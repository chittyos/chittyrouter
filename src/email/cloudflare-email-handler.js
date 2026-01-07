/**
 * Cloudflare Email Handler
 * Intercepts ALL incoming emails to chitty.cc domain
 * AI triages and logs immediately - no polling needed
 */

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

    // Address-based routing rules
    this.addressRoutes = {
      'intake@chitty.cc': { forward: 'nick@aribia.cc', priority: 'HIGH' },
      'legal@chitty.cc': { forward: 'nick@aribia.cc', priority: 'CRITICAL' },
      'evidence@chitty.cc': { forward: 'nick@aribia.cc', priority: 'HIGH' },
      'calendar@chitty.cc': { forward: 'nick@aribia.cc', priority: 'MEDIUM' },
      'arias-v-bianchi@chitty.cc': { forward: 'nick@aribia.cc', priority: 'CRITICAL', case: 'ARIAS_v_BIANCHI' },
      'chittyos@chitty.cc': { forward: 'nick@aribia.cc', priority: 'MEDIUM' }
    };
  }

  /**
   * Main email handler - called by Cloudflare Email Workers
   */
  async handleEmail(message, env, ctx) {
    const startTime = Date.now();

    try {
      // Extract email data
      const emailData = await this.extractEmailData(message);

      // AI triage
      const triage = await this.triageEmail(emailData);

      // Log to KV
      await this.logEmail(emailData, triage);

      // Route based on address and triage result
      await this.routeEmail(message, emailData, triage);

      // If urgent, push to dashboard immediately
      if (triage.urgencyScore >= 50) {
        await this.pushUrgentToNotion(emailData, triage);
      }

      console.log(`📧 Processed email from ${emailData.from} in ${Date.now() - startTime}ms - ${triage.urgencyLevel}`);

      return { success: true, urgencyLevel: triage.urgencyLevel };

    } catch (error) {
      console.error('Email handling failed:', error);

      // Fallback - forward to catch-all
      try {
        await message.forward('nick@aribia.cc');
      } catch (forwardError) {
        console.error('Fallback forward failed:', forwardError);
      }

      return { success: false, error: error.message };
    }
  }

  /**
   * Extract structured data from email
   */
  async extractEmailData(message) {
    const from = message.from || '';
    const to = message.to || '';
    const subject = message.headers.get('subject') || '(No subject)';
    const messageId = message.headers.get('message-id') || `cf-${Date.now()}`;
    const date = message.headers.get('date') || new Date().toISOString();

    // Get raw content for analysis
    let content = '';
    try {
      const rawContent = await this.streamToText(message.raw);
      // Extract just the body (simplified - production would parse MIME)
      content = rawContent.substring(0, 2000);
    } catch {
      content = '';
    }

    return {
      id: messageId,
      from,
      to,
      subject,
      date,
      content,
      timestamp: new Date().toISOString(),
      size: message.rawSize || 0
    };
  }

  /**
   * Triage email for urgency
   */
  async triageEmail(emailData) {
    const text = `${emailData.subject} ${emailData.content} ${emailData.from}`.toLowerCase();
    const reasons = [];
    let score = 0;
    let category = 'general';

    // Pattern matching
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

    // Check destination address priority
    const addressRoute = this.addressRoutes[emailData.to];
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
    const caseMatch = emailData.to.match(/([a-zA-Z]+)-v-([a-zA-Z]+)@/i);
    if (caseMatch) {
      score += 25;
      category = 'case';
      reasons.push(`case_address:${caseMatch[1]}_v_${caseMatch[2]}`);
    }

    // Deadline detection
    if (/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/.test(text)) {
      score += 10;
      reasons.push('contains_date');
    }

    // Important sender detection
    const importantSenders = ['court', 'judge', 'attorney', 'county', 'state', 'irs', 'bank'];
    for (const sender of importantSenders) {
      if (emailData.from.toLowerCase().includes(sender)) {
        score += 20;
        reasons.push(`important_sender:${sender}`);
        break;
      }
    }

    // Determine level
    let urgencyLevel;
    if (score >= 80) urgencyLevel = 'CRITICAL';
    else if (score >= 60) urgencyLevel = 'HIGH';
    else if (score >= 40) urgencyLevel = 'MEDIUM';
    else if (score >= 20) urgencyLevel = 'LOW';
    else urgencyLevel = 'INFO';

    return {
      urgencyLevel,
      urgencyScore: score,
      category,
      reasons,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Log email to KV for dashboard
   */
  async logEmail(emailData, triage) {
    const logEntry = {
      ...emailData,
      ...triage
    };

    try {
      // Add to recent emails list
      const recentKey = 'email_log_recent';
      const existing = await this.env.AI_CACHE?.get(recentKey, 'json') || [];
      existing.unshift(logEntry);

      // Keep only last 100
      const trimmed = existing.slice(0, 100);

      await this.env.AI_CACHE?.put(recentKey, JSON.stringify(trimmed), {
        expirationTtl: 86400 * 7 // 7 days
      });

      // Update urgent items cache
      if (triage.urgencyScore >= 50) {
        const urgentKey = 'email_urgent_items';
        const urgentItems = await this.env.AI_CACHE?.get(urgentKey, 'json') || [];
        urgentItems.unshift(logEntry);
        const trimmedUrgent = urgentItems.slice(0, 50);

        await this.env.AI_CACHE?.put(urgentKey, JSON.stringify(trimmedUrgent), {
          expirationTtl: 86400 * 3 // 3 days
        });
      }

      // Update stats
      const statsKey = 'email_stats';
      const stats = await this.env.AI_CACHE?.get(statsKey, 'json') || {
        total: 0, critical: 0, high: 0, medium: 0, low: 0, today: 0
      };

      stats.total++;
      if (triage.urgencyLevel === 'CRITICAL') stats.critical++;
      if (triage.urgencyLevel === 'HIGH') stats.high++;
      if (triage.urgencyLevel === 'MEDIUM') stats.medium++;
      if (triage.urgencyLevel === 'LOW') stats.low++;

      await this.env.AI_CACHE?.put(statsKey, JSON.stringify(stats), {
        expirationTtl: 86400
      });

    } catch (error) {
      console.error('Failed to log email:', error);
    }
  }

  /**
   * Route email based on address and triage
   */
  async routeEmail(message, emailData, triage) {
    const route = this.addressRoutes[emailData.to];

    if (route?.forward) {
      await message.forward(route.forward);
      console.log(`📤 Forwarded to ${route.forward}`);
    } else {
      // Default forward
      await message.forward('nick@aribia.cc');
      console.log('📤 Forwarded to default (nick@aribia.cc)');
    }
  }

  /**
   * Push urgent email to Notion dashboard
   */
  async pushUrgentToNotion(emailData, triage) {
    try {
      const emoji = {
        CRITICAL: '🚨',
        HIGH: '⚠️',
        MEDIUM: '📌',
        LOW: '📬'
      }[triage.urgencyLevel] || '📧';

      const blocks = [
        {
          object: 'block',
          type: 'callout',
          callout: {
            icon: { emoji },
            rich_text: [{
              type: 'text',
              text: {
                content: `[${triage.urgencyLevel}] ${emailData.subject.substring(0, 100)}
From: ${emailData.from}
Category: ${triage.category}
Reasons: ${triage.reasons.join(', ')}`
              }
            }]
          }
        }
      ];

      await fetch('https://notion-ops.chitty.cc/update-page-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          page_id: '20094de43579808ba32efa91ae9611ae',
          append: true,
          blocks
        })
      });

      console.log('📊 Urgent email pushed to Notion');
    } catch (error) {
      console.error('Failed to push to Notion:', error);
    }
  }

  /**
   * Convert stream to text
   */
  async streamToText(stream) {
    const reader = stream.getReader();
    let result = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        result += new TextDecoder().decode(value);
      }
    } finally {
      reader.releaseLock();
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
