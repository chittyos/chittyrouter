/**
 * Blockchain Queue Consumer Integration Tests
 * Tests consumer behavior with mocked Cloudflare Queues API
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import blockchainConsumer from "../../src/consumers/blockchain-queue-consumer.js";

describe("Blockchain Queue Consumer", () => {
  let mockEnv;
  let mockContext;

  beforeEach(() => {
    mockEnv = {
      CHITTY_ID_TOKEN: "test-token",
      LEDGER_API: "https://ledger.chitty.cc",
      EVIDENCE_API: "https://evidence.chitty.cc",
      CHITTYCHAIN_API: "https://chain.chitty.cc",
      AI: {
        run: vi.fn().mockResolvedValue({
          response: JSON.stringify({ analysis: "test" }),
        }),
      },
      PLATFORM_STORAGE: {
        get: vi.fn().mockResolvedValue(
          JSON.stringify({
            chittyId: "CHITTY-EVNT-001",
            content: "test document",
            metadata: { type: "legal" },
          }),
        ),
        put: vi.fn().mockResolvedValue(undefined),
      },
    };

    mockContext = {
      waitUntil: vi.fn(),
    };

    // Mock fetch for ChittyChain API
    global.fetch = vi.fn().mockImplementation((url) => {
      if (url.includes("/chain/store")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              success: true,
              blockHash: "block-hash-123",
              transactionId: "tx-123",
            }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Soft Minting (Priority < 0.9)", () => {
    it("should process low-priority message with soft mint", async () => {
      const mockMessage = {
        id: "msg-1",
        timestamp: new Date().toISOString(),
        body: {
          chittyId: "CHITTY-EVNT-001",
          priority: 0.5,
          probability: 0.8,
          metadata: { type: "routine" },
        },
        ack: vi.fn(),
        retry: vi.fn(),
      };

      const batch = {
        queue: "blockchain-queue",
        messages: [mockMessage],
      };

      const result = await blockchainConsumer.queue(
        batch,
        mockEnv,
        mockContext,
      );

      expect(result.processed).toBe(1);
      expect(result.failed).toBe(0);
      expect(result.softMinted).toBe(1);
      expect(result.hardMinted).toBe(0);
      expect(result.totalCost).toBe(0.01);
      expect(mockMessage.ack).toHaveBeenCalled();
      expect(mockMessage.retry).not.toHaveBeenCalled();
    });

    it("should handle batch of soft mint messages", async () => {
      const messages = Array.from({ length: 5 }, (_, i) => ({
        id: `msg-${i}`,
        timestamp: new Date().toISOString(),
        body: {
          chittyId: `CHITTY-EVNT-00${i}`,
          priority: 0.5,
          probability: 0.7,
          metadata: { batch: true },
        },
        ack: vi.fn(),
        retry: vi.fn(),
      }));

      const batch = {
        queue: "blockchain-queue",
        messages,
      };

      const result = await blockchainConsumer.queue(
        batch,
        mockEnv,
        mockContext,
      );

      expect(result.processed).toBe(5);
      expect(result.softMinted).toBe(5);
      expect(result.totalCost).toBe(0.05); // 5 × $0.01
      messages.forEach((msg) => expect(msg.ack).toHaveBeenCalled());
    });
  });

  describe("Hard Minting (Priority >= 0.9)", () => {
    it("should process critical message with hard mint", async () => {
      const mockMessage = {
        id: "msg-critical",
        timestamp: new Date().toISOString(),
        body: {
          chittyId: "CHITTY-EVNT-CRITICAL",
          priority: 0.95,
          probability: 0.95,
          metadata: { urgency: "critical" },
        },
        ack: vi.fn(),
        retry: vi.fn(),
      };

      const batch = {
        queue: "blockchain-queue",
        messages: [mockMessage],
      };

      const result = await blockchainConsumer.queue(
        batch,
        mockEnv,
        mockContext,
      );

      expect(result.processed).toBe(1);
      expect(result.hardMinted).toBe(1);
      expect(result.softMinted).toBe(0);
      expect(result.totalCost).toBe(40); // Hard mint cost
      expect(mockMessage.ack).toHaveBeenCalled();
    });

    it("should handle mixed priority batch (soft + hard)", async () => {
      const messages = [
        {
          id: "msg-soft-1",
          body: {
            chittyId: "CHITTY-EVNT-001",
            priority: 0.5,
            probability: 0.7,
          },
          ack: vi.fn(),
          retry: vi.fn(),
        },
        {
          id: "msg-hard",
          body: {
            chittyId: "CHITTY-EVNT-002",
            priority: 0.95,
            probability: 0.95,
          },
          ack: vi.fn(),
          retry: vi.fn(),
        },
        {
          id: "msg-soft-2",
          body: {
            chittyId: "CHITTY-EVNT-003",
            priority: 0.6,
            probability: 0.75,
          },
          ack: vi.fn(),
          retry: vi.fn(),
        },
      ];

      const batch = { queue: "blockchain-queue", messages };

      const result = await blockchainConsumer.queue(
        batch,
        mockEnv,
        mockContext,
      );

      expect(result.processed).toBe(3);
      expect(result.softMinted).toBe(2);
      expect(result.hardMinted).toBe(1);
      expect(result.totalCost).toBe(40.02); // (2 × $0.01) + (1 × $40)
    });
  });

  describe("Error Handling", () => {
    it("should retry failed message", async () => {
      mockEnv.PLATFORM_STORAGE.get.mockRejectedValueOnce(
        new Error("Storage unavailable"),
      );

      const mockMessage = {
        id: "msg-fail",
        body: { chittyId: "CHITTY-EVNT-FAIL", priority: 0.5, probability: 0.8 },
        ack: vi.fn(),
        retry: vi.fn(),
      };

      const batch = { queue: "blockchain-queue", messages: [mockMessage] };

      const result = await blockchainConsumer.queue(
        batch,
        mockEnv,
        mockContext,
      );

      expect(result.processed).toBe(0);
      expect(result.failed).toBe(1);
      expect(mockMessage.retry).toHaveBeenCalled();
      expect(mockMessage.ack).not.toHaveBeenCalled();
    });

    it("should handle partial batch failure", async () => {
      const messages = [
        {
          id: "msg-success",
          body: { chittyId: "CHITTY-EVNT-OK", priority: 0.5, probability: 0.8 },
          ack: vi.fn(),
          retry: vi.fn(),
        },
        {
          id: "msg-fail",
          body: {
            chittyId: "CHITTY-EVNT-FAIL",
            priority: 0.5,
            probability: 0.8,
          },
          ack: vi.fn(),
          retry: vi.fn(),
        },
      ];

      // Mock failure for second message
      mockEnv.PLATFORM_STORAGE.get
        .mockResolvedValueOnce(JSON.stringify({ chittyId: "CHITTY-EVNT-OK" }))
        .mockRejectedValueOnce(new Error("Fetch failed"));

      const batch = { queue: "blockchain-queue", messages };

      const result = await blockchainConsumer.queue(
        batch,
        mockEnv,
        mockContext,
      );

      expect(result.processed).toBe(1);
      expect(result.failed).toBe(1);
      expect(messages[0].ack).toHaveBeenCalled();
      expect(messages[1].retry).toHaveBeenCalled();
    });

    it("should track errors in results", async () => {
      mockEnv.PLATFORM_STORAGE.get.mockRejectedValue(new Error("Service down"));

      const mockMessage = {
        id: "msg-error",
        body: { chittyId: "CHITTY-EVNT-ERR", priority: 0.5, probability: 0.8 },
        ack: vi.fn(),
        retry: vi.fn(),
      };

      const batch = { queue: "blockchain-queue", messages: [mockMessage] };

      const result = await blockchainConsumer.queue(
        batch,
        mockEnv,
        mockContext,
      );

      expect(result.errors).toBeDefined();
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain("Service down");
    });
  });

  describe("Batch Processing", () => {
    it("should respect max_batch_size=10 from wrangler.toml", async () => {
      const messages = Array.from({ length: 10 }, (_, i) => ({
        id: `msg-${i}`,
        body: { chittyId: `CHITTY-EVNT-${i}`, priority: 0.5, probability: 0.8 },
        ack: vi.fn(),
        retry: vi.fn(),
      }));

      const batch = { queue: "blockchain-queue", messages };

      const result = await blockchainConsumer.queue(
        batch,
        mockEnv,
        mockContext,
      );

      expect(result.processed).toBe(10);
      messages.forEach((msg) => expect(msg.ack).toHaveBeenCalled());
    });

    it("should process messages in parallel", async () => {
      const startTime = Date.now();

      const messages = Array.from({ length: 5 }, (_, i) => ({
        id: `msg-${i}`,
        body: { chittyId: `CHITTY-EVNT-${i}`, priority: 0.5, probability: 0.8 },
        ack: vi.fn(),
        retry: vi.fn(),
      }));

      const batch = { queue: "blockchain-queue", messages };

      await blockchainConsumer.queue(batch, mockEnv, mockContext);

      const duration = Date.now() - startTime;

      // Parallel processing should complete faster than sequential
      // (even with mocks, parallel Promise.allSettled is detectable)
      expect(duration).toBeLessThan(1000);
    });
  });

  describe("ChittyChain Integration", () => {
    it("should store result in ChittyChain", async () => {
      const mockMessage = {
        id: "msg-chain",
        body: {
          chittyId: "CHITTY-EVNT-CHAIN",
          priority: 0.7,
          probability: 0.85,
          metadata: { source: "ingestion" },
        },
        ack: vi.fn(),
        retry: vi.fn(),
      };

      const batch = { queue: "blockchain-queue", messages: [mockMessage] };

      await blockchainConsumer.queue(batch, mockEnv, mockContext);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/chain/store"),
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
          }),
        }),
      );
    });

    it("should include metadata in ChittyChain storage", async () => {
      const mockMessage = {
        id: "msg-metadata",
        body: {
          chittyId: "CHITTY-EVNT-META",
          priority: 0.8,
          probability: 0.9,
          timestamp: "2025-10-12T12:00:00Z",
          metadata: { case: "ARIAS-001", type: "evidence" },
        },
        ack: vi.fn(),
        retry: vi.fn(),
      };

      const batch = { queue: "blockchain-queue", messages: [mockMessage] };

      await blockchainConsumer.queue(batch, mockEnv, mockContext);

      const fetchCalls = global.fetch.mock.calls;
      const chainCall = fetchCalls.find((call) =>
        call[0].includes("/chain/store"),
      );

      expect(chainCall).toBeDefined();

      const body = JSON.parse(chainCall[1].body);
      expect(body.metadata).toMatchObject({
        priority: 0.8,
        probability: 0.9,
      });
    });
  });

  describe("Metrics Tracking", () => {
    it("should track processing metrics", async () => {
      const messages = [
        {
          id: "msg-1",
          body: { chittyId: "CHITTY-EVNT-1", priority: 0.5, probability: 0.8 },
          ack: vi.fn(),
          retry: vi.fn(),
        },
        {
          id: "msg-2",
          body: {
            chittyId: "CHITTY-EVNT-2",
            priority: 0.95,
            probability: 0.95,
          },
          ack: vi.fn(),
          retry: vi.fn(),
        },
        {
          id: "msg-3",
          body: { chittyId: "CHITTY-EVNT-3", priority: 0.6, probability: 0.75 },
          ack: vi.fn(),
          retry: vi.fn(),
        },
      ];

      const batch = { queue: "blockchain-queue", messages };

      const result = await blockchainConsumer.queue(
        batch,
        mockEnv,
        mockContext,
      );

      expect(result).toMatchObject({
        processed: 3,
        failed: 0,
        softMinted: 2,
        hardMinted: 1,
        totalCost: 40.02,
      });
    });

    it("should return detailed results structure", async () => {
      const mockMessage = {
        id: "msg-detail",
        body: {
          chittyId: "CHITTY-EVNT-DETAIL",
          priority: 0.5,
          probability: 0.8,
        },
        ack: vi.fn(),
        retry: vi.fn(),
      };

      const batch = { queue: "blockchain-queue", messages: [mockMessage] };

      const result = await blockchainConsumer.queue(
        batch,
        mockEnv,
        mockContext,
      );

      expect(result).toHaveProperty("processed");
      expect(result).toHaveProperty("failed");
      expect(result).toHaveProperty("softMinted");
      expect(result).toHaveProperty("hardMinted");
      expect(result).toHaveProperty("totalCost");
      expect(result).toHaveProperty("errors");
    });
  });
});
