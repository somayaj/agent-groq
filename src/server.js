import "dotenv/config";
import express from "express";
import cors from "cors";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { Agent } from "./agent.js";
import { allTools } from "./tools/index.js";
import { Guardrails, createGuardrails } from "./guardrails.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Data directory for persistence
const DATA_DIR = join(__dirname, "../data");
const TOOLS_FILE = join(DATA_DIR, "custom-tools.json");

// Ensure data directory exists
if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(join(__dirname, "../public")));

// Store active agents by session
const agents = new Map();

// Store custom tools by session
const customTools = new Map();

// Store guardrails by session (default guardrails for all)
const guardrailsStore = new Map();

// Default guardrails instance
const defaultGuardrails = createGuardrails({
  blockHarmfulContent: true,
  blockSensitiveTopics: true,
  blockPII: true,
  maxRequestsPerMinute: 60,
  maxResponseLength: 10000,
});

// Load persisted tools from disk
function loadPersistedTools() {
  try {
    if (existsSync(TOOLS_FILE)) {
      const data = JSON.parse(readFileSync(TOOLS_FILE, "utf-8"));
      for (const [sessionId, tools] of Object.entries(data)) {
        const sessionTools = tools.map(def => ({
          definition: def,
          tool: createCustomTool(def)
        }));
        customTools.set(sessionId, sessionTools);
      }
      console.log(`📦 Loaded ${Object.keys(data).length} session(s) with custom tools`);
    }
  } catch (error) {
    console.error("Failed to load persisted tools:", error.message);
  }
}

// Save tools to disk
function persistTools() {
  try {
    const data = {};
    for (const [sessionId, tools] of customTools.entries()) {
      if (tools.length > 0) {
        data[sessionId] = tools.map(t => t.definition);
      }
    }
    writeFileSync(TOOLS_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Failed to persist tools:", error.message);
  }
}

// ============================================
// SECURITY: Code Validation & Safe Execution
// ============================================

// Dangerous patterns that should be blocked
const DANGEROUS_PATTERNS = [
  // Node.js dangerous globals
  /\brequire\s*\(/gi,
  /\bimport\s*\(/gi,
  /\bprocess\b/gi,
  /\bglobal\b/gi,
  /\bglobalThis\b/gi,
  
  // File system access
  /\bfs\b/gi,
  /\bchild_process\b/gi,
  /\bexecSync\b/gi,
  /\bspawnSync\b/gi,
  /\bexec\b\s*\(/gi,
  /\bspawn\b\s*\(/gi,
  
  // Network access
  /\bfetch\s*\(/gi,
  /\bXMLHttpRequest\b/gi,
  /\bWebSocket\b/gi,
  /\bhttp\b/gi,
  /\bhttps\b/gi,
  /\bnet\b/gi,
  
  // Dangerous eval patterns
  /\beval\s*\(/gi,
  /\bFunction\s*\(/gi,
  /\bsetTimeout\s*\(/gi,
  /\bsetInterval\s*\(/gi,
  /\bsetImmediate\s*\(/gi,
  
  // Prototype pollution
  /__proto__/gi,
  /\bconstructor\s*\[/gi,
  /\bprototype\b/gi,
  
  // Environment access
  /\benv\b/gi,
  /\bENV\b/g,
  /process\.env/gi,
  
  // Buffer/Binary operations (can be used for exploits)
  /\bBuffer\b/gi,
  
  // Module system
  /\bmodule\b/gi,
  /\bexports\b/gi,
  /\b__dirname\b/gi,
  /\b__filename\b/gi,
];

// Allowed safe operations
const SAFE_GLOBALS = {
  Math,
  JSON,
  parseInt,
  parseFloat,
  isNaN,
  isFinite,
  encodeURIComponent,
  decodeURIComponent,
  encodeURI,
  decodeURI,
  Array,
  Object,
  String,
  Number,
  Boolean,
  Date,
  RegExp,
  Map,
  Set,
  Promise,
  console: {
    log: () => {}, // No-op for safety
    warn: () => {},
    error: () => {},
  },
};

// Validate code for dangerous patterns
function validateCode(code) {
  const errors = [];
  
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(code)) {
      const match = code.match(pattern);
      errors.push(`Blocked pattern detected: "${match?.[0] || pattern.source}"`);
    }
    // Reset regex lastIndex for global patterns
    pattern.lastIndex = 0;
  }
  
  return {
    isValid: errors.length === 0,
    errors,
  };
}

// Execute code with timeout protection
async function executeWithTimeout(fn, timeoutMs = 5000) {
  return Promise.race([
    fn(),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error(`Execution timeout (${timeoutMs}ms)`)), timeoutMs)
    ),
  ]);
}

// Create a sandboxed execution environment
function createSandboxedFunction(code, paramNames) {
  // Validate the code first
  const validation = validateCode(code);
  if (!validation.isValid) {
    throw new Error(`Security violation: ${validation.errors.join(', ')}`);
  }

  // Create a function with limited scope
  const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
  
  // Wrap code to prevent access to dangerous globals
  const wrappedCode = `
    "use strict";
    ${code}
  `;
  
  return new AsyncFunction(...paramNames, wrappedCode);
}

// Create a tool from definition
function createCustomTool(definition) {
  const { name, description, parameters, code } = definition;

  // Validate tool code at creation time
  const validation = validateCode(code);
  if (!validation.isValid) {
    throw new Error(`Invalid tool code: ${validation.errors.join(', ')}`);
  }

  // Build zod schema from parameters
  const schemaFields = {};
  for (const param of parameters) {
    let field;
    switch (param.type) {
      case "number":
        field = z.number();
        break;
      case "boolean":
        field = z.boolean();
        break;
      case "array":
        field = z.array(z.any());
        break;
      case "object":
        field = z.record(z.any());
        break;
      case "code":
        // Code/function parameter - accepts JS code as string
        field = z.string();
        break;
      default:
        field = z.string();
    }
    if (param.description) {
      field = field.describe(param.description);
    }
    if (!param.required) {
      field = field.optional();
    }
    schemaFields[param.name] = field;
  }

  return tool(
    async (params) => {
      try {
        // Validate any code parameters at runtime
        for (const param of parameters) {
          if (param.type === 'code' && params[param.name]) {
            const codeValidation = validateCode(params[param.name]);
            if (!codeValidation.isValid) {
              return `Security error: ${codeValidation.errors.join(', ')}`;
            }
          }
        }

        // Create safe helper functions
        const helpers = {
          // Safe transform function
          transform: (data, transformCode) => {
            const validation = validateCode(transformCode);
            if (!validation.isValid) {
              throw new Error(`Blocked: ${validation.errors.join(', ')}`);
            }
            const fn = new Function('x', `"use strict"; return (${transformCode})`);
            return fn(data);
          },
          // Safe map operation
          mapWith: (arr, mapCode) => {
            const validation = validateCode(mapCode);
            if (!validation.isValid) {
              throw new Error(`Blocked: ${validation.errors.join(', ')}`);
            }
            const fn = new Function('x', 'i', `"use strict"; return (${mapCode})`);
            return arr.map((x, i) => fn(x, i));
          },
          // Safe filter operation
          filterWith: (arr, filterCode) => {
            const validation = validateCode(filterCode);
            if (!validation.isValid) {
              throw new Error(`Blocked: ${validation.errors.join(', ')}`);
            }
            const fn = new Function('x', 'i', `"use strict"; return (${filterCode})`);
            return arr.filter((x, i) => fn(x, i));
          },
          // Safe globals
          ...SAFE_GLOBALS,
        };

        // Create execution context with params and helpers
        const allParams = { ...params, ...helpers };
        const fn = createSandboxedFunction(code, Object.keys(allParams));
        
        // Execute with timeout protection
        const result = await executeWithTimeout(
          () => fn(...Object.values(allParams)),
          5000 // 5 second timeout
        );
        
        return String(result);
      } catch (error) {
        return `Error: ${error.message}`;
      }
    },
    {
      name,
      description,
      schema: z.object(schemaFields),
    }
  );
}

// Get all tools for a session (built-in + custom)
function getSessionTools(sessionId) {
  const sessionCustomTools = customTools.get(sessionId) || [];
  return [...allTools, ...sessionCustomTools.map(def => def.tool)];
}

// Get or create agent for session
function getGuardrails(sessionId) {
  if (!guardrailsStore.has(sessionId)) {
    guardrailsStore.set(sessionId, defaultGuardrails);
  }
  return guardrailsStore.get(sessionId);
}

function getAgent(sessionId, config = {}, forceRecreate = false) {
  if (forceRecreate || !agents.has(sessionId)) {
    const guardrails = getGuardrails(sessionId);
    agents.set(
      sessionId,
      new Agent({
        model: config.model || "llama-3.1-8b-instant",
        temperature: config.temperature || 0.7,
        tools: getSessionTools(sessionId),
        guardrails: guardrails,
        sessionId: sessionId,
      })
    );
  }
  return agents.get(sessionId);
}

// API Routes

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    apiKeySet: !!process.env.GROQ_API_KEY,
  });
});

// Get available models
app.get("/api/models", (req, res) => {
  res.json({
    models: [
      { id: "llama-3.1-8b-instant", name: "Llama 3.1 8B (Fastest)", recommended: true },
      { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B (Smartest)" },
      { id: "llama-3.1-70b-versatile", name: "Llama 3.1 70B" },
      { id: "mixtral-8x7b-32768", name: "Mixtral 8x7B" },
      { id: "gemma2-9b-it", name: "Gemma 2 9B" },
    ],
  });
});

// Get available tools (built-in + custom for session)
app.get("/api/tools", (req, res) => {
  const sessionId = req.query.sessionId || "default";
  
  const builtInTools = allTools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    type: "built-in",
  }));

  const sessionCustomTools = (customTools.get(sessionId) || []).map((def) => ({
    name: def.definition.name,
    description: def.definition.description,
    parameters: def.definition.parameters,
    code: def.definition.code,
    type: "custom",
  }));

  res.json({ 
    tools: [...builtInTools, ...sessionCustomTools],
    builtIn: builtInTools,
    custom: sessionCustomTools,
  });
});

// Validate code (for UI feedback)
app.post("/api/tools/validate", (req, res) => {
  const { code } = req.body;
  
  if (!code) {
    return res.json({ isValid: true, errors: [] });
  }
  
  const validation = validateCode(code);
  res.json(validation);
});

// Create custom tool
app.post("/api/tools", (req, res) => {
  const { sessionId = "default", name, description, parameters = [], code } = req.body;

  if (!name || !description || !code) {
    return res.status(400).json({ 
      error: "name, description, and code are required" 
    });
  }

  // Validate tool name
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) {
    return res.status(400).json({ 
      error: "Tool name must be lowercase with underscores only (e.g., my_tool)" 
    });
  }

  // Check for duplicate names
  const existingTools = getSessionTools(sessionId);
  if (existingTools.some(t => t.name === name)) {
    return res.status(400).json({ 
      error: `A tool named "${name}" already exists` 
    });
  }

  try {
    const definition = { name, description, parameters, code };
    const customTool = createCustomTool(definition);

    // Store the custom tool
    if (!customTools.has(sessionId)) {
      customTools.set(sessionId, []);
    }
    customTools.get(sessionId).push({ definition, tool: customTool });

    // Persist to disk
    persistTools();

    // Recreate agent with new tools
    agents.delete(sessionId);

    res.json({ 
      success: true, 
      tool: { name, description, parameters, type: "custom" } 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Generate tool code using LLM
app.post("/api/tools/generate", async (req, res) => {
  const { name, description, parameters = [] } = req.body;

  if (!name || !description) {
    return res.status(400).json({ error: "name and description are required" });
  }

  if (!process.env.GROQ_API_KEY) {
    return res.status(500).json({ error: "GROQ_API_KEY not configured" });
  }

  try {
    const { ChatGroq } = await import("@langchain/groq");
    
    const llm = new ChatGroq({
      model: "llama-3.3-70b-versatile",
      temperature: 0.3,
      apiKey: process.env.GROQ_API_KEY,
    });

    const paramList = parameters.length > 0 
      ? parameters.map(p => `- ${p.name} (${p.type}${p.required ? ', required' : ', optional'}): ${p.description || 'no description'}`).join('\n')
      : 'No parameters';

    const prompt = `You are a JavaScript code generator. Generate ONLY the function body code (no function declaration) for a tool with these specs:

Tool Name: ${name}
Description: ${description}
Parameters available as variables:
${paramList}

Requirements:
1. Return a string result
2. Use the parameter variables directly (they're already in scope)
3. Handle edge cases gracefully
4. Keep it concise but functional
5. Do NOT include function declaration, just the body
6. Do NOT wrap in markdown code blocks

Example format for a greeting tool with 'name' parameter:
const greeting = name ? \`Hello, \${name}!\` : 'Hello, stranger!';
return greeting;

Generate the code now:`;

    const response = await llm.invoke(prompt);
    let code = response.content.trim();
    
    // Clean up any markdown code blocks if present
    code = code.replace(/^```(?:javascript|js)?\n?/i, '').replace(/\n?```$/i, '');
    
    res.json({ code });
  } catch (error) {
    console.error("Code generation error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Update custom tool
app.put("/api/tools/:name", (req, res) => {
  const { name: oldName } = req.params;
  const { sessionId = "default", name, description, parameters = [], code } = req.body;

  if (!name || !description || !code) {
    return res.status(400).json({ 
      error: "name, description, and code are required" 
    });
  }

  const sessionTools = customTools.get(sessionId);
  if (!sessionTools) {
    return res.status(404).json({ error: "Tool not found" });
  }

  const index = sessionTools.findIndex(t => t.definition.name === oldName);
  if (index === -1) {
    return res.status(404).json({ error: "Tool not found" });
  }

  // Validate new tool name if changed
  if (name !== oldName && !/^[a-z_][a-z0-9_]*$/.test(name)) {
    return res.status(400).json({ 
      error: "Tool name must be lowercase with underscores only" 
    });
  }

  // Check for duplicate names if name changed
  if (name !== oldName) {
    const allSessionTools = getSessionTools(sessionId);
    if (allSessionTools.some(t => t.name === name)) {
      return res.status(400).json({ 
        error: `A tool named "${name}" already exists` 
      });
    }
  }

  try {
    const definition = { name, description, parameters, code };
    const customTool = createCustomTool(definition);

    // Update the tool
    sessionTools[index] = { definition, tool: customTool };

    // Persist to disk
    persistTools();

    // Recreate agent with updated tools
    agents.delete(sessionId);

    res.json({ 
      success: true, 
      tool: { name, description, parameters, type: "custom" } 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete custom tool
app.delete("/api/tools/:name", (req, res) => {
  const { name } = req.params;
  const sessionId = req.query.sessionId || "default";

  const sessionTools = customTools.get(sessionId);
  if (!sessionTools) {
    return res.status(404).json({ error: "Tool not found" });
  }

  const index = sessionTools.findIndex(t => t.definition.name === name);
  if (index === -1) {
    return res.status(404).json({ error: "Tool not found" });
  }

  sessionTools.splice(index, 1);
  
  // Persist to disk
  persistTools();
  
  // Recreate agent without the deleted tool
  agents.delete(sessionId);

  res.json({ success: true });
});

// Helper function to add timeout to promises
function withTimeout(promise, timeoutMs = 60000) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Request timed out after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
}

// Chat endpoint
app.post("/api/chat", async (req, res) => {
  const { message, sessionId = "default", config = {} } = req.body;

  if (!message) {
    return res.status(400).json({ error: "Message is required" });
  }

  if (!process.env.GROQ_API_KEY) {
    return res.status(500).json({ error: "GROQ_API_KEY not configured" });
  }

  try {
    // Recreate agent if config changed
    const forceRecreate = config.model || config.temperature !== undefined;
    const agent = getAgent(sessionId, config, forceRecreate);
    const startTime = Date.now();

    // Add 60 second timeout to prevent hanging
    const result = await withTimeout(agent.chat(message), 60000);
    const duration = Date.now() - startTime;

    // Extract tool calls from messages
    const toolCalls = [];
    for (const msg of result.messages) {
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        toolCalls.push(...msg.tool_calls);
      }
    }

    // Extract tool results
    const toolResults = result.messages
      .filter((msg) => msg._getType() === "tool")
      .map((msg) => ({
        name: msg.name,
        result: msg.content,
      }));

    res.json({
      response: result.response,
      toolCalls: toolCalls.map((tc) => ({
        name: tc.name,
        args: tc.args,
      })),
      toolResults,
      duration,
      model: config.model || "llama-3.1-8b-instant",
      guardrails: result.guardrails || null,
    });
  } catch (error) {
    console.error("Chat error:", error);
    console.error("Error stack:", error.stack);
    res.status(500).json({
      error: error.message || "An error occurred",
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
});

// Streaming chat endpoint for real-time responses
app.post("/api/chat/stream", async (req, res) => {
  const { message, sessionId = "default", config = {} } = req.body;

  if (!message) {
    return res.status(400).json({ error: "Message is required" });
  }

  if (!process.env.GROQ_API_KEY) {
    return res.status(500).json({ error: "GROQ_API_KEY not configured" });
  }

  // Set up Server-Sent Events
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    const forceRecreate = config.model || config.temperature !== undefined;
    const agent = getAgent(sessionId, config, forceRecreate);
    const startTime = Date.now();

    let fullResponse = "";
    const toolCalls = [];
    const toolResults = [];

    // Stream with timeout
    const streamPromise = (async () => {
      for await (const chunk of agent.stream(message)) {
        if (chunk.content) {
          fullResponse += chunk.content;
          res.write(`data: ${JSON.stringify({ type: "content", content: chunk.content })}\n\n`);
        }
        if (chunk.toolCalls && chunk.toolCalls.length > 0) {
          for (const toolCall of chunk.toolCalls) {
            toolCalls.push(toolCall);
            res.write(`data: ${JSON.stringify({ type: "tool_call", toolCall })}\n\n`);
          }
        }
      }
    })();

    await withTimeout(streamPromise, 60000);

    const duration = Date.now() - startTime;
    res.write(`data: ${JSON.stringify({ type: "done", duration, model: config.model || "llama-3.1-8b-instant" })}\n\n`);
    res.end();
  } catch (error) {
    console.error("Stream error:", error);
    res.write(`data: ${JSON.stringify({ type: "error", error: error.message })}\n\n`);
    res.end();
  }
});

// Clear session/history
app.post("/api/clear", (req, res) => {
  const { sessionId = "default" } = req.body;
  agents.delete(sessionId);
  res.json({ success: true });
});

// Guardrails & Policy Management

// Get current policies
app.get("/api/guardrails", (req, res) => {
  const sessionId = req.query.sessionId || "default";
  const guardrails = getGuardrails(sessionId);
  res.json({
    policies: guardrails.getPolicySummary(),
  });
});

// Update policies
app.put("/api/guardrails", (req, res) => {
  const { sessionId = "default", policies = {} } = req.body;
  
  try {
    // Get existing guardrails or create new
    const existing = guardrailsStore.get(sessionId);
    const newPolicies = existing 
      ? { ...existing.policies, ...policies }
      : { ...defaultGuardrails.policies, ...policies };
    
    const newGuardrails = createGuardrails(newPolicies);
    guardrailsStore.set(sessionId, newGuardrails);
    
    // Recreate agent with new guardrails
    agents.delete(sessionId);
    
    res.json({
      success: true,
      policies: newGuardrails.getPolicySummary(),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Validate content (for testing)
app.post("/api/guardrails/validate", (req, res) => {
  const { sessionId = "default", content, type = "input" } = req.body;
  
  if (!content) {
    return res.status(400).json({ error: "Content is required" });
  }
  
  const guardrails = getGuardrails(sessionId);
  const validation = guardrails.validateContent(content, type);
  
  res.json(validation);
});

// Check rate limit status
app.get("/api/guardrails/rate-limit", (req, res) => {
  const sessionId = req.query.sessionId || "default";
  const guardrails = getGuardrails(sessionId);
  const check = guardrails.checkRateLimit(sessionId);
  
  res.json(check);
});

// Serve the frontend
app.get("/", (req, res) => {
  res.sendFile(join(__dirname, "../public/index.html"));
});

// Load persisted tools before starting server
loadPersistedTools();

// Start server
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════╗
║                                                        ║
║   🤖 Agent Groq Server                                 ║
║                                                        ║
║   Local:   http://localhost:${PORT}                      ║
║   API:     http://localhost:${PORT}/api                  ║
║                                                        ║
║   API Key: ${process.env.GROQ_API_KEY ? "✅ Configured" : "❌ Missing"}                         ║
║   Tools:   📦 Persisted to data/custom-tools.json      ║
║                                                        ║
╚════════════════════════════════════════════════════════╝
  `);
});
