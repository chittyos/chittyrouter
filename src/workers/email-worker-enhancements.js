/**
 * Email Worker Enhancements
 * Additions to the existing email worker for better QA and functionality
 */

// Add fetch() handler to avoid "no fetch handler" errors
export const fetchHandler = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Health check endpoint
    if (url.pathname === "/health") {
      return new Response(
        JSON.stringify({
          status: "healthy",
          service: "chittyos-email-worker",
          version: "2.0.0",
          timestamp: new Date().toISOString(),
          capabilities: [
            "email-routing",
            "ai-classification",
            "smart-routing",
            "analytics",
            "webhooks",
          ],
        }),
        {
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Status endpoint
    if (url.pathname === "/status") {
      const stats = await getWorkerStats(env);
      return new Response(JSON.stringify(stats), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Debug endpoint to check environment (only in development)
    if (url.pathname === "/debug/env") {
      // Try to access the secret directly - it won't show in Object.keys()
      let tokenInfo = "N/A";
      let tokenLength = 0;
      let hasToken = false;

      try {
        // Secrets are injected at runtime and not enumerable
        if (env.CHITTY_ID_TOKEN !== undefined) {
          hasToken = true;
          tokenLength = env.CHITTY_ID_TOKEN.length;
          tokenInfo = env.CHITTY_ID_TOKEN.substring(0, 10) + "...";
        }
      } catch (e) {
        tokenInfo = `Error: ${e.message}`;
      }

      const debugInfo = {
        hasChittyToken: hasToken,
        tokenLength: tokenLength,
        tokenFirstChars: tokenInfo,
        hasAI: !!env.AI,
        hasAnalytics: !!env.EMAIL_ANALYTICS,
        hasRateLimits: !!env.RATE_LIMITS,
        // Secrets won't show in Object.keys()
        envKeys: Object.keys(env).sort(),
        note: "Secrets are injected at runtime and not enumerable in Object.keys()",
        timestamp: new Date().toISOString(),
      };
      return new Response(JSON.stringify(debugInfo, null, 2), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Webhook endpoint - receives priority email notifications
    if (url.pathname === "/webhooks/email" && request.method === "POST") {
      try {
        const payload = await request.json();
        console.log("[WEBHOOK] Received priority email notification:", payload);

        // Store webhook event in KV for later processing
        if (env.EMAIL_ANALYTICS) {
          const key = `webhook:${payload.transactionId}:${Date.now()}`;
          await env.EMAIL_ANALYTICS.put(
            key,
            JSON.stringify({
              ...payload,
              receivedAt: new Date().toISOString(),
            }),
            {
              expirationTtl: 86400 * 7, // Keep for 7 days
            },
          );
        }

        return new Response(
          JSON.stringify({
            success: true,
            message: "Webhook received",
            transactionId: payload.transactionId,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      } catch (error) {
        console.error("[WEBHOOK] Error processing webhook:", error);
        return new Response(
          JSON.stringify({ error: "Webhook processing failed" }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
    }

    // Feedback endpoint - receives feedback notifications to send to users
    if (url.pathname === "/feedback" && request.method === "POST") {
      try {
        const payload = await request.json();
        console.log(
          "[FEEDBACK] Received feedback request:",
          payload.transactionId,
        );

        // Store feedback event in KV
        if (env.EMAIL_ANALYTICS) {
          const key = `feedback:${payload.transactionId}:${Date.now()}`;
          await env.EMAIL_ANALYTICS.put(
            key,
            JSON.stringify({
              ...payload,
              processedAt: new Date().toISOString(),
            }),
            {
              expirationTtl: 86400 * 30, // Keep for 30 days
            },
          );
        }

        return new Response(
          JSON.stringify({
            success: true,
            message: "Feedback logged",
            transactionId: payload.transactionId,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      } catch (error) {
        console.error("[FEEDBACK] Error processing feedback:", error);
        return new Response(
          JSON.stringify({ error: "Feedback processing failed" }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
    }

    // Default response
    return new Response(
      JSON.stringify({
        error: "This is an Email Worker",
        message:
          "This worker processes emails via Cloudflare Email Routing. It does not respond to HTTP requests.",
        endpoints: {
          health: "/health",
          status: "/status",
          webhooks: "/webhooks/email",
          feedback: "/feedback",
        },
        documentation:
          "https://dash.cloudflare.com/0bc21e3a5a9de1a4cc843be9c3e98121/chitty.cc/email/routing",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  },
};

// ChittyID integration for email tracking
export async function mintEmailChittyID(env, emailData) {
  if (!env.CHITTY_ID_TOKEN) {
    console.warn("ChittyID token not configured, skipping ID generation");
    return null;
  }

  try {
    const response = await fetch("https://id.chitty.cc/v1/mint", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.CHITTY_ID_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        entity: "EMAIL",
        metadata: {
          from: emailData.from,
          to: emailData.to,
          subject: emailData.subject,
          timestamp: emailData.timestamp,
          classification: emailData.classification,
        },
      }),
    });

    if (response.ok) {
      const result = await response.json();
      console.log(`ChittyID minted: ${result.chittyId}`);
      return result.chittyId;
    }
  } catch (error) {
    console.error("Failed to mint ChittyID:", error);
  }

  return null;
}

// Get worker statistics
async function getWorkerStats(env) {
  // Debug: Check token availability and length
  const tokenLength = env.CHITTY_ID_TOKEN ? env.CHITTY_ID_TOKEN.length : 0;
  console.log("[DEBUG] CHITTY_ID_TOKEN length:", tokenLength);
  console.log("[DEBUG] CHITTY_ID_TOKEN truthy:", !!env.CHITTY_ID_TOKEN);

  const stats = {
    uptime: "active",
    aiEnabled: !!env.AI,
    analyticsEnabled: !!env.EMAIL_ANALYTICS,
    chittyIdEnabled: !!env.CHITTY_ID_TOKEN && env.CHITTY_ID_TOKEN.length > 0,
    rateLimitingEnabled: !!env.RATE_LIMITS,
    timestamp: new Date().toISOString(),
  };

  // Get recent email counts from KV if available
  if (env.EMAIL_ANALYTICS) {
    try {
      const today = new Date().toISOString().split("T")[0];
      const countKey = `stats:daily:${today}`;
      const dailyCount = await env.EMAIL_ANALYTICS.get(countKey);
      stats.emailsToday = dailyCount ? parseInt(dailyCount) : 0;
    } catch (error) {
      stats.emailsToday = "unavailable";
    }
  }

  return stats;
}

// Enhanced error handling wrapper
export function withErrorHandling(fn, context = "operation") {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      console.error(`[${context}] Error:`, error.message);
      console.error(`[${context}] Stack:`, error.stack);

      // Return safe fallback
      return null;
    }
  };
}

// Email archival to R2 (optional)
export async function archiveEmailToR2(env, transactionId, emailData) {
  if (!env.EMAIL_ARCHIVE) {
    return; // R2 bucket not configured
  }

  try {
    const archiveKey = `emails/${new Date().toISOString().split("T")[0]}/${transactionId}.json`;
    await env.EMAIL_ARCHIVE.put(archiveKey, JSON.stringify(emailData), {
      customMetadata: {
        from: emailData.from,
        to: emailData.to,
        classification: emailData.classification || "unknown",
        timestamp: emailData.timestamp,
      },
    });
    console.log(`[${transactionId}] Email archived to R2: ${archiveKey}`);
  } catch (error) {
    console.error(`[${transactionId}] Failed to archive email:`, error);
  }
}

// Improved spam scoring with multiple factors
export function calculateSpamScore(message, aiInsights) {
  let score = 0;

  const subject = (message.headers.get("subject") || "").toLowerCase();
  const from = message.from.toLowerCase();

  // Check subject spam indicators
  const spamPhrases = [
    "congratulations",
    "winner",
    "claim",
    "verify your account",
    "act now",
    "limited time",
    "urgent action required",
    "suspended",
  ];

  spamPhrases.forEach((phrase) => {
    if (subject.includes(phrase)) score += 10;
  });

  // Check sender patterns
  if (from.match(/\d{5,}@/)) score += 20; // Numbers in email
  if (from.includes("noreply") && !from.includes("known-domain.com"))
    score += 5;

  // AI classification
  if (aiInsights?.classification === "spam") score += 50;
  if (
    aiInsights?.classification === "marketing" &&
    !subject.includes("unsubscribe")
  )
    score += 15;

  // Sentiment
  if (
    aiInsights?.sentiment === "urgent" &&
    aiInsights?.urgency === "critical"
  ) {
    // Could be phishing
    if (subject.includes("account") || subject.includes("verify")) {
      score += 25;
    }
  }

  return Math.min(score, 100); // Cap at 100
}

// Rate limiting per domain
export async function checkDomainRateLimit(env, domain) {
  if (!env.RATE_LIMITS) return false;

  try {
    const key = `rate:domain:${domain}`;
    const data = await env.RATE_LIMITS.get(key);

    if (data) {
      const parsed = JSON.parse(data);
      // 500 emails per domain per hour
      return parsed.count > 500;
    }
  } catch (error) {
    console.error("Domain rate limit check failed:", error);
  }

  return false;
}

export async function updateDomainRateLimit(env, domain) {
  if (!env.RATE_LIMITS) return;

  try {
    const key = `rate:domain:${domain}`;
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
    console.error("Domain rate limit update failed:", error);
  }
}

// Daily stats counter
export async function incrementDailyStats(env) {
  if (!env.EMAIL_ANALYTICS) return;

  try {
    const today = new Date().toISOString().split("T")[0];
    const countKey = `stats:daily:${today}`;
    const current = await env.EMAIL_ANALYTICS.get(countKey);
    const newCount = current ? parseInt(current) + 1 : 1;

    await env.EMAIL_ANALYTICS.put(countKey, newCount.toString(), {
      expirationTtl: 86400 * 90, // 90 days
    });
  } catch (error) {
    console.error("Failed to increment daily stats:", error);
  }
}
