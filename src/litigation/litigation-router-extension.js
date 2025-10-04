/**
 * Litigation Router Extension for ChittyRouter
 * Extends ChittyRouterAI with litigation-specific routing capabilities
 *
 * Implements service-orchestrated evidence processing workflows
 * per §36 Critical Architecture Principle
 */

import { ChittyRouterAI } from "../ai/intelligent-router.js";
import { EvidenceIngestionOrchestrator } from "./evidence-ingestion-orchestrator.js";

export class LitigationRouterExtension extends ChittyRouterAI {
  constructor(ai, env) {
    super(ai, env);
    this.evidenceOrchestrator = new EvidenceIngestionOrchestrator(ai, env);
    this.litigationWorkflows = new Map();
    this.initializeLitigationWorkflows();
  }

  /**
   * Initialize litigation-specific routing workflows
   */
  initializeLitigationWorkflows() {
    this.litigationWorkflows.set(
      "evidence_intake",
      this.handleEvidenceIntake.bind(this),
    );
    this.litigationWorkflows.set(
      "case_analysis",
      this.handleCaseAnalysis.bind(this),
    );
    this.litigationWorkflows.set(
      "discovery_processing",
      this.handleDiscoveryProcessing.bind(this),
    );
    this.litigationWorkflows.set(
      "attorney_transition",
      this.handleAttorneyTransition.bind(this),
    );
    this.litigationWorkflows.set(
      "ardc_complaint",
      this.handleARDCComplaint.bind(this),
    );
    this.litigationWorkflows.set(
      "timeline_generation",
      this.handleTimelineGeneration.bind(this),
    );
  }

  /**
   * Enhanced intelligent routing with litigation awareness
   * Extends base intelligentRoute for legal workflows
   */
  async intelligentRoute(emailData) {
    console.log("⚖️ Litigation-aware routing for:", emailData.subject);

    // First, run standard email routing
    const standardRouting = await super.intelligentRoute(emailData);

    // Check for litigation-specific indicators
    const litigationContext = await this.detectLitigationContext(emailData);

    if (litigationContext.isLitigationRelated) {
      console.log("📋 Detected litigation context:", litigationContext.type);

      // Route to appropriate litigation workflow
      const litigationResult = await this.routeLitigationWorkflow(
        litigationContext.type,
        emailData,
        standardRouting,
      );

      return {
        ...standardRouting,
        litigation: litigationResult,
        workflow_type: "litigation_enhanced",
        litigation_context: litigationContext,
      };
    }

    return standardRouting;
  }

  /**
   * Detect litigation context in incoming communications
   */
  async detectLitigationContext(emailData) {
    const litigationIndicators = {
      case_management: [
        "case number",
        "docket",
        "court filing",
        "motion",
        "hearing",
        "deposition",
        "discovery",
        "subpoena",
        "arias v bianchi",
        "2024D007847",
        "guzman",
        "schatz",
      ],
      evidence_related: [
        "evidence",
        "exhibit",
        "document production",
        "metadata",
        "authentication",
        "chain of custody",
        "privilege log",
      ],
      attorney_matters: [
        "attorney transition",
        "counsel withdrawal",
        "substitution",
        "vanguard associates",
        "rob",
        "kimber",
        "onboarding",
      ],
      compliance_issues: [
        "ardc",
        "professional conduct",
        "bar complaint",
        "ethics",
        "rule violation",
        "professional responsibility",
      ],
    };

    const content =
      `${emailData.subject} ${emailData.body || ""}`.toLowerCase();

    for (const [category, indicators] of Object.entries(litigationIndicators)) {
      for (const indicator of indicators) {
        if (content.includes(indicator.toLowerCase())) {
          return {
            isLitigationRelated: true,
            type: category,
            confidence: this.calculateConfidence(content, indicators),
            detected_indicators: indicators.filter((ind) =>
              content.includes(ind.toLowerCase()),
            ),
          };
        }
      }
    }

    return { isLitigationRelated: false };
  }

  /**
   * Route to appropriate litigation workflow
   */
  async routeLitigationWorkflow(workflowType, emailData, standardRouting) {
    const workflowMap = {
      case_management: "case_analysis",
      evidence_related: "evidence_intake",
      attorney_matters: "attorney_transition",
      compliance_issues: "ardc_complaint",
    };

    const workflow = workflowMap[workflowType] || "case_analysis";
    const handler = this.litigationWorkflows.get(workflow);

    if (handler) {
      return await handler(emailData, standardRouting);
    }

    console.warn(`⚠️ No handler found for workflow: ${workflow}`);
    return { workflow, status: "no_handler_available" };
  }

  /**
   * Handle evidence intake workflow
   * Integrates with EvidenceIngestionOrchestrator
   */
  async handleEvidenceIntake(emailData, standardRouting) {
    console.log("📄 Processing evidence intake workflow");

    try {
      // Extract attachments and evidence metadata
      const evidenceItems = await this.extractEvidenceFromEmail(emailData);

      const processedEvidence = [];
      for (const evidence of evidenceItems) {
        try {
          // Use orchestrator for full evidence ingestion
          const result = await this.evidenceOrchestrator.ingestEvidence(
            evidence.metadata,
            evidence.data,
          );

          processedEvidence.push({
            chitty_id: result.chitty_id,
            filename: evidence.metadata.filename,
            status: "processed",
            verification: result.verification,
            compliance: result.compliance,
          });

          // Trigger AI analysis if evidence is significant
          if (evidence.metadata.significance_level >= 4) {
            await this.evidenceOrchestrator.analyzeEvidenceWithAI(
              result.chitty_id,
              evidence.data,
            );
          }
        } catch (error) {
          console.error(
            `❌ Failed to process evidence ${evidence.metadata.filename}:`,
            error,
          );
          processedEvidence.push({
            filename: evidence.metadata.filename,
            status: "failed",
            error: error.message,
          });
        }
      }

      return {
        workflow: "evidence_intake",
        status: "completed",
        processed_items: processedEvidence.length,
        evidence: processedEvidence,
      };
    } catch (error) {
      console.error("❌ Evidence intake workflow failed:", error);
      return {
        workflow: "evidence_intake",
        status: "failed",
        error: error.message,
      };
    }
  }

  /**
   * Handle case analysis workflow
   */
  async handleCaseAnalysis(emailData, standardRouting) {
    console.log("📋 Processing case analysis workflow");

    try {
      // Identify case from email content
      const caseInfo = await this.identifyCaseFromEmail(emailData);

      if (!caseInfo.case_number) {
        return {
          workflow: "case_analysis",
          status: "no_case_identified",
          message: "Could not identify case number from email content",
        };
      }

      // Create case analysis task
      const analysisTask = {
        type: "case_analysis",
        case_number: caseInfo.case_number,
        email_data: emailData,
        analysis_types: [
          "deadline_extraction",
          "action_items",
          "party_communications",
          "legal_issues",
          "strategic_implications",
        ],
      };

      // Execute via evidence orchestrator (extends AgentOrchestrator)
      const analysisResult =
        await this.evidenceOrchestrator.executeTask(analysisTask);

      // Update case timeline with analysis results
      if (analysisResult.success && caseInfo.case_number) {
        await this.evidenceOrchestrator.createCaseEvent(
          caseInfo.case_number,
          "EMAIL_ANALYSIS",
          `Email analysis completed: ${emailData.subject}`,
          [],
        );

        // Sync with Cook County docket for current information
        try {
          const docketData =
            await this.evidenceOrchestrator.getCookCountyDocket(
              caseInfo.case_number,
            );
          analysisResult.cook_county_docket = docketData;
        } catch (error) {
          console.warn(
            `⚠️ Could not retrieve Cook County docket for ${caseInfo.case_number}:`,
            error.message,
          );
        }
      }

      return {
        workflow: "case_analysis",
        status: "completed",
        case_info: caseInfo,
        analysis: analysisResult,
      };
    } catch (error) {
      console.error("❌ Case analysis workflow failed:", error);
      return {
        workflow: "case_analysis",
        status: "failed",
        error: error.message,
      };
    }
  }

  /**
   * Handle attorney transition workflow (Vanguard Associates onboarding)
   */
  async handleAttorneyTransition(emailData, standardRouting) {
    console.log("👥 Processing attorney transition workflow");

    try {
      // Detect transition type
      const transitionType = await this.detectTransitionType(emailData);

      if (transitionType === "vanguard_onboarding") {
        // Trigger automated extraction for ARIAS v. BIANCHI
        const extractionResult =
          await this.triggerVanguardExtraction(emailData);

        return {
          workflow: "attorney_transition",
          status: "vanguard_onboarding_initiated",
          extraction: extractionResult,
        };
      }

      return {
        workflow: "attorney_transition",
        status: "transition_detected",
        type: transitionType,
        message: "Attorney transition workflow initiated",
      };
    } catch (error) {
      console.error("❌ Attorney transition workflow failed:", error);
      return {
        workflow: "attorney_transition",
        status: "failed",
        error: error.message,
      };
    }
  }

  /**
   * Handle ARDC complaint processing
   */
  async handleARDCComplaint(emailData, standardRouting) {
    console.log("⚖️ Processing ARDC complaint workflow");

    try {
      // Process Schatz complaint evidence
      const complaintData = await this.extractComplaintData(emailData);

      // Create ARDC processing task
      const ardcTask = {
        type: "ardc_complaint_processing",
        complaint_data: complaintData,
        email_data: emailData,
        processing_steps: [
          "evidence_validation",
          "rule_violation_analysis",
          "timeline_construction",
          "supporting_documentation",
        ],
      };

      const result = await this.evidenceOrchestrator.executeTask(ardcTask);

      return {
        workflow: "ardc_complaint",
        status: "processed",
        complaint_analysis: result,
      };
    } catch (error) {
      console.error("❌ ARDC complaint workflow failed:", error);
      return {
        workflow: "ardc_complaint",
        status: "failed",
        error: error.message,
      };
    }
  }

  /**
   * Handle discovery processing workflow
   */
  async handleDiscoveryProcessing(emailData, standardRouting) {
    console.log("🔍 Processing discovery workflow");

    try {
      const discoveryTask = {
        type: "discovery_processing",
        email_data: emailData,
        processing_types: [
          "document_requests",
          "interrogatories",
          "admissions",
          "privilege_review",
        ],
      };

      const result = await this.evidenceOrchestrator.executeTask(discoveryTask);

      return {
        workflow: "discovery_processing",
        status: "completed",
        discovery_analysis: result,
      };
    } catch (error) {
      console.error("❌ Discovery processing failed:", error);
      return {
        workflow: "discovery_processing",
        status: "failed",
        error: error.message,
      };
    }
  }

  /**
   * Handle timeline generation workflow
   */
  async handleTimelineGeneration(emailData, standardRouting) {
    console.log("📅 Processing timeline generation workflow");

    try {
      const timelineTask = {
        type: "timeline_generation",
        email_data: emailData,
        timeline_types: [
          "case_events",
          "deadlines",
          "communications",
          "filings",
        ],
      };

      const result = await this.evidenceOrchestrator.executeTask(timelineTask);

      return {
        workflow: "timeline_generation",
        status: "completed",
        timeline: result,
      };
    } catch (error) {
      console.error("❌ Timeline generation failed:", error);
      return {
        workflow: "timeline_generation",
        status: "failed",
        error: error.message,
      };
    }
  }

  // Helper methods

  calculateConfidence(content, indicators) {
    const matches = indicators.filter((ind) =>
      content.includes(ind.toLowerCase()),
    ).length;
    return Math.min(matches / indicators.length, 1.0);
  }

  async extractEvidenceFromEmail(emailData) {
    // Mock implementation - would extract actual attachments and metadata
    return [
      {
        metadata: {
          filename: "evidence_document.pdf",
          sha256: "abc123...",
          significance_level: 5,
        },
        data: {
          /* document data */
        },
      },
    ];
  }

  async identifyCaseFromEmail(emailData) {
    const content = `${emailData.subject} ${emailData.body || ""}`;

    // Check for known case numbers
    if (
      content.includes("2024D007847") ||
      content.includes("arias v bianchi")
    ) {
      return { case_number: "2024D007847", case_name: "Arias v. Bianchi" };
    }

    if (content.includes("guzman")) {
      return { case_number: "2023D003456", case_name: "Guzman v. Castillo" };
    }

    return { case_number: null };
  }

  async detectTransitionType(emailData) {
    const content =
      `${emailData.subject} ${emailData.body || ""}`.toLowerCase();

    if (
      content.includes("vanguard") ||
      content.includes("rob") ||
      content.includes("kimber")
    ) {
      return "vanguard_onboarding";
    }

    return "general_transition";
  }

  async triggerVanguardExtraction(emailData) {
    // This would trigger the actual Vanguard extraction script
    console.log(
      "🚀 Triggering Vanguard Associates extraction for ARIAS v. BIANCHI",
    );

    return {
      status: "initiated",
      case: "ARIAS v. BIANCHI",
      attorneys: ["Rob", "Kimber"],
      extraction_script: "EXECUTE_BIANCHI_EXTRACTION.sh",
    };
  }

  async extractComplaintData(emailData) {
    // Extract ARDC complaint specific data
    return {
      respondent: "Jonathan Schatz",
      complainant: "Nicholas Bianchi",
      violations: ["Rule 1.1", "Rule 1.3", "Rule 1.4", "Rule 1.16"],
    };
  }
}
