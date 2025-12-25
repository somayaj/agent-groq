# Agent Groq

A LangChain-powered AI agent using Groq for fast, free inference.

## Features

- ⚡ **Ultra-fast inference** with Groq's Llama 3.1 8B (default) or 70B models
- 🛠️ **Built-in tools**: Calculator, Time, Random Number, String Utils, JSON Parser
- 💬 **Conversation history** tracking
- 🔄 **Streaming support** for real-time responses
- 📦 **Easy to extend** with custom tools
- 🎨 **Beautiful web UI** with Tailwind CSS dark theme
- ✨ **AI code generation** for custom tools
- 🔒 **Security sandboxing** to prevent malicious code
- 💾 **Tool persistence** across server restarts

## How This Differs from Direct LangChain

This package is a **"batteries-included" wrapper** around LangChain that simplifies agent creation.

### Comparison

| Aspect | **Agent Groq** | **Direct LangChain** |
|--------|----------------|----------------------|
| **Setup** | Pre-configured, ready to use | Requires manual setup |
| **LLM Provider** | Groq pre-configured | You choose & configure |
| **Tools** | 5 built-in tools included | No tools by default |
| **API** | Simple `agent.chat()` | More verbose API |
| **History** | Built-in conversation tracking | Manual implementation |
| **Streaming** | Simple `agent.stream()` | More complex setup |

### Code Comparison

**Using Agent Groq (Simplified):**

```javascript
import { Agent } from "agent-groq";

const agent = new Agent();
const result = await agent.chat("What is 25 * 48?");
```

**Using LangChain Directly (More Verbose):**

```javascript
import { ChatGroq } from "@langchain/groq";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { tool } from "@langchain/core/tools";
import { HumanMessage } from "@langchain/core/messages";
import { z } from "zod";

// 1. Create LLM
const llm = new ChatGroq({
  model: "llama-3.3-70b-versatile",
  apiKey: process.env.GROQ_API_KEY,
});

// 2. Define tools manually
const calculator = tool(
  async ({ expression }) => {
    return eval(expression).toString();
  },
  {
    name: "calculator",
    description: "Performs math",
    schema: z.object({ expression: z.string() }),
  }
);

// 3. Create agent
const agent = createReactAgent({
  llm,
  tools: [calculator],
});

// 4. Invoke
const result = await agent.invoke({
  messages: [new HumanMessage("What is 25 * 48?")],
});

// 5. Extract response manually
const response = result.messages[result.messages.length - 1].content;
```

### What This Package Adds

1. **Convenience Wrapper** - Abstracts away LangChain's verbose API
2. **Pre-built Tools** - Calculator, time, string utils, etc. ready to use
3. **Conversation History** - Automatically tracks chat history
4. **Simpler Streaming** - Easy async iterator pattern
5. **Groq Pre-configured** - No need to set up LLM provider

### When to Use What

| Use Case | Recommendation |
|----------|----------------|
| Quick prototyping | **Agent Groq** |
| Simple chatbot | **Agent Groq** |
| Custom agent logic | **Direct LangChain** |
| Complex workflows | **Direct LangChain/LangGraph** |
| Multi-agent systems | **Direct LangGraph** |
| Production apps | Either (customize as needed) |

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Set up environment

Create a `.env` file with your Groq API key:

```bash
GROQ_API_KEY=your_api_key_here
```

Get your free API key at [console.groq.com](https://console.groq.com)

### 3. Run the agent

```bash
npm start          # Run CLI demo
npm run server     # Start web interface
```

## Web Interface

Start the web server to access the beautiful Tailwind CSS interface:

```bash
npm run server
```

Then open **http://localhost:3000** in your browser.

### Features
- 💬 **Chat interface** - Talk with the agent in real-time
- 🔧 **Tool visualization** - See which tools are being used and their results
- ⚙️ **Configuration panel** - Adjust model and temperature on the fly
- 📊 **Performance metrics** - Response times displayed for each message
- 🎨 **Dark theme** - Beautiful Groq-orange accented Tailwind CSS UI
- ✨ **Custom tool creation** - Create your own tools from the UI

## Custom Tools

Create custom tools directly from the web interface! Click **"Add Tool"** in the sidebar to open the tool creator.

### Creating a Custom Tool

1. **Name**: Lowercase with underscores (e.g., `my_tool`)
2. **Description**: Explains what the tool does (AI uses this to decide when to call it)
3. **Parameters**: Input variables your tool accepts
4. **Code**: JavaScript code that returns a string result - or click **"Generate with AI"** to auto-generate!

### AI Code Generation ✨

Click the **"Generate with AI"** button to automatically generate JavaScript code based on your tool name, description, and parameters. The LLM will create functional code for you!

```
Example:
  Name: temperature_converter
  Description: Converts temperature between Celsius and Fahrenheit
  Parameters: value (number), from_unit (string)
  
  → Click "Generate with AI"
  → AI generates complete conversion code!
```

### Example: Greeting Tool

```javascript
// Name: greet_user
// Description: Greets a user by name
// Parameters: name (string, required)

return `Hello, ${name}! Welcome to Agent Groq! 🎉`;
```

### Example: Dice Roller

```javascript
// Name: roll_dice  
// Description: Rolls dice with specified sides
// Parameters: sides (number), count (number, optional)

const numDice = count || 1;
const results = [];
for (let i = 0; i < numDice; i++) {
  results.push(Math.floor(Math.random() * sides) + 1);
}
return `Rolled ${numDice}d${sides}: [${results.join(', ')}]`;
```

### Parameter Types

Custom tools support multiple parameter types:

| Type | Description | Example |
|------|-------------|---------|
| `string` | Text input | `"hello world"` |
| `number` | Numeric input | `42`, `3.14` |
| `boolean` | True/false | `true`, `false` |
| `array` | List of items | `[1, 2, 3]` |
| `object` | Key-value pairs | `{"key": "value"}` |
| `code` | JavaScript expression | `x.toUpperCase()` |

### Code Parameter Helpers

When using `code` type parameters, these helper functions are available:

```javascript
// Transform data with custom expression
transform(data, "x.toUpperCase()")  // "HELLO"

// Map over array with expression
mapWith([1,2,3], "x * 2")  // [2, 4, 6]

// Filter array with expression
filterWith([1,2,3,4], "x > 2")  // [3, 4]
```

### Quick Templates

The tool creator includes templates to get you started:
- 👋 **Greeting** - Greet users by name
- 🎲 **Dice Roll** - Roll dice with any number of sides
- 🔢 **Counter** - Count characters, words, and lines
- 🆔 **UUID Generator** - Generate random UUIDs
- ⚡ **Transformer** - Transform data with custom code
- 📊 **Array Processor** - Map/filter/reduce arrays with code

### Tool Persistence 💾

Custom tools are automatically saved to `data/custom-tools.json` and persist across server restarts.

- ✅ **Auto-save** - Tools saved immediately when created/edited
- ✅ **Auto-load** - Tools restored when server starts
- ✅ **Per-session** - Each browser session has its own tools
- ✅ **Edit & Delete** - Edit ✏️ and delete 🗑️ buttons on each tool

### Security Protection 🔒

Custom tool code is validated and sandboxed to prevent malicious operations:

**Blocked Operations:**
- ❌ `require()`, `import()` - No module loading
- ❌ `process`, `global` - No Node.js globals
- ❌ `fs`, `child_process` - No file system or shell access
- ❌ `fetch`, `http` - No network requests
- ❌ `eval()`, `Function()` - No dynamic code execution
- ❌ `__proto__`, `prototype` - No prototype pollution

**Security Features:**
- ✅ Code validation before saving
- ✅ Runtime validation for code parameters
- ✅ 5-second execution timeout
- ✅ Strict mode enforcement
- ✅ "Check Security" button in UI

**Safe Operations Allowed:**
- ✅ `Math`, `JSON`, `Array`, `Object`, `String`
- ✅ `Date`, `RegExp`, `Map`, `Set`
- ✅ Basic string/array manipulation
- ✅ Mathematical operations

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Check server status |
| `/api/models` | GET | List available models |
| `/api/tools` | GET | List available tools (built-in + custom) |
| `/api/tools` | POST | Create a custom tool |
| `/api/tools/validate` | POST | Validate tool code for security |
| `/api/tools/generate` | POST | Generate tool code with AI |
| `/api/tools/:name` | PUT | Update an existing custom tool |
| `/api/tools/:name` | DELETE | Delete a custom tool |
| `/api/chat` | POST | Send message to agent |
| `/api/clear` | POST | Clear conversation history |

## Usage

### Basic Usage

```javascript
// If installed from npm:
import { Agent } from "agent-groq";

// If using locally:
// import { Agent } from "./src/agent.js";

// Uses fastest model by default
const agent = new Agent();
const result = await agent.chat("What is 25 * 48?");
console.log(result.response);

// Or specify a model
const smartAgent = new Agent({
  model: "llama-3.3-70b-versatile",  // Use smartest model
  temperature: 0.7,
});
```

### Streaming Responses

```javascript
for await (const chunk of agent.stream("Tell me a joke")) {
  if (chunk.content) {
    process.stdout.write(chunk.content);
  }
}
```

### Custom Tools (Programmatic)

```javascript
import { Agent } from "agent-groq";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

const myTool = tool(
  async ({ input }) => {
    return `Processed: ${input}`;
  },
  {
    name: "my_tool",
    description: "Description of what this tool does",
    schema: z.object({
      input: z.string().describe("The input to process"),
    }),
  }
);

const agent = new Agent({
  tools: [myTool],
});
```

## Available Tools

| Tool | Description |
|------|-------------|
| `calculator` | Performs mathematical calculations |
| `current_time` | Returns current date/time with timezone support |
| `random_number` | Generates random numbers in a range |
| `string_utils` | String operations (uppercase, lowercase, reverse, etc.) |
| `json_parser` | Parse and format JSON data |

## Configuration Options

```javascript
const agent = new Agent({
  model: "llama-3.1-8b-instant",  // Fastest model (default)
  // model: "llama-3.3-70b-versatile",  // Smartest model
  temperature: 0.7,                // Creativity (0-1)
  tools: [...],                    // Array of tools
  systemPrompt: "...",             // Custom system prompt
});
```

## Available Groq Models

| Model | Speed | Intelligence | Best For |
|-------|-------|--------------|----------|
| `llama-3.1-8b-instant` | ⚡⚡⚡ Fastest | Good | Default, quick responses |
| `llama-3.3-70b-versatile` | ⚡ | 🧠🧠🧠 Smartest | Complex reasoning |
| `llama-3.1-70b-versatile` | ⚡ | 🧠🧠 | General purpose |
| `mixtral-8x7b-32768` | ⚡⚡ | 🧠🧠 | Long context |
| `gemma2-9b-it` | ⚡⚡ | 🧠 | Lightweight tasks |

## Guardrails & Policies 🔒

Agent Groq includes a comprehensive guardrails system to ensure safe and responsible AI usage.

### Features

- ✅ **Content Filtering** - Blocks harmful, sensitive, or inappropriate content
- ✅ **Rate Limiting** - Prevents abuse with per-session rate limits
- ✅ **Tool Restrictions** - Control which tools can be used
- ✅ **PII Protection** - Automatically redacts personal information
- ✅ **Output Validation** - Validates and sanitizes LLM responses
- ✅ **Custom Policies** - Configure policies per session

### Default Policies

```javascript
{
  blockHarmfulContent: true,      // Block violence, self-harm, etc.
  blockSensitiveTopics: true,      // Block sensitive information
  blockPII: true,                  // Redact personal information
  maxRequestsPerMinute: 60,        // Rate limiting
  maxResponseLength: 10000,        // Response size limit
  allowedTools: null,              // null = all allowed
  blockedTools: [],                // List of blocked tools
}
```

### Usage

```javascript
import { Agent, createGuardrails } from "agent-groq";

// Create custom guardrails
const guardrails = createGuardrails({
  blockHarmfulContent: true,
  maxRequestsPerMinute: 30,
  blockedTools: ["calculator"], // Block specific tools
});

// Use with agent
const agent = new Agent({
  guardrails: guardrails,
  sessionId: "my-session",
});

// Guardrails automatically validate:
// - Input messages
// - Tool usage
// - Output responses
```

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/guardrails` | GET | Get current policies |
| `/api/guardrails` | PUT | Update policies |
| `/api/guardrails/validate` | POST | Validate content |
| `/api/guardrails/rate-limit` | GET | Check rate limit status |

### Policy Configuration

```javascript
// Update policies via API
PUT /api/guardrails
{
  "sessionId": "my-session",
  "policies": {
    "blockHarmfulContent": true,
    "maxRequestsPerMinute": 30,
    "blockedTools": ["calculator"],
    "customFilters": [
      (content, type) => {
        if (content.includes("blocked-word")) {
          return { valid: false, reason: "Contains blocked word" };
        }
        return { valid: true };
      }
    ]
  }
}
```

### What Gets Blocked

**Harmful Content:**
- Violence, threats, self-harm
- Illegal activities
- Hate speech
- Explicit content

**Sensitive Topics:**
- Classified information
- API keys, passwords
- Personal data

**PII (Personal Identifiable Information):**
- Social Security Numbers
- Credit card numbers
- Email addresses
- Phone numbers

## License

MIT License

See [LICENSE](LICENSE) for details.

