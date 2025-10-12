/**
 * Unit tests for ChittyContextual Memory System
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { ContextualMemory } from "../../src/agents/contextual-memory.js";

describe("ContextualMemory", () => {
  let mockMemory;
  let contextualMemory;

  beforeEach(() => {
    // Mock the AgentMemory interface
    mockMemory = {
      recall: vi.fn(),
      store: vi.fn(),
      state: {
        storage: {
          get: vi.fn(),
          put: vi.fn(),
        },
      },
    };

    contextualMemory = new ContextualMemory(mockMemory, {
      maxContextMessages: 5,
      includeSystemContext: true,
    });
  });

  describe("buildConversationHistory", () => {
    it("should build conversation history from recent messages", async () => {
      // Setup mock memory recall
      mockMemory.recall.mockResolvedValue({
        recent: {
          recentMessages: [
            {
              prompt: "What is the case number?",
              response: "The case number is 2024D007847",
              timestamp: Date.now() - 60000,
            },
            {
              prompt: "Who is the client?",
              response: "The client is Nicholas Bianchi",
              timestamp: Date.now() - 30000,
            },
          ],
        },
        similar: [],
        retrieved_at: new Date().toISOString(),
      });

      const currentPrompt = "Tell me about the case";
      const { messages, contextMetadata } =
        await contextualMemory.buildConversationHistory(currentPrompt, {
          taskType: "case_query",
        });

      // Verify conversation history structure
      expect(messages).toHaveLength(5); // 2 pairs of user/assistant + current prompt
      expect(messages[0].role).toBe("user");
      expect(messages[0].content).toBe("What is the case number?");
      expect(messages[1].role).toBe("assistant");
      expect(messages[1].content).toBe("The case number is 2024D007847");
      expect(messages[2].role).toBe("user");
      expect(messages[2].content).toBe("Who is the client?");
      expect(messages[3].role).toBe("assistant");
      expect(messages[3].content).toBe("The client is Nicholas Bianchi");
      expect(messages[4].role).toBe("user");
      expect(messages[4].content).toBe("Tell me about the case");

      // Verify metadata
      expect(contextMetadata.recentInteractions).toBe(2);
      expect(contextMetadata.similarExperiences).toBe(0);
    });

    it("should include system context from similar experiences", async () => {
      mockMemory.recall.mockResolvedValue({
        recent: { recentMessages: [] },
        similar: [
          {
            taskType: "case_query",
            provider: "openai",
            outcome: "success",
            qualityScore: 0.9,
          },
          {
            taskType: "case_query",
            provider: "anthropic",
            outcome: "success",
            qualityScore: 0.95,
          },
        ],
        retrieved_at: new Date().toISOString(),
      });

      const { messages } = await contextualMemory.buildConversationHistory(
        "Query about case",
        { taskType: "case_query" },
      );

      // Should have system context from similar experiences
      const systemMessage = messages.find((m) => m.role === "system");
      expect(systemMessage).toBeDefined();
      expect(systemMessage.content).toContain("similar past interactions");
      expect(systemMessage.content).toContain("case_query");
    });

    it("should respect maxContextMessages limit", async () => {
      // Create many recent messages
      const manyMessages = Array.from({ length: 10 }, (_, i) => ({
        prompt: `Question ${i}`,
        response: `Answer ${i}`,
        timestamp: Date.now() - i * 1000,
      }));

      mockMemory.recall.mockResolvedValue({
        recent: { recentMessages: manyMessages },
        similar: [],
        retrieved_at: new Date().toISOString(),
      });

      const { messages } = await contextualMemory.buildConversationHistory(
        "Current question",
        { taskType: "test" },
      );

      // Should only include the last 5 messages (maxContextMessages)
      // 5 pairs * 2 (user + assistant) + 1 current = 11 messages
      expect(messages.length).toBeLessThanOrEqual(11);
    });
  });

  describe("analyzePrompt", () => {
    it("should extract case numbers from prompt", async () => {
      const prompt =
        "The case number is 2024D007847 for the Arias v. Bianchi matter";
      const analysis = await contextualMemory.analyzePrompt(prompt);

      expect(analysis.entities).toContainEqual({
        type: "case_number",
        value: "2024D007847",
      });
    });

    it("should extract person names from prompt", async () => {
      const prompt =
        "Nicholas Bianchi is the defendant and Gabriela Arias is the plaintiff";
      const analysis = await contextualMemory.analyzePrompt(prompt);

      const personEntities = analysis.entities.filter(
        (e) => e.type === "person",
      );
      expect(personEntities).toContainEqual({
        type: "person",
        value: "Nicholas Bianchi",
      });
      expect(personEntities).toContainEqual({
        type: "person",
        value: "Gabriela Arias",
      });
    });

    it("should extract amounts from prompt", async () => {
      const prompt = "The settlement amount is $50,000.00 plus $5,000 in fees";
      const analysis = await contextualMemory.analyzePrompt(prompt);

      const amountEntities = analysis.entities.filter(
        (e) => e.type === "amount",
      );
      expect(amountEntities).toContainEqual({
        type: "amount",
        value: "$50,000.00",
      });
      expect(amountEntities).toContainEqual({
        type: "amount",
        value: "$5,000",
      });
    });

    it("should extract dates from prompt", async () => {
      const prompt =
        "The hearing is scheduled for 2024-03-15 and discovery ends on 03/01/2024";
      const analysis = await contextualMemory.analyzePrompt(prompt);

      const dateEntities = analysis.entities.filter((e) => e.type === "date");
      expect(dateEntities).toContainEqual({
        type: "date",
        value: "2024-03-15",
      });
      expect(dateEntities).toContainEqual({
        type: "date",
        value: "03/01/2024",
      });
    });

    it("should extract legal topics from prompt", async () => {
      const prompt =
        "We need to file a motion for discovery before the trial date";
      const analysis = await contextualMemory.analyzePrompt(prompt);

      const legalTopics = analysis.topics.filter((t) => t.category === "legal");
      expect(legalTopics).toContainEqual({
        category: "legal",
        keyword: "motion",
        relevance: 1.0,
      });
      expect(legalTopics).toContainEqual({
        category: "legal",
        keyword: "discovery",
        relevance: 1.0,
      });
      expect(legalTopics).toContainEqual({
        category: "legal",
        keyword: "trial",
        relevance: 1.0,
      });
    });
  });

  describe("enrichWithCaseContext", () => {
    it("should add case context when available", async () => {
      const caseData = {
        case_number: "2024D007847",
        parties: ["Arias", "Bianchi"],
        status: "Discovery",
      };

      mockMemory.state.storage.get.mockResolvedValue(caseData);

      const messages = [{ role: "user", content: "What's the status?" }];

      const enrichedMessages = await contextualMemory.enrichWithCaseContext(
        messages,
        "2024D007847",
      );

      expect(enrichedMessages).toHaveLength(2);
      expect(enrichedMessages[0].role).toBe("system");
      expect(enrichedMessages[0].content).toContain("2024D007847");
      expect(enrichedMessages[1]).toEqual({
        role: "user",
        content: "What's the status?",
      });
    });

    it("should not modify messages when no case context exists", async () => {
      mockMemory.state.storage.get.mockResolvedValue(null);

      const messages = [{ role: "user", content: "General question" }];

      const enrichedMessages = await contextualMemory.enrichWithCaseContext(
        messages,
        "unknown-case",
      );

      expect(enrichedMessages).toEqual(messages);
    });
  });

  describe("buildSimilarContext", () => {
    it("should build context from successful similar experiences", () => {
      const similar = [
        {
          taskType: "case_query",
          provider: "openai",
          outcome: "success",
          qualityScore: 0.9,
        },
        {
          taskType: "document_analysis",
          provider: "anthropic",
          outcome: "success",
          qualityScore: 0.85,
        },
        {
          taskType: "summary",
          provider: "workersai",
          outcome: "failure",
        },
      ];

      const context = contextualMemory.buildSimilarContext(similar);

      expect(context).toContain("similar past interactions");
      expect(context).toContain("case_query using openai");
      expect(context).toContain("document_analysis using anthropic");
      expect(context).not.toContain("failure");
    });

    it("should return null for empty similar experiences", () => {
      const context = contextualMemory.buildSimilarContext([]);
      expect(context).toBeNull();
    });
  });
});
