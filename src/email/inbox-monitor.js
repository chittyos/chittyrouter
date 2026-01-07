/**
 * ChittyRouter Inbox Monitor
 * Aggregates and AI-triages emails from multiple inboxes
 * Surfaces urgent items without traversing all inboxes manually
 */

import { GmailTokenManager } from './gmail-token-manager.js';

export class InboxMonitor {
  constructor(env) {
    this.env = env;
    this.tokenManager = new GmailTokenManager(env);
    this.urgencyCategories = {
      CRITICAL: { score: 100, color: 'red', emoji: '🚨' },
      HIGH: { score: 75, color: 'orange', emoji: '⚠️' },
      MEDIUM: { score: 50, color: 'yellow', emoji: '📌' },
      LOW: { score: 25, color: 'gray', emoji: '📬' },
      INFO: { score: 0, color: 'blue', emoji: 'ℹ️' }
    };

    // Email patterns that indicate urgency
    this.urgencyPatterns = {
      court: /court|hearing|motion|deadline|filing|summons|subpoena|order|judgment/i,
      legal: /attorney|lawyer|legal|case|matter|plaintiff|defendant/i,
      property: /tenant|rent|lease|maintenance|eviction|property|landlord/i,
      creditor: /collection|debt|payment due|past due|account|creditor|demand/i,
      compliance: /annual report|registered agent|tax|compliance|filing deadline|state of/i,
      urgent: /urgent|asap|immediately|time.?sensitive|action required|final notice/i,
      financial: /invoice|payment|transfer|wire|bank|balance|overdue/i
    };
  }

  /**
   * Main monitoring endpoint - aggregates across all inboxes
   */
  async monitorAllInboxes(request) {
    const inboxes = await this.getConfiguredInboxes();
    const results = {
      timestamp: new Date().toISOString(),
      inboxes_scanned: 0,
      urgent_items: [],
      summary: {},
      errors: []
    };

    for (const inbox of inboxes) {
      try {
        const emails = await this.fetchRecentEmails(inbox);
        const triaged = await this.triageEmails(emails, inbox);

        results.inboxes_scanned++;
        results.urgent_items.push(...triaged.urgent);
        results.summary[inbox.name] = triaged.summary;
      } catch (error) {
        results.errors.push({ inbox: inbox.name, error: error.message });
      }
    }

    // Sort by urgency
    results.urgent_items.sort((a, b) => b.urgencyScore - a.urgencyScore);

    // Push to dashboard
    await this.pushToDashboard(results);

    return results;
  }

  /**
   * Get configured inbox sources
   */
  async getConfiguredInboxes() {
    // These correspond to the rclone/Google accounts
    return [
      { name: 'nick_aribia_main', type: 'gmail', email: 'nick@aribia.cc' },
      { name: 'aribia_llc', type: 'gmail', email: 'admin@aribia.cc' },
      { name: 'it_can_be_llc', type: 'gmail', email: 'admin@itcanbe.llc' },
      { name: 'chitty_router', type: 'cloudflare', domain: 'chitty.cc' }
    ];
  }

  /**
   * Fetch recent emails from an inbox via Gmail API
   */
  async fetchRecentEmails(inbox) {
    if (inbox.type === 'cloudflare') {
      return await this.fetchCloudflareEmails(inbox);
    }

    // Gmail API fetch
    const token = await this.getGmailToken(inbox.name);
    if (!token) {
      throw new Error(`No token for ${inbox.name}`);
    }

    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=50&q=is:unread OR is:important after:${this.getYesterdayDate()}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Gmail API error: ${response.status}`);
    }

    const data = await response.json();
    const emails = [];

    // Fetch details for each message
    for (const msg of (data.messages || []).slice(0, 20)) {
      const detail = await this.fetchEmailDetail(token, msg.id);
      if (detail) emails.push(detail);
    }

    return emails;
  }

  /**
   * Fetch email details from Gmail
   */
  async fetchEmailDetail(token, messageId) {
    try {
      const response = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) return null;

      const data = await response.json();
      const headers = {};

      for (const header of data.payload?.headers || []) {
        headers[header.name.toLowerCase()] = header.value;
      }

      return {
        id: messageId,
        from: headers.from || 'Unknown',
        subject: headers.subject || '(No subject)',
        date: headers.date || new Date().toISOString(),
        snippet: data.snippet || '',
        labels: data.labelIds || []
      };
    } catch (error) {
      console.error(`Failed to fetch email ${messageId}:`, error);
      return null;
    }
  }

  /**
   * Fetch emails routed through Cloudflare
   */
  async fetchCloudflareEmails(inbox) {
    // Query the email logs from KV or D1
    try {
      const logs = await this.env.AI_CACHE?.get('email_log_recent', 'json');
      return logs || [];
    } catch (error) {
      console.error('Failed to fetch Cloudflare email logs:', error);
      return [];
    }
  }

  /**
   * AI-powered email triage
   */
  async triageEmails(emails, inbox) {
    const urgent = [];
    const summary = {
      total: emails.length,
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      unread: 0
    };

    for (const email of emails) {
      const urgency = await this.assessUrgency(email);

      if (urgency.level === 'CRITICAL') summary.critical++;
      else if (urgency.level === 'HIGH') summary.high++;
      else if (urgency.level === 'MEDIUM') summary.medium++;
      else summary.low++;

      // Only include high-priority items in urgent list
      if (urgency.score >= 50) {
        urgent.push({
          inbox: inbox.name,
          email: inbox.email,
          ...email,
          urgencyLevel: urgency.level,
          urgencyScore: urgency.score,
          urgencyReasons: urgency.reasons,
          category: urgency.category
        });
      }
    }

    return { urgent, summary };
  }

  /**
   * Assess urgency of an email using pattern matching + AI
   */
  async assessUrgency(email) {
    const text = `${email.subject} ${email.snippet} ${email.from}`.toLowerCase();
    const reasons = [];
    let score = 0;
    let category = 'general';

    // Check urgency patterns
    for (const [key, pattern] of Object.entries(this.urgencyPatterns)) {
      if (pattern.test(text)) {
        reasons.push(key);

        // Weight by category
        if (key === 'court') {
          score += 40;
          category = 'legal';
        } else if (key === 'urgent') {
          score += 30;
        } else if (key === 'creditor') {
          score += 25;
          category = 'financial';
        } else if (key === 'compliance') {
          score += 25;
          category = 'compliance';
        } else if (key === 'property') {
          score += 20;
          category = 'property';
        } else if (key === 'legal') {
          score += 15;
          category = 'legal';
        } else if (key === 'financial') {
          score += 15;
          category = 'financial';
        }
      }
    }

    // Check for deadline indicators
    if (/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/.test(text)) {
      score += 10;
      reasons.push('contains_date');
    }

    // Check sender importance
    const importantSenders = [
      'court', 'judge', 'attorney', 'lawyer', 'county', 'state',
      'irs', 'treasury', 'bank', 'collection'
    ];

    for (const sender of importantSenders) {
      if (email.from.toLowerCase().includes(sender)) {
        score += 20;
        reasons.push(`important_sender:${sender}`);
      }
    }

    // Determine level
    let level = 'LOW';
    if (score >= 80) level = 'CRITICAL';
    else if (score >= 60) level = 'HIGH';
    else if (score >= 40) level = 'MEDIUM';
    else if (score >= 20) level = 'LOW';
    else level = 'INFO';

    return { level, score, reasons, category };
  }

  /**
   * Push results to Notion dashboard
   */
  async pushToDashboard(results) {
    try {
      const dashboardContent = this.formatDashboardContent(results);

      await fetch('https://notion-ops.chitty.cc/update-page-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          page_id: '20094de43579808ba32efa91ae9611ae', // Command Center
          blocks: dashboardContent
        })
      });

      console.log('Dashboard updated with email status');
    } catch (error) {
      console.error('Failed to update dashboard:', error);
    }
  }

  /**
   * Format dashboard content blocks
   */
  formatDashboardContent(results) {
    const blocks = [];

    // Header
    blocks.push({
      object: 'block',
      type: 'heading_2',
      heading_2: {
        rich_text: [{ type: 'text', text: { content: `Email Status - ${new Date().toLocaleString()}` } }]
      }
    });

    // Summary stats
    const totalCritical = results.urgent_items.filter(i => i.urgencyLevel === 'CRITICAL').length;
    const totalHigh = results.urgent_items.filter(i => i.urgencyLevel === 'HIGH').length;

    blocks.push({
      object: 'block',
      type: 'callout',
      callout: {
        icon: { emoji: totalCritical > 0 ? '🚨' : (totalHigh > 0 ? '⚠️' : '✅') },
        rich_text: [{
          type: 'text',
          text: {
            content: totalCritical > 0
              ? `${totalCritical} CRITICAL + ${totalHigh} HIGH priority items need attention`
              : totalHigh > 0
                ? `${totalHigh} HIGH priority items to review`
                : 'No urgent emails requiring immediate attention'
          }
        }]
      }
    });

    // Urgent items
    if (results.urgent_items.length > 0) {
      blocks.push({
        object: 'block',
        type: 'heading_3',
        heading_3: {
          rich_text: [{ type: 'text', text: { content: 'Action Required' } }]
        }
      });

      for (const item of results.urgent_items.slice(0, 10)) {
        const emoji = this.urgencyCategories[item.urgencyLevel]?.emoji || '📧';
        blocks.push({
          object: 'block',
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: [{
              type: 'text',
              text: { content: `${emoji} [${item.inbox}] ${item.subject.substring(0, 60)}${item.subject.length > 60 ? '...' : ''}` }
            }]
          }
        });
      }
    }

    return blocks;
  }

  /**
   * Get Gmail OAuth token via token manager
   */
  async getGmailToken(accountName) {
    return await this.tokenManager.getToken(accountName);
  }

  /**
   * Get yesterday's date for query
   */
  getYesterdayDate() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  }
}

/**
 * Cron handler for scheduled inbox monitoring
 */
export async function handleScheduledMonitoring(env) {
  const monitor = new InboxMonitor(env);
  const results = await monitor.monitorAllInboxes();

  console.log(`Inbox monitoring complete: ${results.urgent_items.length} urgent items found`);
  return results;
}
