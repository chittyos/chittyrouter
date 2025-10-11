/**
 * Unit Tests for Email Processor
 * Tests all functions in email-processor.js
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { EmailProcessor } from "../../src/ai/email-processor.js";
import { mockAI } from "../mocks/ai-responses.js";
import { testEmails, createMockMessage } from "../data/test-emails.js";

// Mock the ChittyRouterAI dependency
vi.mock("../../src/ai/intelligent-router.js", () => ({
  ChittyRouterAI: vi.fn().mockImplementation(() => ({
    intelligentRoute: vi.fn().mockResolvedValue({
      chittyId: "CHITTY-TEST-123",
      ai: {
        analysis: {
          category: "lawsuit",
          priority: "HIGH",
          case_related: true,
          case_pattern: "SMITH_v_JONES",
          auto_response_needed: true,
        },
        routing: {
          primary_route: "case-management@example.com",
          cc_routes: [],
          priority_queue: "high",
        },
        response: {
          should_respond: true,
          subject: "Re: Test Subject",
          body: "Thank you for your email...",
        },
      },
      actions: [
        { type: "ROUTE_EMAIL", destination: "case-management@example.com" },
        { type: "GENERATE_CHITTYID" },
        { type: "SEND_AUTO_RESPONSE" },
      ],
    }),
  })),
}));

// Mock utilities - Using mock format to avoid rogue ChittyID patterns
vi.mock("../../src/utils/chittyid-client.js", () => ({
  requestEmailChittyID: vi.fn().mockResolvedValue("MOCK-TEST-456"),
}));

vi.mock("../../src/utils/storage.js", () => ({
  storeInChittyChain: vi.fn().mockResolvedValue({ success: true }),
}));

describe("EmailProcessor", () => {
  let processor;
  let mockEnv;

  beforeEach(() => {
    mockEnv = {
      CHITTY_CHAIN_URL: "https://test-chain.example.com",
      AI_MODEL: "@cf/meta/llama-3.1-8b-instruct",
    };

    processor = new EmailProcessor(mockAI, mockEnv);
    mockAI.reset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("processIncomingEmail", () => {
    it("should successfully process a lawsuit email", async () => {
      const message = createMockMessage("lawsuit_urgent");

      const result = await processor.processIncomingEmail(message, {});

      expect(result.success).toBe(true);
      expect(result.chittyId).toBeDefined();
      expect(result.ai_processed).toBe(true);
      expect(result.routing).toBeDefined();
      expect(result.actions_taken).toBeDefined();
    });

    it("should process emergency emails with proper escalation", async () => {
      const message = createMockMessage("emergency_injunction");

      const result = await processor.processIncomingEmail(message, {});

      expect(result.success).toBe(true);
      expect(result.ai_processed).toBe(true);
      expect(result.chittyId).toBeDefined();
    });

    it("should handle document submission emails", async () => {
      const message = createMockMessage("document_evidence");

      const result = await processor.processIncomingEmail(message, {});

      expect(result.success).toBe(true);
      expect(result.routing).toBeDefined();
    });

    it("should use fallback processing when AI routing fails", async () => {
      // Mock the router to fail
      const failingProcessor = new EmailProcessor(mockAI, mockEnv);
      failingProcessor.router.intelligentRoute = vi
        .fn()
        .mockRejectedValue(new Error("AI routing failed"));

      const message = createMockMessage("general_question");

      const result = await failingProcessor.processIncomingEmail(message, {});

      expect(result.success).toBe(true);
      expect(result.fallback).toBe(true);
      expect(result.error).toBeDefined();
    });
  });

  describe("extractEmailData", () => {
    it("should extract all email data correctly", async () => {
      const message = createMockMessage("lawsuit_urgent");

      const emailData = await processor.extractEmailData(message);

      expect(emailData.from).toBe(testEmails.lawsuit_urgent.from);
      expect(emailData.to).toBe(testEmails.lawsuit_urgent.to);
      expect(emailData.subject).toBe(testEmails.lawsuit_urgent.subject);
      expect(emailData.content).toBeDefined();
      expect(emailData.attachments).toBeDefined();
      expect(emailData.timestamp).toBeDefined();
      expect(emailData.messageId).toBeDefined();
    });

    it("should handle emails with multiple attachments", async () => {
      const message = createMockMessage("document_evidence");

      const emailData = await processor.extractEmailData(message);

      expect(emailData.attachments).toHaveLength(
        testEmails.document_evidence.attachments.length,
      );
      expect(emailData.attachments[0].chittyId).toBeDefined();
    });

    it("should extract case patterns when present", async () => {
      const message = createMockMessage("lawsuit_settlement");

      const emailData = await processor.extractEmailData(message);

      expect(emailData.casePattern).toBeDefined();
      if (emailData.casePattern) {
        expect(emailData.casePattern.has_case_pattern).toBe(true);
        expect(emailData.casePattern.extracted_pattern).toBeDefined();
      }
    });

    it("should handle emails without case patterns", async () => {
      const message = createMockMessage("general_question");

      const emailData = await processor.extractEmailData(message);

      // casePattern might be null for non-case emails
      expect(
        emailData.casePattern === null ||
          emailData.casePattern?.has_case_pattern === false,
      ).toBe(true);
    });
  });

  describe("extractCasePattern", () => {
    it("should extract lawsuit patterns", async () => {
      const to = "smith-v-jones@example.com";
      const subject = "Urgent Motion in Smith v. Jones";
      const content = "Regarding the Smith v. Jones case number 2024D007847...";

      const pattern = await processor.extractCasePattern(to, subject, content);

      expect(pattern).toBeDefined();
      expect(pattern.has_case_pattern).toBe(true);
      expect(pattern.pattern_type).toBe("lawsuit");
      expect(pattern.extracted_pattern).toContain("SMITH");
      expect(pattern.extracted_pattern).toContain("JONES");
    });

    it("should handle emails without case patterns", async () => {
      const to = "info@example.com";
      const subject = "General inquiry";
      const content = "I have a question about legal services...";

      const pattern = await processor.extractCasePattern(to, subject, content);

      expect(pattern === null || pattern.has_case_pattern === false).toBe(true);
    });

    it("should use fallback extraction when AI fails", async () => {
      const failingAI = {
        run: vi.fn().mockRejectedValue(new Error("Case pattern AI failed")),
      };

      const failingProcessor = new EmailProcessor(failingAI, mockEnv);

      const to = "arias-v-bianchi@example.com";
      const subject = "Test";
      const content = "Test content";

      const pattern = await failingProcessor.extractCasePattern(
        to,
        subject,
        content,
      );

      expect(pattern).toBeDefined();
      expect(pattern.fallback).toBe(true);
      expect(pattern.extracted_pattern).toContain("ARIAS");
      expect(pattern.extracted_pattern).toContain("BIANCHI");
    });
  });

  describe("executeRoutingActions", () => {
    it("should execute all routing actions", async () => {
      const message = createMockMessage("lawsuit_urgent");
      const routingResult = {
        chittyId: "CHITTY-123",
        actions: [
          { type: "ROUTE_EMAIL", destination: "case-management@example.com" },
          { type: "GENERATE_CHITTYID" },
          { type: "CREATE_CHITTY_THREAD", case_pattern: "SMITH_v_JONES" },
          { type: "ESCALATE", level: "immediate_attention" },
          { type: "SEND_AUTO_RESPONSE" },
        ],
      };

      // Spy on console.log to verify actions are logged
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await processor.executeRoutingActions(message, routingResult);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Routing to:"),
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("ChittyID generated:"),
      );

      consoleSpy.mockRestore();
    });

    it("should handle unknown action types gracefully", async () => {
      const message = createMockMessage("general_question");
      const routingResult = {
        chittyId: "CHITTY-123",
        actions: [{ type: "UNKNOWN_ACTION_TYPE", data: "test" }],
      };

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await processor.executeRoutingActions(message, routingResult);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Unknown action type"),
      );

      consoleSpy.mockRestore();
    });

    it("should handle action execution failures", async () => {
      const message = createMockMessage("emergency_injunction");
      const routingResult = {
        chittyId: "CHITTY-123",
        actions: [
          { type: "CREATE_CHITTY_THREAD", case_pattern: "SMITH_v_JONES" },
        ],
      };

      // Mock storeInChittyChain to fail
      const { storeInChittyChain } = await import("../../src/utils/storage.js");
      storeInChittyChain.mockRejectedValueOnce(new Error("Storage failed"));

      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      await processor.executeRoutingActions(message, routingResult);

      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe("sendAIResponse", () => {
    it("should send AI-generated response", async () => {
      const message = createMockMessage("client_consultation");
      const response = {
        subject: "Re: Legal Consultation Request",
        body: "Thank you for your inquiry. We will review your case...",
      };

      const replySpy = vi
        .spyOn(message, "reply")
        .mockResolvedValue({ success: true });
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await processor.sendAIResponse(message, response);

      expect(replySpy).toHaveBeenCalledWith({
        subject: response.subject,
        text: expect.stringContaining(response.body),
      });

      expect(consoleSpy).toHaveBeenCalledWith("✅ AI response sent");

      replySpy.mockRestore();
      consoleSpy.mockRestore();
    });

    it("should handle response sending failures", async () => {
      const message = createMockMessage("client_consultation");
      const response = {
        subject: "Re: Test",
        body: "Test response",
      };

      const replySpy = vi
        .spyOn(message, "reply")
        .mockRejectedValue(new Error("Send failed"));
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      await processor.sendAIResponse(message, response);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Failed to send AI response:",
        expect.any(Error),
      );

      replySpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });
  });

  describe("forwardToRoutes", () => {
    it("should forward to primary route", async () => {
      const message = createMockMessage("lawsuit_urgent");
      const routing = {
        primary_route: "case-management@example.com",
      };

      const forwardSpy = vi
        .spyOn(message, "forward")
        .mockResolvedValue({ success: true });
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await processor.forwardToRoutes(message, routing);

      expect(forwardSpy).toHaveBeenCalledWith("case-management@example.com");
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Forwarded to primary"),
      );

      forwardSpy.mockRestore();
      consoleSpy.mockRestore();
    });

    it("should forward to CC routes", async () => {
      const message = createMockMessage("emergency_injunction");
      const routing = {
        primary_route: "emergency@example.com",
        cc_routes: ["partners@example.com", "case-management@example.com"],
      };

      const forwardSpy = vi
        .spyOn(message, "forward")
        .mockResolvedValue({ success: true });

      await processor.forwardToRoutes(message, routing);

      expect(forwardSpy).toHaveBeenCalledWith("emergency@example.com");
      expect(forwardSpy).toHaveBeenCalledWith("partners@example.com");
      expect(forwardSpy).toHaveBeenCalledWith("case-management@example.com");

      forwardSpy.mockRestore();
    });

    it("should use fallback route when forwarding fails", async () => {
      const message = createMockMessage("general_question");
      const routing = {
        primary_route: "case-management@example.com",
      };

      const forwardSpy = vi
        .spyOn(message, "forward")
        .mockRejectedValueOnce(new Error("Forward failed"))
        .mockResolvedValueOnce({ success: true });

      await processor.forwardToRoutes(message, routing);

      expect(forwardSpy).toHaveBeenCalledWith("case-management@example.com");
      expect(forwardSpy).toHaveBeenCalledWith("intake@example.com"); // Fallback

      forwardSpy.mockRestore();
    });
  });

  describe("createChittyThread", () => {
    it("should create thread for case-related emails", async () => {
      const routingResult = {
        chittyId: "CHITTY-123",
        ai: {
          analysis: {
            case_pattern: "SMITH_v_JONES",
            priority: "HIGH",
          },
        },
      };

      const message = createMockMessage("lawsuit_urgent");
      const { storeInChittyChain } = await import("../../src/utils/storage.js");
      storeInChittyChain.mockResolvedValueOnce({ success: true });

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await processor.createChittyThread(routingResult, message);

      expect(storeInChittyChain).toHaveBeenCalledWith(
        expect.objectContaining({
          chittyId: "CHITTY-123",
          casePattern: "SMITH_v_JONES",
          type: "EMAIL_INTAKE",
          priority: "HIGH",
        }),
      );

      expect(consoleSpy).toHaveBeenCalledWith("💬 ChittyChat thread created");

      consoleSpy.mockRestore();
    });

    it("should handle thread creation failures", async () => {
      const routingResult = {
        chittyId: "CHITTY-123",
        ai: { analysis: { case_pattern: "TEST_v_CASE" } },
      };

      const message = createMockMessage("lawsuit_urgent");
      const { storeInChittyChain } = await import("../../src/utils/storage.js");
      storeInChittyChain.mockRejectedValueOnce(
        new Error("Thread creation failed"),
      );

      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      await processor.createChittyThread(routingResult, message);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Failed to create ChittyChat thread:",
        expect.any(Error),
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe("escalateMessage", () => {
    it("should escalate urgent messages", async () => {
      const message = createMockMessage("emergency_injunction");
      const action = {
        type: "ESCALATE",
        level: "immediate_attention",
      };

      const forwardSpy = vi
        .spyOn(message, "forward")
        .mockResolvedValue({ success: true });
      const { storeInChittyChain } = await import("../../src/utils/storage.js");
      storeInChittyChain.mockResolvedValueOnce({ success: true });

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await processor.escalateMessage(message, action);

      expect(forwardSpy).toHaveBeenCalledWith("emergency@example.com");
      expect(storeInChittyChain).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "URGENT_EMAIL_ESCALATION",
          level: "immediate_attention",
        }),
      );

      expect(consoleSpy).toHaveBeenCalledWith("🚨 Message escalated");

      forwardSpy.mockRestore();
      consoleSpy.mockRestore();
    });

    it("should handle escalation failures", async () => {
      const message = createMockMessage("emergency_subpoena");
      const action = { type: "ESCALATE", level: "critical" };

      const forwardSpy = vi
        .spyOn(message, "forward")
        .mockRejectedValue(new Error("Escalation failed"));
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      await processor.escalateMessage(message, action);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Failed to escalate message:",
        expect.any(Error),
      );

      forwardSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });
  });

  describe("processAttachments", () => {
    it("should process multiple attachments", async () => {
      const message = createMockMessage("document_evidence");

      const attachments = await processor.processAttachments(message);

      expect(attachments).toHaveLength(
        testEmails.document_evidence.attachments.length,
      );
      expect(attachments[0].chittyId).toBeDefined();
      expect(attachments[0].processed).toBe(true);
    });

    it("should handle messages without attachments", async () => {
      const message = createMockMessage("general_question");

      const attachments = await processor.processAttachments(message);

      expect(attachments).toHaveLength(0);
    });

    it("should handle attachment processing failures", async () => {
      const message = {
        from: "test@example.com",
        attachments: [{ name: "test.pdf", size: 123, type: "application/pdf" }],
      };

      const { requestEmailChittyID } = await import(
        "../../src/utils/chittyid-client.js"
      );
      requestEmailChittyID.mockRejectedValueOnce(
        new Error("ChittyID generation failed"),
      );

      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const attachments = await processor.processAttachments(message);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Attachment processing failed:",
        expect.any(Error),
      );
      expect(attachments).toHaveLength(0);

      consoleErrorSpy.mockRestore();
    });
  });

  describe("streamToText", () => {
    it("should convert readable stream to text", async () => {
      const testText = "This is test email content";
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(testText));
          controller.close();
        },
      });

      const result = await processor.streamToText(stream);

      expect(result).toBe(testText);
    });

    it("should handle empty streams", async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.close();
        },
      });

      const result = await processor.streamToText(stream);

      expect(result).toBe("");
    });

    it("should handle streams with multiple chunks", async () => {
      const chunks = ["First chunk", " Second chunk", " Third chunk"];
      const stream = new ReadableStream({
        start(controller) {
          chunks.forEach((chunk) => {
            controller.enqueue(new TextEncoder().encode(chunk));
          });
          controller.close();
        },
      });

      const result = await processor.streamToText(stream);

      expect(result).toBe(chunks.join(""));
    });
  });

  describe("fallbackProcessing", () => {
    it("should provide basic email processing when AI fails", async () => {
      const message = createMockMessage("general_question");
      const error = new Error("AI system unavailable");

      const forwardSpy = vi
        .spyOn(message, "forward")
        .mockResolvedValue({ success: true });
      const replySpy = vi
        .spyOn(message, "reply")
        .mockResolvedValue({ success: true });

      const result = await processor.fallbackProcessing(message, error);

      expect(result.success).toBe(true);
      expect(result.fallback).toBe(true);
      expect(result.error).toBe(error.message);
      expect(result.routing.primary_route).toBe("intake@example.com");

      expect(forwardSpy).toHaveBeenCalledWith("intake@example.com");
      expect(replySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: expect.stringContaining("Re:"),
        }),
      );

      forwardSpy.mockRestore();
      replySpy.mockRestore();
    });

    it("should handle complete system failure", async () => {
      const message = createMockMessage("general_question");
      const error = new Error("System error");

      const forwardSpy = vi
        .spyOn(message, "forward")
        .mockRejectedValue(new Error("Forward failed"));
      const replySpy = vi
        .spyOn(message, "reply")
        .mockRejectedValue(new Error("Reply failed"));

      const result = await processor.fallbackProcessing(message, error);

      expect(result.success).toBe(false);
      expect(result.fallback_failed).toBe(true);
      expect(result.error).toBeDefined();

      forwardSpy.mockRestore();
      replySpy.mockRestore();
    });
  });

  describe("parseAIResponse", () => {
    it("should parse valid JSON responses", () => {
      const response =
        'Analysis: {"has_case_pattern": true, "pattern_type": "lawsuit"}';

      const parsed = processor.parseAIResponse(response);

      expect(parsed.has_case_pattern).toBe(true);
      expect(parsed.pattern_type).toBe("lawsuit");
    });

    it("should handle invalid JSON gracefully", () => {
      const response = "Invalid JSON: {pattern: lawsuit}";

      const parsed = processor.parseAIResponse(response);

      expect(parsed.parse_error).toBe(true);
      expect(parsed.raw_response).toBe(response);
    });
  });

  describe("fallbackCaseExtraction", () => {
    it("should extract case patterns using regex fallback", () => {
      const to = "smith-v-jones@example.com";
      const subject = "Test case";

      const pattern = processor.fallbackCaseExtraction(to, subject);

      expect(pattern.has_case_pattern).toBe(true);
      expect(pattern.pattern_type).toBe("lawsuit");
      expect(pattern.extracted_pattern).toBe("SMITH_v_JONES");
      expect(pattern.fallback).toBe(true);
    });

    it("should return null when no pattern found", () => {
      const to = "info@example.com";
      const subject = "General inquiry";

      const pattern = processor.fallbackCaseExtraction(to, subject);

      expect(pattern).toBeNull();
    });
  });
});
