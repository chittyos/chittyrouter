/**
 * MCP Tool Schemas — Zod v4 schemas for all 39 MCP tools across 12 agents.
 * Pure data, no side effects.
 *
 * @service chittycanon://core/services/chittyrouter
 */
import { z } from "zod";

// ── Triage Agent (2 tools) ────────────────────────────────────────────

export const triageSchemas = {
  triage__classify: {
    description: "Classify an inbound communication by org, type, and urgency",
    schema: z.object({
      sender: z.string().optional().describe("Sender email address"),
      subject: z.string().optional().describe("Email subject line"),
      content: z.string().describe("Email body content"),
      channel: z.string().optional().describe("Communication channel (email, chat, etc.)"),
    }),
    method: "POST",
    path: "/classify",
    binding: "TRIAGE_AGENT",
  },
  triage__stats: {
    description: "Get triage classification statistics",
    schema: z.object({}),
    method: "GET",
    path: "/stats",
    binding: "TRIAGE_AGENT",
  },
};

// ── Priority Agent (2 tools) ──────────────────────────────────────────

export const prioritySchemas = {
  priority__score: {
    description: "Score priority and urgency for a classified communication",
    schema: z.object({
      sender: z.string().optional().describe("Sender email address"),
      subject: z.string().optional().describe("Email subject line"),
      content: z.string().optional().describe("Email body content"),
      category: z.string().describe("Triage category (e.g. lawsuit_communication, emergency_legal)"),
      org: z.string().optional().describe("Organization name"),
      triageConfidence: z.number().optional().describe("Confidence from triage (0-1)"),
    }),
    method: "POST",
    path: "/score",
    binding: "PRIORITY_AGENT",
  },
  priority__stats: {
    description: "Get priority scoring statistics",
    schema: z.object({}),
    method: "GET",
    path: "/stats",
    binding: "PRIORITY_AGENT",
  },
};

// ── Response Agent (2 tools) ──────────────────────────────────────────

export const responseSchemas = {
  response__draft: {
    description: "Draft an AI-powered response for an email",
    schema: z.object({
      emailData: z.object({
        subject: z.string().describe("Email subject"),
        from: z.string().optional().describe("Sender address"),
        content: z.string().optional().describe("Email body"),
      }),
      triageResult: z.object({
        category: z.string().describe("Triage classification category"),
      }),
      priorityResult: z.object({
        level: z.string().optional().describe("Priority level (CRITICAL, HIGH, NORMAL, LOW)"),
      }).optional(),
      org: z.string().optional().describe("Organization name"),
    }),
    method: "POST",
    path: "/draft",
    binding: "RESPONSE_AGENT",
  },
  response__validate: {
    description: "Validate response text for legal compliance",
    schema: z.object({
      text: z.string().describe("Response text to validate"),
      category: z.string().optional().describe("Communication category for disclaimer"),
    }),
    method: "POST",
    path: "/validate",
    binding: "RESPONSE_AGENT",
  },
};

// ── Document Agent (2 tools) ──────────────────────────────────────────

export const documentSchemas = {
  document__analyze: {
    description: "Analyze a document attachment for type, importance, and compliance",
    schema: z.object({
      attachment: z.object({
        name: z.string().describe("Filename"),
        size: z.number().optional().describe("File size in bytes"),
        type: z.string().optional().describe("MIME type"),
      }),
      emailContext: z.object({
        subject: z.string().optional(),
        from: z.string().optional(),
        category: z.string().optional(),
      }).optional(),
      org: z.string().optional().describe("Organization name"),
    }),
    method: "POST",
    path: "/analyze",
    binding: "DOCUMENT_AGENT",
  },
  document__batch: {
    description: "Analyze multiple document attachments in batch",
    schema: z.object({
      attachments: z.array(z.object({
        name: z.string(),
        size: z.number().optional(),
        type: z.string().optional(),
      })).describe("Array of attachments to analyze"),
      emailContext: z.object({
        subject: z.string().optional(),
        from: z.string().optional(),
        category: z.string().optional(),
      }).optional(),
      org: z.string().optional(),
    }),
    method: "POST",
    path: "/batch",
    binding: "DOCUMENT_AGENT",
  },
};

// ── Entity Agent (6 tools) ───────────────────────────────────────────

export const entitySchemas = {
  entity__create: {
    description: "Create a new P/L/T/E/A entity (Person, Location, Thing, Event, Authority)",
    schema: z.object({
      entity_type: z.enum(["P", "L", "T", "E", "A"]).describe("Entity type code"),
      subtype: z.string().optional().describe("Entity subtype (e.g. Natural, Jurisdiction, Document)"),
      name: z.string().describe("Entity name"),
      org: z.string().optional().describe("Organization"),
      chitty_id: z.string().optional().describe("ChittyID"),
      metadata: z.record(z.any()).optional().describe("Additional metadata"),
    }),
    method: "POST",
    path: "/create",
    binding: "ENTITY_AGENT",
  },
  entity__update: {
    description: "Update an existing entity (status transition, name, metadata)",
    schema: z.object({
      id: z.number().describe("Entity ID"),
      status: z.string().optional().describe("New status (draft→active→suspended/closed→retired)"),
      name: z.string().optional().describe("New name"),
      metadata: z.record(z.any()).optional().describe("Metadata to merge"),
    }),
    method: "POST",
    path: "/update",
    binding: "ENTITY_AGENT",
  },
  entity__search: {
    description: "Search entities by type, org, status, or name",
    schema: z.object({
      entity_type: z.enum(["P", "L", "T", "E", "A"]).optional().describe("Filter by entity type"),
      org: z.string().optional().describe("Filter by organization"),
      status: z.string().optional().describe("Filter by status"),
      q: z.string().optional().describe("Search by name"),
    }),
    method: "GET",
    path: "/search",
    binding: "ENTITY_AGENT",
  },
  entity__get: {
    description: "Get an entity by ID with links and timeline",
    schema: z.object({
      id: z.number().describe("Entity ID"),
    }),
    method: "GET",
    path: "/get",
    binding: "ENTITY_AGENT",
  },
  entity__link: {
    description: "Create a link between two entities",
    schema: z.object({
      source_id: z.number().describe("Source entity ID"),
      target_id: z.number().describe("Target entity ID"),
      link_type: z.string().describe("Relationship type (e.g. owns, represents, filed_in)"),
      metadata: z.record(z.any()).optional(),
    }),
    method: "POST",
    path: "/link",
    binding: "ENTITY_AGENT",
  },
  entity__timeline: {
    description: "Add a timeline event to an entity",
    schema: z.object({
      entity_id: z.number().describe("Entity ID"),
      event_type: z.string().describe("Event type (e.g. status_change, note, action)"),
      description: z.string().optional().describe("Event description"),
      actor: z.string().optional().describe("Who performed the action"),
      metadata: z.record(z.any()).optional(),
    }),
    method: "POST",
    path: "/timeline",
    binding: "ENTITY_AGENT",
  },
};

// ── Evidence Agent (5 tools) ─────────────────────────────────────────

export const evidenceSchemas = {
  evidence__ingest: {
    description: "Ingest new evidence with chain of custody tracking",
    schema: z.object({
      exhibit_id: z.string().describe("Unique exhibit identifier"),
      title: z.string().describe("Evidence title"),
      category: z.enum(["financial", "communication", "identification", "photographic", "contractual", "legal_filing", "other"]).optional(),
      source: z.string().optional().describe("Evidence source"),
      case_id: z.string().optional().describe("Associated case ID"),
      org: z.string().optional(),
      sha256: z.string().optional().describe("SHA-256 hash for integrity verification"),
      r2_path: z.string().optional().describe("R2 storage path"),
    }),
    method: "POST",
    path: "/ingest",
    binding: "EVIDENCE_AGENT",
  },
  evidence__verify: {
    description: "Verify evidence integrity and authenticity",
    schema: z.object({
      exhibit_id: z.string().describe("Exhibit ID to verify"),
      verification_type: z.string().optional().describe("Type of verification (manual, automated, hash)"),
      verifier: z.string().optional().describe("Person/system performing verification"),
      expected_sha256: z.string().optional().describe("Expected SHA-256 hash"),
      notes: z.string().optional(),
    }),
    method: "POST",
    path: "/verify",
    binding: "EVIDENCE_AGENT",
  },
  evidence__seal: {
    description: "Seal verified evidence (prevents further modification)",
    schema: z.object({
      exhibit_id: z.string().describe("Exhibit ID to seal"),
      sealed_by: z.string().optional().describe("Person sealing the evidence"),
    }),
    method: "POST",
    path: "/seal",
    binding: "EVIDENCE_AGENT",
  },
  evidence__search: {
    description: "Search evidence by category, status, case, or text",
    schema: z.object({
      category: z.string().optional().describe("Filter by category"),
      status: z.string().optional().describe("Filter by status (ingested, verified, sealed, disputed)"),
      case_id: z.string().optional().describe("Filter by case ID"),
      q: z.string().optional().describe("Search by title or exhibit ID"),
    }),
    method: "GET",
    path: "/search",
    binding: "EVIDENCE_AGENT",
  },
  evidence__custody: {
    description: "Get full chain of custody for evidence",
    schema: z.object({
      exhibit_id: z.string().describe("Exhibit ID"),
    }),
    method: "GET",
    path: "/custody",
    binding: "EVIDENCE_AGENT",
  },
};

// ── Calendar Agent (3 tools) ─────────────────────────────────────────

export const calendarSchemas = {
  calendar__create: {
    description: "Create a calendar event (court date, filing deadline, lease renewal, etc.)",
    schema: z.object({
      title: z.string().describe("Event title"),
      event_type: z.enum(["court_date", "filing_deadline", "lease_renewal", "lease_expiry", "payment_due", "inspection", "meeting", "review", "permit_deadline", "grant_deadline", "other"]).optional(),
      event_date: z.string().describe("Event date (ISO 8601)"),
      event_end_date: z.string().optional().describe("End date for multi-day events"),
      org: z.string().optional(),
      case_id: z.string().optional(),
      entity_id: z.string().optional(),
      description: z.string().optional(),
      location: z.string().optional(),
      is_recurring: z.boolean().optional(),
      recurrence_rule: z.string().optional(),
      reminders: z.array(z.object({
        remind_at: z.string(),
        channel: z.string().optional(),
      })).optional(),
    }),
    method: "POST",
    path: "/create",
    binding: "CALENDAR_AGENT",
  },
  calendar__upcoming: {
    description: "Get upcoming calendar events within a time window",
    schema: z.object({
      days: z.number().optional().describe("Number of days to look ahead (default 30, max 365)"),
      org: z.string().optional().describe("Filter by organization"),
      event_type: z.string().optional().describe("Filter by event type"),
    }),
    method: "GET",
    path: "/upcoming",
    binding: "CALENDAR_AGENT",
  },
  calendar__urgent: {
    description: "Get urgent calendar events approaching their deadlines",
    schema: z.object({
      org: z.string().optional().describe("Filter by organization"),
    }),
    method: "GET",
    path: "/urgent",
    binding: "CALENDAR_AGENT",
  },
};

// ── Finance Agent (4 tools) ──────────────────────────────────────────

export const financeSchemas = {
  finance__transaction: {
    description: "Record a financial transaction",
    schema: z.object({
      transaction_type: z.enum(["income", "expense", "transfer", "refund", "invoice", "payment", "fee", "deposit"]).describe("Transaction type"),
      category: z.string().optional().describe("Transaction category"),
      amount: z.number().describe("Transaction amount"),
      currency: z.string().optional().describe("Currency code (default USD)"),
      description: z.string().optional(),
      from_entity: z.string().optional().describe("Source entity"),
      to_entity: z.string().optional().describe("Destination entity"),
      org: z.string().optional(),
      case_id: z.string().optional(),
      reference_id: z.string().optional(),
      transaction_date: z.string().optional().describe("Transaction date (ISO 8601)"),
    }),
    method: "POST",
    path: "/transaction",
    binding: "FINANCE_AGENT",
  },
  finance__invoice: {
    description: "Create an invoice",
    schema: z.object({
      invoice_number: z.string().describe("Unique invoice number"),
      org: z.string().optional(),
      to_entity: z.string().optional().describe("Invoice recipient"),
      amount: z.number().describe("Invoice amount"),
      currency: z.string().optional(),
      line_items: z.array(z.record(z.any())).optional().describe("Line items"),
      due_date: z.string().optional().describe("Due date (ISO 8601)"),
    }),
    method: "POST",
    path: "/invoice",
    binding: "FINANCE_AGENT",
  },
  finance__ledger: {
    description: "Get ledger entries for an entity",
    schema: z.object({
      entity_id: z.string().describe("Entity ID"),
      org: z.string().optional().describe("Filter by organization"),
    }),
    method: "GET",
    path: "/ledger",
    binding: "FINANCE_AGENT",
  },
  finance__summary: {
    description: "Get financial summary with income, expenses, and cash flow",
    schema: z.object({
      org: z.string().optional().describe("Filter by organization"),
      from: z.string().optional().describe("Start date (ISO 8601)"),
      to: z.string().optional().describe("End date (ISO 8601)"),
    }),
    method: "GET",
    path: "/summary",
    binding: "FINANCE_AGENT",
  },
};

// ── Notification Agent (3 tools) ─────────────────────────────────────

export const notificationSchemas = {
  notification__send: {
    description: "Send a notification via email, Slack, push, or SMS",
    schema: z.object({
      recipient: z.string().describe("Recipient identifier"),
      channel: z.enum(["email", "slack", "push", "sms"]).optional().describe("Delivery channel (auto-selected by priority if omitted)"),
      priority: z.enum(["critical", "high", "normal", "low"]).optional(),
      subject: z.string().optional(),
      body: z.string().describe("Notification body"),
      org: z.string().optional(),
      source_agent: z.string().optional().describe("Originating agent"),
      reference_id: z.string().optional(),
    }),
    method: "POST",
    path: "/send",
    binding: "NOTIFICATION_AGENT",
  },
  notification__broadcast: {
    description: "Broadcast a notification to multiple recipients",
    schema: z.object({
      recipients: z.array(z.string()).describe("Array of recipient identifiers"),
      channel: z.string().optional(),
      priority: z.enum(["critical", "high", "normal", "low"]).optional(),
      subject: z.string().optional(),
      body: z.string().describe("Notification body"),
      org: z.string().optional(),
    }),
    method: "POST",
    path: "/broadcast",
    binding: "NOTIFICATION_AGENT",
  },
  notification__history: {
    description: "Get notification delivery history",
    schema: z.object({
      recipient: z.string().optional().describe("Filter by recipient"),
      channel: z.string().optional().describe("Filter by channel"),
      status: z.string().optional().describe("Filter by status"),
      limit: z.number().optional().describe("Max results (default 50)"),
    }),
    method: "GET",
    path: "/history",
    binding: "NOTIFICATION_AGENT",
  },
};

// ── Intelligence Agent (4 tools) ─────────────────────────────────────

export const intelligenceSchemas = {
  intelligence__observe: {
    description: "Record an observation for pattern analysis",
    schema: z.object({
      observation_type: z.enum(["volume_trend", "category_shift", "escalation_pattern", "org_distribution", "agent_performance", "anomaly_detection"]).describe("Observation type"),
      source_agent: z.string().optional().describe("Agent that generated the observation"),
      org: z.string().optional(),
      title: z.string().describe("Observation title"),
      description: z.string().optional(),
      severity: z.enum(["info", "warning", "critical"]).optional(),
      data: z.record(z.any()).optional().describe("Structured observation data"),
    }),
    method: "POST",
    path: "/observe",
    binding: "INTELLIGENCE_AGENT",
  },
  intelligence__analyze: {
    description: "Run AI analysis on recent observations",
    schema: z.object({
      analysis_type: z.enum(["volume_trend", "category_shift", "escalation_pattern", "org_distribution", "agent_performance", "anomaly_detection"]).describe("Type of analysis"),
      org: z.string().optional().describe("Filter by organization"),
      timeframe_hours: z.number().optional().describe("Analysis window in hours (default 24)"),
      context: z.string().optional().describe("Additional context for analysis"),
    }),
    method: "POST",
    path: "/analyze",
    binding: "INTELLIGENCE_AGENT",
  },
  intelligence__recommend: {
    description: "Create a system improvement recommendation",
    schema: z.object({
      recommendation_type: z.enum(["routing_optimization", "resource_allocation", "process_improvement", "risk_alert", "capacity_planning", "compliance_gap"]).describe("Recommendation type"),
      title: z.string().describe("Recommendation title"),
      description: z.string().describe("Detailed recommendation"),
      priority: z.enum(["critical", "high", "normal", "low"]).optional(),
      org: z.string().optional(),
      source_observation_ids: z.array(z.number()).optional().describe("Related observation IDs"),
    }),
    method: "POST",
    path: "/recommend",
    binding: "INTELLIGENCE_AGENT",
  },
  intelligence__dashboard: {
    description: "Get intelligence dashboard with observations, recommendations, and trends",
    schema: z.object({
      org: z.string().optional().describe("Filter by organization"),
    }),
    method: "GET",
    path: "/dashboard",
    binding: "INTELLIGENCE_AGENT",
  },
};

// ── Webhook Agent (2 tools) ──────────────────────────────────────────

export const webhookSchemas = {
  webhook__ingest: {
    description: "Ingest a webhook event with dedup and R2 archival",
    schema: z.object({
      platform: z.enum(["notion", "github", "stripe", "generic"]).describe("Webhook platform"),
      event_type: z.string().optional().describe("Event type identifier"),
      event_id: z.string().optional().describe("Platform event ID for dedup"),
      payload: z.any().describe("Webhook payload (object or string)"),
      org: z.string().optional(),
    }),
    method: "POST",
    path: "/ingest",
    binding: "WEBHOOK_AGENT",
  },
  webhook__events: {
    description: "List webhook events with filtering",
    schema: z.object({
      platform: z.string().optional().describe("Filter by platform"),
      status: z.string().optional().describe("Filter by status (received, processed, failed)"),
      limit: z.number().optional().describe("Max results (default 50)"),
    }),
    method: "GET",
    path: "/events",
    binding: "WEBHOOK_AGENT",
  },
};

// ── Messaging Agent (4 tools) ────────────────────────────────────────

export const messagingSchemas = {
  messaging__conversation: {
    description: "Create a new conversation thread",
    schema: z.object({
      thread_id: z.string().optional().describe("Custom thread ID (auto-generated if omitted)"),
      subject: z.string().optional().describe("Conversation subject"),
      participants: z.array(z.string()).describe("Participant identifiers"),
      org: z.string().optional(),
      channel: z.string().optional().describe("Channel (chat, sms, etc.)"),
    }),
    method: "POST",
    path: "/conversation",
    binding: "MESSAGING_AGENT",
  },
  messaging__message: {
    description: "Send a message in a conversation thread",
    schema: z.object({
      thread_id: z.string().describe("Conversation thread ID"),
      sender: z.string().describe("Message sender"),
      content: z.string().describe("Message content"),
      message_type: z.string().optional().describe("Message type (text, image, file)"),
    }),
    method: "POST",
    path: "/message",
    binding: "MESSAGING_AGENT",
  },
  messaging__thread: {
    description: "Get messages from a conversation thread",
    schema: z.object({
      thread_id: z.string().describe("Conversation thread ID"),
      limit: z.number().optional().describe("Max messages to return (default 50)"),
    }),
    method: "GET",
    path: "/thread",
    binding: "MESSAGING_AGENT",
  },
  messaging__conversations: {
    description: "List conversations with filtering",
    schema: z.object({
      org: z.string().optional().describe("Filter by organization"),
      status: z.string().optional().describe("Filter by status (active, retired)"),
      limit: z.number().optional().describe("Max results (default 50)"),
    }),
    method: "GET",
    path: "/conversations",
    binding: "MESSAGING_AGENT",
  },
};

/**
 * All tool schemas combined into a single map for registration.
 */
export const ALL_TOOL_SCHEMAS = {
  ...triageSchemas,
  ...prioritySchemas,
  ...responseSchemas,
  ...documentSchemas,
  ...entitySchemas,
  ...evidenceSchemas,
  ...calendarSchemas,
  ...financeSchemas,
  ...notificationSchemas,
  ...intelligenceSchemas,
  ...webhookSchemas,
  ...messagingSchemas,
};
