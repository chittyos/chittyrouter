/**
 * ChittyCases Integration Service
 * Integrates legal case management and document analysis from ChittyCases research
 */

import { LangChainAIService } from "./langchain-ai.js";

export class ChittyCasesService {
  constructor(env) {
    this.env = env;
    this.langChainAI = new LangChainAIService(env);
  }

  /**
   * Enhanced Legal Research (from cloudflare_ai_routes.py)
   */
  async performLegalResearch(params) {
    const {
      query,
      caseNumber,
      jurisdiction = "Cook County, Illinois",
      caseContext,
    } = params;

    if (!query) {
      throw new Error("Research query is required");
    }

    // Enhanced research prompt with ChittyCases integration
    const enhancedPrompt = `
Perform comprehensive legal research on the following query:

Query: ${query}
Jurisdiction: ${jurisdiction}
${caseContext ? `Case Context: ${caseContext}` : ""}

Provide detailed research results including:
1. Relevant statutes and regulations
2. Case law and precedents
3. Legal principles and doctrines
4. Procedural requirements
5. Strategic considerations
6. Risk assessment
7. Next steps and recommendations

Format as a comprehensive legal research memo.`;

    try {
      const result = await this.langChainAI.analyzeLegalCase({
        caseDetails: enhancedPrompt,
        analysisType: "precedent",
        provider: "anthropic",
      });

      return {
        success: true,
        query,
        jurisdiction,
        caseContext,
        research: result.analysis,
        researchId: result.chittyId,
        timestamp: new Date().toISOString(),
        powered_by: "ChittyCases-LangChain-AI",
      };
    } catch (error) {
      throw new Error(`Legal research failed: ${error.message}`);
    }
  }

  /**
   * Enhanced Document Analysis
   */
  async analyzeDocument(params) {
    const {
      documentContent,
      documentType,
      caseNumber,
      analysisType = "comprehensive",
    } = params;

    if (!documentContent) {
      throw new Error("Document content is required");
    }

    const analysisPrompt = `
Analyze the following legal document:

Document Type: ${documentType || "Unknown"}
Case Number: ${caseNumber || "N/A"}
Analysis Type: ${analysisType}

Document Content:
${documentContent}

Provide a comprehensive analysis including:
1. Document classification and type
2. Key legal issues identified
3. Factual findings and claims
4. Legal arguments and positions
5. Procedural status and deadlines
6. Evidence and exhibits referenced
7. Potential contradictions or inconsistencies
8. Strategic implications
9. Compliance and filing requirements
10. Recommendations for action

Format as a detailed document analysis report.`;

    try {
      const result = await this.langChainAI.generateDocument({
        documentType: "document_analysis_report",
        caseData: {
          documentType,
          caseNumber,
          analysisType,
          content: documentContent,
        },
        template: { format: "comprehensive_analysis" },
        requirements: {
          include_citations: true,
          include_recommendations: true,
        },
      });

      return {
        success: true,
        documentType,
        analysisType,
        caseNumber,
        analysis: result.document,
        analysisId: result.documentId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new Error(`Document analysis failed: ${error.message}`);
    }
  }

  /**
   * Case Insights Generation
   */
  async getCaseInsights(params) {
    const { caseNumber, caseData, insightType = "strategic" } = params;

    if (!caseNumber && !caseData) {
      throw new Error("Case number or case data is required");
    }

    const insightPrompt = `
Generate comprehensive case insights for:

Case Number: ${caseNumber || "N/A"}
Insight Type: ${insightType}

Case Data:
${JSON.stringify(caseData, null, 2)}

Provide strategic insights including:
1. Case strength assessment
2. Key legal theories and arguments
3. Factual support and evidence gaps
4. Procedural opportunities and risks
5. Settlement considerations
6. Trial strategy recommendations
7. Resource requirements
8. Timeline and critical deadlines
9. Potential outcomes and probability
10. Action items and next steps

Format as an executive case strategy memo.`;

    try {
      const result = await this.langChainAI.analyzeLegalCase({
        caseDetails: insightPrompt,
        analysisType: "strategy",
        provider: "anthropic",
      });

      return {
        caseNumber,
        insightType,
        insights: result.analysis,
        insightId: result.chittyId,
        timestamp: new Date().toISOString(),
        confidence: "high",
      };
    } catch (error) {
      throw new Error(`Case insights generation failed: ${error.message}`);
    }
  }

  /**
   * Enhanced Petition Generation
   */
  async generatePetition(params) {
    const { petitionType, caseData, jurisdiction, urgency = "normal" } = params;

    if (!petitionType || !caseData) {
      throw new Error("Petition type and case data are required");
    }

    const petitionPrompt = `
Generate a ${petitionType} petition with the following details:

Jurisdiction: ${jurisdiction || "Cook County, Illinois"}
Urgency Level: ${urgency}

Case Information:
${JSON.stringify(caseData, null, 2)}

Create a professional legal petition including:
1. Caption and case header
2. Procedural basis and authority
3. Statement of facts
4. Legal arguments and authorities
5. Prayer for relief
6. Certificate of service
7. Verification if required
8. Supporting exhibits list

Ensure compliance with local court rules and formatting requirements.
Format as a complete, ready-to-file legal petition.`;

    try {
      const result = await this.langChainAI.generateDocument({
        documentType: `${petitionType}_petition`,
        caseData: {
          petitionType,
          jurisdiction,
          urgency,
          ...caseData,
        },
        template: { format: "court_filing", jurisdiction },
        requirements: {
          include_citations: true,
          court_rules_compliance: true,
          ready_to_file: true,
        },
      });

      return {
        success: true,
        petitionType,
        jurisdiction,
        urgency,
        petition: result.document,
        petitionId: result.documentId,
        timestamp: new Date().toISOString(),
        filing_ready: true,
      };
    } catch (error) {
      throw new Error(`Petition generation failed: ${error.message}`);
    }
  }

  /**
   * Contradiction Analysis
   */
  async findContradictions(params) {
    const { documents, statements, caseNumber } = params;

    if (!documents && !statements) {
      throw new Error(
        "Documents or statements are required for contradiction analysis",
      );
    }

    const contradictionPrompt = `
Analyze the following materials for contradictions and inconsistencies:

Case Number: ${caseNumber || "N/A"}

Documents:
${documents ? JSON.stringify(documents, null, 2) : "None provided"}

Statements:
${statements ? JSON.stringify(statements, null, 2) : "None provided"}

Identify and analyze:
1. Direct contradictions between statements
2. Inconsistencies in factual claims
3. Timeline discrepancies
4. Conflicting evidence
5. Legal position inconsistencies
6. Witness statement contradictions
7. Document vs. testimony conflicts
8. Internal inconsistencies within single sources
9. Credibility implications
10. Strategic use of contradictions

Provide detailed analysis with specific citations and strategic recommendations.`;

    try {
      const result = await this.langChainAI.compileEvidence({
        claim: "Contradiction and inconsistency analysis",
        evidenceTypes: ["documents", "statements", "testimony"],
        searchCriteria: {
          caseNumber,
          analysisType: "contradiction_detection",
          sources: { documents, statements },
        },
      });

      return {
        caseNumber,
        contradictionAnalysis: result.evidenceCompilation,
        contradictions: [], // Would be populated by detailed analysis
        analysisId: result.compilationId,
        timestamp: new Date().toISOString(),
        confidence: "high",
      };
    } catch (error) {
      throw new Error(`Contradiction analysis failed: ${error.message}`);
    }
  }

  /**
   * Case Dashboard Data Generation
   */
  async generateDashboardData(params) {
    const { caseNumber, caseData } = params;

    if (!caseNumber) {
      throw new Error("Case number is required");
    }

    try {
      // Generate multiple analyses for comprehensive dashboard
      const [insights, timeline, compliance] = await Promise.all([
        this.getCaseInsights({ caseNumber, caseData }),
        this.langChainAI.generateTimeline({
          topic: `Case ${caseNumber}`,
          dateRange: { start: "2024-01-01", end: "2024-12-31" },
          entities: caseData?.entities || [],
          events: caseData?.events || [],
        }),
        this.langChainAI.analyzeCompliance({
          entity: caseNumber,
          regulations: [
            "Court Rules",
            "Filing Requirements",
            "Procedural Deadlines",
          ],
          scope: { type: "legal_case", jurisdiction: caseData?.jurisdiction },
          documents: caseData?.documents || [],
        }),
      ]);

      return {
        caseNumber,
        lastUpdated: new Date().toISOString(),
        caseInsights: insights,
        timeline: timeline,
        complianceStatus: compliance,
        dashboardId: await this.generateChittyIdForDashboard(caseNumber),
        summary: {
          status: "active",
          priority: "normal",
          nextDeadline: null, // Would be extracted from timeline
          openTasks: 0, // Would be calculated from analysis
          documentsCount: caseData?.documents?.length || 0,
        },
      };
    } catch (error) {
      throw new Error(`Dashboard generation failed: ${error.message}`);
    }
  }

  /**
   * Generate ChittyID for dashboard
   */
  async generateChittyIdForDashboard(caseNumber) {
    try {
      const response = await fetch(`${this.env.CHITTY_SERVER_URL}/v1/mint`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.env.CHITTY_API_KEY}`,
        },
        body: JSON.stringify({
          type: "INFO",
          namespace: "CASE_DASHBOARD",
          purpose: `dashboard_${caseNumber}`,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        return result.chittyId;
      }
    } catch (error) {
      console.warn("ChittyID generation failed:", error);
    }

    return `TEMP-DASHBOARD-${Date.now()}`;
  }

  /**
   * Health check for ChittyCases integration
   */
  async healthCheck() {
    try {
      const langChainHealth = await this.langChainAI.healthCheck();

      return {
        status: "healthy",
        timestamp: new Date().toISOString(),
        services: {
          langchain: langChainHealth.status,
          chittycases_integration: "active",
        },
        capabilities: [
          "legal_research",
          "document_analysis",
          "case_insights",
          "petition_generation",
          "contradiction_analysis",
          "dashboard_generation",
        ],
        version: "1.0.0",
      };
    } catch (error) {
      return {
        status: "unhealthy",
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }
}

export default ChittyCasesService;
