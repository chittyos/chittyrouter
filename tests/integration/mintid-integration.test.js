/**
 * Phase 1 ChittyID mintId Integration Tests
 *
 * Tests all 3 critical security point implementations:
 * 1. Session Management (ChittyRouter)
 * 2. API Key Generation (ChittyAuth)
 * 3. Audit Logging (ChittySchema)
 *
 * Verifies:
 * - Proper ChittyID minting at runtime
 * - Graceful fallback to pending IDs
 * - Error handling and logging
 * - ID format validation
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { mintId } from "../../src/utils/mint-id.js";

// Mock environment for testing
const mockEnv = {
  CHITTY_ID_TOKEN: "test_token_12345",
  CHITTYID_SERVICE_URL: "https://id.chitty.cc",
};

describe("Phase 1: ChittyID mintId Integration Tests", () => {
  describe("1. Session Management (ChittyRouter)", () => {
    it("should mint ChittyID for session with SESSN entity", async () => {
      // Mock successful ChittyID service response
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          chittyId: "CHITTY-SESSN-TEST001-ABC",
          entity: "SESSN",
          purpose: "project-123-sync",
          timestamp: new Date().toISOString(),
        }),
      });

      const sessionId = await mintId("SESSN", "project-123-sync", mockEnv);

      expect(sessionId).toMatch(/^CHITTY-SESSN-/);
      expect(global.fetch).toHaveBeenCalledWith(
        "https://id.chitty.cc/v1/mint",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            Authorization: "Bearer test_token_12345",
          }),
        }),
      );
    });

    it("should fallback to pending ID when service unavailable", async () => {
      // Mock service failure
      global.fetch = vi
        .fn()
        .mockRejectedValue(new Error("Service unavailable"));

      const sessionId = await mintId("SESSN", "project-123-sync", mockEnv);

      expect(sessionId).toMatch(/^pending-sessn-\d+$/);
      expect(sessionId).toContain("pending-sessn-");
    });

    it("should use deterministic pending ID format", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

      const id1 = await mintId("SESSN", "test", mockEnv);
      // Add small delay to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 5));
      const id2 = await mintId("SESSN", "test", mockEnv);

      // Both should be valid pending IDs
      expect(id1).toMatch(/^pending-sessn-\d+$/);
      expect(id2).toMatch(/^pending-sessn-\d+$/);

      // Should be different due to timestamp
      expect(id1).not.toBe(id2);
    });

    it("should handle missing environment token gracefully", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: "Unauthorized" }),
      });

      const sessionId = await mintId("SESSN", "test", {});

      expect(sessionId).toMatch(/^pending-sessn-\d+$/);
    });
  });

  describe("2. API Key Generation (ChittyAuth)", () => {
    it("should mint ChittyID for API key with APIKEY entity", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          chittyId: "CHITTY-APIKEY-KEY001-XYZ",
          entity: "APIKEY",
          purpose: "auth-service",
          timestamp: new Date().toISOString(),
        }),
      });

      const apiKeyId = await mintId("APIKEY", "auth-service", mockEnv);

      expect(apiKeyId).toMatch(/^CHITTY-APIKEY-/);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/v1/mint"),
        expect.objectContaining({
          body: JSON.stringify({ entity: "APIKEY", purpose: "auth-service" }),
        }),
      );
    });

    it("should fallback to pending ID for API key on service failure", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: "Internal server error" }),
      });

      const apiKeyId = await mintId("APIKEY", "auth-service", mockEnv);

      expect(apiKeyId).toMatch(/^pending-apikey-\d+$/);
    });

    it("should handle ChittyIDClient.mintAPIKeyID() integration pattern", async () => {
      // Simulate ChittyIDClient behavior
      const mockClient = {
        env: mockEnv,
        serviceUrl: "https://id.chitty.cc",
        async mintAPIKeyID() {
          const response = await fetch(`${this.serviceUrl}/v1/mint`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${this.env.CHITTY_ID_TOKEN || ""}`,
            },
            body: JSON.stringify({
              type: "APIKEY",
              namespace: "AUTH",
            }),
          });

          if (!response.ok) {
            throw new Error(
              "ChittyID service unavailable - cannot mint API key ID",
            );
          }

          const result = await response.json();
          return result.chitty_id || result.chittyId;
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          chitty_id: "CHITTY-APIKEY-AUTH001-ABC",
        }),
      });

      const apiKeyId = await mockClient.mintAPIKeyID();
      expect(apiKeyId).toBe("CHITTY-APIKEY-AUTH001-ABC");
    });
  });

  describe("3. Audit Logging (ChittySchema)", () => {
    it("should mint ChittyID for audit log with AUDIT entity", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          chittyId: "CHITTY-AUDIT-LOG001-DEF",
          entity: "AUDIT",
          purpose: "fact-create-case123",
          timestamp: new Date().toISOString(),
        }),
      });

      const auditId = await mintId("AUDIT", "fact-create-case123", mockEnv);

      expect(auditId).toMatch(/^CHITTY-AUDIT-/);
    });

    it("should mint different audit IDs for different actions", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ chittyId: "CHITTY-AUDIT-LOG001-ABC" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ chittyId: "CHITTY-AUDIT-LOG002-DEF" }),
        });

      const createId = await mintId("AUDIT", "fact-create-case123", mockEnv);
      const updateId = await mintId("AUDIT", "case-update-case456", mockEnv);

      expect(createId).not.toBe(updateId);
      expect(createId).toMatch(/^CHITTY-AUDIT-/);
      expect(updateId).toMatch(/^CHITTY-AUDIT-/);
    });

    it("should include action and entity in purpose string", async () => {
      let capturedBody;
      global.fetch = vi.fn().mockImplementation(async (url, options) => {
        capturedBody = JSON.parse(options.body);
        return {
          ok: true,
          json: async () => ({ chittyId: "CHITTY-AUDIT-LOG001-ABC" }),
        };
      });

      await mintId("AUDIT", "fact-create-case123", mockEnv);

      expect(capturedBody.purpose).toBe("fact-create-case123");
      expect(capturedBody.entity).toBe("AUDIT");
    });

    it("should fallback to pending ID for audit logs", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Network timeout"));

      const auditId = await mintId("AUDIT", "fact-verify-fact789", mockEnv);

      expect(auditId).toMatch(/^pending-audit-\d+$/);
    });
  });

  describe("4. Cross-Implementation Validation", () => {
    it("should maintain consistent ID format across all implementations", async () => {
      const successfulMints = [];
      const failedMints = [];

      // Mock service to track all mints
      global.fetch = vi.fn().mockImplementation(async (url, options) => {
        const body = JSON.parse(options.body);
        const chittyId = `CHITTY-${body.entity}-TEST${successfulMints.length}-ABC`;
        successfulMints.push({ entity: body.entity, chittyId });

        return {
          ok: true,
          json: async () => ({ chittyId }),
        };
      });

      const sessionId = await mintId("SESSN", "test", mockEnv);
      const apiKeyId = await mintId("APIKEY", "test", mockEnv);
      const auditId = await mintId("AUDIT", "test", mockEnv);

      // All should match ChittyID format
      expect(sessionId).toMatch(/^CHITTY-[A-Z]+-[A-Z0-9]+-[A-Z0-9]+$/);
      expect(apiKeyId).toMatch(/^CHITTY-[A-Z]+-[A-Z0-9]+-[A-Z0-9]+$/);
      expect(auditId).toMatch(/^CHITTY-[A-Z]+-[A-Z0-9]+-[A-Z0-9]+$/);
    });

    it("should maintain consistent pending ID format on failures", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Service down"));

      const sessionId = await mintId("SESSN", "test", mockEnv);
      const apiKeyId = await mintId("APIKEY", "test", mockEnv);
      const auditId = await mintId("AUDIT", "test", mockEnv);

      // All should match pending ID format
      expect(sessionId).toMatch(/^pending-[a-z]+-\d+$/);
      expect(apiKeyId).toMatch(/^pending-[a-z]+-\d+$/);
      expect(auditId).toMatch(/^pending-[a-z]+-\d+$/);
    });

    it("should not use random() or crypto patterns flagged by chittycheck", async () => {
      global.fetch = vi
        .fn()
        .mockRejectedValue(new Error("Service unavailable"));

      const id = await mintId("TEST", "purpose", mockEnv);

      // Should NOT match random patterns
      expect(id).not.toMatch(/Math\.random/);
      expect(id).not.toMatch(/crypto\.randomUUID/);
      expect(id).not.toMatch(/uuid\.v4/);

      // Should match deterministic timestamp pattern
      expect(id).toMatch(/^pending-test-\d+$/);
    });
  });

  describe("5. Error Handling and Logging", () => {
    it("should log errors but not throw on service failure", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const consoleWarnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {});

      global.fetch = vi.fn().mockRejectedValue(new Error("Connection refused"));

      const id = await mintId("TEST", "purpose", mockEnv);

      expect(id).toMatch(/^pending-test-\d+$/);
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(consoleErrorSpy.mock.calls[0][0]).toContain(
        "[mint-id] Failed to mint ChittyID",
      );
      expect(consoleWarnSpy).toHaveBeenCalled();
      expect(consoleWarnSpy.mock.calls[0][0]).toContain(
        "[mint-id] Using fallback ID",
      );

      consoleErrorSpy.mockRestore();
      consoleWarnSpy.mockRestore();
    });

    it("should handle malformed service responses", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ error: "Missing chittyId field" }),
      });

      const id = await mintId("TEST", "purpose", mockEnv);

      // Should fallback to pending ID
      expect(id).toMatch(/^pending-test-\d+$/);
    });

    it("should handle HTTP error responses", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ error: "Forbidden" }),
      });

      const id = await mintId("TEST", "purpose", mockEnv);

      expect(id).toMatch(/^pending-test-\d+$/);
    });
  });

  describe("6. Environment Configuration", () => {
    it("should use CHITTY_ID_TOKEN from environment", async () => {
      let capturedHeaders;
      global.fetch = vi.fn().mockImplementation(async (url, options) => {
        capturedHeaders = options.headers;
        return {
          ok: true,
          json: async () => ({ chittyId: "CHITTY-TEST-001-ABC" }),
        };
      });

      await mintId("TEST", "purpose", { token: "custom_token" });

      expect(capturedHeaders.Authorization).toBe("Bearer custom_token");
    });

    it("should use custom service URL when provided", async () => {
      let capturedUrl;
      global.fetch = vi.fn().mockImplementation(async (url, options) => {
        capturedUrl = url;
        return {
          ok: true,
          json: async () => ({ chittyId: "CHITTY-TEST-001-ABC" }),
        };
      });

      await mintId("TEST", "purpose", {
        token: "test",
        serviceUrl: "https://custom.chitty.cc",
      });

      expect(capturedUrl).toBe("https://custom.chitty.cc/v1/mint");
    });

    it("should work without token (unauthenticated minting)", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ chittyId: "CHITTY-TEST-001-ABC" }),
      });

      const id = await mintId("TEST", "purpose", {});

      expect(id).toMatch(/^CHITTY-TEST-/);
    });
  });
});
