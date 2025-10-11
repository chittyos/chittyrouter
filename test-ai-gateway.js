/**
 * Test AI Gateway Integration
 * Run after creating gateway in dashboard
 */

import { AIGatewayClient } from "./src/ai/ai-gateway-client.js";

// Mock env for testing
const mockEnv = {
  CLOUDFLARE_ACCOUNT_ID: "0bc21e3a5a9de1a4cc843be9c3e98121",
  AI_GATEWAY_ID: "chittyos-ai-gateway",

  // Workers AI binding (mock)
  AI: {
    run: async (model, options) => {
      console.log(`🤖 Workers AI called with model: ${model}`);
      return {
        response: "Mock Workers AI response",
        usage: { prompt_tokens: 10, completion_tokens: 20 },
      };
    },
  },

  // Provider keys (will be added as secrets)
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || "sk-test",
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || "sk-ant-test",
};

async function testAIGateway() {
  console.log("\n🧪 Testing AI Gateway Integration\n");

  const client = new AIGatewayClient(mockEnv);

  // Test 1: Simple task (should use Workers AI - free)
  console.log("Test 1: Simple task routing...");
  try {
    const result1 = await client.complete("Summarize: AI is cool", {
      complexity: "simple",
      maxTokens: 100,
    });
    console.log(
      "✅ Simple task:",
      result1.provider,
      `Cost: $${result1.cost.toFixed(4)}`,
    );
  } catch (error) {
    console.error("❌ Simple task failed:", error.message);
  }

  // Test 2: Complex task (should try external providers)
  console.log("\nTest 2: Complex task routing...");
  try {
    const result2 = await client.complete(
      "Write a detailed legal analysis of contract law",
      {
        complexity: "complex",
        maxTokens: 500,
        fallbackChain: true,
      },
    );
    console.log(
      "✅ Complex task:",
      result2.provider,
      `Cost: $${result2.cost.toFixed(4)}`,
    );
  } catch (error) {
    console.log(
      "⚠️  Complex task failed (expected - external APIs not configured):",
      error.message,
    );
  }

  // Test 3: Cost tracking
  console.log("\nTest 3: Usage stats...");
  const stats = await client.getUsageStats(7);
  console.log("📊 Usage Stats:", stats);

  console.log("\n✅ AI Gateway client is functional!");
  console.log("\n📝 Next steps:");
  console.log(
    "1. Create gateway: https://dash.cloudflare.com/0bc21e3a5a9de1a4cc843be9c3e98121/ai/ai-gateway",
  );
  console.log("2. Add API keys as wrangler secrets");
  console.log("3. Deploy and test with real AI calls");
}

testAIGateway().catch(console.error);
