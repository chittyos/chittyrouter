/**
 * Evidence Ingestion Orchestrator for ChittyRouter
 * Implements §36 Critical Architecture Principle: Litigation system as ChittyOS client
 *
 * Based on master_litigation_documentation_manual_evidence_analysis.md
 * All evidence processing flows through ChittyOS services, never standalone
 */

import { AgentOrchestrator } from "../ai/agent-orchestrator.js";
import { requestEmailChittyID } from "../utils/chittyid-client.js";
import { validateEmailSchema } from "../utils/schema-validation.js";

export class EvidenceIngestionOrchestrator extends AgentOrchestrator {
  constructor(ai, env) {
    super(ai, env);
    this.serviceRegistry = new Map();
    this.initializeServiceRegistry();
  }

  /**
   * Initialize ChittyOS service registry per §36 principle
   */
  async initializeServiceRegistry() {
    // All services resolved dynamically through ChittyRegistry
    const registryUrl = this.env.REGISTRY_URL || "https://registry.chitty.cc";

    const services = [
      "chittyschema",
      "chittyid",
      "chittyverify",
      "chittycheck",
      "chittycanon",
      "chittycases",
    ];

    for (const service of services) {
      try {
        const response = await fetch(
          `${registryUrl}/api/v1/resolve/${service}`,
          {
            headers: {
              Authorization: `Bearer ${this.env.CHITTY_REGISTRY_TOKEN || ""}`,
            },
          },
        );

        if (response.ok) {
          const { base_url } = await response.json();
          this.serviceRegistry.set(service, base_url);
          console.log(`✅ Resolved ${service}: ${base_url}`);
        }
      } catch (error) {
        console.error(`❌ Failed to resolve ${service}:`, error.message);
      }
    }
  }

  /**
   * End-to-End Evidence Ingestion - Service-Orchestrated Flow
   * Implements the example from §37 of the litigation manual
   */
  async ingestEvidence(evidenceMeta, rawData) {
    console.log("📄 Starting evidence ingestion:", evidenceMeta.filename);

    try {
      // 1) Validate evidence metadata against ChittySchema
      const schemaValidation = await this.validateEvidenceSchema(
        evidenceMeta,
        rawData,
      );
      if (!schemaValidation.valid) {
        throw new Error(`Schema validation failed: ${schemaValidation.errors}`);
      }

      // 2) Request ChittyID from service (✅ WORKING per manual)
      const chittyId = await this.mintChittyID(evidenceMeta);

      // 3) Store as event in event_store (event-sourced pattern)
      const eventData = await this.createEvidenceEvent(
        chittyId,
        evidenceMeta,
        rawData,
      );

      // 4) Verify integrity/trust via ChittyVerify
      const verificationResult = await this.verifyEvidence(
        chittyId,
        evidenceMeta,
      );

      // 5) Compliance via ChittyCheck
      const complianceResult = await this.validateCompliance(
        chittyId,
        evidenceMeta,
        verificationResult,
      );

      // 6) Store canonical record via ChittySchema
      const storageResult = await this.storeCanonicalRecord({
        ...eventData,
        verification: verificationResult,
        compliance: complianceResult,
      });

      // 7) Link evidence to cases via ChittyCases
      const caseLinks = await this.linkEvidenceToCases(chittyId, evidenceMeta);

      return {
        chitty_id: chittyId,
        verification: verificationResult,
        compliance: complianceResult,
        storage: storageResult,
        case_links: caseLinks,
        success: true,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error("❌ Evidence ingestion failed:", error);
      throw error;
    }
  }

  /**
   * Validate evidence against ChittySchema service
   */
  async validateEvidenceSchema(evidenceMeta, rawData) {
    const schemaService = this.serviceRegistry.get("chittyschema");
    if (!schemaService) {
      throw new Error("ChittySchema service not available");
    }

    const payload = {
      filename: evidenceMeta.filename,
      sha256: evidenceMeta.sha256,
      metadata: evidenceMeta,
      raw_data: rawData,
    };

    const response = await fetch(`${schemaService}/api/v1/validate/evidence`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.env.CHITTY_ID_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Schema validation failed: ${errorText}`);
    }

    return await response.json();
  }

  /**
   * Mint ChittyID from ChittyID Foundation service
   * Per §30: IDs always minted by ChittyID Foundation, never locally
   */
  async mintChittyID(evidenceMeta) {
    const response = await fetch("https://id.chitty.cc/v1/mint", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.env.CHITTY_ID_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        domain: "evidence",
        subtype: "document",
        metadata: {
          filename: evidenceMeta.filename,
          sha256: evidenceMeta.sha256,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ChittyID minting failed: ${errorText}`);
    }

    const { chitty_id } = await response.json();
    return chitty_id;
  }

  /**
   * Create evidence event for event-sourced storage
   * Per §3.2: Timeline events use event-sourced pattern with cryptographic integrity
   */
  async createEvidenceEvent(chittyId, evidenceMeta, rawData) {
    const crypto = await import("crypto");

    const eventData = {
      chitty_id: chittyId,
      aggregate_id: chittyId,
      aggregate_type: "evidence",
      event_type: "EVIDENCE_INGESTED",
      event_data: {
        filename: evidenceMeta.filename,
        sha256: evidenceMeta.sha256,
        places: evidenceMeta.places || [],
        properties: evidenceMeta.properties || [],
        raw: rawData,
        cid: `bafk${evidenceMeta.sha256.substring(0, 52)}`, // IPFS-compatible CID
      },
    };

    // Add cryptographic integrity hash
    eventData.event_hash = crypto
      .createHash("sha256")
      .update(JSON.stringify(eventData.event_data))
      .digest("hex");

    return eventData;
  }

  /**
   * Verify evidence integrity via ChittyVerify service
   * Per §33: Evidence integrity, custody, authenticity must pass ChittyVerify
   */
  async verifyEvidence(chittyId, evidenceMeta) {
    const verifyService = this.serviceRegistry.get("chittyverify");
    if (!verifyService) {
      throw new Error("ChittyVerify service not available");
    }

    const response = await fetch(`${verifyService}/api/v1/evidence/verify`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.env.CHITTY_VERIFY_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chitty_id: chittyId,
        sha256: evidenceMeta.sha256,
        filename: evidenceMeta.filename,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Evidence verification failed: ${errorText}`);
    }

    return await response.json();
  }

  /**
   * Validate compliance via ChittyCheck service
   * Per §35: Compliance validation integrates with ChittyCheck and ChittyGuardian
   */
  async validateCompliance(chittyId, evidenceMeta, verificationResult) {
    const checkService = this.serviceRegistry.get("chittycheck");
    if (!checkService) {
      throw new Error("ChittyCheck service not available");
    }

    const response = await fetch(`${checkService}/api/v1/validate/evidence`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.env.CHITTY_CHECK_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chitty_id: chittyId,
        sha256: evidenceMeta.sha256,
        verification: verificationResult,
        metadata: evidenceMeta,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Compliance validation failed: ${errorText}`);
    }

    return await response.json();
  }

  /**
   * Store canonical evidence record via ChittySchema
   * Per §32: Entity resolution flows through ChittyCanon, stored via ChittySchema
   */
  async storeCanonicalRecord(evidenceRecord) {
    const schemaService = this.serviceRegistry.get("chittyschema");
    if (!schemaService) {
      throw new Error("ChittySchema service not available");
    }

    const response = await fetch(`${schemaService}/api/v1/store/evidence`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.env.CHITTY_ID_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(evidenceRecord),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Canonical storage failed: ${errorText}`);
    }

    return await response.json();
  }

  /**
   * AI-powered evidence analysis using multi-model routing
   * Per §23: All AI processing routes through ChittyRouter - no direct AI provider calls
   */
  async analyzeEvidenceWithAI(chittyId, evidenceData) {
    console.log("🧠 Starting AI evidence analysis:", chittyId);

    try {
      // Create AI analysis task
      const analysisTask = {
        type: "evidence_analysis",
        chitty_id: chittyId,
        evidence_data: evidenceData,
        routing_method: "CHITTYROUTER", // Enforced routing pattern per §23
        models: ["claude", "gpt", "gemini", "llama"], // Multi-model consensus
        analysis_types: [
          "relevance_scoring",
          "privilege_detection",
          "party_identification",
          "timeline_extraction",
          "legal_significance",
        ],
      };

      // Execute via agent orchestrator
      const result = await this.executeTask(analysisTask);

      // Store AI analysis in event store
      if (result.success) {
        await this.storeAIAnalysisEvent(chittyId, result);
      }

      return result;
    } catch (error) {
      console.error("❌ AI evidence analysis failed:", error);
      throw error;
    }
  }

  /**
   * Store AI analysis results as events
   * Per §7.4: MCP tools integrated with centralized ChittySchema
   */
  async storeAIAnalysisEvent(chittyId, analysisResult) {
    const schemaService = this.serviceRegistry.get("chittyschema");
    if (!schemaService) {
      throw new Error("ChittySchema service not available");
    }

    const eventData = {
      chitty_id: `${chittyId}-analysis-${Date.now()}`,
      aggregate_id: chittyId,
      aggregate_type: "ai_analysis",
      event_type: "AI_ANALYSIS_COMPLETED",
      event_data: {
        original_chitty_id: chittyId,
        analysis_result: analysisResult,
        models_used: analysisResult.agents_used,
        routing_method: "CHITTYROUTER",
        timestamp: analysisResult.timestamp,
      },
    };

    const response = await fetch(`${schemaService}/api/v1/events`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.env.CHITTY_ID_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(eventData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ Failed to store AI analysis event:", errorText);
    }

    return response.ok;
  }

  /**
   * Link evidence to cases via ChittyCases service
   * Per litigation manual: Cases managed through centralized ChittyCases service
   */
  async linkEvidenceToCases(chittyId, evidenceMeta) {
    const casesService = this.serviceRegistry.get("chittycases");
    if (!casesService) {
      console.warn(
        "⚠️ ChittyCases service not available - skipping case linking",
      );
      return { status: "service_unavailable" };
    }

    try {
      // Identify relevant cases from evidence metadata
      const relevantCases = await this.identifyRelevantCases(evidenceMeta);

      const linkResults = [];
      for (const caseInfo of relevantCases) {
        const response = await fetch(
          `${casesService}/api/v1/cases/${caseInfo.case_number}/evidence`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${this.env.CHITTY_ID_TOKEN}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              chitty_id: chittyId,
              evidence_type: evidenceMeta.evidence_type || "document",
              relevance_score: caseInfo.relevance_score,
              metadata: {
                filename: evidenceMeta.filename,
                sha256: evidenceMeta.sha256,
                significance_level: evidenceMeta.significance_level,
              },
            }),
          },
        );

        if (response.ok) {
          const result = await response.json();
          linkResults.push({
            case_number: caseInfo.case_number,
            status: "linked",
            link_id: result.link_id,
          });
          console.log(
            `✅ Linked evidence ${chittyId} to case ${caseInfo.case_number}`,
          );
        } else {
          const errorText = await response.text();
          linkResults.push({
            case_number: caseInfo.case_number,
            status: "failed",
            error: errorText,
          });
          console.error(
            `❌ Failed to link evidence to case ${caseInfo.case_number}:`,
            errorText,
          );
        }
      }

      return {
        status: "completed",
        links: linkResults,
        total_cases: relevantCases.length,
      };
    } catch (error) {
      console.error("❌ Case linking failed:", error);
      return {
        status: "failed",
        error: error.message,
      };
    }
  }

  /**
   * Identify relevant cases from evidence metadata
   */
  async identifyRelevantCases(evidenceMeta) {
    const relevantCases = [];
    const filename = evidenceMeta.filename?.toLowerCase() || "";
    const path = evidenceMeta.original_path?.toLowerCase() || "";

    // Check for ARIAS v. BIANCHI case
    if (
      filename.includes("arias") ||
      filename.includes("bianchi") ||
      path.includes("arias") ||
      path.includes("2024d007847")
    ) {
      relevantCases.push({
        case_number: "2024D007847",
        case_name: "Arias v. Bianchi",
        relevance_score: 0.95,
      });
    }

    // Check for Guzman case
    if (
      filename.includes("guzman") ||
      filename.includes("castillo") ||
      path.includes("guzman") ||
      path.includes("2023d003456")
    ) {
      relevantCases.push({
        case_number: "2023D003456",
        case_name: "Guzman v. Castillo",
        relevance_score: 0.95,
      });
    }

    // Check for Schatz ARDC case
    if (
      filename.includes("schatz") ||
      filename.includes("ardc") ||
      path.includes("schatz") ||
      filename.includes("complaint")
    ) {
      relevantCases.push({
        case_number: "ARDC-2024-SCHATZ",
        case_name: "ARDC Complaint - Schatz",
        relevance_score: 0.9,
      });
    }

    return relevantCases;
  }

  /**
   * Get case timeline from ChittyCases
   */
  async getCaseTimeline(caseNumber) {
    const casesService = this.serviceRegistry.get("chittycases");
    if (!casesService) {
      throw new Error("ChittyCases service not available");
    }

    const response = await fetch(
      `${casesService}/api/v1/cases/${caseNumber}/timeline`,
      {
        headers: {
          Authorization: `Bearer ${this.env.CHITTY_ID_TOKEN}`,
        },
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get case timeline: ${errorText}`);
    }

    return await response.json();
  }

  /**
   * Update case status via ChittyCases
   */
  async updateCaseStatus(caseNumber, status, notes) {
    const casesService = this.serviceRegistry.get("chittycases");
    if (!casesService) {
      throw new Error("ChittyCases service not available");
    }

    const response = await fetch(
      `${casesService}/api/v1/cases/${caseNumber}/status`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${this.env.CHITTY_ID_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: status,
          notes: notes,
          updated_by: "ChittyRouter-Litigation",
          timestamp: new Date().toISOString(),
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to update case status: ${errorText}`);
    }

    return await response.json();
  }

  /**
   * Create case event in ChittyCases
   */
  async createCaseEvent(caseNumber, eventType, description, evidenceIds = []) {
    const casesService = this.serviceRegistry.get("chittycases");
    if (!casesService) {
      throw new Error("ChittyCases service not available");
    }

    const response = await fetch(
      `${casesService}/api/v1/cases/${caseNumber}/events`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.env.CHITTY_ID_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          event_type: eventType,
          description: description,
          evidence_ids: evidenceIds,
          created_by: "ChittyRouter-Litigation",
          timestamp: new Date().toISOString(),
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create case event: ${errorText}`);
    }

    return await response.json();
  }

  /**
   * Get Cook County docket information via ChittyCases
   * ChittyCases scrapes Cook County case search for real-time docket data
   */
  async getCookCountyDocket(caseNumber) {
    const casesService = this.serviceRegistry.get("chittycases");
    if (!casesService) {
      throw new Error("ChittyCases service not available");
    }

    console.log(`📋 Fetching Cook County docket for case ${caseNumber}`);

    const response = await fetch(
      `${casesService}/api/v1/cook-county/docket/${caseNumber}`,
      {
        headers: {
          Authorization: `Bearer ${this.env.CHITTY_ID_TOKEN}`,
        },
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get Cook County docket: ${errorText}`);
    }

    const docketData = await response.json();

    // Create case event for docket retrieval
    if (docketData.entries && docketData.entries.length > 0) {
      await this.createCaseEvent(
        caseNumber,
        "DOCKET_RETRIEVED",
        `Retrieved ${docketData.entries.length} docket entries from Cook County`,
        [],
      );
    }

    return docketData;
  }

  /**
   * Sync case with Cook County docket updates
   * Automatically checks for new filings and updates
   */
  async syncWithCookCountyDocket(caseNumber) {
    const casesService = this.serviceRegistry.get("chittycases");
    if (!casesService) {
      throw new Error("ChittyCases service not available");
    }

    console.log(`🔄 Syncing case ${caseNumber} with Cook County docket`);

    const response = await fetch(
      `${casesService}/api/v1/cook-county/sync/${caseNumber}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.env.CHITTY_ID_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sync_type: "full",
          create_events: true,
          update_timeline: true,
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to sync with Cook County docket: ${errorText}`);
    }

    return await response.json();
  }

  /**
   * Monitor case for new Cook County filings
   * Sets up automatic monitoring for case updates
   */
  async monitorCookCountyCase(caseNumber, webhookUrl = null) {
    const casesService = this.serviceRegistry.get("chittycases");
    if (!casesService) {
      throw new Error("ChittyCases service not available");
    }

    console.log(`👀 Setting up Cook County monitoring for case ${caseNumber}`);

    const response = await fetch(
      `${casesService}/api/v1/cook-county/monitor/${caseNumber}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.env.CHITTY_ID_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          monitoring_enabled: true,
          check_frequency: "daily", // daily, hourly, or real-time
          webhook_url: webhookUrl,
          notifications: {
            new_filings: true,
            status_changes: true,
            hearing_dates: true,
          },
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to set up Cook County monitoring: ${errorText}`);
    }

    return await response.json();
  }

  /**
   * Search Cook County for related cases
   * Uses ChittyCases scraping to find related matters
   */
  async searchCookCountyRelatedCases(partyName, dateRange = null) {
    const casesService = this.serviceRegistry.get("chittycases");
    if (!casesService) {
      throw new Error("ChittyCases service not available");
    }

    console.log(`🔍 Searching Cook County for cases involving ${partyName}`);

    const searchParams = {
      party_name: partyName,
      date_range: dateRange,
      include_disposed: false,
    };

    const response = await fetch(`${casesService}/api/v1/cook-county/search`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.env.CHITTY_ID_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(searchParams),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to search Cook County cases: ${errorText}`);
    }

    return await response.json();
  }

  /**
   * Determine required agents for evidence processing
   * Extends base AgentOrchestrator for litigation-specific workflows
   */
  determineRequiredAgents(taskData) {
    const baseAgents = super.determineRequiredAgents(taskData);

    // Add litigation-specific agents
    if (taskData.type === "evidence_analysis") {
      return [
        ...baseAgents,
        "legal_relevance_agent",
        "privilege_detection_agent",
        "timeline_extraction_agent",
        "party_identification_agent",
        "case_linking_agent",
      ];
    }

    return baseAgents;
  }
}
