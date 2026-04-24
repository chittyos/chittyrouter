/**
 * Integration test for the SecurityAgent Durable Object.
 *
 * Exercises the full /agents/security/* route surface against a live
 * chittyrouter deployment. There is no local Durable Object runtime in
 * this project's test environment (vitest runs under node, not
 * @cloudflare/vitest-pool-workers), so per the no-mocks policy we test
 * the agent end-to-end against a real deployed worker or not at all.
 *
 * Required env to run:
 *   CHITTYROUTER_URL          — e.g. https://router.chitty.cc or staging
 *   CHITTYROUTER_AUTH_TOKEN   — bearer token accepted by the deployment
 *
 * When either is missing the suite is `describe.skip` — same convention as
 * tests/integration/dispute-forwarder.test.js.
 *
 * What this test covers:
 *   - POST /agents/security/ingest creates an incident and returns 48h
 *     ack_sla_deadline
 *   - POST /agents/security/acknowledge advances state
 *   - POST /agents/security/triage rejects invalid severity and accepts
 *     a valid one, computing fix_sla_deadline for CRITICAL/HIGH
 *   - POST /agents/security/transition enforces forward-only state order
 *   - GET  /agents/security/open lists non-terminal incidents
 *   - GET  /agents/security/status returns an aggregate state breakdown
 */

import { describe, it, expect, beforeAll } from "vitest";
import { generateIntegrationProbeEmail } from "../data/test-emails-security.js";

const URL_BASE = process.env.CHITTYROUTER_URL;
const TOKEN = process.env.CHITTYROUTER_AUTH_TOKEN;
const LIVE_INTEGRATION = process.env.LIVE_INTEGRATION === "true";

// Production URL denylist - never run integration tests against these
const PRODUCTION_URLS = [
  "https://router.chitty.cc",
  "https://chittyrouter.chitty.cc",
  "router.chitty.cc",
  "chittyrouter.chitty.cc",
];

function isProductionURL(url) {
  if (!url) return false;
  const normalized = url.toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
  return PRODUCTION_URLS.some(prod => normalized === prod || normalized.includes(prod));
}

// Only enable tests if:
// 1. URL_BASE and TOKEN are set
// 2. LIVE_INTEGRATION=true is explicitly set
// 3. URL_BASE is not a known production URL
const describeOrSkip =
  URL_BASE && TOKEN && LIVE_INTEGRATION && !isProductionURL(URL_BASE)
    ? describe
    : describe.skip;

function headers() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${TOKEN}`,
  };
}

async function post(path, body) {
  const res = await fetch(`${URL_BASE}${path}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // non-JSON body is acceptable on some error paths; leave json null
  }
  return { status: res.status, json, text };
}

async function get(path) {
  const res = await fetch(`${URL_BASE}${path}`, { headers: headers() });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // leave json null
  }
  return { status: res.status, json, text };
}

describeOrSkip("SecurityAgent → /agents/security/* (live)", () => {
  const runId = `integration-${Date.now()}`;
  let createdIncidentId = null;

  beforeAll(async () => {
    // Sanity: the deployment must be reachable before we run the suite.
    const res = await fetch(`${URL_BASE}/health`);
    expect(res.ok, `${URL_BASE}/health must be reachable`).toBe(true);
  }, 15000);

  it("POST /ingest creates an incident with a 48h ack deadline", async () => {
    const before = Date.now();
    const probeEmail = generateIntegrationProbeEmail(runId);
    const result = await post("/agents/security/ingest", probeEmail);
    const after = Date.now();

    expect(result.status).toBe(200);
    expect(result.json).toBeTruthy();
    expect(result.json.incident_id).toMatch(/^sec-\d+-[a-z0-9]{6}$/);
    expect(result.json.state).toBe("received");
    expect(result.json.ack_sla_deadline).toBeTruthy();

    const deadlineMs = Date.parse(result.json.ack_sla_deadline);
    const expectedLo = before + 48 * 60 * 60 * 1000 - 5000;
    const expectedHi = after + 48 * 60 * 60 * 1000 + 5000;
    expect(deadlineMs).toBeGreaterThanOrEqual(expectedLo);
    expect(deadlineMs).toBeLessThanOrEqual(expectedHi);

    createdIncidentId = result.json.incident_id;
  }, 15000);

  it("POST /ingest rejects missing reporter/subject with 400", async () => {
    const result = await post("/agents/security/ingest", {
      content: "missing reporter and subject",
    });
    expect(result.status).toBe(400);
    expect(result.json?.error?.code).toBe("BAD_INPUT");
  }, 15000);

  it("POST /acknowledge advances state to 'acknowledged'", async () => {
    expect(createdIncidentId).toBeTruthy();
    const result = await post("/agents/security/acknowledge", {
      id: createdIncidentId,
      acknowledger: `integration-responder+${runId}@chittyrouter.test`,
    });
    expect(result.status).toBe(200);
    expect(result.json?.state).toBe("acknowledged");
    expect(result.json?.acknowledged_at).toBeTruthy();
  }, 15000);

  it("POST /triage rejects an invalid severity", async () => {
    expect(createdIncidentId).toBeTruthy();
    const result = await post("/agents/security/triage", {
      id: createdIncidentId,
      severity: "CATASTROPHIC",
    });
    expect(result.status).toBe(400);
    expect(result.json?.error?.code).toBe("BAD_INPUT");
  }, 15000);

  it("POST /triage with CRITICAL sets a fix_sla_deadline ~14d out", async () => {
    expect(createdIncidentId).toBeTruthy();
    const before = Date.now();
    const result = await post("/agents/security/triage", {
      id: createdIncidentId,
      severity: "CRITICAL",
      assignee: `responder+${runId}@chittyrouter.test`,
    });
    const after = Date.now();

    expect(result.status).toBe(200);
    expect(result.json?.state).toBe("triaged");
    expect(result.json?.severity).toBe("CRITICAL");
    expect(result.json?.fix_sla_deadline).toBeTruthy();

    const fixMs = Date.parse(result.json.fix_sla_deadline);
    const expectedLo = before + 14 * 24 * 60 * 60 * 1000 - 5000;
    const expectedHi = after + 14 * 24 * 60 * 60 * 1000 + 5000;
    expect(fixMs).toBeGreaterThanOrEqual(expectedLo);
    expect(fixMs).toBeLessThanOrEqual(expectedHi);
  }, 15000);

  it("POST /transition to an earlier state returns 409", async () => {
    expect(createdIncidentId).toBeTruthy();
    // incident is currently 'triaged'; 'received' is earlier → must reject
    const result = await post("/agents/security/transition", {
      id: createdIncidentId,
      to: "received",
      note: "integration-test backward transition probe",
    });
    expect(result.status).toBe(409);
    expect(result.json?.error?.code).toBe("CONFLICT");
  }, 15000);

  it("POST /transition to an unknown state returns 400", async () => {
    expect(createdIncidentId).toBeTruthy();
    const result = await post("/agents/security/transition", {
      id: createdIncidentId,
      to: "quarantined",
    });
    expect(result.status).toBe(400);
    expect(result.json?.error?.code).toBe("BAD_INPUT");
  }, 15000);

  it("POST /transition forward to 'fix_in_progress' advances state", async () => {
    expect(createdIncidentId).toBeTruthy();
    const result = await post("/agents/security/transition", {
      id: createdIncidentId,
      to: "fix_in_progress",
    });
    expect(result.status).toBe(200);
    expect(result.json?.to).toBe("fix_in_progress");
    expect(result.json?.from).toBe("triaged");
  }, 15000);

  it("GET /incident/:id returns the current incident row", async () => {
    expect(createdIncidentId).toBeTruthy();
    const result = await get(`/agents/security/incident/${createdIncidentId}`);
    expect(result.status).toBe(200);
    expect(result.json?.id).toBe(createdIncidentId);
    expect(result.json?.state).toBe("fix_in_progress");
    expect(result.json?.severity).toBe("CRITICAL");
  }, 15000);

  it("GET /open includes our still-open incident", async () => {
    expect(createdIncidentId).toBeTruthy();
    const result = await get("/agents/security/open");
    expect(result.status).toBe(200);
    expect(Array.isArray(result.json?.incidents)).toBe(true);
    const ids = result.json.incidents.map((i) => i.id);
    expect(ids).toContain(createdIncidentId);
  }, 15000);

  it("GET /status returns an aggregate state breakdown", async () => {
    const result = await get("/agents/security/status");
    expect(result.status).toBe(200);
    expect(result.json?.agent).toBe("SecurityAgent");
    expect(Array.isArray(result.json?.by_state)).toBe(true);
  }, 15000);

  it("GET /incident/:id for an unknown id returns 404", async () => {
    const result = await get(
      `/agents/security/incident/sec-0000000000-ffffff`,
    );
    expect(result.status).toBe(404);
    expect(result.json?.error?.code).toBe("NOT_FOUND");
  }, 15000);

  it("POST /transition forward to 'fix_shipped' then 'disclosed' then 'closed'", async () => {
    expect(createdIncidentId).toBeTruthy();
    for (const to of ["fix_shipped", "disclosed", "closed"]) {
      const result = await post("/agents/security/transition", {
        id: createdIncidentId,
        to,
      });
      expect(result.status).toBe(200);
      expect(result.json?.to).toBe(to);
    }
  }, 20000);
});
