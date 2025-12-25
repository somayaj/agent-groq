import { ChatGroq } from "@langchain/groq";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { HumanMessage } from "@langchain/core/messages";
import { allTools } from "./tools/index.js";
import { Guardrails, defaultGuardrails } from "./guardrails.js";

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
Be concise but thorough in your responses.`,
  } = options;

  // Initialize the Groq LLM
  const llm = new ChatGroq({
    model,
    temperature,
    apiKey: process.env.GROQ_API_KEY,
  });

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
      
      const result = await this.agent.invoke({
        messages: [new HumanMessage(message)],
      });

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
      throw new Error(`Agent error: ${error.message}`);
    }
  }

  /**
   * Stream responses from the agent
   */
  async *stream(message) {
    try {
      const eventStream = await this.agent.stream(
        { messages: [new HumanMessage(message)] },
        { streamMode: "values" }
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

