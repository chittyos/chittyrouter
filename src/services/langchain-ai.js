/**
 * Unified LangChain AI Service for ChittyOS
 * Integrates legal analysis, financial tracing, and document processing
 */

import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { ChatPromptTemplate } from "@langchain/core/prompts";

export class LangChainAIService {
  constructor(env) {
    this.env = env;

    // Initialize LangChain models
    this.openAIChat = new ChatOpenAI({
      apiKey: env.OPENAI_API_KEY,
      modelName: "gpt-4-turbo-preview",
      temperature: 0.7,
    });

    this.anthropicChat = new ChatAnthropic({
      apiKey: env.ANTHROPIC_API_KEY,
      modelName: "claude-3-5-sonnet-20241022",
      temperature: 0.7,
    });

    this.outputParser = new StringOutputParser();
  }

  /**
   * Legal Case Analysis (from chittycases research)
   */
  async analyzeLegalCase(request) {
    const { caseDetails, analysisType, provider = "anthropic" } = request;

    const prompts = {
      risk: `Analyze the following legal case and identify potential risks:

Case Details: {caseDetails}

Provide a comprehensive risk assessment including:
1. Legal risks and exposure
2. Financial risks and potential damages
3. Reputational risks
4. Mitigation strategies
5. ChittyID compliance requirements`,

      strategy: `Develop a legal strategy for the following case:

Case Details: {caseDetails}

Provide:
1. Recommended approach and tactics
2. Key arguments and legal theories
3. Potential challenges and counterarguments
4. Timeline and critical milestones
5. Resource requirements and ChittyID integration`,

      summary: `Provide a concise summary of the following legal case:

Case Details: {caseDetails}

Include:
1. Key parties and their ChittyIDs
2. Main legal issues and claims
3. Current procedural status
4. Next steps and deadlines
5. ChittyOS service implications`,

      precedent: `Identify relevant legal precedents for the following case:

Case Details: {caseDetails}

Provide:
1. Similar cases and outcomes
2. Key judicial rulings and reasoning
3. Applicable statutes and regulations
4. How precedents apply to this case
5. Impact on ChittyFoundation operations`,
    };

    const prompt = ChatPromptTemplate.fromTemplate(prompts[analysisType]);
    const model =
      provider === "anthropic" ? this.anthropicChat : this.openAIChat;

    const chain = prompt.pipe(model).pipe(this.outputParser);

    try {
      const result = await chain.invoke({ caseDetails });
      return {
        analysis: result,
        provider,
        analysisType,
        timestamp: new Date().toISOString(),
        chittyId: await this.generateChittyIdForAnalysis(analysisType),
      };
    } catch (error) {
      console.error("Error in legal analysis:", error);
      throw error;
    }
  }

  /**
   * Financial Fund Tracing (from chittytrace research)
   */
  async traceFunds(params) {
    const { sourceAccount, destination, dateRange, amount } = params;

    const prompt = ChatPromptTemplate.fromTemplate(`
Trace the flow of funds with the following parameters:

Source Account: {sourceAccount}
Destination: {destination}
Date Range: {dateRange}
Amount: {amount}

Provide a comprehensive fund flow analysis including:
1. All intermediate transactions and routing
2. Exact dates, amounts, and reference numbers
3. Account numbers and financial institutions
4. Any suspicious patterns or anomalies
5. ChittyID associations for all entities
6. Compliance flags and regulatory considerations
7. Evidence chain and documentation requirements

Format as a detailed investigative report.`);

    const chain = prompt.pipe(this.anthropicChat).pipe(this.outputParser);

    try {
      const result = await chain.invoke({
        sourceAccount,
        destination,
        dateRange: JSON.stringify(dateRange),
        amount,
      });

      return {
        fundTrace: result,
        traceId: await this.generateChittyIdForTrace(),
        timestamp: new Date().toISOString(),
        parameters: params,
      };
    } catch (error) {
      console.error("Error in fund tracing:", error);
      throw error;
    }
  }

  /**
   * Document Generation and Processing
   */
  async generateDocument(request) {
    const { documentType, caseData, template, requirements } = request;

    const prompt = ChatPromptTemplate.fromTemplate(`
Generate a {documentType} document with the following specifications:

Document Type: {documentType}
Case Data: {caseData}
Template Requirements: {template}
Special Requirements: {requirements}

Create a professional, legally compliant document that includes:
1. Proper legal formatting and structure
2. All required sections and clauses
3. ChittyID references for all parties
4. Compliance with ChittyFoundation standards
5. Digital signature placeholders
6. Audit trail components

Format as a complete, ready-to-file document.`);

    const chain = prompt.pipe(this.anthropicChat).pipe(this.outputParser);

    try {
      const result = await chain.invoke({
        documentType,
        caseData: JSON.stringify(caseData),
        template: JSON.stringify(template),
        requirements: JSON.stringify(requirements),
      });

      return {
        document: result,
        documentId: await this.generateChittyIdForDocument(documentType),
        timestamp: new Date().toISOString(),
        metadata: {
          type: documentType,
          generated_by: "ChittyFoundation-LangChain-AI",
          compliance_version: "2.0.0",
        },
      };
    } catch (error) {
      console.error("Error generating document:", error);
      throw error;
    }
  }

  /**
   * Evidence Compilation and Analysis
   */
  async compileEvidence(params) {
    const { claim, evidenceTypes, searchCriteria } = params;

    const prompt = ChatPromptTemplate.fromTemplate(`
Compile and analyze evidence for the following claim:

Claim: {claim}
Required Evidence Types: {evidenceTypes}
Search Criteria: {searchCriteria}

Provide a comprehensive evidence analysis including:
1. Evidence categorization and strength assessment
2. Document authenticity evaluation
3. Chain of custody requirements
4. Gaps in evidence and recommendations
5. ChittyID verification for all evidence sources
6. Legal admissibility analysis
7. Supporting documentation requirements

Format as a detailed evidence brief suitable for legal proceedings.`);

    const chain = prompt.pipe(this.anthropicChat).pipe(this.outputParser);

    try {
      const result = await chain.invoke({
        claim,
        evidenceTypes: JSON.stringify(evidenceTypes),
        searchCriteria: JSON.stringify(searchCriteria),
      });

      return {
        evidenceCompilation: result,
        compilationId: await this.generateChittyIdForEvidence(),
        timestamp: new Date().toISOString(),
        claim,
        evidenceTypes,
      };
    } catch (error) {
      console.error("Error compiling evidence:", error);
      throw error;
    }
  }

  /**
   * Timeline Generation
   */
  async generateTimeline(params) {
    const { topic, dateRange, entities, events } = params;

    const prompt = ChatPromptTemplate.fromTemplate(`
Generate a detailed chronological timeline for:

Topic: {topic}
Date Range: {dateRange}
Key Entities: {entities}
Known Events: {events}

Create a comprehensive timeline including:
1. Chronological sequence of all events
2. Precise dates and times where available
3. Entity involvement and actions
4. Document references and sources
5. ChittyID associations for all entities
6. Causal relationships between events
7. Supporting evidence for each entry

Format as a detailed investigative timeline.`);

    const chain = prompt.pipe(this.anthropicChat).pipe(this.outputParser);

    try {
      const result = await chain.invoke({
        topic,
        dateRange: JSON.stringify(dateRange),
        entities: JSON.stringify(entities),
        events: JSON.stringify(events),
      });

      return {
        timeline: result,
        timelineId: await this.generateChittyIdForTimeline(),
        timestamp: new Date().toISOString(),
        topic,
        scope: { dateRange, entities },
      };
    } catch (error) {
      console.error("Error generating timeline:", error);
      throw error;
    }
  }

  /**
   * Compliance Analysis
   */
  async analyzeCompliance(request) {
    const { entity, regulations, scope, documents } = request;

    const prompt = ChatPromptTemplate.fromTemplate(`
Analyze compliance status for the following entity:

Entity: {entity}
Applicable Regulations: {regulations}
Compliance Scope: {scope}
Supporting Documents: {documents}

Provide a comprehensive compliance analysis including:
1. Current compliance status assessment
2. Regulatory gaps and violations
3. Required remediation actions
4. Timeline for compliance achievement
5. ChittyFoundation standard alignment
6. Ongoing monitoring requirements
7. Risk mitigation strategies

Format as an executive compliance report.`);

    const chain = prompt.pipe(this.anthropicChat).pipe(this.outputParser);

    try {
      const result = await chain.invoke({
        entity,
        regulations: JSON.stringify(regulations),
        scope: JSON.stringify(scope),
        documents: JSON.stringify(documents),
      });

      return {
        complianceAnalysis: result,
        analysisId: await this.generateChittyIdForCompliance(),
        timestamp: new Date().toISOString(),
        entity,
        regulations,
      };
    } catch (error) {
      console.error("Error analyzing compliance:", error);
      throw error;
    }
  }

  /**
   * Generate ChittyIDs for different analysis types
   */
  async generateChittyIdForAnalysis(analysisType) {
    try {
      const response = await fetch(`${this.env.CHITTY_SERVER_URL}/v1/mint`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.env.CHITTY_API_KEY}`,
        },
        body: JSON.stringify({
          type: "INFO",
          namespace: "LEGAL",
          purpose: `analysis_${analysisType}`,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        return result.chittyId;
      }
    } catch (error) {
      console.warn("ChittyID generation failed:", error);
    }

    return `TEMP-LEGAL-${Date.now()}`;
  }

  async generateChittyIdForTrace() {
    return this.generateChittyIdForType("TRACE", "FINANCIAL");
  }

  async generateChittyIdForDocument(docType) {
    return this.generateChittyIdForType("PROP", `DOC_${docType.toUpperCase()}`);
  }

  async generateChittyIdForEvidence() {
    return this.generateChittyIdForType("EVNT", "EVIDENCE");
  }

  async generateChittyIdForTimeline() {
    return this.generateChittyIdForType("EVNT", "TIMELINE");
  }

  async generateChittyIdForCompliance() {
    return this.generateChittyIdForType("AUTH", "COMPLIANCE");
  }

  async generateChittyIdForType(type, namespace) {
    try {
      const response = await fetch(`${this.env.CHITTY_SERVER_URL}/v1/mint`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.env.CHITTY_API_KEY}`,
        },
        body: JSON.stringify({
          type,
          namespace,
          purpose: "langchain_ai_service",
        }),
      });

      if (response.ok) {
        const result = await response.json();
        return result.chittyId;
      }
    } catch (error) {
      console.warn("ChittyID generation failed:", error);
    }

    return `TEMP-${type}-${Date.now()}`;
  }

  /**
   * Health check for LangChain AI service
   */
  async healthCheck() {
    try {
      const testPrompt = ChatPromptTemplate.fromTemplate(
        "Respond with 'OK' if you can process this message: {message}",
      );
      const chain = testPrompt.pipe(this.anthropicChat).pipe(this.outputParser);

      const result = await chain.invoke({ message: "Health check test" });

      return {
        status: result.includes("OK") ? "healthy" : "degraded",
        timestamp: new Date().toISOString(),
        models: {
          anthropic: "available",
          openai: "available",
        },
        capabilities: [
          "legal_analysis",
          "fund_tracing",
          "document_generation",
          "evidence_compilation",
          "timeline_generation",
          "compliance_analysis",
        ],
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

export default LangChainAIService;
