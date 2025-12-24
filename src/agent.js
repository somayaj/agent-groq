import { ChatGroq } from "@langchain/groq";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { HumanMessage } from "@langchain/core/messages";
import { allTools } from "./tools/index.js";

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
  }

  /**
   * Send a message to the agent and get a response
   */
  async chat(message) {
    try {
      const result = await this.agent.invoke({
        messages: [new HumanMessage(message)],
      });

      // Extract the final response
      const messages = result.messages;
      const lastMessage = messages[messages.length - 1];

      // Store in history
      this.conversationHistory.push({
        role: "user",
        content: message,
      });
      this.conversationHistory.push({
        role: "assistant",
        content: lastMessage.content,
      });

      return {
        response: lastMessage.content,
        messages: messages,
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

