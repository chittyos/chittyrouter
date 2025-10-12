/**
 * ContextualMemory - Advanced memory system inspired by ChittyContextual
 * Converts agent memory into conversation history for AI context injection
 */

import { GovernanceContext } from "./governance-context.js";

export class ContextualMemory {
  constructor(memory, options = {}) {
    this.memory = memory;
    this.maxContextMessages = options.maxContextMessages || 10;
    this.includeSystemContext = options.includeSystemContext !== false;
    this.governance = new GovernanceContext(options.governance || {});
    this.enableGovernance = options.enableGovernance !== false;
  }

  /**
   * Build conversation history from memory tiers
   * Converts stored interactions into OpenAI-compatible message format
   */
  async buildConversationHistory(currentPrompt, options = {}) {
    const { taskType, limit = 5 } = options;

    // Recall from memory tiers
    const memoryContext = await this.memory.recall({ taskType, limit });

    const messages = [];

    // Add system context if available
    if (this.includeSystemContext && memoryContext.systemContext) {
      messages.push({
        role: "system",
        content: memoryContext.systemContext,
      });
    }

    // Convert recent interactions to message history
    if (memoryContext.recent?.recentMessages) {
      for (const interaction of memoryContext.recent.recentMessages.slice(
        -this.maxContextMessages,
      )) {
        // Add user message (original prompt)
        if (interaction.prompt) {
          messages.push({
            role: "user",
            content: interaction.prompt,
          });
        }

        // Add assistant response
        if (interaction.response) {
          messages.push({
            role: "assistant",
            content: interaction.response,
          });
        }
      }
    }

    // Add similar past experiences as system context
    if (memoryContext.similar && memoryContext.similar.length > 0) {
      const similarContext = this.buildSimilarContext(memoryContext.similar);
      if (similarContext) {
        messages.push({
          role: "system",
          content: similarContext,
        });
      }
    }

    // Add current prompt
    messages.push({
      role: "user",
      content: currentPrompt,
    });

    // Enrich with governance context if enabled
    if (this.enableGovernance && options.context) {
      messages = await this.governance.enrichContext(messages, options.context);
    }

    return {
      messages,
      contextMetadata: {
        recentInteractions: memoryContext.recent?.recentMessages?.length || 0,
        similarExperiences: memoryContext.similar?.length || 0,
        governanceEnriched: this.enableGovernance && !!options.context?.case_id,
        retrievedAt: memoryContext.retrieved_at,
      },
    };
  }

  /**
   * Build system context from similar past experiences
   */
  buildSimilarContext(similarExperiences) {
    if (!similarExperiences || similarExperiences.length === 0) {
      return null;
    }

    const contextParts = ["Based on similar past interactions:"];

    for (const experience of similarExperiences) {
      if (experience.outcome === "success") {
        contextParts.push(
          `- Successfully handled ${experience.taskType} using ${experience.provider} (quality: ${experience.qualityScore || "unknown"})`,
        );
      }
    }

    return contextParts.join("\n");
  }

  /**
   * Extract entities and topics from prompt (inspired by ChittyContextual)
   */
  async analyzePrompt(prompt) {
    // Basic keyword extraction (can be enhanced with OpenAI later)
    const entities = this.extractBasicEntities(prompt);
    const topics = this.extractBasicTopics(prompt);

    return {
      entities,
      topics,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Basic entity extraction (people, organizations, dates, amounts)
   */
  extractBasicEntities(text) {
    const entities = [];

    // Extract case numbers (e.g., 2024D007847)
    const caseNumbers = text.match(/\b\d{4}[A-Z]\d+\b/g);
    if (caseNumbers) {
      entities.push(
        ...caseNumbers.map((cn) => ({ type: "case_number", value: cn })),
      );
    }

    // Extract names (capitalized words, 2+ words)
    const namePattern = /\b([A-Z][a-z]+(?: [A-Z][a-z]+)+)\b/g;
    const names = text.match(namePattern);
    if (names) {
      entities.push(...names.map((n) => ({ type: "person", value: n })));
    }

    // Extract amounts ($1000, $1,000.00)
    const amounts = text.match(/\$[\d,]+(?:\.\d{2})?/g);
    if (amounts) {
      entities.push(...amounts.map((a) => ({ type: "amount", value: a })));
    }

    // Extract dates (YYYY-MM-DD, MM/DD/YYYY)
    const dates = text.match(
      /\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}\/\d{4}\b/g,
    );
    if (dates) {
      entities.push(...dates.map((d) => ({ type: "date", value: d })));
    }

    return entities;
  }

  /**
   * Basic topic extraction (legal, business, technical keywords)
   */
  extractBasicTopics(text) {
    const topics = [];

    const legalKeywords = [
      "divorce",
      "litigation",
      "evidence",
      "court",
      "case",
      "attorney",
      "counsel",
      "filing",
      "discovery",
      "motion",
      "trial",
      "settlement",
    ];

    const businessKeywords = [
      "contract",
      "agreement",
      "payment",
      "invoice",
      "transaction",
      "financial",
    ];

    const technicalKeywords = [
      "database",
      "API",
      "system",
      "integration",
      "deployment",
      "service",
    ];

    for (const keyword of legalKeywords) {
      if (text.toLowerCase().includes(keyword)) {
        topics.push({ category: "legal", keyword, relevance: 1.0 });
      }
    }

    for (const keyword of businessKeywords) {
      if (text.toLowerCase().includes(keyword)) {
        topics.push({ category: "business", keyword, relevance: 0.8 });
      }
    }

    for (const keyword of technicalKeywords) {
      if (text.toLowerCase().includes(keyword)) {
        topics.push({ category: "technical", keyword, relevance: 0.6 });
      }
    }

    return topics;
  }

  /**
   * Enrich context with case-specific knowledge
   */
  async enrichWithCaseContext(messages, caseId) {
    // Check if case ID is mentioned in memory
    const caseContext = await this.memory.state.storage.get(`case:${caseId}`);

    if (caseContext) {
      messages.unshift({
        role: "system",
        content: `Case Context: ${JSON.stringify(caseContext)}`,
      });
    }

    return messages;
  }
}
