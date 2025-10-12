/**
 * Governance Context Module
 * Lightweight adapter for ChittyGov integration with persistent agents
 * Provides business authorities, compliance rules, and governance context
 */

export class GovernanceContext {
  constructor(options = {}) {
    this.governanceEndpoint =
      options.governanceEndpoint || "https://gov.chitty.cc";
    this.enableCompliance = options.enableCompliance !== false;
    this.cacheTimeout = options.cacheTimeout || 3600000; // 1 hour
    this.cache = new Map();
  }

  /**
   * Get governance context for a legal case
   */
  async getLegalContext(caseId, jurisdiction) {
    const cacheKey = `legal:${caseId}:${jurisdiction}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    const context = {
      jurisdiction: this.getJurisdictionRules(jurisdiction),
      authorities: this.getLegalAuthorities(jurisdiction),
      compliance: this.getComplianceRequirements(jurisdiction),
      ethicsRules: this.getEthicsRules(jurisdiction),
    };

    this.setCache(cacheKey, context);
    return context;
  }

  /**
   * Get Illinois-specific legal rules (for ARIAS v. BIANCHI context)
   */
  getJurisdictionRules(jurisdiction) {
    const rules = {
      IL: {
        name: "Illinois",
        court_system: "Cook County Circuit Court",
        rules_of_professional_conduct: {
          competence: "Illinois Rule 1.1 - Duty of Competence",
          diligence: "Illinois Rule 1.3 - Duty of Diligence",
          communication: "Illinois Rule 1.4 - Duty to Communicate",
          confidentiality: "Illinois Rule 1.6 - Confidentiality",
          conflicts: "Illinois Rule 1.7 - Conflicts of Interest",
          fees: "Illinois Rule 1.5 - Fees",
          withdrawal:
            "Illinois Rule 1.16 - Declining/Terminating Representation",
        },
        divorce_law: {
          grounds: "No-fault (Irreconcilable Differences)",
          residency: "90 days",
          separation: "6 months (if contested)",
          property_division: "Equitable distribution",
          maintenance: "Duration-based formula",
        },
        filing_deadlines: {
          answer: "30 days from service",
          discovery_response: "28 days",
          motion_response: "Varies by motion type",
        },
      },
      default: {
        name: "United States (Federal)",
        court_system: "Federal Courts",
        rules_of_professional_conduct: {
          model_rules: "ABA Model Rules of Professional Conduct",
        },
      },
    };

    return rules[jurisdiction] || rules.default;
  }

  /**
   * Get relevant legal authorities (cases, statutes, regulations)
   */
  getLegalAuthorities(jurisdiction) {
    const authorities = {
      IL: {
        statutes: {
          marriage_dissolution:
            "750 ILCS 5/ - Illinois Marriage and Dissolution of Marriage Act",
          ethics:
            "Illinois Supreme Court Rules, Article VIII - Rules of Professional Conduct",
        },
        key_cases: {
          in_re_marriage_of_eckert: {
            citation: "In re Marriage of Eckert, 119 Ill.2d 316 (1988)",
            holding: "Property division must be equitable, not equal",
          },
          in_re_marriage_of_weinstein: {
            citation: "In re Marriage of Weinstein, 128 Ill.2d 83 (1989)",
            holding: "Maintenance factors and consideration",
          },
        },
        regulatory_bodies: {
          ardc: {
            name: "Illinois Attorney Registration and Disciplinary Commission",
            website: "https://www.iardc.org",
            jurisdiction: "Attorney discipline and registration",
          },
        },
      },
    };

    return (
      authorities[jurisdiction] || {
        statutes: {},
        key_cases: {},
        regulatory_bodies: {},
      }
    );
  }

  /**
   * Get compliance requirements for legal matters
   */
  getComplianceRequirements(jurisdiction) {
    return {
      attorney_client_relationship: {
        engagement_letter: "Required - establishes scope and terms",
        conflict_check: "Mandatory before representation",
        fee_agreement: "Required in writing if contingent or retainer",
      },
      communication: {
        reasonable_promptness: "Must respond to client communications promptly",
        significant_developments:
          "Must inform client of all significant case developments",
        decision_authority:
          "Client retains authority over settlement and major decisions",
      },
      confidentiality: {
        privileged_communications:
          "All attorney-client communications protected",
        work_product: "Attorney work product protected",
        exceptions: "Future crime/fraud, defending malpractice claim",
      },
      file_retention: {
        closed_files: "Minimum 7 years after case closure",
        client_property: "Must return all client property upon termination",
        destruction_notice: "Must notify client before file destruction",
      },
      trust_accounting: {
        iolta: "Client funds in separate trust account",
        segregation: "Client funds never commingled with attorney funds",
        accounting: "Detailed records required",
      },
    };
  }

  /**
   * Get ethics rules and attorney responsibilities
   */
  getEthicsRules(jurisdiction) {
    return {
      competence: {
        knowledge: "Attorney must have requisite legal knowledge",
        skill: "Attorney must have requisite skill",
        thoroughness: "Must conduct reasonably thorough investigation",
        preparation: "Must be adequately prepared",
        continuing_education: "Must maintain competence through CLE",
      },
      diligence: {
        reasonable_diligence: "Must act with commitment and dedication",
        promptness: "Must act without procrastination",
        follow_through: "Must complete representation",
      },
      communication: {
        keep_informed: "Keep client reasonably informed",
        explain_matters: "Explain matters to permit informed decisions",
        respond_promptly: "Respond to reasonable requests for information",
      },
      withdrawal: {
        mandatory_withdrawal: [
          "Client using services for illegal activity",
          "Attorney incapacitated",
        ],
        permissive_withdrawal: [
          "Client fails to fulfill obligations",
          "Representation unreasonably difficult",
          "Client insists on illegal conduct",
        ],
        notice_required: "Must give reasonable notice before withdrawal",
        court_approval: "Court approval required if litigation pending",
      },
    };
  }

  /**
   * Check if action complies with ethics rules
   */
  async checkCompliance(action, context) {
    if (!this.enableCompliance) {
      return { compliant: true, warnings: [], blockers: [] };
    }

    const warnings = [];
    const blockers = [];

    // Check for attorney communication requirements
    if (context.daysWithoutContact && context.daysWithoutContact > 14) {
      warnings.push(
        "14+ days without client contact may violate Rule 1.4 (Communication)",
      );
    }

    if (context.daysWithoutContact && context.daysWithoutContact > 30) {
      blockers.push(
        "30+ days without contact likely violates Rule 1.4 - immediate action required",
      );
    }

    // Check for competence issues
    if (context.filingErrors && context.filingErrors > 2) {
      warnings.push(
        "Multiple filing errors may indicate competence issues (Rule 1.1)",
      );
    }

    // Check for diligence issues
    if (context.missedDeadlines && context.missedDeadlines > 0) {
      blockers.push(
        `${context.missedDeadlines} missed deadline(s) - potential Rule 1.3 violation`,
      );
    }

    return {
      compliant: blockers.length === 0,
      warnings,
      blockers,
    };
  }

  /**
   * Enrich agent context with governance information
   */
  async enrichContext(messages, metadata) {
    if (!metadata.case_id && !metadata.jurisdiction) {
      return messages; // No enrichment needed
    }

    const jurisdiction = metadata.jurisdiction || "IL";
    const legalContext = await this.getLegalContext(
      metadata.case_id,
      jurisdiction,
    );

    // Add governance context as system message
    const governanceMessage = {
      role: "system",
      content: `GOVERNANCE CONTEXT:
Jurisdiction: ${legalContext.jurisdiction.name}
Court System: ${legalContext.jurisdiction.court_system}

Key Professional Responsibilities:
- Competence (Rule 1.1): ${legalContext.jurisdiction.rules_of_professional_conduct.competence}
- Diligence (Rule 1.3): ${legalContext.jurisdiction.rules_of_professional_conduct.diligence}
- Communication (Rule 1.4): ${legalContext.jurisdiction.rules_of_professional_conduct.communication}

Filing Deadlines:
- Answer: ${legalContext.jurisdiction.filing_deadlines?.answer}
- Discovery Response: ${legalContext.jurisdiction.filing_deadlines?.discovery_response}

Compliance Requirements:
- Attorney-client engagement letter required
- Conflict check mandatory before representation
- Client communications must be reasonably prompt
- File retention minimum 7 years`,
    };

    // Insert at beginning (after any existing system messages)
    const firstUserIndex = messages.findIndex((m) => m.role === "user");
    if (firstUserIndex > 0) {
      messages.splice(firstUserIndex, 0, governanceMessage);
    } else {
      messages.unshift(governanceMessage);
    }

    return messages;
  }

  /**
   * Cache management
   */
  getCached(key) {
    const cached = this.cache.get(key);
    if (!cached) return null;

    if (Date.now() - cached.timestamp > this.cacheTimeout) {
      this.cache.delete(key);
      return null;
    }

    return cached.data;
  }

  setCache(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  clearCache() {
    this.cache.clear();
  }
}
