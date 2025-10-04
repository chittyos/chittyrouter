/**
 * Litigation Module Entry Point for ChittyRouter
 *
 * Integrates litigation-specific capabilities into ChittyRouter per §36 principle:
 * - Evidence ingestion orchestration
 * - Litigation-aware routing
 * - Service-based evidence processing
 * - Multi-model AI analysis for legal workflows
 */

export { EvidenceIngestionOrchestrator } from "./evidence-ingestion-orchestrator.js";
export { LitigationRouterExtension } from "./litigation-router-extension.js";

/**
 * Factory function to create litigation-enabled router instance
 */
export async function createLitigationRouter(ai, env) {
  const { LitigationRouterExtension } = await import(
    "./litigation-router-extension.js"
  );
  return new LitigationRouterExtension(ai, env);
}

/**
 * Configuration for litigation workflows
 */
export const LitigationConfig = {
  // Evidence processing settings
  evidence: {
    auto_mint_chittyid: true,
    require_verification: true,
    enable_ai_analysis: true,
    significance_threshold: 4, // Trigger AI analysis for evidence with significance >= 4
  },

  // Case management settings
  cases: {
    active_cases: [
      {
        case_number: "2024D007847",
        case_name: "Arias v. Bianchi",
        court: "Cook County Circuit Court",
        status: "active",
      },
      {
        case_number: "2023D003456",
        case_name: "Guzman v. Castillo",
        court: "Cook County Circuit Court",
        status: "active",
      },
    ],
  },

  // Attorney transition settings
  transitions: {
    vanguard_associates: {
      attorneys: ["Rob", "Kimber"],
      extraction_script: "EXECUTE_BIANCHI_EXTRACTION.sh",
      dropbox_sync: true,
      case_numbers: ["2024D007847"],
    },
  },

  // ARDC complaint settings
  ardc: {
    auto_process: true,
    evidence_validation: true,
    timeline_generation: true,
  },

  // ChittyOS service integration
  services: {
    registry_url: "https://registry.chitty.cc",
    chittyid_url: "https://id.chitty.cc",
    schema_service: "chittyschema",
    verify_service: "chittyverify",
    check_service: "chittycheck",
    canon_service: "chittycanon",
    cases_service: "chittycases", // Located in CHICAGOAPPS/chittycases - scrapes Cook County dockets
  },

  // AI routing settings per §23
  ai_routing: {
    enforce_chittyrouter: true,
    no_direct_providers: true,
    models: ["claude", "gpt", "gemini", "llama"],
    consensus_threshold: 0.7,
  },
};
