/**
 * ChittyChat Project Synchronization
 * Syncs email routing data, case communications, and project updates with ChittyChat
 */

const CHITTYCHAT_SYNC_URL = 'https://chittychat.api.com/api/v1/sync';

export class ChittyChatProjectSync {
  constructor(env) {
    this.env = env;
    this.apiKey = env.CHITTYCHAT_API_KEY;
    this.projectId = env.CHITTYROUTER_PROJECT_ID;
    this.syncEnabled = env.CHITTYCHAT_SYNC_ENABLED !== 'false';
  }

  /**
   * Sync email routing decision to ChittyChat project
   */
  async syncEmailRouting(emailData, routingResult) {
    if (!this.syncEnabled) return { synced: false, reason: 'sync_disabled' };

    try {
      const syncPayload = {
        type: 'email_routing',
        project_id: this.projectId,
        timestamp: new Date().toISOString(),
        data: {
          chittyId: routingResult.chittyId,
          email: {
            from: emailData.from,
            to: emailData.to,
            subject: emailData.subject,
            timestamp: emailData.timestamp
          },
          routing: {
            decision: routingResult.ai.routing.primary_route,
            confidence: routingResult.ai.analysis.urgency_score,
            priority: routingResult.ai.analysis.priority,
            category: routingResult.ai.analysis.category,
            reasoning: routingResult.ai.routing.reasoning
          },
          ai_insights: {
            case_related: routingResult.ai.analysis.case_related,
            legal_entities: routingResult.ai.analysis.legal_entities,
            compliance_flags: routingResult.ai.analysis.compliance_flags,
            key_topics: routingResult.ai.analysis.key_topics
          }
        }
      };

      const response = await fetch(`${CHITTYCHAT_SYNC_URL}/project`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'X-ChittyOS-Service': 'chittyrouter'
        },
        body: JSON.stringify(syncPayload)
      });

      if (!response.ok) {
        throw new Error(`ChittyChat sync failed: ${response.status}`);
      }

      const result = await response.json();
      console.log('📧 Email routing synced to ChittyChat:', result.syncId);

      return {
        synced: true,
        syncId: result.syncId,
        projectUpdate: result.projectUpdate,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ ChittyChat email sync failed:', error);
      return {
        synced: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Sync case thread creation to ChittyChat
   */
  async syncCaseThread(caseData, threadId) {
    if (!this.syncEnabled) return { synced: false, reason: 'sync_disabled' };

    try {
      const syncPayload = {
        type: 'case_thread',
        project_id: this.projectId,
        timestamp: new Date().toISOString(),
        data: {
          threadId: threadId,
          case: {
            chittyId: caseData.chittyId,
            pattern: caseData.case_pattern,
            parties: caseData.parties,
            court: caseData.court,
            caseType: caseData.caseType
          },
          communications: {
            emailCount: caseData.emailCount || 0,
            lastActivity: caseData.lastActivity,
            participants: caseData.participants || []
          }
        }
      };

      const response = await fetch(`${CHITTYCHAT_SYNC_URL}/thread`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'X-ChittyOS-Service': 'chittyrouter'
        },
        body: JSON.stringify(syncPayload)
      });

      if (!response.ok) {
        throw new Error(`ChittyChat thread sync failed: ${response.status}`);
      }

      const result = await response.json();
      console.log('🧵 Case thread synced to ChittyChat:', result.threadId);

      return {
        synced: true,
        threadId: result.threadId,
        chatRoomId: result.chatRoomId,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ ChittyChat thread sync failed:', error);
      return {
        synced: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Sync AI agent activity to ChittyChat
   */
  async syncAgentActivity(agentType, activity, result) {
    if (!this.syncEnabled) return { synced: false, reason: 'sync_disabled' };

    try {
      const syncPayload = {
        type: 'agent_activity',
        project_id: this.projectId,
        timestamp: new Date().toISOString(),
        data: {
          agent: {
            type: agentType,
            version: '2.0-ai',
            capabilities: this.getAgentCapabilities(agentType)
          },
          activity: {
            operation: activity.operation,
            input: activity.input,
            duration: activity.duration,
            status: activity.status
          },
          result: {
            success: result.success,
            output: result.output,
            confidence: result.confidence,
            insights: result.insights
          }
        }
      };

      const response = await fetch(`${CHITTYCHAT_SYNC_URL}/agent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'X-ChittyOS-Service': 'chittyrouter'
        },
        body: JSON.stringify(syncPayload)
      });

      if (!response.ok) {
        throw new Error(`ChittyChat agent sync failed: ${response.status}`);
      }

      const result_sync = await response.json();
      console.log('🤖 Agent activity synced to ChittyChat:', result_sync.activityId);

      return {
        synced: true,
        activityId: result_sync.activityId,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ ChittyChat agent sync failed:', error);
      return {
        synced: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Sync document processing to ChittyChat
   */
  async syncDocumentProcessing(documentData, processingResult) {
    if (!this.syncEnabled) return { synced: false, reason: 'sync_disabled' };

    try {
      const syncPayload = {
        type: 'document_processing',
        project_id: this.projectId,
        timestamp: new Date().toISOString(),
        data: {
          document: {
            chittyId: documentData.chittyId,
            filename: documentData.filename,
            type: documentData.type,
            size: documentData.size,
            checksum: documentData.checksum
          },
          processing: {
            aiAnalysis: processingResult.ai_analysis,
            classification: processingResult.classification,
            extractedData: processingResult.extracted_data,
            complianceStatus: processingResult.compliance_status
          },
          routing: {
            destination: processingResult.routing_destination,
            priority: processingResult.priority,
            reviewRequired: processingResult.review_required
          }
        }
      };

      const response = await fetch(`${CHITTYCHAT_SYNC_URL}/document`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'X-ChittyOS-Service': 'chittyrouter'
        },
        body: JSON.stringify(syncPayload)
      });

      if (!response.ok) {
        throw new Error(`ChittyChat document sync failed: ${response.status}`);
      }

      const result = await response.json();
      console.log('📄 Document processing synced to ChittyChat:', result.documentId);

      return {
        synced: true,
        documentId: result.documentId,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ ChittyChat document sync failed:', error);
      return {
        synced: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Get project status from ChittyChat
   */
  async getProjectStatus() {
    try {
      const response = await fetch(`${CHITTYCHAT_SYNC_URL}/project/${this.projectId}/status`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'X-ChittyOS-Service': 'chittyrouter'
        }
      });

      if (!response.ok) {
        throw new Error(`ChittyChat status fetch failed: ${response.status}`);
      }

      const status = await response.json();
      return {
        available: true,
        project: status.project,
        lastSync: status.lastSync,
        syncCount: status.syncCount,
        participants: status.participants
      };

    } catch (error) {
      console.error('❌ ChittyChat status fetch failed:', error);
      return {
        available: false,
        error: error.message
      };
    }
  }

  /**
   * Sync ChittyRouter health status to project
   */
  async syncHealthStatus(healthData) {
    if (!this.syncEnabled) return { synced: false, reason: 'sync_disabled' };

    try {
      const syncPayload = {
        type: 'service_health',
        project_id: this.projectId,
        timestamp: new Date().toISOString(),
        data: {
          service: 'chittyrouter',
          version: '2.0.0-ai',
          health: {
            status: healthData.status,
            aiHealth: healthData.ai,
            integration: healthData.integration,
            services: healthData.services
          },
          metrics: {
            emailsProcessed: healthData.metrics?.emailsProcessed || 0,
            avgProcessingTime: healthData.metrics?.avgProcessingTime || 0,
            activeChittyIds: healthData.metrics?.activeChittyIds || 0,
            errorRate: healthData.metrics?.errorRate || 0
          }
        }
      };

      const response = await fetch(`${CHITTYCHAT_SYNC_URL}/health`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'X-ChittyOS-Service': 'chittyrouter'
        },
        body: JSON.stringify(syncPayload)
      });

      if (!response.ok) {
        throw new Error(`ChittyChat health sync failed: ${response.status}`);
      }

      const result = await response.json();
      return {
        synced: true,
        healthId: result.healthId,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ ChittyChat health sync failed:', error);
      return {
        synced: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Batch sync multiple activities
   */
  async batchSync(activities) {
    if (!this.syncEnabled) return { synced: false, reason: 'sync_disabled' };

    try {
      const syncPayload = {
        type: 'batch_sync',
        project_id: this.projectId,
        timestamp: new Date().toISOString(),
        activities: activities.map(activity => ({
          ...activity,
          service: 'chittyrouter',
          version: '2.0.0-ai'
        }))
      };

      const response = await fetch(`${CHITTYCHAT_SYNC_URL}/batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'X-ChittyOS-Service': 'chittyrouter'
        },
        body: JSON.stringify(syncPayload)
      });

      if (!response.ok) {
        throw new Error(`ChittyChat batch sync failed: ${response.status}`);
      }

      const result = await response.json();
      console.log(`📦 Batch synced ${activities.length} activities to ChittyChat`);

      return {
        synced: true,
        batchId: result.batchId,
        processedCount: result.processedCount,
        failedCount: result.failedCount,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ ChittyChat batch sync failed:', error);
      return {
        synced: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Subscribe to ChittyChat project events
   */
  async subscribeToProjectEvents(webhookUrl) {
    try {
      const subscription = {
        project_id: this.projectId,
        webhook_url: webhookUrl,
        events: [
          'project_update',
          'participant_joined',
          'participant_left',
          'message_created',
          'thread_created',
          'document_shared'
        ],
        service: 'chittyrouter'
      };

      const response = await fetch(`${CHITTYCHAT_SYNC_URL}/subscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'X-ChittyOS-Service': 'chittyrouter'
        },
        body: JSON.stringify(subscription)
      });

      if (!response.ok) {
        throw new Error(`ChittyChat subscription failed: ${response.status}`);
      }

      const result = await response.json();
      console.log('🔔 Subscribed to ChittyChat project events:', result.subscriptionId);

      return {
        subscribed: true,
        subscriptionId: result.subscriptionId,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ ChittyChat subscription failed:', error);
      return {
        subscribed: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Get agent capabilities for sync
   */
  getAgentCapabilities(agentType) {
    const capabilities = {
      'triage-agent': ['email_classification', 'priority_assessment', 'routing_recommendation'],
      'priority-agent': ['urgency_analysis', 'deadline_detection', 'escalation_rules'],
      'response-agent': ['auto_response_generation', 'template_selection', 'personalization'],
      'document-agent': ['document_analysis', 'metadata_extraction', 'compliance_checking'],
      'intelligent-router': ['ai_routing', 'pattern_recognition', 'decision_making']
    };

    return capabilities[agentType] || ['general_ai_processing'];
  }

  /**
   * Get sync configuration
   */
  getSyncConfig() {
    return {
      enabled: this.syncEnabled,
      projectId: this.projectId,
      apiUrl: CHITTYCHAT_SYNC_URL,
      hasApiKey: !!this.apiKey,
      version: '2.0.0-ai'
    };
  }
}