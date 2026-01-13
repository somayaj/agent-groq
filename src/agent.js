import { ChatGroq } from "@langchain/groq";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { HumanMessage } from "@langchain/core/messages";
import { allTools } from "./tools/index.js";
import { Guardrails, defaultGuardrails } from "./guardrails.js";
import https from "https";

/**
 * Create a LangChain ReAct Agent powered by Groq
 */
export function createAgent(options = {}) {
  const {
    model = "llama-3.1-8b-instant",
    temperature = 0.7,
    tools = allTools,
    systemPrompt = `You are a helpful AI assistant with access to various tools.
Use the tools available to you to help answer questions and complete tasks.
Always think step by step and use the appropriate tool when needed.
Be concise but thorough in your responses.
IMPORTANT: After using a tool, analyze the result and provide a final answer. Do not call tools repeatedly for the same task. If a tool doesn't give you the expected result, explain what happened and provide your best answer based on available information.`,
  } = options;

  // Initialize the Groq LLM with timeout
  if (!process.env.GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is not set in environment variables");
  }
  
  // Create HTTPS agent - handle SSL certificate issues
  // In some environments, SSL certificates may not be available
  // For development, we can allow insecure connections if needed
  const httpsAgent = new https.Agent({
    rejectUnauthorized: false, // Allow self-signed or missing certificates (development only)
  });

  const llm = new ChatGroq({
    model,
    temperature,
    apiKey: process.env.GROQ_API_KEY,
    timeout: 20000, // 20 second timeout for individual API calls
    maxRetries: 1, // Reduce retries to fail faster
  });
  
  // Set httpAgent on the client after creation to handle SSL issues
  if (llm.client && httpsAgent) {
    llm.client.httpAgent = httpsAgent;
  }
  
  console.log(`[Agent] Created LLM with model: ${model}, baseURL: ${llm.client?.baseURL || 'default'}`);

  // Create the ReAct agent with tools
  const agent = createReactAgent({
    llm,
    tools,
    messageModifier: systemPrompt,
  });

  return agent;
}

/**
 * Agent class for more control over agent execution
 */
export class Agent {
  constructor(options = {}) {
    this.agent = createAgent(options);
    this.conversationHistory = [];
    this.guardrails = options.guardrails || defaultGuardrails;
    this.sessionId = options.sessionId || "default";
  }

  /**
   * Send a message to the agent and get a response
   */
  async chat(message) {
    try {
      // Guardrails: Rate limiting
      const rateLimitCheck = this.guardrails.checkRateLimit(this.sessionId);
      if (!rateLimitCheck.allowed) {
        throw new Error(rateLimitCheck.reason);
      }

      // Guardrails: Input validation
      const inputValidation = this.guardrails.validateContent(message, 'input');
      if (!inputValidation.valid) {
        throw new Error(`Input blocked: ${inputValidation.violations.join(', ')}`);
      }

      // Validate tool usage before execution
      const toolCalls = [];
      const toolValidationErrors = [];
      
      // Add timeout wrapper for agent invocation
      console.log(`[Agent] Starting chat request for session: ${this.sessionId}`);
      const invokePromise = this.agent.invoke(
        {
          messages: [new HumanMessage(message)],
        },
        {
          recursionLimit: 50, // Increase from default 25 to 50
        }
      );
      
      // Timeout after 30 seconds (reduced from 45)
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Agent invocation timed out after 30 seconds")), 30000);
      });
      
      console.log(`[Agent] Waiting for response...`);
      const result = await Promise.race([invokePromise, timeoutPromise]);
      console.log(`[Agent] Received response`);

      // Extract the final response
      const messages = result.messages;
      const lastMessage = messages[messages.length - 1];

      // Validate tool calls
      for (const msg of messages) {
        if (msg.tool_calls && msg.tool_calls.length > 0) {
          for (const toolCall of msg.tool_calls) {
            const toolValidation = this.guardrails.validateTool(toolCall.name);
            if (!toolValidation.allowed) {
              toolValidationErrors.push(toolValidation.reason);
            } else {
              toolCalls.push(toolCall);
            }
          }
        }
      }

      if (toolValidationErrors.length > 0) {
        throw new Error(`Tool usage blocked: ${toolValidationErrors.join(', ')}`);
      }

      // Guardrails: Output validation
      let response = lastMessage.content;
      const outputValidation = this.guardrails.validateContent(response, 'output');
      if (!outputValidation.valid) {
        // Sanitize or block response
        response = this.guardrails.sanitizeOutput(response);
        if (outputValidation.violations.some(v => v.includes('harmful') || v.includes('sensitive'))) {
          response = "I cannot provide that response due to content policy restrictions.";
        }
      } else {
        // Sanitize even if valid (remove PII, etc.)
        response = this.guardrails.sanitizeOutput(response);
      }

      // Store in history
      this.conversationHistory.push({
        role: "user",
        content: message,
      });
      this.conversationHistory.push({
        role: "assistant",
        content: response,
      });

      return {
        response: response,
        messages: messages,
        guardrails: {
          inputValidated: inputValidation.valid,
          outputValidated: outputValidation.valid,
          violations: outputValidation.violations,
        },
      };
    } catch (error) {
      console.error(`[Agent] Error details:`, error);
      // Provide more detailed error information
      let errorMessage = error.message || "Unknown error";
      if (error.cause) {
        errorMessage += ` (${error.cause.message || error.cause})`;
      }
      if (error.response) {
        errorMessage += ` - Status: ${error.response.status}`;
      }
      throw new Error(`Agent error: ${errorMessage}`);
    }
  }

  /**
   * Stream responses from the agent
   */
  async *stream(message) {
    try {
      const eventStream = await this.agent.stream(
        { messages: [new HumanMessage(message)] },
        { 
          streamMode: "values",
          recursionLimit: 50, // Increase from default 25 to 50
        }
      );

      for await (const event of eventStream) {
        const lastMessage = event.messages[event.messages.length - 1];
        yield {
          type: lastMessage._getType(),
          content: lastMessage.content,
          toolCalls: lastMessage.tool_calls || [],
        };
      }
    } catch (error) {
      throw new Error(`Stream error: ${error.message}`);
    }
  }

  /**
   * Clear conversation history
   */
  clearHistory() {
    this.conversationHistory = [];
  }

  /**
   * Get conversation history
   */
  getHistory() {
    return this.conversationHistory;
  }
}

export default Agent;

