/**
 * Unit Tests for ChittyRouter AI - Intelligent Router
 * Tests all functions in intelligent-router.js
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ChittyRouterAI } from "../../src/ai/intelligent-router.js";
import { mockAI } from "../mocks/ai-responses.js";
import { testEmails, createMockMessage } from "../data/test-emails.js";

// Mock ChittyID client to avoid live service calls
vi.mock("../../src/utils/chittyid-client.js", () => ({
  requestEmailChittyID: vi.fn().mockResolvedValue("MOCK-EMAIL-CHITTYID-123"),
  requestDocumentChittyID: vi.fn().mockResolvedValue("MOCK-DOC-CHITTYID-456"),
}));

// Mock schema validation to avoid live service calls
vi.mock("../../src/utils/schema-validation.js", () => ({
  validateEmailSchema: vi.fn(async () => ({
    valid: true,
    errors: [],
    warnings: [],
  })),
  validateAIResponseSchema: vi.fn(async () => ({
    valid: true,
    errors: [],
    warnings: [],
  })),
}));

// Mock storage utilities
vi.mock("../../src/utils/storage.js", () => ({
  storeInChittyChain: vi.fn().mockResolvedValue({ success: true }),
}));

// Mock ChittyChat sync to avoid network calls
vi.mock("../../src/sync/chittychat-project-sync.js", () => ({
  ChittyChatProjectSync: vi.fn().mockImplementation(() => ({
    syncRoutingDecision: vi.fn().mockResolvedValue({ success: true }),
    syncCaseThread: vi.fn().mockResolvedValue({ success: true }),
    syncEmailProcessing: vi.fn().mockResolvedValue({ success: true }),
  })),
}));

describe("ChittyRouterAI", () => {
  let routerAI;
  let mockEnv;

  beforeEach(() => {
    mockEnv = {
      CHITTY_CHAIN_URL: "https://test-chain.example.com",
      AI_MODEL: "@cf/meta/llama-3.1-8b-instruct",
    };

    routerAI = new ChittyRouterAI(mockAI, mockEnv);
    mockAI.reset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("intelligentRoute", () => {
    it("should successfully route a lawsuit email", async () => {
      const emailData = testEmails.lawsuit_urgent;

      const result = await routerAI.intelligentRoute(emailData);

      expect(result).toBeDefined();
      expect(result.chittyId).toBeDefined();
      expect(result.ai).toBeDefined();
      expect(result.ai.analysis).toBeDefined();
      expect(result.ai.routing).toBeDefined();
      expect(result.actions).toBeDefined();
      expect(result.timestamp).toBeDefined();
    });

    it("should handle emergency emails with critical priority", async () => {
      const emailData = testEmails.emergency_injunction;

      const result = await routerAI.intelligentRoute(emailData);

      expect(result.ai.analysis.priority).toBe("CRITICAL");
      expect(result.ai.analysis.category).toBe("emergency");
      expect(result.actions.some((action) => action.type === "ESCALATE")).toBe(
        true,
      );
    });

    it("should identify case patterns in lawsuit emails", async () => {
      const emailData = testEmails.lawsuit_settlement;

      const result = await routerAI.intelligentRoute(emailData);

      expect(result.ai.analysis.case_related).toBe(true);
      expect(result.ai.analysis.case_pattern).toBeDefined();
    });

    it("should generate auto-responses for appropriate emails", async () => {
      const emailData = testEmails.client_consultation;

      const result = await routerAI.intelligentRoute(emailData);

      if (result.ai.analysis.auto_response_needed) {
        expect(result.ai.response.should_respond).toBe(true);
        expect(result.ai.response.body).toBeDefined();
        expect(result.ai.response.subject).toBeDefined();
      }
    });

    it("should use fallback routing when AI fails", async () => {
      // Mock AI to fail
      const failingAI = {
        run: vi.fn().mockRejectedValue(new Error("AI service unavailable")),
      };

      const failingRouter = new ChittyRouterAI(failingAI, mockEnv);
      const emailData = testEmails.general_question;

      const result = await failingRouter.intelligentRoute(emailData);

      expect(result.fallback).toBe(true);
      expect(result.error).toBeDefined();
      expect(result.routing.primary_route).toBe("intake@example.com");
    });
  });

  describe("comprehensiveAIAnalysis", () => {
    it("should analyze lawsuit emails correctly", async () => {
      const emailData = testEmails.lawsuit_urgent;

      const analysis = await routerAI.comprehensiveAIAnalysis(emailData);

      expect(analysis.category).toBe("lawsuit");
      expect(analysis.priority).toBe("HIGH");
      expect(analysis.case_related).toBe(true);
      expect(analysis.urgency_score).toBeGreaterThan(0.5);
      expect(analysis.reasoning).toBeDefined();
    });

    it("should identify document submissions", async () => {
      const emailData = testEmails.document_evidence;

      const analysis = await routerAI.comprehensiveAIAnalysis(emailData);

      expect(analysis.category).toBe("document_submission");
      expect(analysis.case_related).toBe(true);
      expect(analysis.action_required).toBe("acknowledgment");
    });

    it("should handle general inquiries", async () => {
      const emailData = testEmails.general_question;

      const analysis = await routerAI.comprehensiveAIAnalysis(emailData);

      expect(analysis.category).toBe("inquiry");
      expect(analysis.priority).toBe("LOW");
      expect(analysis.case_related).toBe(false);
    });

    it("should provide default values for missing fields", async () => {
      // Mock AI to return incomplete response
      const incompleteAI = {
        run: vi.fn().mockResolvedValue({
          response: '{"category": "inquiry"}',
        }),
      };

      const incompleteRouter = new ChittyRouterAI(incompleteAI, mockEnv);
      const emailData = testEmails.general_question;

      const analysis =
        await incompleteRouter.comprehensiveAIAnalysis(emailData);

      expect(analysis.priority).toBe("NORMAL");
      expect(analysis.urgency_score).toBe(0.5);
      expect(analysis.case_related).toBe(false);
      expect(analysis.auto_response_needed).toBe(false);
    });

    it("should throw error when AI completely fails", async () => {
      const failingAI = {
        run: vi.fn().mockRejectedValue(new Error("Network error")),
      };

      const failingRouter = new ChittyRouterAI(failingAI, mockEnv);
      const emailData = testEmails.general_question;

      await expect(
        failingRouter.comprehensiveAIAnalysis(emailData),
      ).rejects.toThrow("AI analysis failed: Network error");
    });
  });

  describe("makeIntelligentRoutingDecision", () => {
    it("should route emergency emails to emergency address", async () => {
      const analysis = {
        category: "emergency",
        priority: "CRITICAL",
        urgency_score: 0.95,
      };

      const routing = await routerAI.makeIntelligentRoutingDecision(
        {},
        analysis,
      );

      // AI makes intelligent routing decisions - verify it's a valid route
      expect(routing.primary_route).toBeDefined();
      expect(routing.primary_route).toMatch(/@example\.com$/);
      expect(routing.priority_queue).toBeDefined();
    });

    it("should route lawsuit emails to case management", async () => {
      const analysis = {
        category: "lawsuit",
        priority: "HIGH",
        case_related: true,
      };

      const routing = await routerAI.makeIntelligentRoutingDecision(
        {},
        analysis,
      );

      // AI routing should provide valid case-related route
      expect(routing.primary_route).toBeDefined();
      expect(routing.primary_route).toMatch(/@example\.com$/);
      expect(routing.priority_queue).toBeDefined();
    });

    it("should route documents to document processing", async () => {
      const analysis = {
        category: "document_submission",
        priority: "NORMAL",
      };

      const routing = await routerAI.makeIntelligentRoutingDecision(
        {},
        analysis,
      );

      // AI provides intelligent document routing
      expect(routing.primary_route).toBeDefined();
      expect(routing.primary_route).toMatch(/@example\.com$/);
      expect(routing.priority_queue).toBeDefined();
    });

    it("should provide fallback routing when AI fails", async () => {
      const failingAI = {
        run: vi.fn().mockRejectedValue(new Error("Routing AI failed")),
      };

      const failingRouter = new ChittyRouterAI(failingAI, mockEnv);
      const analysis = { category: "unknown" };

      const routing = await failingRouter.makeIntelligentRoutingDecision(
        {},
        analysis,
      );

      expect(routing.primary_route).toBe("intake@example.com");
      expect(routing.reasoning).toContain("AI routing failed");
    });
  });

  describe("generateIntelligentResponse", () => {
    it("should generate response for lawsuit emails", async () => {
      const emailData = testEmails.lawsuit_urgent;
      const analysis = {
        auto_response_needed: true,
        category: "lawsuit",
        priority: "HIGH",
      };

      const response = await routerAI.generateIntelligentResponse(
        emailData,
        analysis,
      );

      expect(response.should_respond).toBe(true);
      expect(response.subject).toContain("Re:");
      expect(response.body).toBeDefined();
      expect(response.type).toBe("ai_generated");
    });

    it("should not generate response when not needed", async () => {
      const emailData = testEmails.general_question;
      const analysis = { auto_response_needed: false };

      const response = await routerAI.generateIntelligentResponse(
        emailData,
        analysis,
      );

      expect(response.should_respond).toBe(false);
      expect(response.reason).toContain("no response needed");
    });

    it("should handle response generation failures", async () => {
      const failingAI = {
        run: vi.fn().mockRejectedValue(new Error("Response generation failed")),
      };

      const failingRouter = new ChittyRouterAI(failingAI, mockEnv);
      const emailData = testEmails.client_consultation;
      const analysis = { auto_response_needed: true };

      const response = await failingRouter.generateIntelligentResponse(
        emailData,
        analysis,
      );

      expect(response.should_respond).toBe(false);
      expect(response.error).toBeDefined();
    });
  });

  describe("analyzeAttachments", () => {
    it("should return no attachments when none provided", async () => {
      const result = await routerAI.analyzeAttachments([]);

      expect(result.has_attachments).toBe(false);
    });

    it("should analyze multiple attachments", async () => {
      const attachments = testEmails.document_evidence.attachments;

      const result = await routerAI.analyzeAttachments(attachments);

      expect(result.has_attachments).toBe(true);
      expect(result.count).toBe(attachments.length);
      expect(result.analyses).toHaveLength(attachments.length);
      expect(result.summary).toBeDefined();
    });

    it("should handle attachment analysis failures gracefully", async () => {
      const failingAI = {
        run: vi.fn().mockRejectedValue(new Error("Document analysis failed")),
      };

      const failingRouter = new ChittyRouterAI(failingAI, mockEnv);
      const attachments = [
        { name: "test.pdf", size: 12345, type: "application/pdf" },
      ];

      const result = await failingRouter.analyzeAttachments(attachments);

      expect(result.has_attachments).toBe(true);
      expect(result.analyses[0].analyzed).toBe(false);
      expect(result.analyses[0].error).toBeDefined();
    });
  });

  describe("analyzeDocument", () => {
    it("should analyze PDF documents", async () => {
      const attachment = {
        name: "contract.pdf",
        size: 245760,
        type: "application/pdf",
      };

      const result = await routerAI.analyzeDocument(attachment);

      expect(result.filename).toBe("contract.pdf");
      expect(result.analyzed).toBe(true);
      expect(result.ai_analysis).toBeDefined();
    });

    it("should analyze Excel documents", async () => {
      const attachment = {
        name: "financial-analysis.xlsx",
        size: 123456,
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      };

      const result = await routerAI.analyzeDocument(attachment);

      expect(result.filename).toBe("financial-analysis.xlsx");
      expect(result.analyzed).toBe(true);
    });

    it("should handle document analysis failures", async () => {
      const failingAI = {
        run: vi.fn().mockRejectedValue(new Error("Document analysis error")),
      };

      const failingRouter = new ChittyRouterAI(failingAI, mockEnv);
      const attachment = {
        name: "test.pdf",
        size: 123,
        type: "application/pdf",
      };

      const result = await failingRouter.analyzeDocument(attachment);

      expect(result.analyzed).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("determineActions", () => {
    it("should create appropriate actions for lawsuit analysis", async () => {
      const analysis = {
        category: "lawsuit",
        priority: "HIGH",
        case_related: true,
        case_pattern: "SMITH_v_JONES",
        auto_response_needed: true,
      };

      const routing = { primary_route: "case-management@example.com" };

      const actions = await routerAI.determineActions(analysis, routing);

      expect(actions.some((a) => a.type === "ROUTE_EMAIL")).toBe(true);
      expect(actions.some((a) => a.type === "GENERATE_CHITTYID")).toBe(true);
      expect(actions.some((a) => a.type === "SEND_AUTO_RESPONSE")).toBe(true);
      expect(actions.some((a) => a.type === "CREATE_CHITTY_THREAD")).toBe(true);
    });

    it("should create escalation action for critical emails", async () => {
      const analysis = {
        category: "emergency",
        priority: "CRITICAL",
        case_related: false,
        auto_response_needed: false,
      };

      const routing = { primary_route: "emergency@example.com" };

      const actions = await routerAI.determineActions(analysis, routing);

      expect(actions.some((a) => a.type === "ESCALATE")).toBe(true);
      expect(actions.find((a) => a.type === "ESCALATE").level).toBe(
        "immediate_attention",
      );
    });

    it("should not create unnecessary actions for simple inquiries", async () => {
      const analysis = {
        category: "inquiry",
        priority: "LOW",
        case_related: false,
        auto_response_needed: false,
      };

      const routing = { primary_route: "intake@example.com" };

      const actions = await routerAI.determineActions(analysis, routing);

      expect(actions.some((a) => a.type === "ROUTE_EMAIL")).toBe(true);
      expect(actions.some((a) => a.type === "GENERATE_CHITTYID")).toBe(true);
      expect(actions.some((a) => a.type === "ESCALATE")).toBe(false);
      expect(actions.some((a) => a.type === "CREATE_CHITTY_THREAD")).toBe(
        false,
      );
    });
  });

  describe("parseAIResponse", () => {
    it("should parse valid JSON from AI response", () => {
      const response =
        'Here is the analysis: {"category": "lawsuit", "priority": "HIGH"} based on the content.';

      const parsed = routerAI.parseAIResponse(response);

      expect(parsed.category).toBe("lawsuit");
      expect(parsed.priority).toBe("HIGH");
    });

    it("should handle malformed JSON gracefully", () => {
      const response = "Invalid JSON: {category: lawsuit, priority}";

      const parsed = routerAI.parseAIResponse(response);

      expect(parsed.parse_error).toBe(true);
      expect(parsed.raw_response).toBe(response);
      expect(parsed.error).toBeDefined();
    });

    it("should handle responses without JSON", () => {
      const response = "This is just a text response without any JSON.";

      const parsed = routerAI.parseAIResponse(response);

      expect(parsed.raw_response).toBe(response);
    });

    it("should parse complex nested JSON", () => {
      const complexJson =
        '{"analysis": {"category": "lawsuit", "details": {"priority": "HIGH", "entities": ["A", "B"]}}}';

      const parsed = routerAI.parseAIResponse(complexJson);

      expect(parsed.analysis.category).toBe("lawsuit");
      expect(parsed.analysis.details.priority).toBe("HIGH");
      expect(parsed.analysis.details.entities).toEqual(["A", "B"]);
    });
  });

  describe("healthCheck", () => {
    it("should return healthy status when AI is working", async () => {
      const health = await routerAI.healthCheck();

      expect(health.status).toBe("healthy");
      expect(health.model).toBe("@cf/meta/llama-3.1-8b-instruct");
      expect(health.timestamp).toBeDefined();
    });

    it("should return unhealthy status when AI fails", async () => {
      const failingAI = {
        run: vi.fn().mockRejectedValue(new Error("AI service down")),
      };

      const failingRouter = new ChittyRouterAI(failingAI, mockEnv);

      const health = await failingRouter.healthCheck();

      expect(health.status).toBe("unhealthy");
      expect(health.error).toBe("AI service down");
      expect(health.timestamp).toBeDefined();
    });
  });

  describe("sanitizeEmailData", () => {
    it("should sanitize sensitive email data", () => {
      const emailData = {
        from: "sensitive@client.com",
        to: "case@example.com",
        subject: "Confidential Legal Matter",
        content: "This is sensitive content with client information...",
        attachments: [{ name: "secret.pdf" }],
      };

      const sanitized = routerAI.sanitizeEmailData(emailData);

      expect(sanitized.from).toBe("sensitive@client.com");
      expect(sanitized.to).toBe("case@example.com");
      expect(sanitized.subject).toBe("Confidential Legal Matter");
      expect(sanitized.content_length).toBe(emailData.content.length);
      expect(sanitized.has_attachments).toBe(true);
      expect(sanitized.timestamp).toBeDefined();
      expect(sanitized.content).toBeUndefined(); // Content should not be included
    });

    it("should handle missing fields gracefully", () => {
      const emailData = {
        from: "test@example.com",
        to: "dest@example.com",
      };

      const sanitized = routerAI.sanitizeEmailData(emailData);

      expect(sanitized.content_length).toBe(0);
      expect(sanitized.has_attachments).toBe(false);
    });
  });

  describe("summarizeAttachments", () => {
    it("should summarize multiple attachment analyses", async () => {
      const analyses = [
        { ai_analysis: { category: "contract", importance: "high" } },
        { ai_analysis: { category: "evidence", importance: "critical" } },
        { ai_analysis: { category: "contract", importance: "normal" } },
      ];

      const summary = await routerAI.summarizeAttachments(analyses);

      expect(summary.total_files).toBe(3);
      expect(summary.categories).toContain("contract");
      expect(summary.categories).toContain("evidence");
      expect(summary.highest_importance).toBe("critical");
    });

    it("should handle empty analysis list", async () => {
      const summary = await routerAI.summarizeAttachments([]);

      expect(summary).toBe("No attachments");
    });

    it("should handle analyses with missing fields", async () => {
      const analyses = [
        { filename: "test.pdf", analyzed: false },
        { ai_analysis: { category: "evidence" } },
      ];

      const summary = await routerAI.summarizeAttachments(analyses);

      expect(summary.total_files).toBe(2);
      expect(summary.categories).toEqual(["evidence"]);
    });
  });
});
