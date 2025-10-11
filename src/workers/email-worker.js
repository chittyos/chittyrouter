/**
 * Universal Email Worker for ChittyOS with Workers AI
 * Automatically handles any domain configured in Cloudflare Email Routing
 * Enhanced with AI-powered classification, sentiment analysis, and smart routing
 *
 * Version: 2.1.0 - Enhanced with ChittyID, spam scoring, domain rate limiting, R2 archival
 */

// Import enhancements
import {
  fetchHandler,
  mintEmailChittyID,
  calculateSpamScore,
  checkDomainRateLimit,
  updateDomainRateLimit,
  archiveEmailToR2,
  incrementDailyStats,
} from "./email-worker-enhancements.js";

export default {
  // Add fetch handler for HTTP endpoints
  fetch: fetchHandler.fetch,

  async scheduled(event, env, ctx) {
    // Weekly impact report cron job
    console.log("Running weekly impact report...");
    await generateWeeklyImpactReport(env);
  },

  async email(message, env, ctx) {
    const startTime = Date.now();

    // Extract domain and local part
    const [recipientLocal, recipientDomain] = message.to
      .toLowerCase()
      .split("@");

    // Generate transaction ID
    const transactionId = `EMAIL-${Date.now()}`;

    // Check for BCC tracking (bcc@chitty.cc)
    const bccHeader = message.headers.get("bcc") || "";
    const ccHeader = message.headers.get("cc") || "";
    const isBccTracked = bccHeader.toLowerCase().includes("bcc@chitty.cc");
    const isCcTracked = ccHeader.toLowerCase().includes("@chitty.cc");

    // Check if sender is copying their own chitty.cc namespace
    const fromEmail = message.from.toLowerCase();
    const isNamespaceCopy =
      fromEmail.includes("@chitty.cc") &&
      (bccHeader.toLowerCase().includes(fromEmail) ||
        ccHeader.toLowerCase().includes(fromEmail));

    // Whitelist for system/verification emails
    const WHITELISTED_SENDERS = [
      "noreply@notify.cloudflare.com",
      "@cloudflare.com",
      "@google.com",
      "no-reply@",
      "noreply@",
    ];

    const isWhitelisted = WHITELISTED_SENDERS.some((pattern) =>
      fromEmail.includes(pattern.toLowerCase()),
    );

    console.log(`[${transactionId}] Email received:`, {
      from: message.from,
      to: message.to,
      domain: recipientDomain,
      bccTracked: isBccTracked,
      ccTracked: isCcTracked,
      namespaceCopy: isNamespaceCopy,
      whitelisted: isWhitelisted,
      timestamp: new Date().toISOString(),
    });

    // Default forwarding address for all domains
    const DEFAULT_FORWARD = env.DEFAULT_FORWARD || "no-reply@itcan.llc";

    // Known domain configurations (can be extended)
    const KNOWN_DOMAINS = {
      "nevershitty.com": { priority: true },
      "chitty.cc": { priority: true },
      "chittychat.com": { priority: false },
      "chittyos.com": { priority: true },
      "mrniceweird.com": { priority: false },
      "chittyrouter.com": { priority: false },
      "chicagofurnishedcondos.com": { priority: false },
      "itcanbellc.com": { priority: true },
      "aribia.llc": { priority: true },
      "aribia.co": { priority: false },
      "apt-arlene.llc": { priority: false },
      "jeanarlene.com": { priority: false },
      "nickyb.me": { priority: true },
      "chittycorp.com": { priority: true },
      // Additional domains will use default config
    };

    try {
      // Domain rate limiting check (NEW)
      if (await checkDomainRateLimit(env, recipientDomain)) {
        console.log(
          `[${transactionId}] Domain rate limited: ${recipientDomain}`,
        );
        await message.setReject("Domain rate limit exceeded");
        return;
      }

      // Per-sender rate limiting check
      if (await checkRateLimit(env, message.from)) {
        console.log(`[${transactionId}] Rate limited: ${message.from}`);
        await message.setReject("Rate limit exceeded - please try again later");
        return;
      }

      // Quick spam check (before AI) - skip for whitelisted senders
      if (!isWhitelisted && (await isSpamQuick(message))) {
        console.log(
          `[${transactionId}] Quick spam check failed from ${message.from}`,
        );
        await message.setReject("Message classified as spam");
        return;
      }

      // AI-Enhanced Processing (if available)
      let aiInsights = null;
      if (env.AI) {
        try {
          // Get email body from raw stream
          const rawEmail = await new Response(message.raw).text();
          const subject = message.headers.get("subject") || "";

          // Extract body from raw email (simple extraction)
          const emailBody = rawEmail
            .split("\n\n")
            .slice(1)
            .join("\n\n")
            .substring(0, 2000);

          aiInsights = await Promise.all([
            classifyEmail(env.AI, subject, emailBody),
            analyzeSentiment(env.AI, emailBody),
            checkUrgency(env.AI, subject, emailBody),
            extractEntities(env.AI, emailBody),
          ]).then(([classification, sentiment, urgency, entities]) => ({
            classification,
            sentiment,
            urgency,
            entities,
          }));

          console.log(`[${transactionId}] AI Analysis:`, {
            classification: aiInsights.classification,
            sentiment: aiInsights.sentiment,
            urgency: aiInsights.urgency,
            entityCount: aiInsights.entities.length,
          });

          // Enhanced spam scoring (NEW) - skip for whitelisted senders
          const spamScore = calculateSpamScore(message, aiInsights);
          console.log(
            `[${transactionId}] Spam score: ${spamScore}/100 (whitelisted: ${isWhitelisted})`,
          );

          if (!isWhitelisted && spamScore >= 75) {
            console.log(
              `[${transactionId}] High spam score (${spamScore}), rejecting`,
            );
            await message.setReject("Message classified as spam");
            return;
          }

          // Reject if AI detects spam (keep existing check as fallback) - skip for whitelisted
          if (!isWhitelisted && aiInsights.classification === "spam") {
            console.log(`[${transactionId}] AI detected spam, rejecting`);
            await message.setReject("Message classified as spam by AI");
            return;
          }
        } catch (aiError) {
          console.error(
            `[${transactionId}] AI processing failed, continuing without AI:`,
            aiError,
          );
        }
      }

      // Get domain config (use defaults if unknown)
      const domainConfig = KNOWN_DOMAINS[recipientDomain] || {
        priority: false,
      };

      // Determine forwarding address with AI-enhanced routing
      let forwardTo = DEFAULT_FORWARD;

      // Special routing for specific local parts
      const MGMT_FORWARD = "mgmt@aribia.llc";
      const NICK_FORWARD = "nick@jeanarlene.com";
      const SHARON_FORWARD = "sharon@itcanbellc.com";

      const specialRoutes = {
        // Management emails
        admin: MGMT_FORWARD,
        support: MGMT_FORWARD,
        legal: MGMT_FORWARD,
        security: MGMT_FORWARD,
        abuse: MGMT_FORWARD,
        postmaster: MGMT_FORWARD,
        mgmt: MGMT_FORWARD,
        management: MGMT_FORWARD,
        web: MGMT_FORWARD,

        // Personal routing
        nick: NICK_FORWARD,
        sharon: SHARON_FORWARD,

        // Developer/API emails
        api: DEFAULT_FORWARD,
        webhook: DEFAULT_FORWARD,
        id: DEFAULT_FORWARD,
        dev: DEFAULT_FORWARD,
        info: DEFAULT_FORWARD,
        hello: DEFAULT_FORWARD,

        // Don't forward
        noreply: null,
        "no-reply": null,
      };

      // Handle BCC tracking - bcc@chitty.cc creates certified tracking record
      if (recipientLocal === "bcc" && recipientDomain === "chitty.cc") {
        if (env.TRACKING_ROUTER_URL) {
          await sendToCertifiedTracking(
            env,
            message,
            aiInsights,
            transactionId,
          );
          console.log(
            `[${transactionId}] Created certified tracking record for BCC`,
          );
          return; // Don't forward BCC tracking emails
        }
      }

      // Handle namespace copy tracking (e.g., nick@chitty.cc copying themselves)
      if (isNamespaceCopy && env.TRACKING_ROUTER_URL) {
        await sendToNamespaceTracking(env, message, aiInsights, transactionId);
        console.log(
          `[${transactionId}] Recorded namespace copy for ${fromEmail}`,
        );
        // Continue to also forward/route the email normally
      }

      // Check for no-reply addresses
      if (
        recipientLocal.includes("noreply") ||
        recipientLocal.includes("no-reply")
      ) {
        console.log(
          `[${transactionId}] Discarding no-reply email to ${message.to}`,
        );
        return;
      }

      // Check for evidence/litigation intake emails
      if (["evidence", "litigation", "intake"].includes(recipientLocal)) {
        if (env.EVIDENCE_ROUTER_URL) {
          // Send to evidence processing worker
          await sendToEvidenceRouter(
            env,
            message,
            aiInsights,
            transactionId,
            "litigation",
          );
          console.log(
            `[${transactionId}] Sent to litigation intake: ${recipientLocal}@${recipientDomain}`,
          );
          return;
        } else {
          console.log(
            `[${transactionId}] Evidence router not configured, forwarding to management`,
          );
          forwardTo = MGMT_FORWARD;
        }
      } else if (
        [
          "finance",
          "accounting",
          "invoice",
          "invoices",
          "billing",
          "bill",
          "pay",
          "payment",
        ].includes(recipientLocal)
      ) {
        if (env.FINANCE_ROUTER_URL) {
          // Send to finance workstream
          await sendToEvidenceRouter(
            env,
            message,
            aiInsights,
            transactionId,
            "finance",
          );
          console.log(
            `[${transactionId}] Sent to finance workstream: ${recipientLocal}@${recipientDomain}`,
          );
          return;
        } else {
          console.log(
            `[${transactionId}] Finance router not configured, forwarding to management`,
          );
          forwardTo = MGMT_FORWARD;
        }
      } else if (
        [
          "compliance",
          "governance",
          "risk",
          "audit",
          "regulatory",
          "ethics",
          "policy",
          "grc",
        ].includes(recipientLocal)
      ) {
        if (env.COMPLIANCE_ROUTER_URL) {
          // Send to compliance/governance workstream
          await sendToEvidenceRouter(
            env,
            message,
            aiInsights,
            transactionId,
            "compliance",
          );
          console.log(
            `[${transactionId}] Sent to compliance workstream: ${recipientLocal}@${recipientDomain}`,
          );
          return;
        } else {
          console.log(
            `[${transactionId}] Compliance router not configured, forwarding to management`,
          );
          forwardTo = MGMT_FORWARD;
        }
      } else if (specialRoutes[recipientLocal] !== undefined) {
        // Use special route if defined
        if (specialRoutes[recipientLocal] === null) {
          console.log(
            `[${transactionId}] Discarding email to ${recipientLocal}@${recipientDomain}`,
          );
          return;
        }
        forwardTo = specialRoutes[recipientLocal];
      }

      // AI-Enhanced Smart Routing
      if (aiInsights) {
        // Override routing based on AI classification
        if (
          aiInsights.classification === "legal" ||
          aiInsights.classification === "contract"
        ) {
          // Legal matters go to litigation workstream
          if (env.EVIDENCE_ROUTER_URL) {
            await sendToEvidenceRouter(
              env,
              message,
              aiInsights,
              transactionId,
              "litigation",
            );
            console.log(
              `[${transactionId}] AI detected legal/contract, sent to litigation workstream`,
            );
            return;
          } else {
            forwardTo = MGMT_FORWARD;
            console.log(
              `[${transactionId}] AI routing: legal/contract -> management`,
            );
          }
        } else if (
          aiInsights.classification === "complaint" &&
          aiInsights.sentiment === "angry"
        ) {
          forwardTo = MGMT_FORWARD;
          console.log(
            `[${transactionId}] AI routing: angry complaint -> management`,
          );
        } else if (
          aiInsights.urgency === "critical" ||
          aiInsights.urgency === "high"
        ) {
          // Route urgent emails to management unless personal
          if (!["nick", "sharon"].includes(recipientLocal)) {
            forwardTo = MGMT_FORWARD;
            console.log(
              `[${transactionId}] AI routing: ${aiInsights.urgency} urgency -> management`,
            );
          }
        }

        // Store AI insights for analytics
        if (env.EMAIL_ANALYTICS) {
          await storeAIInsights(env, {
            transactionId,
            from: message.from,
            to: message.to,
            domain: recipientDomain,
            ...aiInsights,
            forwardedTo: forwardTo,
            processingTime: Date.now() - startTime,
          });
        }

        // Handle special classifications - route to finance workstream
        if (
          aiInsights.classification === "invoice" ||
          aiInsights.classification === "receipt"
        ) {
          if (env.FINANCE_ROUTER_URL) {
            await sendToEvidenceRouter(
              env,
              message,
              aiInsights,
              transactionId,
              "finance",
            );
            console.log(
              `[${transactionId}] AI detected financial email, sent to finance workstream`,
            );
            return; // Don't forward, already routed
          } else {
            await handleFinancialEmail(
              env,
              message,
              aiInsights.entities,
              transactionId,
            );
          }
        }

        // Handle compliance/governance classifications
        if (
          ["compliance", "audit", "regulatory", "governance"].includes(
            aiInsights.classification,
          )
        ) {
          if (env.COMPLIANCE_ROUTER_URL) {
            await sendToEvidenceRouter(
              env,
              message,
              aiInsights,
              transactionId,
              "compliance",
            );
            console.log(
              `[${transactionId}] AI detected ${aiInsights.classification} email, sent to compliance workstream`,
            );
            return; // Don't forward, already routed
          }
        }
      }

      // Check for priority
      const isPriority =
        domainConfig.priority ||
        ["legal", "security", "abuse"].includes(recipientLocal) ||
        checkPrioritySender(message.from) ||
        (aiInsights &&
          (aiInsights.urgency === "high" || aiInsights.urgency === "critical"));

      // Note: Cannot modify headers in Cloudflare Email Workers (immutable)
      // Headers are logged for tracking but not added to forwarded message
      const trackingHeaders = {
        "X-Cloudflare-Worker": "chittyos-email-universal-ai",
        "X-Transaction-ID": transactionId,
        "X-Original-To": message.to,
        "X-Routed-Domain": recipientDomain,
        "X-Processing-Time": `${Date.now() - startTime}ms`,
      };

      // Log AI headers if available
      if (aiInsights) {
        trackingHeaders["X-AI-Classification"] = aiInsights.classification;
        trackingHeaders["X-AI-Sentiment"] = aiInsights.sentiment;
        trackingHeaders["X-AI-Urgency"] = aiInsights.urgency;
        if (aiInsights.entities.length > 0) {
          trackingHeaders["X-AI-Entities"] =
            aiInsights.entities.length.toString();
        }
      }

      // Log tracking headers
      if (isBccTracked) {
        trackingHeaders["X-ChittyOS-BCC-Tracked"] = "true";
        trackingHeaders["X-ChittyOS-Certified-Tracking"] = "enabled";
      }
      if (isCcTracked) {
        trackingHeaders["X-ChittyOS-CC-Tracked"] = "true";
      }
      if (isNamespaceCopy) {
        trackingHeaders["X-ChittyOS-Namespace-Copy"] = fromEmail;
      }

      if (isPriority) {
        trackingHeaders["X-Priority"] = "High";
        trackingHeaders["Importance"] = "high";
      }

      // Mint ChittyID for blockchain verification (NEW)
      const chittyId = await mintEmailChittyID(env, {
        from: message.from,
        to: message.to,
        subject: message.headers.get("subject"),
        timestamp: new Date().toISOString(),
        classification: aiInsights?.classification,
      });

      if (chittyId) {
        trackingHeaders["X-ChittyID"] = chittyId;
        console.log(`[${transactionId}] ChittyID: ${chittyId}`);
      }

      console.log(`[${transactionId}] Tracking headers:`, trackingHeaders);

      // Log analytics FIRST (works even if forwarding disabled)
      if (env.EMAIL_ANALYTICS) {
        await logAnalytics(env, {
          transactionId,
          action: "processed",
          from: message.from,
          to: message.to,
          forwardedTo: forwardTo,
          domain: recipientDomain,
          processingTime: Date.now() - startTime,
          priority: isPriority,
          size: message.raw.length,
          aiInsights,
        });
        console.log(`[${transactionId}] ✅ Analytics stored in KV`);
      }

      // Send feedback to sender (all senders, not just @chitty.cc)
      if (env.FEEDBACK_ENABLED === "true") {
        await sendFeedbackToSender(env, {
          transactionId,
          from: message.from,
          to: message.to,
          forwardedTo: forwardTo,
          aiInsights,
          isBccTracked,
          isNamespaceCopy,
          isPriority,
        });
        console.log(`[${transactionId}] ✅ Feedback sent to ${message.from}`);
      }

      // Send webhook for priority emails
      if (isPriority && env.WEBHOOK_URL) {
        await sendWebhook(env.WEBHOOK_URL, {
          transactionId,
          event: "priority_email",
          from: message.from,
          to: message.to,
          subject: message.headers.get("subject"),
          domain: recipientDomain,
        });
        console.log(`[${transactionId}] ✅ Webhook sent`);
      }

      // Forward the email to the destination
      console.log(
        `[${transactionId}] Forwarding to: ${forwardTo} (priority: ${isPriority})`,
      );

      try {
        await message.forward(forwardTo);
        console.log(
          `[${transactionId}] ✅ Successfully forwarded to ${forwardTo}`,
        );
      } catch (forwardError) {
        console.error(
          `[${transactionId}] ⚠️  Forward failed:`,
          forwardError.message,
        );
        console.log(
          `[${transactionId}] Note: Destination address must be verified in Cloudflare Email Routing`,
        );
        // Email processing completed, but forwarding failed
      }

      // Archive email to R2 (NEW - optional)
      await archiveEmailToR2(env, transactionId, {
        from: message.from,
        to: message.to,
        subject: message.headers.get("subject"),
        timestamp: new Date().toISOString(),
        classification: aiInsights?.classification,
        chittyId: chittyId,
        rawEmail: await new Response(message.raw).text(),
      });

      // Update rate limits (sender + domain)
      await updateRateLimit(env, message.from);
      await updateDomainRateLimit(env, recipientDomain);

      // Increment daily stats (NEW)
      await incrementDailyStats(env);
    } catch (error) {
      console.error(`[${transactionId}] Error:`, error);
      // Email processed but encountered an error - no fallback forwarding
    }
  },
};

// Check if sender is priority
function checkPrioritySender(from) {
  const prioritySenders = [
    "@cloudflare.com",
    "@google.com",
    "@github.com",
    "@stripe.com",
    "@openai.com",
    "@anthropic.com",
  ];

  const fromLower = from.toLowerCase();
  return prioritySenders.some((sender) => fromLower.includes(sender));
}

// Quick spam detection (before AI)
async function isSpamQuick(message) {
  const spamKeywords = [
    "viagra",
    "casino",
    "lottery",
    "inheritance",
    "prince",
    "click here now",
    "act now",
    "limited time",
    "you have won",
    "bitcoin mining",
    "forex",
    "make money fast",
    "guarantee",
  ];

  const subject = (message.headers.get("subject") || "").toLowerCase();
  const from = message.from.toLowerCase();

  // Check keywords
  for (const keyword of spamKeywords) {
    if (subject.includes(keyword)) return true;
  }

  // Check patterns
  if (from.match(/\d{5,}@/) || from.includes("..")) {
    return true;
  }

  return false;
}

// Rate limiting
async function checkRateLimit(env, sender) {
  if (!env.RATE_LIMITS) return false;

  try {
    const key = `rate:${sender}`;
    const data = await env.RATE_LIMITS.get(key);

    if (data) {
      const parsed = JSON.parse(data);
      // 50 emails per hour
      return parsed.count > 50;
    }
  } catch (error) {
    console.error("Rate limit check failed:", error);
  }

  return false;
}

// Update rate limit
async function updateRateLimit(env, sender) {
  if (!env.RATE_LIMITS) return;

  try {
    const key = `rate:${sender}`;
    const existing = await env.RATE_LIMITS.get(key);

    let data;
    if (existing) {
      data = JSON.parse(existing);
      if (Date.now() - data.window > 3600000) {
        data = { count: 1, window: Date.now() };
      } else {
        data.count++;
      }
    } else {
      data = { count: 1, window: Date.now() };
    }

    await env.RATE_LIMITS.put(key, JSON.stringify(data), {
      expirationTtl: 3600,
    });
  } catch (error) {
    console.error("Rate limit update failed:", error);
  }
}

// Log analytics
async function logAnalytics(env, data) {
  try {
    if (!env.EMAIL_ANALYTICS) {
      console.error("EMAIL_ANALYTICS KV binding is missing!");
      return;
    }

    const key = `email:${data.domain}:${data.transactionId}`;
    console.log(`Storing analytics with key: ${key}`);

    await env.EMAIL_ANALYTICS.put(
      key,
      JSON.stringify({
        ...data,
        timestamp: new Date().toISOString(),
      }),
      {
        expirationTtl: 86400 * 30,
        metadata: {
          domain: data.domain,
          action: data.action,
        },
      },
    );
    console.log(`Analytics stored successfully for key: ${key}`);
  } catch (error) {
    console.error("Analytics logging failed:", error.message, error.stack);
  }
}

// Send webhook
async function sendWebhook(url, data) {
  try {
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-ChittyOS-Event": "email",
      },
      body: JSON.stringify({
        ...data,
        timestamp: new Date().toISOString(),
      }),
    });
  } catch (error) {
    console.error("Webhook failed:", error);
  }
}

// ============= AI FUNCTIONS =============

// Classify email type using Workers AI
async function classifyEmail(ai, subject, body) {
  if (!ai) return "general";

  try {
    const prompt = `Classify this email into ONE category:
Categories: invoice, receipt, contract, legal, support, complaint, meeting, calendar,
newsletter, marketing, personal, business, api-notification, security-alert, compliance,
audit, regulatory, governance, spam, general

Subject: ${subject}
Body (first 500 chars): ${body.substring(0, 500)}

Reply with only the category name.`;

    const response = await ai.run("@cf/meta/llama-2-7b-chat-int8", {
      prompt,
      max_tokens: 10,
    });

    const category = response.response.toLowerCase().trim();
    return [
      "invoice",
      "receipt",
      "contract",
      "legal",
      "support",
      "complaint",
      "meeting",
      "calendar",
      "newsletter",
      "marketing",
      "personal",
      "business",
      "api-notification",
      "security-alert",
      "compliance",
      "audit",
      "regulatory",
      "governance",
      "spam",
      "general",
    ].includes(category)
      ? category
      : "general";
  } catch (error) {
    console.error("AI classification failed:", error);
    return "general";
  }
}

// Analyze email sentiment using Workers AI
async function analyzeSentiment(ai, body) {
  if (!ai) return "neutral";

  try {
    const prompt = `Analyze the sentiment of this email:
"${body.substring(0, 500)}"

Reply with only: positive, negative, neutral, urgent, or angry`;

    const response = await ai.run("@cf/meta/llama-2-7b-chat-int8", {
      prompt,
      max_tokens: 10,
    });

    const sentiment = response.response.toLowerCase().trim();
    return ["positive", "negative", "neutral", "urgent", "angry"].includes(
      sentiment,
    )
      ? sentiment
      : "neutral";
  } catch (error) {
    console.error("AI sentiment analysis failed:", error);
    return "neutral";
  }
}

// Check urgency level using Workers AI
async function checkUrgency(ai, subject, body) {
  if (!ai) return "normal";

  // Quick keyword check first
  const urgentKeywords = [
    "urgent",
    "asap",
    "emergency",
    "critical",
    "immediately",
    "deadline",
    "expire",
    "final notice",
    "action required",
  ];
  const combinedText = (subject + " " + body).toLowerCase();

  const hasUrgentKeyword = urgentKeywords.some((keyword) =>
    combinedText.includes(keyword),
  );

  if (!hasUrgentKeyword) return "normal";

  try {
    const prompt = `Rate the urgency of this email:
Subject: ${subject}
Body: ${body.substring(0, 300)}

Reply with only: critical, high, normal, or low`;

    const response = await ai.run("@cf/meta/llama-2-7b-chat-int8", {
      prompt,
      max_tokens: 10,
    });

    const urgency = response.response.toLowerCase().trim();
    return ["critical", "high", "normal", "low"].includes(urgency)
      ? urgency
      : "normal";
  } catch (error) {
    console.error("AI urgency check failed:", error);
    return hasUrgentKeyword ? "high" : "normal";
  }
}

// Extract entities (dates, amounts, names, etc.) using Workers AI
async function extractEntities(ai, body) {
  if (!ai) return [];

  try {
    const prompt = `Extract important entities from this email:
"${body.substring(0, 500)}"

List any: dates, dollar amounts, company names, product names, or important numbers.
Format: entity_type:value (one per line, max 5)`;

    const response = await ai.run("@cf/meta/llama-2-7b-chat-int8", {
      prompt,
      max_tokens: 100,
    });

    const entities = response.response
      .split("\n")
      .filter((line) => line.includes(":"))
      .map((line) => {
        const [type, value] = line.split(":");
        return { type: type.trim(), value: value.trim() };
      })
      .slice(0, 5);

    return entities;
  } catch (error) {
    console.error("AI entity extraction failed:", error);
    return [];
  }
}

// Store AI insights for analytics
async function storeAIInsights(env, insights) {
  try {
    const key = `ai:${insights.domain}:${insights.transactionId}`;
    await env.EMAIL_ANALYTICS.put(
      key,
      JSON.stringify({
        ...insights,
        timestamp: new Date().toISOString(),
      }),
      {
        expirationTtl: 86400 * 90, // Keep for 90 days
        metadata: {
          classification: insights.classification,
          urgency: insights.urgency,
          domain: insights.domain,
        },
      },
    );
  } catch (error) {
    console.error("Failed to store AI insights:", error);
  }
}

// Handle financial emails (invoices, receipts)
async function handleFinancialEmail(env, message, entities, transactionId) {
  if (!env.FINANCIAL_EMAILS) return;

  const amounts = entities.filter(
    (e) => e.type === "amount" || e.value.includes("$"),
  );
  const dates = entities.filter((e) => e.type === "date");

  console.log(`[${transactionId}] Financial email:`, { amounts, dates });

  try {
    await env.FINANCIAL_EMAILS.put(
      `financial:${transactionId}`,
      JSON.stringify({
        from: message.from,
        subject: message.headers.get("subject"),
        amounts,
        dates,
        timestamp: new Date().toISOString(),
      }),
    );
  } catch (error) {
    console.error("Failed to store financial email:", error);
  }
}

// Send email to workstream router (evidence/litigation or finance)
async function sendToEvidenceRouter(
  env,
  message,
  aiInsights,
  transactionId,
  workstream = "litigation",
) {
  try {
    const emailData = {
      transactionId,
      from: message.from,
      to: message.to,
      subject: message.headers.get("subject"),
      timestamp: new Date().toISOString(),
      workstream, // "litigation" or "finance"
      aiInsights: aiInsights || {},
      rawEmail: await message.raw(),
    };

    // Determine router URL based on workstream
    const routerUrl =
      workstream === "finance"
        ? env.FINANCE_ROUTER_URL || env.EVIDENCE_ROUTER_URL
        : workstream === "compliance"
          ? env.COMPLIANCE_ROUTER_URL || env.EVIDENCE_ROUTER_URL
          : env.EVIDENCE_ROUTER_URL;

    if (!routerUrl) {
      throw new Error(`No router URL configured for ${workstream} workstream`);
    }

    // Send to router worker
    const response = await fetch(routerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Transaction-ID": transactionId,
        "X-ChittyOS-Event": `${workstream}-intake`,
        "X-Workstream": workstream,
      },
      body: JSON.stringify(emailData),
    });

    if (!response.ok) {
      throw new Error(
        `${workstream} router returned ${response.status}: ${await response.text()}`,
      );
    }

    console.log(`[${transactionId}] Successfully sent to ${workstream} router`);
  } catch (error) {
    console.error(
      `[${transactionId}] Failed to send to ${workstream} router:`,
      error,
    );
    // Fallback: forward to management
    await message.forward("mgmt@aribia.llc");
  }
}

// Send to certified tracking system (bcc@chitty.cc)
async function sendToCertifiedTracking(
  env,
  message,
  aiInsights,
  transactionId,
) {
  try {
    const trackingData = {
      transactionId,
      trackingType: "certified-bcc",
      from: message.from,
      to: message.to,
      cc: message.headers.get("cc") || "",
      bcc: message.headers.get("bcc") || "",
      subject: message.headers.get("subject"),
      timestamp: new Date().toISOString(),
      messageId: message.headers.get("message-id"),
      aiInsights: aiInsights || {},
      rawEmail: await message.raw(),
      certificationLevel: "bcc-tracking",
    };

    const response = await fetch(env.TRACKING_ROUTER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Transaction-ID": transactionId,
        "X-ChittyOS-Event": "certified-tracking",
        "X-Tracking-Type": "bcc",
      },
      body: JSON.stringify(trackingData),
    });

    if (!response.ok) {
      throw new Error(
        `Tracking router returned ${response.status}: ${await response.text()}`,
      );
    }

    console.log(
      `[${transactionId}] Successfully created certified tracking record`,
    );
  } catch (error) {
    console.error(
      `[${transactionId}] Failed to create tracking record:`,
      error,
    );
  }
}

// Send to namespace tracking system (user copying their own namespace)
async function sendToNamespaceTracking(
  env,
  message,
  aiInsights,
  transactionId,
) {
  try {
    const trackingData = {
      transactionId,
      trackingType: "namespace-copy",
      from: message.from,
      to: message.to,
      cc: message.headers.get("cc") || "",
      bcc: message.headers.get("bcc") || "",
      subject: message.headers.get("subject"),
      timestamp: new Date().toISOString(),
      messageId: message.headers.get("message-id"),
      namespace: message.from.split("@")[0],
      aiInsights: aiInsights || {},
    };

    const response = await fetch(env.TRACKING_ROUTER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Transaction-ID": transactionId,
        "X-ChittyOS-Event": "namespace-tracking",
        "X-Tracking-Type": "namespace-copy",
      },
      body: JSON.stringify(trackingData),
    });

    if (!response.ok) {
      throw new Error(
        `Tracking router returned ${response.status}: ${await response.text()}`,
      );
    }

    console.log(
      `[${transactionId}] Successfully recorded namespace copy tracking`,
    );
  } catch (error) {
    console.error(
      `[${transactionId}] Failed to record namespace tracking:`,
      error,
    );
  }
}

// Send feedback notification to sender
async function sendFeedbackToSender(env, feedbackData) {
  try {
    const {
      transactionId,
      from,
      to,
      forwardedTo,
      aiInsights,
      isBccTracked,
      isNamespaceCopy,
      isPriority,
    } = feedbackData;

    // Build feedback message
    let feedbackText = `ChittyOS Email Routing Confirmation

`;
    feedbackText += `Transaction ID: ${transactionId}
`;
    feedbackText += `From: ${from}
`;
    feedbackText += `To: ${to}
`;
    feedbackText += `Forwarded to: ${forwardedTo}
`;
    feedbackText += `Priority: ${isPriority ? "High" : "Normal"}

`;

    if (aiInsights) {
      feedbackText += `AI Analysis:
`;
      feedbackText += `- Classification: ${aiInsights.classification}
`;
      feedbackText += `- Sentiment: ${aiInsights.sentiment}
`;
      feedbackText += `- Urgency: ${aiInsights.urgency}
`;
      if (aiInsights.entities && aiInsights.entities.length > 0) {
        feedbackText += `- Entities detected: ${aiInsights.entities.length}
`;
      }
      feedbackText += `
`;
    }

    if (isBccTracked) {
      feedbackText += `✓ Certified tracking enabled (bcc@chitty.cc detected)
`;
    }

    if (isNamespaceCopy) {
      feedbackText += `✓ Namespace copy recorded
`;
    }

    feedbackText += `
View details: https://portal.chitty.cc/tracking/${transactionId}
`;

    // Send to notification endpoint
    const response = await fetch(env.TRACKING_ROUTER_URL + "/feedback", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Transaction-ID": transactionId,
        "X-ChittyOS-Event": "feedback-notification",
      },
      body: JSON.stringify({
        transactionId,
        recipient: from,
        feedbackText,
        metadata: feedbackData,
        timestamp: new Date().toISOString(),
      }),
    });

    if (response.ok) {
      console.log(`[${transactionId}] Feedback sent to ${from}`);
    }
  } catch (error) {
    console.error(`Failed to send feedback:`, error);
    // Do not fail the email processing if feedback fails
  }
}

// Generate weekly impact report
async function generateWeeklyImpactReport(env) {
  try {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    console.log(
      `Generating impact report for ${weekAgo.toISOString()} to ${now.toISOString()}`,
    );

    // Fetch analytics from KV
    const stats = {
      totalEmails: 0,
      workstreams: {
        litigation: 0,
        finance: 0,
        compliance: 0,
      },
      aiClassifications: {},
      urgencyLevels: {
        critical: 0,
        high: 0,
        normal: 0,
        low: 0,
      },
      sentiments: {
        positive: 0,
        negative: 0,
        neutral: 0,
        urgent: 0,
        angry: 0,
      },
      tracking: {
        bccTracked: 0,
        namespaceCopies: 0,
      },
      domains: {},
      topSenders: {},
    };

    // Query EMAIL_ANALYTICS KV for the week's data
    if (env.EMAIL_ANALYTICS) {
      const listResult = await env.EMAIL_ANALYTICS.list({ prefix: "ai:" });

      for (const key of listResult.keys) {
        const data = await env.EMAIL_ANALYTICS.get(key.name);
        if (!data) continue;

        try {
          const email = JSON.parse(data);
          const emailDate = new Date(email.timestamp);

          // Only include emails from the last week
          if (emailDate < weekAgo) continue;

          stats.totalEmails++;

          // Track workstreams
          if (email.workstream) {
            stats.workstreams[email.workstream] =
              (stats.workstreams[email.workstream] || 0) + 1;
          }

          // Track AI classifications
          if (email.classification) {
            stats.aiClassifications[email.classification] =
              (stats.aiClassifications[email.classification] || 0) + 1;
          }

          // Track urgency
          if (
            email.urgency &&
            stats.urgencyLevels[email.urgency] !== undefined
          ) {
            stats.urgencyLevels[email.urgency]++;
          }

          // Track sentiment
          if (
            email.sentiment &&
            stats.sentiments[email.sentiment] !== undefined
          ) {
            stats.sentiments[email.sentiment]++;
          }

          // Track domains
          if (email.domain) {
            stats.domains[email.domain] =
              (stats.domains[email.domain] || 0) + 1;
          }

          // Track senders
          if (email.from) {
            stats.topSenders[email.from] =
              (stats.topSenders[email.from] || 0) + 1;
          }
        } catch (parseError) {
          console.error("Failed to parse analytics entry:", parseError);
        }
      }
    }

    // Build report
    const report = buildImpactReport(stats, weekAgo, now);

    // Send report to tracking router
    await fetch(env.TRACKING_ROUTER_URL + "/reports", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-ChittyOS-Event": "weekly-impact-report",
      },
      body: JSON.stringify({
        reportType: "weekly-impact",
        period: {
          start: weekAgo.toISOString(),
          end: now.toISOString(),
        },
        stats,
        report,
        timestamp: now.toISOString(),
      }),
    });

    console.log("Weekly impact report generated and sent successfully");
    console.log(report);
  } catch (error) {
    console.error("Failed to generate weekly impact report:", error);
  }
}

// Build formatted impact report
function buildImpactReport(stats, startDate, endDate) {
  const topSenders = Object.entries(stats.topSenders)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const topDomains = Object.entries(stats.domains)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const topClassifications = Object.entries(stats.aiClassifications)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  let report = `
╔════════════════════════════════════════════════════════════════╗
║          ChittyOS Email Worker - Weekly Impact Report         ║
╚════════════════════════════════════════════════════════════════╝

Period: ${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}
Generated: ${endDate.toISOString()}

═══════════════════════════════════════════════════════════════

📊 OVERALL STATISTICS
────────────────────────────────────────────────────────────────
Total Emails Processed:     ${stats.totalEmails.toLocaleString()}

🔀 WORKSTREAM DISTRIBUTION
────────────────────────────────────────────────────────────────
Litigation:                 ${stats.workstreams.litigation.toLocaleString()} emails (${((stats.workstreams.litigation / stats.totalEmails) * 100 || 0).toFixed(1)}%)
Finance:                    ${stats.workstreams.finance.toLocaleString()} emails (${((stats.workstreams.finance / stats.totalEmails) * 100 || 0).toFixed(1)}%)
Compliance:                 ${stats.workstreams.compliance.toLocaleString()} emails (${((stats.workstreams.compliance / stats.totalEmails) * 100 || 0).toFixed(1)}%)

🤖 AI CLASSIFICATION BREAKDOWN
────────────────────────────────────────────────────────────────
${
  topClassifications
    .map(
      ([type, count]) =>
        `${type.padEnd(25)} ${count.toString().padStart(6)} (${((count / stats.totalEmails) * 100).toFixed(1)}%)`,
    )
    .join("\n") || "No classifications"
}

⚡ URGENCY LEVELS
────────────────────────────────────────────────────────────────
Critical:                   ${stats.urgencyLevels.critical.toLocaleString()} (${((stats.urgencyLevels.critical / stats.totalEmails) * 100 || 0).toFixed(1)}%)
High:                       ${stats.urgencyLevels.high.toLocaleString()} (${((stats.urgencyLevels.high / stats.totalEmails) * 100 || 0).toFixed(1)}%)
Normal:                     ${stats.urgencyLevels.normal.toLocaleString()} (${((stats.urgencyLevels.normal / stats.totalEmails) * 100 || 0).toFixed(1)}%)
Low:                        ${stats.urgencyLevels.low.toLocaleString()} (${((stats.urgencyLevels.low / stats.totalEmails) * 100 || 0).toFixed(1)}%)

😊 SENTIMENT ANALYSIS
────────────────────────────────────────────────────────────────
Positive:                   ${stats.sentiments.positive.toLocaleString()} (${((stats.sentiments.positive / stats.totalEmails) * 100 || 0).toFixed(1)}%)
Negative:                   ${stats.sentiments.negative.toLocaleString()} (${((stats.sentiments.negative / stats.totalEmails) * 100 || 0).toFixed(1)}%)
Neutral:                    ${stats.sentiments.neutral.toLocaleString()} (${((stats.sentiments.neutral / stats.totalEmails) * 100 || 0).toFixed(1)}%)
Urgent:                     ${stats.sentiments.urgent.toLocaleString()} (${((stats.sentiments.urgent / stats.totalEmails) * 100 || 0).toFixed(1)}%)
Angry:                      ${stats.sentiments.angry.toLocaleString()} (${((stats.sentiments.angry / stats.totalEmails) * 100 || 0).toFixed(1)}%)

📍 TRACKING FEATURES
────────────────────────────────────────────────────────────────
BCC Tracked (Certified):    ${stats.tracking.bccTracked.toLocaleString()}
Namespace Copies:           ${stats.tracking.namespaceCopies.toLocaleString()}

🌐 TOP DOMAINS
────────────────────────────────────────────────────────────────
${
  topDomains
    .map(
      ([domain, count], idx) =>
        `${(idx + 1).toString().padStart(2)}. ${domain.padEnd(35)} ${count.toString().padStart(6)}`,
    )
    .join("\n") || "No domains"
}

👥 TOP SENDERS
────────────────────────────────────────────────────────────────
${
  topSenders
    .map(
      ([sender, count], idx) =>
        `${(idx + 1).toString().padStart(2)}. ${sender.substring(0, 35).padEnd(35)} ${count.toString().padStart(6)}`,
    )
    .join("\n") || "No senders"
}

═══════════════════════════════════════════════════════════════

📈 KEY INSIGHTS
────────────────────────────────────────────────────────────────
• Average emails per day: ${(stats.totalEmails / 7).toFixed(1)}
• Most active workstream: ${Object.entries(stats.workstreams).sort((a, b) => b[1] - a[1])[0]?.[0] || "N/A"}
• Highest urgency rate: ${(((stats.urgencyLevels.critical + stats.urgencyLevels.high) / stats.totalEmails) * 100 || 0).toFixed(1)}% critical/high
• Sentiment balance: ${((stats.sentiments.positive / (stats.sentiments.positive + stats.sentiments.negative)) * 100 || 0).toFixed(1)}% positive

View detailed analytics: https://portal.chitty.cc/analytics/weekly

🤖 Generated by ChittyOS Email Worker
═══════════════════════════════════════════════════════════════
`;

  return report;
}
