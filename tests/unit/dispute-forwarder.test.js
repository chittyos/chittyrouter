/**
 * Unit tests for the dispute forwarder.
 *
 * These tests exercise real behavior of the forwarder's pure functions
 * (`isDisputeWorthy`, `buildIntakePayload`) and the short-circuit paths of
 * `forwardToDisputeIntake` that do not require a network call. The
 * end-to-end POST path is covered by the integration test against a real
 * dispute.chitty.cc endpoint (see tests/integration/dispute-forwarder.test.js).
 */

import { describe, it, expect } from "vitest";
import {
  isDisputeWorthy,
  buildIntakePayload,
  forwardToDisputeIntake,
} from "../../src/integration/dispute-forwarder.js";

const WORTHY_ENV = {
  DISPUTE_WORTHY_CATEGORIES:
    "lawsuit,court_filing,legal_demand,dispute,complaint",
};

describe("isDisputeWorthy", () => {
  it("returns true when category is in the worthy set (case-insensitive)", () => {
    expect(isDisputeWorthy({ category: "lawsuit" }, WORTHY_ENV)).toBe(true);
    expect(isDisputeWorthy({ category: "LAWSUIT" }, WORTHY_ENV)).toBe(true);
    expect(isDisputeWorthy({ category: "Court_Filing" }, WORTHY_ENV)).toBe(
      true,
    );
  });

  it("returns false for categories not in the set", () => {
    expect(isDisputeWorthy({ category: "newsletter" }, WORTHY_ENV)).toBe(false);
    expect(isDisputeWorthy({ category: "spam" }, WORTHY_ENV)).toBe(false);
  });

  it("returns false when triage result is missing or malformed", () => {
    expect(isDisputeWorthy(null, WORTHY_ENV)).toBe(false);
    expect(isDisputeWorthy(undefined, WORTHY_ENV)).toBe(false);
    expect(isDisputeWorthy({}, WORTHY_ENV)).toBe(false);
    expect(isDisputeWorthy({ category: "" }, WORTHY_ENV)).toBe(false);
  });

  it("returns false when DISPUTE_WORTHY_CATEGORIES is unset or empty", () => {
    expect(isDisputeWorthy({ category: "lawsuit" }, {})).toBe(false);
    expect(
      isDisputeWorthy({ category: "lawsuit" }, { DISPUTE_WORTHY_CATEGORIES: "" }),
    ).toBe(false);
    expect(
      isDisputeWorthy(
        { category: "lawsuit" },
        { DISPUTE_WORTHY_CATEGORIES: "   ,  ,  " },
      ),
    ).toBe(false);
  });
});

describe("buildIntakePayload", () => {
  const triage = {
    org: "ARIBIA",
    category: "lawsuit",
    confidence: 0.91,
    keywords: ["summons", "defendant"],
    urgencyIndicators: ["deadline-7-days"],
    reasoning: "Explicit lawsuit language and docket reference present.",
    fallback: false,
    timestamp: "2026-04-18T12:00:00.000Z",
  };

  const email = {
    subject: "Summons - Smith v Jones 2024D007847",
    from: "clerk@cookcountycourt.example",
    to: "intake@chitty.cc",
    content: "You are hereby summoned to appear on...",
    messageId: "<abc123@cookcountycourt.example>",
    timestamp: "2026-04-18T11:59:00.000Z",
  };

  it("maps triage and email fields into the intake contract", () => {
    const payload = buildIntakePayload(triage, email);

    expect(payload.source).toBe("chittyrouter");
    expect(payload.source_ref).toBe("<abc123@cookcountycourt.example>");
    expect(payload.received_at).toBe("2026-04-18T11:59:00.000Z");

    expect(payload.email).toEqual({
      from: "clerk@cookcountycourt.example",
      to: "intake@chitty.cc",
      subject: "Summons - Smith v Jones 2024D007847",
      content_preview: "You are hereby summoned to appear on...",
    });

    expect(payload.triage).toEqual({
      org: "ARIBIA",
      category: "lawsuit",
      confidence: 0.91,
      keywords: ["summons", "defendant"],
      urgencyIndicators: ["deadline-7-days"],
      reasoning: "Explicit lawsuit language and docket reference present.",
      fallback: false,
      classified_at: "2026-04-18T12:00:00.000Z",
    });
  });

  it("truncates long content to 2000 characters in the preview", () => {
    const longEmail = { ...email, content: "x".repeat(5000) };
    const payload = buildIntakePayload(triage, longEmail);
    expect(payload.email.content_preview.length).toBe(2000);
  });

  it("falls back to metadata.messageId, then a generated source_ref", () => {
    const withMetaMessageId = buildIntakePayload(triage, {
      subject: "s",
      from: "a",
      metadata: { messageId: "<meta-id@x>" },
    });
    expect(withMetaMessageId.source_ref).toBe("<meta-id@x>");

    const withoutAnyId = buildIntakePayload(triage, {
      subject: "s",
      from: "a",
    });
    expect(withoutAnyId.source_ref).toMatch(/^chittyrouter-\d+$/);
  });

  it("defaults missing array/string triage fields safely", () => {
    const sparse = {
      category: "dispute",
    };
    const payload = buildIntakePayload(sparse, email);
    expect(payload.triage.keywords).toEqual([]);
    expect(payload.triage.urgencyIndicators).toEqual([]);
    expect(payload.triage.reasoning).toBeNull();
    expect(payload.triage.fallback).toBe(false);
  });
});

describe("forwardToDisputeIntake short-circuits (no network)", () => {
  const triage = { category: "lawsuit", confidence: 0.9 };
  const email = {
    subject: "s",
    from: "a@b",
    content: "c",
    messageId: "<m@x>",
  };

  it("skips when env is null", async () => {
    const result = await forwardToDisputeIntake(null, triage, email);
    expect(result).toEqual({ forwarded: false, reason: "no-env" });
  });

  it("skips when CHITTYDISPUTE_AUTH_TOKEN is missing", async () => {
    const result = await forwardToDisputeIntake(
      { DISPUTE_WORTHY_CATEGORIES: "lawsuit" },
      triage,
      email,
    );
    expect(result).toEqual({ forwarded: false, reason: "missing-auth-token" });
  });

  it("skips when category is not worthy", async () => {
    const result = await forwardToDisputeIntake(
      {
        CHITTYDISPUTE_AUTH_TOKEN: "test-token",
        DISPUTE_WORTHY_CATEGORIES: "dispute,complaint",
      },
      { category: "newsletter" },
      email,
    );
    expect(result).toEqual({ forwarded: false, reason: "category-not-worthy" });
  });

  it("skips when DISPUTE_WORTHY_CATEGORIES is unset even with auth token", async () => {
    const result = await forwardToDisputeIntake(
      { CHITTYDISPUTE_AUTH_TOKEN: "test-token" },
      triage,
      email,
    );
    expect(result).toEqual({ forwarded: false, reason: "category-not-worthy" });
  });
});
