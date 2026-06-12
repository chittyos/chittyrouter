/**
 * Cloudflare Email Handler
 * Intercepts ALL incoming emails to chitty.cc domain
 * AI triages, extracts attachments to R2, logs, and forwards
 */

import { CASE_EMAIL_ROUTES } from '../config/case-registry.js';
import { resolveAliasDecision } from '../config/alias-registry.js';
import { isPrivileged } from '../config/privilege-gate.js';

export class CloudflareEmailHandler {
  constructor(env) {
    this.env = env;

    // Urgency patterns for triage
    this.urgencyPatterns = {
      court: /court|hearing|motion|deadline|filing|summons|subpoena|order|judgment|docket/i,
      legal: /attorney|lawyer|legal|case|matter|plaintiff|defendant|litigation/i,
      property: /tenant|rent|lease|maintenance|eviction|property|landlord|HOA/i,
      creditor: /collection|debt|payment due|past due|account|creditor|demand|balance/i,
      compliance: /annual report|registered agent|tax|compliance|filing deadline|state of/i,
      urgent: /urgent|asap|immediately|time.?sensitive|action required|final notice/i,
      financial: /invoice|payment|transfer|wire|bank|balance|overdue|ACH/i
    };

    // Extractable MIME types allow-list for attachment processing.
    this.extractableTypes = new Set([
      'application/pdf',
      'application/zip',
      'application/octet-stream',
      'text/plain',
      'text/html',
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp'
    ]);

    // Non-case address routing rules. Case-specific addresses are merged in
    // below from the canonical case registry so there is a single source of
    // truth for case → email attribution.
    const nonCaseRoutes = {
      'intake@chitty.cc': { forward: 'nick@aribia.cc', priority: 'HIGH' },
      'legal@chitty.cc': { forward: 'nick@aribia.cc', priority: 'CRITICAL' },
      'evidence@chitty.cc': { forward: 'nick@aribia.cc', priority: 'HIGH' },
      'calendar@chitty.cc': { forward: 'nick@aribia.cc', priority: 'MEDIUM' },
      'chittyos@chitty.cc': { forward: 'nick@aribia.cc', priority: 'MEDIUM' }
    };

    // Derive case-specific routes from the registry (never hardcode case
    // aliases here — add them to src/config/case-registry.js). Real
    // forwarding addresses are resolved from env at construction time via
    // the `forwardEnv` field on each registry route, keeping live PII out
    // of the public source tree.
    const caseRoutes = Object.create(null);
    for (const [addr, route] of Object.entries(CASE_EMAIL_ROUTES)) {
      const forward = route.forwardEnv ? env?.[route.forwardEnv] : undefined;
      if (route.forwardEnv && !forward) {
        console.warn(
          `[email-handler] case route ${addr} declares forwardEnv=${route.forwardEnv} ` +
          `but env is unset — route will fall through to default forward.`,
        );
      }
      caseRoutes[addr] = {
        forward,
        priority: route.priority,
        case: route.chittyThread ?? route.caseSlug,
        caseSlug: route.caseSlug,
        caseNumber: route.caseNumber,
      };
    }

    // Build addressRoutes as a null-prototype dict so untrusted lookups
    // (`addressRoutes[emailData.to]`) cannot hit Object.prototype keys, and
    // throw on collisions between non-case and case routes rather than
    // silently overwriting.
    const mergedRoutes = Object.create(null);
    for (const [addr, route] of Object.entries(nonCaseRoutes)) {
      mergedRoutes[addr] = route;
    }
    for (const [addr, route] of Object.entries(caseRoutes)) {
      if (Object.prototype.hasOwnProperty.call(mergedRoutes, addr)) {
        throw new Error(
          `Email route collision for "${addr}": both non-case routes and ` +
          `case registry define this address. Resolve in case-registry.js.`,
        );
      }
      mergedRoutes[addr] = route;
    }
    this.addressRoutes = mergedRoutes;
  }

  /**
   * Main email handler - called by Cloudflare Email Workers
   */
  async handleEmail(message, env, ctx) {
    const startTime = Date.now();

    try {
      // Read raw email once — we need it for both parsing and triage
      const rawBytes = await this.streamToBytes(message.raw);
      const rawText = new TextDecoder().decode(rawBytes);

      // Extract email metadata
      const emailData = this.extractEmailData(message, rawText);

      // Parse MIME and extract attachments
      const attachments = this.parseMimeAttachments(rawText);
      emailData.attachmentCount = attachments.length;
      emailData.attachmentNames = attachments.map(a => a.filename);

      // Registry-backed routing overlay (additive). Resolved ONCE here —
      // now BEFORE triage/R2 as well as before logEmail/routeEmail — because
      // (1) the privileged_legal (F-L10) metadata-only flag must suppress
      // subject/body logging, and (2) the PRE-TRIAGE PRIVILEGE GATE below uses
      // the resolved lane-3/privileged_legal signal as one input. Attaches
      // `aliasDecision` to emailData for the gate, logging, and routing to
      // consume. Fully fail-OPEN: resolveAliasDecision never throws and returns
      // null on any failure (a DB blip must never drop/misroute mail).
      emailData.aliasDecision = await this.resolveAliasOverlay(emailData);

      // ===== PRE-TRIAGE PRIVILEGE GATE (F-L10) — FAIL-CLOSED =====
      // Decide privilege from RELIABLE STATIC signals (sender-domain allowlist +
      // case-registry aliases) PLUS, additively, the already-resolved
      // alias_registry posture. This is the deliberate inverse of #99's
      // fail-OPEN routing: detection fails CLOSED (errors → treat as
      // privileged) and does NOT depend on Neon being up. If privileged, the
      // BODY and ATTACHMENTS must never reach the CF AI model or R2.
      const privileged = isPrivileged(
        emailData.from,
        emailData.to,
        this.env,
        emailData.aliasDecision,
      );
      emailData.privileged = privileged;

      let triage;
      let stored;
      if (privileged) {
        // SKIP the AI model (no body to llama) and SKIP R2 attachment storage.
        // Classify on subject + sender ONLY. Forward + metadata-only logging
        // still proceed below exactly as for non-privileged mail.
        triage = this.privilegedTriage(emailData);
        stored = []; // privileged attachments are NOT written to R2
        console.log(
          `[privilege-gate] F-L10 ENGAGED for ${emailData.id} — AI skipped, ` +
          `${attachments.length} attachment(s) NOT stored to R2, metadata-only logging.`,
        );
      } else {
        // Non-privileged: unchanged behavior — full AI triage + R2 storage.
        triage = await this.triageEmail(emailData);
        stored = await this.storeAttachments(attachments, emailData, triage);
      }
      emailData.storedAttachments = stored;

      // Security disclosure path — dispatched BEFORE general routing so that
      // mail to security@chitty.cc (or triaged as a security_incident) is
      // guaranteed to reach the SecurityAgent within the 48h SLA declared in
      // chittyentity/SECURITY.md, even if downstream routing fails.
      if (this.isSecurityIncident(emailData)) {
        await this.dispatchToSecurityAgent(emailData, triage, env, ctx);
      }
      // Check if we're in onboarding/training mode
      const mode = await this.getRoutingMode();

      // Queue the email with AI's proposed classification
      const queueItem = await this.enqueue(emailData, triage, stored);

      if (mode === 'auto') {
        // Auto mode: AI is trusted, process immediately
        await this.logEmail(emailData, triage);
        await this.routeEmail(message, emailData, triage);
        await this.sendRoutingConfirmation(emailData, triage, stored);
        await this.updateQueueItem(queueItem.id, 'auto_approved');
      } else {
        // Onboarding/training mode: queue for review, still forward email
        await this.routeEmail(message, emailData, triage);
        await this.sendRoutingConfirmation(emailData, triage, stored);
        // Item stays 'pending' in queue until user approves/corrects
      }

      const elapsed = Date.now() - startTime;
      console.log(`[${mode}] Processed email from ${emailData.from} in ${elapsed}ms - ${triage.urgencyLevel} - ${stored.length} attachments - queue:${queueItem.id}`);

      return { success: true, urgencyLevel: triage.urgencyLevel, attachmentsStored: stored.length, queueId: queueItem.id, mode };

    } catch (error) {
      console.error('Email handling failed:', error);

      // Fallback - forward to catch-all
      try {
        await message.forward('nick@aribia.llc');
      } catch (forwardError) {
        console.error('Fallback forward failed:', forwardError);
      }

      return { success: false, error: error.message };
    }
  }

  /**
   * Extract structured data from email
   */
  extractEmailData(message, rawText) {
    const from = message.from || '';
    const to = message.to || '';
    const subject = message.headers.get('subject') || '(No subject)';
    const messageId = message.headers.get('message-id') || `cf-${Date.now()}`;
    const date = message.headers.get('date') || new Date().toISOString();
    const cc = message.headers.get('cc') || '';
    const bcc = message.headers.get('bcc') || '';
    const replyTo = message.headers.get('reply-to') || '';
    const xOriginalTo = message.headers.get('x-original-to') || '';
    const references = message.headers.get('references') || '';
    const inReplyTo = message.headers.get('in-reply-to') || '';

    // Extract body text — get more for AI analysis
    let content = '';
    const bodyStart = rawText.indexOf('\r\n\r\n');
    if (bodyStart > -1) {
      content = rawText.substring(bodyStart + 4, bodyStart + 8000);
    }
    // Strip base64 noise from content for cleaner AI input
    content = content.replace(/[A-Za-z0-9+/=]{60,}/g, '[base64-data]').substring(0, 3000);

    return {
      id: messageId,
      from,
      to,
      cc,
      bcc,
      replyTo,
      xOriginalTo,
      references,
      inReplyTo,
      subject,
      date,
      content,
      timestamp: new Date().toISOString(),
      size: message.rawSize || rawText.length
    };
  }

  /**
   * Parse MIME multipart email to extract attachments
   * Handles base64-encoded parts with Content-Disposition: attachment
   */
  parseMimeAttachments(rawText) {
    const attachments = [];

    // Find all boundaries in the email (primary + nested multipart)
    const boundaryMatches = rawText.match(/boundary="?([^"\r\n;]+)"?/gi);
    if (!boundaryMatches) return attachments;

    const seenBoundaries = new Set();

    for (const match of boundaryMatches) {
      const parsed = match.match(/boundary="?([^"\r\n;]+)"?/i);
      if (!parsed) continue;
      const boundary = parsed[1];
      if (seenBoundaries.has(boundary)) continue;
      seenBoundaries.add(boundary);

      const parts = rawText.split('--' + boundary);

      for (const part of parts) {
        const attachment = this.extractAttachmentFromPart(part, boundary);
        if (!attachment) continue;

        // Skip duplicates (same filename found in nested boundary)
        if (attachments.some(a => a.filename === attachment.filename)) continue;

        attachments.push(attachment);
      }
    }

    return attachments;
  }

  /**
   * Extract a single attachment from a MIME part, or return null if not an attachment
   */
  extractAttachmentFromPart(part, boundary) {
    if (part.trim() === '' || part.trim() === '--') return null;

    const hasAttachment = /Content-Disposition:\s*attachment/i.test(part);
    const hasInline = /Content-Disposition:\s*inline/i.test(part);

    // Get content type
    const ctMatch = part.match(/Content-Type:\s*([^\r\n;]+)/i);
    const contentType = ctMatch ? ctMatch[1].trim().toLowerCase() : '';

    // Get filename from Content-Disposition or Content-Type
    let filename = '';
    const fnMatch = part.match(/filename="?([^"\r\n;]+)"?/i);
    if (fnMatch) filename = fnMatch[1].trim();
    const nameMatch = part.match(/name="?([^"\r\n;]+)"?/i);
    if (!filename && nameMatch) filename = nameMatch[1].trim();

    if (!filename) return null;
    if (hasInline && contentType.startsWith('image/')) return null;
    if (!hasAttachment && !this.extractableTypes.has(contentType)) return null;

    // Check encoding
    const encodingMatch = part.match(/Content-Transfer-Encoding:\s*(\S+)/i);
    const encoding = encodingMatch ? encodingMatch[1].toLowerCase() : '7bit';

    // Extract the body (after the blank line separating headers from content)
    const bodyStart = part.indexOf('\r\n\r\n');
    if (bodyStart === -1) return null;

    let body = part.substring(bodyStart + 4).trim();
    // Remove trailing boundary marker if present
    const trailingBoundary = body.lastIndexOf('--' + boundary);
    if (trailingBoundary > -1) {
      body = body.substring(0, trailingBoundary).trim();
    }

    const data = this.decodePartBody(body, encoding, filename);
    if (!data || data.length < 1) {
      if (data && data.length > 0) {
        console.log(`[email-handler] Filtered small attachment: ${filename} (${contentType}, ${data.length} bytes)`);
      }
      return null;
    }

    return { filename, contentType, size: data.length, data };
  }

  /**
   * Decode a MIME part body from its transfer encoding into bytes
   * Returns null if decoding fails
   */
  decodePartBody(body, encoding, filename) {
    if (encoding === 'base64') {
      const cleaned = body.replace(/[\r\n\s]/g, '');
      try {
        const binaryString = atob(cleaned);
        const data = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          data[i] = binaryString.charCodeAt(i);
        }
        return data;
      } catch (e) {
        console.error(`Failed to decode base64 for ${filename}:`, e.message);
        return null;
      }
    }
    return new TextEncoder().encode(body);
  }

  /**
   * Resolve R2 storage base path from classification data (triage or correction)
   */
  resolveStoragePath(classification) {
    if (classification.caseRelevant || classification.category === 'case' || classification.category === 'legal') {
      return `cases/arias-v-bianchi/${classification.category}`;
    } else if (classification.entity === 'ARIBIA') {
      return `business/aribia/${classification.category}`;
    } else if (classification.entity === 'ITCANBE') {
      return `business/itcanbe/${classification.category}`;
    } else if (classification.entity === 'personal') {
      return `inbox/nick/${classification.category}`;
    } else if (classification.entity === 'chittyos') {
      return `ops/${classification.category}`;
    } else if (classification.category === 'spam') {
      return 'spam';
    }
    return `inbox/unsorted/${classification.category}`;
  }

  /**
   * Store extracted attachments to R2
   */
  async storeAttachments(attachments, emailData, triage) {
    if (!attachments.length) return [];
    if (!this.env.DOCUMENT_STORAGE) {
      console.error('R2 DOCUMENT_STORAGE binding not available');
      return [];
    }

    const stored = [];
    const dateStr = new Date().toISOString().split('T')[0];
    const basePath = this.resolveStoragePath(triage);
    // Derive a short slug from the email message ID to prevent same-day filename collisions
    const emailSlug = (emailData.id || '').replace(/[^a-zA-Z0-9]/g, '').slice(-12) || Date.now().toString(36);

    for (const att of attachments) {
      const key = `${basePath}/${dateStr}/${emailSlug}/${att.filename}`;

      try {
        // Compute SHA-256 hash for chain of custody
        const hashBuffer = await crypto.subtle.digest('SHA-256', att.data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const sha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        // Store with metadata
        await this.env.DOCUMENT_STORAGE.put(key, att.data, {
          httpMetadata: { contentType: att.contentType },
          customMetadata: {
            originalFilename: att.filename,
            emailFrom: emailData.from,
            emailTo: emailData.to,
            emailSubject: emailData.subject.substring(0, 200),
            emailDate: emailData.date,
            emailMessageId: emailData.id,
            sha256,
            extractedAt: new Date().toISOString(),
            urgencyLevel: triage.urgencyLevel,
            category: triage.category,
            size: String(att.size)
          }
        });

        stored.push({
          filename: att.filename,
          key,
          size: att.size,
          sha256,
          contentType: att.contentType
        });

        console.log(`R2: stored ${att.filename} (${att.size} bytes, sha256:${sha256.substring(0, 12)}...) -> ${key}`);

      } catch (error) {
        console.error(`Failed to store ${att.filename}:`, error);
        stored.push({
          filename: att.filename,
          key,
          size: att.size,
          sha256: null,
          contentType: att.contentType,
          failed: true,
          error: error.message
        });
      }
    }

    return stored;
  }

  /**
   * AI-powered email triage — uses Workers AI to analyze full email context
   * Examines: from, to, cc, bcc, subject, body, attachment names, reply chains
   */
  async triageEmail(emailData) {
    // Load training corrections to improve AI classification
    const trainingExamples = await this.getTrainingExamples();

    // Build rich context for AI analysis
    const attachmentList = emailData.attachmentNames?.length
      ? `Attachments: ${emailData.attachmentNames.join(', ')}`
      : 'No attachments';

    const trainingBlock = trainingExamples.length
      ? `\nLEARNED CORRECTIONS (apply these patterns):\n${trainingExamples.map(ex =>
          `- Email from "${ex.from}" about "${ex.subject}" → was "${ex.wrongCategory}", should be "${ex.correctCategory}" (${ex.reason})`
        ).join('\n')}\n`
      : '';

    const prompt = `You are an email routing AI for a legal professional named Nicholas Bianchi.
You must classify this email into exactly ONE category and assess urgency.

KNOWN CONTEXT:
- Active litigation: Arias v. Bianchi, Case No. 2024D007847 (Cook County divorce/dissolution)
- Parties: Nicholas Bianchi (respondent), Luisa Arias/Montealegre (petitioner)
- Attorneys: Rob Alexander (Bianchi), Berlin Melzer (Arias)
- Business entities: ARIBIA LLC, IT CAN BE LLC
- Properties: 541 W Addison, 550 W Surf, Morada Mami (Colombia)
- Known senders: court coordinators, paralegals, State Farm, ServiceMaster, DoorLoop, Mercury Bank
${trainingBlock}
EMAIL:
From: ${emailData.from}
To: ${emailData.to}
CC: ${emailData.cc || 'none'}
Reply-To: ${emailData.replyTo || 'none'}
Subject: ${emailData.subject}
Date: ${emailData.date}
${attachmentList}

Body (excerpt):
${emailData.content.substring(0, 1500)}

CLASSIFY into exactly one JSON object:
{
  "category": one of ["case", "legal", "financial", "property", "business", "personal", "ops", "spam"],
  "urgency": one of ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"],
  "reasons": [array of 1-3 short reason strings],
  "case_relevant": true/false (is this related to Arias v. Bianchi or any active litigation?),
  "entity": null or one of ["ARIBIA", "ITCANBE", "personal", "chittyos"],
  "action_needed": true/false,
  "summary": "one-line summary of what this email is about"
}

Respond with ONLY the JSON object, no other text.`;

    try {
      const aiResult = await this.env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 300,
        temperature: 0.1
      });

      const responseText = aiResult.response || '';
      // Extract JSON from response (handle markdown fences)
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          urgencyLevel: parsed.urgency || 'MEDIUM',
          urgencyScore: this.urgencyToScore(parsed.urgency),
          category: parsed.category || 'general',
          caseRelevant: parsed.case_relevant ?? false,
          entity: parsed.entity || null,
          actionNeeded: parsed.action_needed ?? false,
          summary: parsed.summary || '',
          reasons: parsed.reasons || ['ai-classified'],
          aiClassified: true,
          timestamp: new Date().toISOString()
        };
      }
    } catch (err) {
      console.error('AI triage failed, falling back to rule-based:', err);
    }

    // Fallback: rule-based triage if AI fails
    return this.ruleBasedTriage(emailData);
  }

  /**
   * Metadata-only triage for PRIVILEGED-LEGAL mail (F-L10). Classifies using
   * ONLY the subject + sender/recipient addresses — the body is NEVER read and
   * is NEVER sent to the Cloudflare AI model. Mirrors how
   * studio-flows/aribia-daily-inbox-triage.json classifies privileged mail on
   * subject signals alone.
   *
   * Returns the same triage shape the rest of handleEmail consumes (so
   * enqueue / sendRoutingConfirmation / the return value all keep working), but
   * with category fixed to 'legal' and caseRelevant true — privileged-legal is
   * by definition legal/case material. urgencyLevel is derived from subject
   * urgency keywords + recipient-address priority only.
   *
   * @param {Object} emailData
   * @returns {Object} triage
   */
  privilegedTriage(emailData) {
    // Subject + addresses ONLY — explicitly NOT emailData.content.
    const subject = String(emailData.subject || '');
    const reasons = ['privileged_legal', 'metadata-only'];
    let score = 50; // privileged-legal floors at MEDIUM; legal mail is never INFO

    if (this.urgencyPatterns.court.test(subject)) { score += 30; reasons.push('court'); }
    if (this.urgencyPatterns.urgent.test(subject)) { score += 20; reasons.push('urgent'); }
    if (this.urgencyPatterns.legal.test(subject)) { score += 10; reasons.push('legal'); }

    // Recipient-address priority (no body needed).
    const addressRoute = Object.prototype.hasOwnProperty.call(this.addressRoutes, emailData.to)
      ? this.addressRoutes[emailData.to]
      : undefined;
    if (addressRoute) {
      if (addressRoute.priority === 'CRITICAL') score += 30;
      else if (addressRoute.priority === 'HIGH') score += 20;
      else if (addressRoute.priority === 'MEDIUM') score += 10;
      if (addressRoute.case) reasons.push(`case:${addressRoute.case}`);
    }

    let urgencyLevel;
    if (score >= 80) urgencyLevel = 'CRITICAL';
    else if (score >= 60) urgencyLevel = 'HIGH';
    else urgencyLevel = 'MEDIUM';

    return {
      urgencyLevel,
      urgencyScore: score,
      category: 'legal',
      caseRelevant: true,
      entity: null,
      actionNeeded: score >= 60,
      // NO summary — summaries would describe body content. Metadata-only.
      summary: '',
      reasons,
      aiClassified: false,
      privileged: true,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Convert urgency string to numeric score
   */
  urgencyToScore(urgency) {
    switch (urgency) {
      case 'CRITICAL': return 90;
      case 'HIGH': return 70;
      case 'MEDIUM': return 50;
      case 'LOW': return 25;
      case 'INFO': return 10;
      default: return 30;
    }
  }

  /**
   * Fallback rule-based triage when AI is unavailable
   */
  ruleBasedTriage(emailData) {
    const text = `${emailData.subject} ${emailData.content} ${emailData.from}`.toLowerCase();
    const reasons = [];
    let score = 0;
    let category = 'general';

    for (const [key, pattern] of Object.entries(this.urgencyPatterns)) {
      if (pattern.test(text)) {
        reasons.push(key);
        switch(key) {
          case 'court': score += 40; category = 'legal'; break;
          case 'urgent': score += 30; break;
          case 'creditor': score += 25; category = 'financial'; break;
          case 'compliance': score += 25; category = 'compliance'; break;
          case 'property': score += 20; category = 'property'; break;
          case 'legal': score += 15; category = 'legal'; break;
          case 'financial': score += 15; category = 'financial'; break;
        }
      }
    }

    // Check destination address priority. Use hasOwn to keep prototype-chain
    // lookups (e.g. `to: '__proto__'`) from hitting Object.prototype methods.
    const addressRoute = Object.prototype.hasOwnProperty.call(this.addressRoutes, emailData.to)
      ? this.addressRoutes[emailData.to]
      : undefined;
    if (addressRoute) {
      if (addressRoute.priority === 'CRITICAL') score += 30;
      else if (addressRoute.priority === 'HIGH') score += 20;
      else if (addressRoute.priority === 'MEDIUM') score += 10;

      if (addressRoute.case) {
        category = 'case';
        reasons.push(`case:${addressRoute.case}`);
      }
    }

    // Check for case patterns in address (e.g., plaintiff-v-defendant@chitty.cc)
    const caseMatch = emailData.to.match(/([a-zA-Z]{1,64})-v-([a-zA-Z]{1,64})@/i);
    if (caseMatch) {
      score += 25;
      category = 'case';
      reasons.push(`case_address:${caseMatch[1]}-v-${caseMatch[2]}`);
    }

    if (emailData.attachmentCount > 0) {
      score += 10;
      reasons.push(`attachments:${emailData.attachmentCount}`);
    }

    let urgencyLevel;
    if (score >= 80) urgencyLevel = 'CRITICAL';
    else if (score >= 60) urgencyLevel = 'HIGH';
    else if (score >= 40) urgencyLevel = 'MEDIUM';
    else if (score >= 20) urgencyLevel = 'LOW';
    else urgencyLevel = 'INFO';

    return {
      urgencyLevel, urgencyScore: score, category, reasons,
      caseRelevant: category === 'case' || category === 'legal',
      entity: null, actionNeeded: score >= 40, summary: '',
      aiClassified: false, timestamp: new Date().toISOString()
    };
  }

  /**
   * Log email to KV for dashboard
   */
  async logEmail(emailData, triage) {
    // F-L10 metadata-only: for privileged_legal mail, do NOT persist subject or
    // body. Forward still proceeds normally in routeEmail. The flag is the UNION
    // of two signals: the STATIC pre-triage privilege gate (emailData.privileged,
    // Neon-independent, fail-closed) and #99's registry-derived posture
    // (aliasDecision.metadataOnly). Either one suppresses logging — otherwise a
    // statically-privileged email with no alias_registry row would leak its
    // subject/body into KV here.
    const metadataOnly = emailData?.privileged === true
      || emailData?.aliasDecision?.metadataOnly === true;
    const logEntry = {
      ...emailData,
      content: undefined, // Don't store full body in KV
      subject: metadataOnly ? '[REDACTED — privileged_legal]' : emailData.subject,
      aliasDecision: undefined, // don't serialize the decision object into the log
      ...triage,
      summary: metadataOnly ? '' : triage.summary,
      metadataOnly,
    };

    try {
      const recentKey = 'email_log_recent';
      const existing = await this.env.AI_CACHE?.get(recentKey, 'json') || [];
      existing.unshift(logEntry);
      const trimmed = existing.slice(0, 100);
      await this.env.AI_CACHE?.put(recentKey, JSON.stringify(trimmed), { expirationTtl: 86400 * 7 });

      if (triage.urgencyScore >= 50) {
        const urgentKey = 'email_urgent_items';
        const urgentItems = await this.env.AI_CACHE?.get(urgentKey, 'json') || [];
        urgentItems.unshift(logEntry);
        await this.env.AI_CACHE?.put(urgentKey, JSON.stringify(urgentItems.slice(0, 50)), { expirationTtl: 86400 * 3 });
      }

      const statsKey = 'email_stats';
      const stats = await this.env.AI_CACHE?.get(statsKey, 'json') || {
        total: 0, critical: 0, high: 0, medium: 0, low: 0, attachmentsStored: 0
      };
      stats.total++;
      stats[triage.urgencyLevel.toLowerCase()] = (stats[triage.urgencyLevel.toLowerCase()] || 0) + 1;
      stats.attachmentsStored = (stats.attachmentsStored || 0) + (emailData.storedAttachments?.length || 0);
      await this.env.AI_CACHE?.put(statsKey, JSON.stringify(stats), { expirationTtl: 86400 });

    } catch (error) {
      console.error('Failed to log email:', error);
    }
  }

  /**
   * Route email based on address and triage
   */
  /**
   * True when an inbound email should be dispatched to SecurityAgent.
   *
   * Two independent signals:
   *   1. Recipient is in the critical-address set (security@chitty.cc) —
   *      address-based override, trusted unconditionally.
   *   2. TriageAgent/LLM classifier tagged it as a security_incident.
   *
   * Either signal is sufficient; both are common.
   */
  isSecurityIncident(emailData) {
    // Recipient-based dispatch only on this legacy path. The local
    // triageEmail() emits 'general'/'legal'/'financial'/'compliance'/
    // 'property'/'case' — never 'security_incident' — and has no
    // `class` field, so any triage.category/triage.class checks here
    // would be permanently dead. The Agents-SDK pipeline
    // (src/ai/email-processor.js → TRIAGE_AGENT/classify) does the
    // content-based 'security_incident' classification, which dispatches
    // to SecurityAgent through that path instead of this one.
    const to = String(emailData?.to || '').toLowerCase();
    // Match the address token directly so "Security <security@chitty.cc>",
    // comma-separated lists, etc. all dispatch.
    return to.includes('security@chitty.cc');
  }

  /**
   * Dispatch the email to SecurityAgent's /ingest endpoint. Uses DO stub
   * (idFromName("default") — one agent instance per deployment keeps the
   * incident table global). Failures are logged but do not reject — the
   * email still gets logged + routed by the caller.
   */
  async dispatchToSecurityAgent(emailData, triage, env, ctx) {
    if (!env || !env.SECURITY_AGENT) {
      console.warn('SECURITY_AGENT binding absent — cannot dispatch security incident', emailData.id);
      return;
    }

    const dispatchTask = (async () => {
      try {
        const stub = env.SECURITY_AGENT.get(env.SECURITY_AGENT.idFromName('default'));

        // Initialize agent name via partyserver protocol (same as email-processor.js callAgent)
        const setupReq = new Request('http://dummy-example.cloudflare.com/cdn-cgi/partyserver/set-name/');
        setupReq.headers.set('x-partykit-room', 'SECURITY_AGENT');
        await stub.fetch(setupReq).then((r) => r.text());

        // Now send the ingest request
        const res = await stub.fetch('https://internal/agents/security/ingest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reporter: emailData.from,
            // F-L10: privileged-legal mail must not have subject/body cross even
            // to the internal SecurityAgent DO. Redact; the incident still fires
            // (recipient + metadata reach the agent within the 48h SLA).
            subject: emailData.privileged ? '[REDACTED — privileged_legal]' : emailData.subject,
            content: emailData.privileged ? '' : emailData.content,
            message_id: emailData.id,
            recipient: emailData.to,
            triage_category: triage?.category,
            triage_urgency: triage?.urgencyLevel,
          }),
        });
        if (!res.ok) {
          console.error(`SecurityAgent /ingest returned ${res.status} for ${emailData.id}`);
          return;
        }
        const body = await res.json();
        console.log(`🔒 Dispatched to SecurityAgent: incident ${body.incident_id}, ACK due ${body.ack_sla_deadline}`);
      } catch (err) {
        console.error('SecurityAgent dispatch failed:', err?.message || err);
      }
    })();

    // Execute asynchronously via waitUntil if available
    if (ctx && typeof ctx.waitUntil === 'function') {
      ctx.waitUntil(dispatchTask);
    } else {
      dispatchTask.catch(() => {});
    }
  }

  /**
   * Consult the alias_registry overlay for a recipient — but ONLY when the
   * address is NOT already governed by a case/non-case route. This enforces
   * case-registry PRECEDENCE (legal attribution wins) and guarantees the
   * overlay is a pure no-op for every address the handler already knows.
   *
   * Fully fail-open: returns null on disabled overlay, DB failure, absent
   * address, or any exception. Never throws.
   *
   * @param {Object} emailData
   * @param {(env:any)=>Promise<any[]>} [queryFn] - injectable DB query (tests)
   * @returns {Promise<import('../config/alias-registry.js').AliasDecision | null>}
   */
  async resolveAliasOverlay(emailData, queryFn) {
    const to = emailData?.to;
    if (typeof to !== 'string' || !to) return null;
    // PRECEDENCE: case/non-case routes win — skip the overlay entirely (no DB
    // consult). Legal attribution from case-registry always wins.
    if (Object.prototype.hasOwnProperty.call(this.addressRoutes, to)) return null;
    try {
      return await resolveAliasDecision(to, this.env, queryFn);
    } catch (err) {
      console.error('[email-handler] alias overlay failed, failing open:', err?.message ?? err);
      return null;
    }
  }

  async routeEmail(message, emailData, triage) {
    const route = Object.prototype.hasOwnProperty.call(this.addressRoutes, emailData.to)
      ? this.addressRoutes[emailData.to]
      : undefined;
    if (route?.forward) {
      await message.forward(route.forward);
      console.log(`Forwarded to ${route.forward}`);
      return;
    }

    // No case/non-case route matched. Consult the registry-backed overlay
    // decision resolved earlier in handleEmail (null unless it applies).
    // Fail-open at every branch: a missing/unset override env falls through
    // to today's default forward rather than dropping the message.
    const decision = emailData.aliasDecision;
    if (decision) {
      if (decision.forwardEnv) {
        const dest = this.env?.[decision.forwardEnv];
        if (dest) {
          await message.forward(dest);
          console.log(
            `[alias-registry] lane=${decision.lane} disposition=${decision.disposition} ` +
            `forwarded via ${decision.forwardEnv}`,
          );
          return;
        }
        // Override env unset → fail open to default forward below.
        console.warn(
          `[alias-registry] ${decision.address} wants ${decision.forwardEnv} but env is unset — ` +
          `falling back to default forward.`,
        );
      }
      if (decision.retired) {
        // 'retire' disposition: still forward (don't drop), but log it.
        console.log(`[alias-registry] forwarding RETIRED address ${decision.address} to default.`);
      }
    }

    await message.forward('nick@aribia.llc');
    console.log('Forwarded to default (nick@aribia.llc)');
  }

  // pushUrgentToNotion removed — replaced by sendRoutingConfirmation which covers all emails

  /**
   * Send routing confirmation — so user knows what arrived and where it went
   */
  async sendRoutingConfirmation(emailData, triage, storedAttachments) {
    // F-L10 metadata-only: privileged_legal mail gets a redacted receipt
    // (no subject/summary persisted or pushed to Notion). Routing is unaffected.
    // Union of the static pre-triage gate and #99's registry posture.
    const metadataOnly = emailData?.privileged === true
      || emailData?.aliasDecision?.metadataOnly === true;
    const safeSubject = metadataOnly ? '[REDACTED — privileged_legal]' : emailData.subject;
    const safeSummary = metadataOnly ? '' : triage.summary;
    const receipt = {
      id: `rcpt-${Date.now()}`,
      receivedAt: new Date().toISOString(),
      from: emailData.from,
      to: emailData.to,
      subject: safeSubject,
      classification: {
        category: triage.category,
        urgency: triage.urgencyLevel,
        caseRelevant: triage.caseRelevant,
        entity: triage.entity,
        summary: safeSummary,
        reasons: triage.reasons,
        aiClassified: triage.aiClassified
      },
      attachments: storedAttachments.map(a => ({
        filename: a.filename,
        path: a.key,
        size: a.size,
        sha256: a.sha256
      })),
      actionNeeded: triage.actionNeeded
    };

    // Store receipt in KV for retrieval
    try {
      await this.env.AI_CACHE?.put(
        `email_receipt_${receipt.id}`,
        JSON.stringify(receipt),
        { expirationTtl: 86400 * 30 }
      );

      // Append to recent receipts list
      const recentKey = 'email_receipts_recent';
      const recent = await this.env.AI_CACHE?.get(recentKey, 'json') || [];
      recent.unshift(receipt);
      await this.env.AI_CACHE?.put(recentKey, JSON.stringify(recent.slice(0, 200)), { expirationTtl: 86400 * 30 });
    } catch (err) {
      console.error('Failed to store receipt:', err);
    }

    // Push to Notion as confirmation
    try {
      const urgencyEmoji = { CRITICAL: '🚨', HIGH: '⚠️', MEDIUM: '📌', LOW: '📬', INFO: '📧' };
      const caseTag = triage.caseRelevant ? ' [CASE]' : '';
      const aiTag = triage.aiClassified ? ' [AI]' : ' [RULE]';
      const attCount = storedAttachments.length;
      const attLine = attCount ? `\n📎 ${attCount} attachment${attCount > 1 ? 's' : ''}: ${storedAttachments.map(a => a.filename).join(', ')}` : '';

      const blocks = [{
        object: 'block',
        type: 'callout',
        callout: {
          icon: { emoji: urgencyEmoji[triage.urgencyLevel] || '📧' },
          rich_text: [{
            type: 'text',
            text: {
              content: `${aiTag}${caseTag} ${triage.urgencyLevel} — ${triage.category}\n` +
                `From: ${emailData.from}\n` +
                `Subject: ${safeSubject.substring(0, 120)}\n` +
                `${safeSummary ? `Summary: ${safeSummary}\n` : ''}` +
                `Reasons: ${triage.reasons.join(', ')}` +
                attLine
            }
          }]
        }
      }];

      const notionResp = await fetch('https://notion-ops.chitty.cc/update-page-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          page_id: '20094de43579808ba32efa91ae9611ae',
          append: true,
          blocks
        })
      });
      if (!notionResp.ok) {
        console.error(`Notion push failed: ${notionResp.status} ${await notionResp.text().catch(() => '')}`);
      }
    } catch (err) {
      console.error('Failed to push confirmation to Notion:', err);
    }
  }

  /**
   * Get training examples from KV — corrections submitted by user
   * These are injected into the AI prompt as few-shot learning
   */
  async getTrainingExamples() {
    try {
      const examples = await this.env.AI_CACHE?.get('email_training_corrections', 'json');
      return examples || [];
    } catch (err) {
      console.error('Failed to load training examples from KV:', err);
      return [];
    }
  }

  /**
   * Submit a routing correction — called via /email/correct API
   * Stores the correction so future classifications learn from it
   */
  async submitCorrection(correction) {
    try {
      const examples = await this.getTrainingExamples();

      examples.push({
        from: correction.from,
        subject: correction.subject,
        wrongCategory: correction.wasCategory,
        correctCategory: correction.shouldBeCategory,
        correctEntity: correction.shouldBeEntity || null,
        reason: correction.reason || 'user correction',
        submittedAt: new Date().toISOString()
      });

      // Keep last 50 corrections (most recent = most relevant)
      const trimmed = examples.slice(-50);

      await this.env.AI_CACHE?.put(
        'email_training_corrections',
        JSON.stringify(trimmed),
        { expirationTtl: 86400 * 90 } // 90 days
      );

      return { success: true, totalCorrections: trimmed.length };
    } catch (err) {
      console.error('Failed to store correction:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Get recent routing receipts — called via /email/receipts API
   */
  async getRecentReceipts(limit = 20) {
    try {
      const recent = await this.env.AI_CACHE?.get('email_receipts_recent', 'json') || [];
      return recent.slice(0, limit);
    } catch (err) {
      console.error('Failed to load recent receipts from KV:', err);
      return [];
    }
  }

  // ============ Queue System ============

  /**
   * Get current routing mode: 'onboarding' (review everything) or 'auto' (AI trusted)
   */
  async getRoutingMode() {
    try {
      const mode = await this.env.AI_CACHE?.get('email_routing_mode');
      return mode || 'onboarding'; // default to onboarding until user switches
    } catch (err) {
      console.error('Failed to read routing mode from KV:', err);
      return 'onboarding';
    }
  }

  /**
   * Set routing mode
   */
  async setRoutingMode(mode) {
    await this.env.AI_CACHE?.put('email_routing_mode', mode);
    return { mode };
  }

  /**
   * Add email to the review queue
   */
  async enqueue(emailData, triage, storedAttachments) {
    const id = `q-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    // F-L10 metadata-only: privileged_legal mail must not have subject, body,
    // or AI summary persisted to the queue store. The queue item still records
    // routing metadata so the review UI shows the email arrived. enqueue runs
    // in BOTH auto and onboarding modes, so this is a required redaction sink.
    // CRITICAL: bodyPreview below is emailData.content.substring(0,500) — the
    // BODY. Without the static-gate term, a statically-privileged email with no
    // alias_registry row would write its body straight into KV here.
    const metadataOnly = emailData?.privileged === true
      || emailData?.aliasDecision?.metadataOnly === true;
    const safeSubject = metadataOnly ? '[REDACTED — privileged_legal]' : emailData.subject;
    const safeBodyPreview = metadataOnly ? '' : (emailData.content?.substring(0, 500) ?? '');
    const safeSummary = metadataOnly ? '' : triage.summary;

    const item = {
      id,
      status: 'pending', // pending | approved | corrected | auto_approved
      receivedAt: new Date().toISOString(),
      metadataOnly,
      email: {
        from: emailData.from,
        to: emailData.to,
        cc: emailData.cc,
        subject: safeSubject,
        date: emailData.date,
        bodyPreview: safeBodyPreview,
        attachments: emailData.attachmentNames || []
      },
      aiClassification: {
        category: triage.category,
        urgency: triage.urgencyLevel,
        caseRelevant: triage.caseRelevant,
        entity: triage.entity,
        summary: safeSummary,
        reasons: triage.reasons,
        aiClassified: triage.aiClassified
      },
      storedPaths: storedAttachments.map(a => a.key),
      finalClassification: null, // filled when approved/corrected
      reviewedAt: null
    };

    try {
      // Store individual item
      await this.env.AI_CACHE?.put(`email_queue_${id}`, JSON.stringify(item), { expirationTtl: 86400 * 30 });

      // Add to queue index
      const indexKey = 'email_queue_index';
      const index = await this.env.AI_CACHE?.get(indexKey, 'json') || [];
      index.unshift({ id, status: 'pending', from: emailData.from, subject: safeSubject, receivedAt: item.receivedAt, urgency: triage.urgencyLevel });
      await this.env.AI_CACHE?.put(indexKey, JSON.stringify(index.slice(0, 500)), { expirationTtl: 86400 * 30 });
    } catch (err) {
      console.error('Failed to enqueue:', err);
    }

    return item;
  }

  /**
   * Update queue item status
   */
  async updateQueueItem(id, status, correction) {
    try {
      const item = await this.env.AI_CACHE?.get(`email_queue_${id}`, 'json');
      if (!item) return null;

      item.status = status;
      item.reviewedAt = new Date().toISOString();

      if (correction) {
        item.finalClassification = correction;
        // Also submit as training correction
        await this.submitCorrection({
          from: item.email.from,
          subject: item.email.subject,
          wasCategory: item.aiClassification.category,
          shouldBeCategory: correction.category,
          shouldBeEntity: correction.entity,
          reason: correction.reason || 'queue correction'
        });

        // Move files in R2 if category changed
        if (correction.category !== item.aiClassification.category && item.storedPaths.length) {
          await this.reclassifyStoredFiles(item, correction);
        }
      } else {
        item.finalClassification = item.aiClassification;
      }

      await this.env.AI_CACHE?.put(`email_queue_${id}`, JSON.stringify(item), { expirationTtl: 86400 * 30 });

      // Update index
      const index = await this.env.AI_CACHE?.get('email_queue_index', 'json') || [];
      const idx = index.findIndex(i => i.id === id);
      if (idx !== -1) {
        index[idx].status = status;
        await this.env.AI_CACHE?.put('email_queue_index', JSON.stringify(index), { expirationTtl: 86400 * 30 });
      }

      return item;
    } catch (err) {
      console.error('Failed to update queue item:', err);
      return null;
    }
  }

  /**
   * Get queue — pending items, or filtered by status
   */
  async getQueue(status, limit = 50) {
    try {
      const index = await this.env.AI_CACHE?.get('email_queue_index', 'json') || [];
      let filtered = status ? index.filter(i => i.status === status) : index;
      filtered = filtered.slice(0, limit);

      // Fetch full items for the filtered set
      const items = await Promise.all(
        filtered.map(async (entry) => {
          const item = await this.env.AI_CACHE?.get(`email_queue_${entry.id}`, 'json');
          return item || entry;
        })
      );

      return items;
    } catch (err) {
      console.error('Failed to read email queue from KV:', err);
      return [];
    }
  }

  /**
   * Approve all pending items (bulk approve — "AI got it right")
   */
  async approveAll() {
    // Read index once, update all pending items, write index back once
    const index = await this.env.AI_CACHE?.get('email_queue_index', 'json') || [];
    const now = new Date().toISOString();
    let approved = 0;

    for (const entry of index) {
      if (entry.status !== 'pending') continue;
      // Update individual item
      const item = await this.env.AI_CACHE?.get(`email_queue_${entry.id}`, 'json');
      if (item) {
        item.status = 'approved';
        item.reviewedAt = now;
        item.finalClassification = item.aiClassification;
        await this.env.AI_CACHE?.put(`email_queue_${entry.id}`, JSON.stringify(item), { expirationTtl: 86400 * 30 });
      }
      entry.status = 'approved';
      approved++;
    }

    // Write index back once
    await this.env.AI_CACHE?.put('email_queue_index', JSON.stringify(index), { expirationTtl: 86400 * 30 });
    return { approved };
  }

  /**
   * Move stored files when user corrects the classification
   */
  async reclassifyStoredFiles(item, correction) {
    if (!this.env.DOCUMENT_STORAGE) return;

    for (const oldKey of item.storedPaths) {
      try {
        // Read the existing object
        const obj = await this.env.DOCUMENT_STORAGE.get(oldKey);
        if (!obj) continue;

        const filename = oldKey.split('/').pop();
        const dateStr = new Date().toISOString().split('T')[0];
        const newBase = this.resolveStoragePath(correction);
        const newKey = `${newBase}/${dateStr}/${filename}`;

        // Copy to new location with updated metadata
        const meta = obj.customMetadata || {};
        meta.reclassifiedFrom = oldKey;
        meta.reclassifiedAt = new Date().toISOString();
        meta.reclassifiedCategory = correction.category;

        await this.env.DOCUMENT_STORAGE.put(newKey, await obj.arrayBuffer(), {
          httpMetadata: obj.httpMetadata,
          customMetadata: meta
        });

        // Delete old
        await this.env.DOCUMENT_STORAGE.delete(oldKey);

        console.log(`Reclassified: ${oldKey} -> ${newKey}`);
      } catch (err) {
        console.error(`Failed to reclassify ${oldKey}:`, err);
      }
    }
  }

  /**
   * Read stream into Uint8Array
   */
  async streamToBytes(stream) {
    const reader = stream.getReader();
    const chunks = [];
    let totalLength = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        totalLength += value.length;
      }
    } finally {
      reader.releaseLock();
    }
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }
}

/**
 * Email handler export for wrangler
 */
export async function email(message, env, ctx) {
  const handler = new CloudflareEmailHandler(env);
  return await handler.handleEmail(message, env, ctx);
}
