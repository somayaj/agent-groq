import "dotenv/config";
import { Agent } from "./agent.js";

// Verify API key is set
if (!process.env.GROQ_API_KEY) {
  console.error("❌ Error: GROQ_API_KEY is not set in environment variables");
  console.error("Please create a .env file with your Groq API key:");
  console.error("  GROQ_API_KEY=your_api_key_here");
  process.exit(1);
}

async function main() {
  console.log("🤖 LangChain Agent with Groq");
  console.log("============================\n");

  // Create agent instance (using fastest model by default)
  const agent = new Agent({
    model: "llama-3.1-8b-instant",
    temperature: 0.7,
  });

  // Example interactions
  const questions = [
    "What is 25 * 48 + 137?",
    "What is the current time in New York?",
    "Generate a random number between 1 and 1000",
    "Convert 'Hello World' to uppercase and tell me its length",
  ];

  console.log("📝 Running example queries...\n");

  for (const question of questions) {
    console.log(`❓ Question: ${question}`);
    console.log("─".repeat(50));

    try {
      const result = await agent.chat(question);
      console.log(`✅ Answer: ${result.response}`);
    } catch (error) {
      console.error(`❌ Error: ${error.message}`);
    }

    console.log("\n");
  }

  // Interactive mode example with streaming
  console.log("🔄 Streaming example:");
  console.log("─".repeat(50));
  console.log("❓ Question: What is 100 divided by 4, then multiply by 7?");
  console.log("✅ Answer: ");

  try {
    for await (const chunk of agent.stream(
      "What is 100 divided by 4, then multiply by 7?"
    )) {
      if (chunk.type === "ai" && chunk.content) {
        process.stdout.write(chunk.content);
      }
      if (chunk.toolCalls && chunk.toolCalls.length > 0) {
        console.log(`\n🔧 Using tool: ${chunk.toolCalls[0].name}`);
      }
    }
  } catch (error) {
    console.error(`❌ Stream error: ${error.message}`);
  }

  console.log("\n\n✨ Done!");
}

// Run the main function
main().catch(console.error);

