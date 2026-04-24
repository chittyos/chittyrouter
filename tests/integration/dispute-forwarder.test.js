/**
 * Integration test for the dispute forwarder against a live
 * chittydispute /api/intake endpoint.
 *
 * This test is gated on the CHITTYDISPUTE_AUTH_TOKEN environment variable.
 * When the token is not set (e.g. CI without secrets), the suite is
 * skipped rather than mocked — per the no-mocks/no-fake-data rule, we
 * exercise real behavior or we do not exercise it at all.
 *
 * Required env:
 *   CHITTYDISPUTE_AUTH_TOKEN  — bearer token accepted by the target intake
 *   CHITTYDISPUTE_URL         — optional, defaults to https://dispute.chitty.cc
 */

import { describe, it, expect } from "vitest";
import { forwardToDisputeIntake } from "../../src/integration/dispute-forwarder.js";

const TOKEN = process.env.CHITTYDISPUTE_AUTH_TOKEN;
const URL_BASE = process.env.CHITTYDISPUTE_URL || "https://dispute.chitty.cc";
const CATEGORIES =
  process.env.DISPUTE_WORTHY_CATEGORIES ||
  "lawsuit,court_filing,legal_demand,dispute,complaint";

const describeOrSkip = TOKEN ? describe : describe.skip;

describeOrSkip("dispute-forwarder → live /api/intake", () => {
  const env = {
    CHITTYDISPUTE_AUTH_TOKEN: TOKEN,
    CHITTYDISPUTE_URL: URL_BASE,
    DISPUTE_WORTHY_CATEGORIES: CATEGORIES,
  };

  it("forwards a qualifying triage result and receives a 2xx", async () => {
    const sourceRef = `chittyrouter-integration-${Date.now()}`;

    const triage = {
      org: "CHITTYOS",
      category: "lawsuit",
      confidence: 0.92,
      keywords: ["summons", "hearing"],
      urgencyIndicators: ["deadline-7-days"],
      reasoning:
        "Integration test fixture — simulates a live lawsuit-class email.",
      fallback: false,
      timestamp: new Date().toISOString(),
    };

    const email = {
      subject: `[integration-test] ${sourceRef}`,
      from: "integration@chittyrouter.test",
      to: "intake@chitty.cc",
      content:
        "This is an integration-test payload posted from chittyrouter's " +
        "dispute-forwarder test suite. Safe to discard or archive.",
      messageId: sourceRef,
      timestamp: new Date().toISOString(),
    };

    const result = await forwardToDisputeIntake(env, triage, email);

    expect(result.forwarded).toBe(true);
    expect(result.status).toBeGreaterThanOrEqual(200);
    expect(result.status).toBeLessThan(300);
  }, 15000);

  it("is rejected with a tagged non-2xx when auth token is wrong", async () => {
    const result = await forwardToDisputeIntake(
      { ...env, CHITTYDISPUTE_AUTH_TOKEN: "definitely-not-a-real-token" },
      {
        category: "lawsuit",
        confidence: 0.5,
        timestamp: new Date().toISOString(),
      },
      {
        subject: "integration-test-bad-auth",
        from: "integration@chittyrouter.test",
        content: "bad auth probe",
        messageId: `bad-auth-${Date.now()}`,
      },
    );

    // Either 401/403 from a real service, or a network error swallowed
    // into { forwarded: false }. Both are acceptable — what we assert is
    // that the forwarder never threw and never reported forwarded: true.
    expect(result.forwarded).toBe(false);
  }, 15000);
});
