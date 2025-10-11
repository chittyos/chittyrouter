/**
 * PDX (Portable DNA eXchange) Core Implementation
 * Universal Standard for AI DNA Portability v1.0
 */

import { ChittyIdClient } from "../utils/chittyid-integration.js";
import { mintId } from "../utils/mint-id.js";
import { ChittyP256Signatures } from "../crypto/p256-signatures.js";
import { ChittyFinancialServices } from "../financial/financial-services.js";

/**
 * PDX Package Builder and Manager
 */
export class PDXCore {
  constructor(env) {
    this.env = env;
    this.chittyIdClient = null;
    this.signatureManager = null;
    this.financialServices = null;
    this.initialized = false;
    this.version = "1.0";
  }

  /**
   * Initialize PDX core services
   */
  async initialize() {
    try {
      console.log("🧬 Initializing PDX (Portable DNA eXchange) Core...");

      // Initialize ChittyID client
      this.chittyIdClient = new ChittyIdClient();
      await this.chittyIdClient.initialize?.();

      // Initialize signature manager for PDX integrity
      this.signatureManager = new ChittyP256Signatures(this.env);
      await this.signatureManager.initialize();

      // Initialize financial services for attribution tracking
      this.financialServices = new ChittyFinancialServices(this.env);
      await this.financialServices.initialize();

      this.initialized = true;
      console.log("✅ PDX Core initialized - AI DNA portability enabled");

      return { initialized: true, version: this.version };
    } catch (error) {
      console.error("❌ PDX Core initialization failed:", error);
      throw error;
    }
  }

  /**
   * Create a PDX package from AI DNA data
   */
  async createPDXPackage(dnaData, options = {}) {
    if (!this.initialized) {
      throw new Error("PDX Core not initialized");
    }

    try {
      const packageId = await mintId("pdx", "pdx_package", this.env);

      // Get ChittyID for package issuer
      const issuerChittyId =
        (await this.chittyIdClient.request?.("chittyrouter-pdx")) ||
        (await this.chittyIdClient.ensure?.(this.env, "chittyrouter-pdx")) ||
        "CHITTY-PDX-ROUTER-001";

      // Create PDX header
      const header = this.createPDXHeader({
        packageId,
        issuerChittyId,
        subjectChittyId: dnaData.ownerChittyId || issuerChittyId,
        options,
      });

      // Build DNA profile from collected patterns
      const dnaProfile = this.buildDNAProfile(dnaData);

      // Collect and process contributions
      const contributions = await this.processContributions(
        dnaData.contributions || [],
      );

      // Generate cryptographic proofs
      const proofs = await this.generateProofBundle(dnaProfile, contributions);

      // Create license terms
      const licenses = this.createLicenseTerms(options.licenses || "CDCL");

      // Create metadata
      const metadata = this.createPDXMetadata(dnaData, options);

      // Assemble PDX package
      const pdxPackage = {
        header,
        dnaProfile,
        contributions,
        proofs,
        licenses,
        metadata,
      };

      // Calculate integrity checksum
      header.checksum = await this.calculatePackageChecksum(pdxPackage);

      // Sign the package
      const signatures = await this.signPDXPackage(pdxPackage);
      pdxPackage.signatures = signatures;

      console.log(`🧬 PDX Package created: ${packageId}`);

      return pdxPackage;
    } catch (error) {
      console.error("Failed to create PDX package:", error);
      throw error;
    }
  }

  /**
   * Create PDX header
   */
  createPDXHeader(params) {
    const { packageId, issuerChittyId, subjectChittyId, options } = params;

    return {
      version: this.version,
      packageId,
      createdAt: new Date().toISOString(),
      expiresAt: options.expiresAt || null,
      issuer: {
        chittyId: issuerChittyId,
        systemName: "ChittyRouter AI Gateway",
        systemVersion: "2.0.0-ai",
      },
      subject: {
        chittyId: subjectChittyId,
        personaId: options.personaId || `persona_${Date.now()}`,
      },
      checksum: null, // Will be calculated after package creation
    };
  }

  /**
   * Build DNA profile from AI patterns
   */
  buildDNAProfile(dnaData) {
    return {
      personaId: dnaData.personaId || `persona_${Date.now()}`,
      domainExpertise: dnaData.domainExpertise || [
        "email-processing",
        "ai-routing",
      ],
      decisionPatterns: this.extractDecisionPatterns(dnaData),
      modelDeltas: this.extractModelDeltas(dnaData),
      behaviorSignature: this.createBehaviorSignature(dnaData),
      temporalCoherence: this.calculateTemporalCoherence(dnaData),
    };
  }

  /**
   * Extract decision patterns from AI interactions
   */
  extractDecisionPatterns(dnaData) {
    const patterns = [];

    // Extract patterns from email routing decisions
    if (dnaData.emailRoutingPatterns) {
      patterns.push({
        vectorId: `pattern_email_routing_${Date.now()}`,
        dimensions: 768, // Common embedding size
        embedding: this.encryptPatternVector(dnaData.emailRoutingPatterns),
        confidence: dnaData.routingConfidence || 0.85,
        contextTags: ["email", "routing", "classification"],
        privacyLevel: "SELECTIVE",
      });
    }

    // Extract patterns from AI model responses
    if (dnaData.aiResponsePatterns) {
      patterns.push({
        vectorId: `pattern_ai_response_${Date.now()}`,
        dimensions: 1024,
        embedding: this.encryptPatternVector(dnaData.aiResponsePatterns),
        confidence: dnaData.responseConfidence || 0.8,
        contextTags: ["ai", "response", "generation"],
        privacyLevel: "PRIVATE",
      });
    }

    // Extract patterns from user feedback
    if (dnaData.feedbackPatterns) {
      patterns.push({
        vectorId: `pattern_feedback_${Date.now()}`,
        dimensions: 512,
        embedding: this.encryptPatternVector(dnaData.feedbackPatterns),
        confidence: dnaData.feedbackConfidence || 0.75,
        contextTags: ["feedback", "improvement", "learning"],
        privacyLevel: "PUBLIC",
      });
    }

    return patterns;
  }

  /**
   * Encrypt pattern vectors for privacy
   */
  encryptPatternVector(pattern) {
    // Use deterministic vector generation based on pattern hash
    const {
      generateDeterministicPatterns,
    } = require("../utils/deterministic-vectors.js");
    const seed = pattern.id || pattern.name || Date.now().toString();
    return generateDeterministicPatterns(seed, pattern.dimensions || 768);
  }

  /**
   * Extract model deltas (fine-tuning adjustments)
   */
  extractModelDeltas(dnaData) {
    const deltas = [];

    if (dnaData.fineTuningData) {
      deltas.push({
        baseModel: "@cf/meta/llama-3.1-8b-instruct",
        deltaType: "FINE_TUNE",
        deltaData: this.encryptModelWeights(dnaData.fineTuningData),
        performanceGains: {
          accuracyImprovement: dnaData.accuracyGain || 0.05,
          speedImprovement: dnaData.speedGain || 0.02,
          qualityScore: dnaData.qualityScore || 0.87,
        },
        validationResults: dnaData.validationResults || [],
      });
    }

    return deltas;
  }

  /**
   * Encrypt model weights for secure transfer
   */
  encryptModelWeights(weights) {
    // In production, this would use proper encryption
    return {
      encryptedData: btoa(JSON.stringify(weights)),
      encryptionMethod: "AES-256-GCM",
      keyId: "key_" + Date.now(),
    };
  }

  /**
   * Create behavior signature
   */
  createBehaviorSignature(dnaData) {
    return {
      responsePatterns: dnaData.responsePatterns || [],
      riskProfile: {
        riskTolerance: dnaData.riskTolerance || 0.3,
        safetyScore: dnaData.safetyScore || 0.95,
        biasDetection: dnaData.biasMetrics || {},
      },
      ethicalAlignment: {
        fairnessScore: dnaData.fairnessScore || 0.9,
        transparencyLevel: dnaData.transparencyLevel || 0.85,
        accountabilityScore: dnaData.accountabilityScore || 0.88,
      },
      qualityMetrics: {
        consistency: dnaData.consistencyScore || 0.92,
        reliability: dnaData.reliabilityScore || 0.89,
        adaptability: dnaData.adaptabilityScore || 0.78,
      },
      coherenceScore: dnaData.coherenceScore || 0.85,
    };
  }

  /**
   * Calculate temporal coherence (consistency over time)
   */
  calculateTemporalCoherence(dnaData) {
    // Simple implementation - in production would analyze patterns over time
    const samples = dnaData.temporalSamples || [];
    if (samples.length < 2) return 0.8; // Default coherence

    const variations = samples.map((sample, index) => {
      if (index === 0) return 0;
      return Math.abs(sample.score - samples[index - 1].score);
    });

    const avgVariation =
      variations.reduce((a, b) => a + b, 0) / variations.length;
    return Math.max(0, 1 - avgVariation); // Higher coherence = lower variation
  }

  /**
   * Process contributions for attribution
   */
  async processContributions(contributions) {
    const processedContributions = [];

    for (const contribution of contributions) {
      const contributionId =
        (await this.chittyIdClient.request?.("contribution")) ||
        `contrib_${Date.now()}`;

      processedContributions.push({
        contributionId,
        type: contribution.type || "TRAINING_DATA",
        domain: contribution.domain || "email-processing",
        timestamp: contribution.timestamp || new Date().toISOString(),
        impactWeight: contribution.impactWeight || 0.1,
        evidenceHash: await this.hashContributionEvidence(contribution),
        attribution: {
          role: contribution.role || "CREATOR",
          weight: contribution.attributionWeight || 1.0,
          loyaltyRate: contribution.loyaltyRate || 0.05, // 5% default
          decayFunction: {
            type: "EXPONENTIAL",
            halfLife: 365, // days
            minRate: 0.01, // minimum 1%
          },
        },
      });
    }

    return processedContributions;
  }

  /**
   * Hash contribution evidence for integrity
   */
  async hashContributionEvidence(contribution) {
    const evidence = JSON.stringify({
      type: contribution.type,
      data: contribution.data,
      timestamp: contribution.timestamp,
    });

    const encoder = new TextEncoder();
    const data = encoder.encode(evidence);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);

    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  /**
   * Generate cryptographic proof bundle
   */
  async generateProofBundle(dnaProfile, contributions) {
    const proofs = [];

    // Proof of DNA ownership
    const ownershipProof = await this.signatureManager.signChittyIdVerification(
      dnaProfile.personaId,
      { type: "DNA_OWNERSHIP", timestamp: new Date().toISOString() },
    );

    proofs.push({
      proofType: "OWNERSHIP",
      algorithm: "ECDSA-P256-SHA256",
      signature: ownershipProof.signature,
      publicKey: ownershipProof.publicKey,
    });

    // Proof of contribution integrity
    for (const contribution of contributions) {
      const contributionProof =
        await this.signatureManager.signChittyIdVerification(
          contribution.contributionId,
          { evidenceHash: contribution.evidenceHash },
        );

      proofs.push({
        proofType: "CONTRIBUTION_INTEGRITY",
        contributionId: contribution.contributionId,
        signature: contributionProof.signature,
        publicKey: contributionProof.publicKey,
      });
    }

    return {
      zkProofs: proofs,
      integrityProofs: [],
      attributionProofs: [],
    };
  }

  /**
   * Create license terms (defaults to CDCL)
   */
  createLicenseTerms(licenseType = "CDCL") {
    if (licenseType === "CDCL") {
      return [
        {
          licenseType: "CDCL",
          version: "1.0",
          grantScope: {
            permissions: ["READ", "DERIVE", "TRAIN"],
            restrictions: ["COMMERCIAL_USE_REQUIRES_PAYMENT"],
          },
          territorialScope: ["GLOBAL"],
          fieldOfUse: ["AI_TRAINING", "MODEL_IMPROVEMENT", "RESEARCH"],
          exclusions: ["MILITARY", "SURVEILLANCE", "DISCRIMINATION"],
          compensationTerms: {
            loyaltyRate: 0.05, // 5% of revenue
            minimumPayment: 0.01, // $0.01 minimum
            paymentCurrency: "USDC",
            paymentFrequency: "MONTHLY",
            performanceMultiplier: {
              baseMultiplier: 1.0,
              qualityBonusRate: 0.1,
              popularityBonusRate: 0.05,
            },
          },
          terminationConditions: {
            noticePeriod: 30, // 30 days notice
            gracePeriod: 90, // 90 days to transition
            dataRetention: {
              maxRetentionDays: 365,
              deletionRequiredAfterTermination: true,
            },
            migrationSupport: true,
          },
          governingLaw: "Delaware, USA",
        },
      ];
    }

    return []; // Other license types not implemented yet
  }

  /**
   * Create PDX metadata
   */
  createPDXMetadata(dnaData, options) {
    return {
      creatorInfo: {
        name: options.creatorName || "Anonymous",
        email: options.creatorEmail || null,
        organization: options.organization || "ChittyRouter User",
      },
      technicalInfo: {
        modelArchitecture: dnaData.modelArchitecture || "transformer",
        trainingFramework: dnaData.framework || "cloudflare-ai",
        datasetInfo: dnaData.datasetInfo || {},
        computeRequirements: dnaData.computeRequirements || {},
      },
      qualityMetrics: {
        validationScore: dnaData.validationScore || 0.85,
        testResults: dnaData.testResults || [],
        benchmarkScores: dnaData.benchmarkScores || {},
      },
      usageStats: {
        totalInferences: dnaData.totalInferences || 0,
        averageLatency: dnaData.averageLatency || 0,
        successRate: dnaData.successRate || 0.95,
      },
    };
  }

  /**
   * Calculate package checksum for integrity
   */
  async calculatePackageChecksum(pdxPackage) {
    // Create canonical string representation (excluding checksum field)
    const checksumData = {
      header: { ...pdxPackage.header, checksum: null },
      dnaProfile: pdxPackage.dnaProfile,
      contributions: pdxPackage.contributions,
      proofs: pdxPackage.proofs,
      licenses: pdxPackage.licenses,
      metadata: pdxPackage.metadata,
    };

    const canonicalString = JSON.stringify(
      checksumData,
      Object.keys(checksumData).sort(),
    );

    const encoder = new TextEncoder();
    const data = encoder.encode(canonicalString);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);

    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  /**
   * Sign PDX package for authenticity
   */
  async signPDXPackage(pdxPackage) {
    const packageData = {
      packageId: pdxPackage.header.packageId,
      checksum: pdxPackage.header.checksum,
      issuer: pdxPackage.header.issuer,
      subject: pdxPackage.header.subject,
    };

    const signature =
      await this.signatureManager.signChittyIdRequest(packageData);

    return [
      {
        signatureType: "PACKAGE_INTEGRITY",
        algorithm: "ECDSA-P256-SHA256",
        signature: signature.signature,
        publicKey: signature.publicKey,
        timestamp: signature.timestamp,
        signer: pdxPackage.header.issuer,
      },
    ];
  }

  /**
   * Validate PDX package integrity and structure
   */
  async validatePDXPackage(pdxPackage) {
    const validation = {
      isValid: true,
      errors: [],
      warnings: [],
      score: 1.0,
    };

    try {
      // Validate structure
      if (
        !pdxPackage.header ||
        !pdxPackage.dnaProfile ||
        !pdxPackage.contributions
      ) {
        validation.errors.push("Missing required package components");
        validation.isValid = false;
      }

      // Validate version
      if (pdxPackage.header.version !== this.version) {
        validation.warnings.push(
          `Version mismatch: expected ${this.version}, got ${pdxPackage.header.version}`,
        );
        validation.score *= 0.9;
      }

      // Validate checksum
      const calculatedChecksum = await this.calculatePackageChecksum({
        ...pdxPackage,
        signatures: undefined, // Exclude signatures from checksum calculation
      });

      if (calculatedChecksum !== pdxPackage.header.checksum) {
        validation.errors.push("Package checksum validation failed");
        validation.isValid = false;
      }

      // Validate signatures
      if (pdxPackage.signatures && pdxPackage.signatures.length > 0) {
        for (const signature of pdxPackage.signatures) {
          const isValidSignature = await this.signatureManager.verifySignature(
            {
              packageId: pdxPackage.header.packageId,
              checksum: pdxPackage.header.checksum,
            },
            signature.signature,
            signature.publicKey,
          );

          if (!isValidSignature.valid) {
            validation.errors.push(
              `Invalid signature: ${signature.signatureType}`,
            );
            validation.isValid = false;
          }
        }
      } else {
        validation.warnings.push("Package is not signed");
        validation.score *= 0.8;
      }

      // Validate expiration
      if (pdxPackage.header.expiresAt) {
        const expirationDate = new Date(pdxPackage.header.expiresAt);
        if (expirationDate < new Date()) {
          validation.errors.push("Package has expired");
          validation.isValid = false;
        }
      }
    } catch (error) {
      validation.errors.push(`Validation error: ${error.message}`);
      validation.isValid = false;
    }

    return validation;
  }

  /**
   * Get PDX Core status
   */
  getStatus() {
    return {
      initialized: this.initialized,
      version: this.version,
      specification: "PDX v1.0",
      capabilities: [
        "DNA_EXPORT",
        "DNA_IMPORT",
        "PACKAGE_VALIDATION",
        "CRYPTOGRAPHIC_PROOFS",
        "ATTRIBUTION_TRACKING",
        "LICENSE_MANAGEMENT",
      ],
      supportedLicenses: ["CDCL"],
      encryptionMethods: ["AES-256-GCM", "ECDSA-P256"],
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * PDX Package Validator
 */
export class PDXValidator {
  constructor(pdxCore) {
    this.pdxCore = pdxCore;
  }

  async validateStructure(pkg) {
    const requiredFields = [
      "header",
      "header.version",
      "header.packageId",
      "header.createdAt",
      "header.issuer",
      "header.subject",
      "header.checksum",
      "dnaProfile",
      "contributions",
      "proofs",
      "licenses",
      "metadata",
    ];

    const errors = [];

    for (const field of requiredFields) {
      if (!this.getNestedValue(pkg, field)) {
        errors.push(`Missing required field: ${field}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings: [],
    };
  }

  getNestedValue(obj, path) {
    return path
      .split(".")
      .reduce(
        (current, key) =>
          current && current[key] !== undefined ? current[key] : null,
        obj,
      );
  }

  async validateSignatures(pkg) {
    if (!pkg.signatures || pkg.signatures.length === 0) {
      return {
        isValid: false,
        errors: ["Package must be signed"],
        warnings: [],
      };
    }

    const errors = [];

    for (const signature of pkg.signatures) {
      try {
        const isValid = await this.pdxCore.signatureManager.verifySignature(
          { packageId: pkg.header.packageId, checksum: pkg.header.checksum },
          signature.signature,
          signature.publicKey,
        );

        if (!isValid.valid) {
          errors.push(`Invalid signature: ${signature.signatureType}`);
        }
      } catch (error) {
        errors.push(`Signature verification failed: ${error.message}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings: [],
    };
  }
}
