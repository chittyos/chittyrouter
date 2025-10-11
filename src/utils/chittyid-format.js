/**
 * ChittyID Format Validation Utilities
 *
 * Provides format validation, parsing, and validation helpers for ChittyID strings.
 * All ChittyIDs MUST be minted from id.chitty.cc - this utility only validates format.
 *
 * Format: XX-Y-ZZZ-AAAA-B-CCCCCC-DDDD-E
 * Example: 01-1-PEO-2024-L-102458-1-7
 */

/**
 * Canonical ChittyID regex pattern
 * Format: XX-Y-ZZZ-AAAA-B-CCCCCC-DDDD-E
 * - XX: 2-digit region/version code
 * - Y: Single digit category
 * - ZZZ: 3-letter entity type (PEO, PLACE, PROP, EVNT, AUTH, INFO, FACT, CONTEXT, ACTOR)
 * - AAAA: 4-digit year
 * - B: Single letter jurisdiction/region
 * - CCCCCC: 6-digit sequence number
 * - DDDD+: Variable-length checksum/hash
 * - E: Single-digit verification code
 */
export const CHITTY_ID_RX =
  /^[0-9]{2}-[0-9]-[A-Z]{3,7}-[0-9]{4}-[A-Z]-[0-9]{6}-[0-9]+-[0-9]+$/;

/**
 * Alternative ChittyID format (legacy support)
 * Format: CT-XX-Y-ZZZ-AAAA-B-CCCC-D-E
 */
export const CHITTY_ID_ALT_RX =
  /^CT-[0-9]{2}-[0-9]-[A-Z]{3}-[0-9]{4}-[A-Z]-[0-9]{4,6}-[A-Z]-[0-9]+$/;

/**
 * Pending ChittyID format (fallback when service unavailable)
 * Format: pending-{entity}-{timestamp}
 */
export const PENDING_ID_RX = /^pending-[a-z]+-\d+$/;

/**
 * Allowed ChittyID entity types
 */
export const CHITTYID_ENTITIES = new Set([
  "PEO", // Person
  "PLACE", // Location
  "PROP", // Property/Thing
  "EVNT", // Event
  "AUTH", // Authorization
  "INFO", // Information
  "FACT", // Fact/Evidence
  "CONTEXT", // Context/Case
  "ACTOR", // Actor/Participant
  "APIKEY", // API Key
  "SESSN", // Session
]);

/**
 * Check if a string matches valid ChittyID format
 *
 * @param {string} id - The ID to validate
 * @param {boolean} allowPending - Whether to allow pending-* format (default: false)
 * @returns {boolean} True if format is valid
 */
export function isValidChittyIDFormat(id, allowPending = false) {
  if (!id || typeof id !== "string") {
    return false;
  }

  // Check canonical format
  if (CHITTY_ID_RX.test(id)) {
    return true;
  }

  // Check alternative format
  if (CHITTY_ID_ALT_RX.test(id)) {
    return true;
  }

  // Check pending format if allowed
  if (allowPending && PENDING_ID_RX.test(id)) {
    return true;
  }

  return false;
}

/**
 * Validate ChittyID format and throw error if invalid
 *
 * @param {string} id - The ID to validate
 * @param {object} options - Validation options
 * @param {boolean} options.allowPending - Allow pending-* format (default: false)
 * @param {string} options.fieldName - Name of field for error message (default: 'ChittyID')
 * @throws {Error} If ID format is invalid
 * @returns {true} Returns true if valid
 */
export function validateChittyID(id, options = {}) {
  const { allowPending = false, fieldName = "ChittyID" } = options;

  if (!id) {
    throw new Error(`${fieldName} is required`);
  }

  if (typeof id !== "string") {
    throw new Error(`${fieldName} must be a string, got ${typeof id}`);
  }

  if (!isValidChittyIDFormat(id, allowPending)) {
    const formats = [
      "XX-Y-ZZZ-AAAA-B-CCCCCC-DDDD-E",
      "CT-XX-Y-ZZZ-AAAA-B-CCCC-D-E",
    ];
    if (allowPending) {
      formats.push("pending-{entity}-{timestamp}");
    }
    throw new Error(
      `Invalid ${fieldName} format: "${id}". Expected format: ${formats.join(" or ")}`,
    );
  }

  return true;
}

/**
 * Parse ChittyID into components
 *
 * @param {string} id - The ChittyID to parse
 * @returns {object|null} Parsed components or null if invalid
 */
export function parseChittyID(id) {
  if (!isValidChittyIDFormat(id)) {
    return null;
  }

  // Handle pending format
  if (PENDING_ID_RX.test(id)) {
    const [, entity, timestamp] = id.match(/^pending-([a-z]+)-(\d+)$/);
    return {
      type: "pending",
      entity: entity.toUpperCase(),
      timestamp: parseInt(timestamp, 10),
      isPending: true,
    };
  }

  const parts = id.split("-");

  // Canonical format: XX-Y-ZZZ-AAAA-B-CCCCCC-DDDD-E
  if (parts.length >= 8) {
    return {
      type: "canonical",
      region: parts[0],
      category: parts[1],
      entity: parts[2],
      year: parts[3],
      jurisdiction: parts[4],
      sequence: parts[5],
      checksum: parts.slice(6, -1).join("-"),
      verification: parts[parts.length - 1],
      isPending: false,
    };
  }

  // Alternative format: CT-XX-Y-ZZZ-AAAA-B-CCCC-D-E
  if (parts[0] === "CT" && parts.length >= 9) {
    return {
      type: "alternative",
      prefix: parts[0],
      region: parts[1],
      category: parts[2],
      entity: parts[3],
      year: parts[4],
      jurisdiction: parts[5],
      sequence: parts[6],
      checksumType: parts[7],
      verification: parts[8],
      isPending: false,
    };
  }

  return null;
}

/**
 * Extract entity type from ChittyID
 *
 * @param {string} id - The ChittyID
 * @returns {string|null} Entity type or null if invalid
 */
export function getEntityType(id) {
  const parsed = parseChittyID(id);
  return parsed ? parsed.entity : null;
}

/**
 * Check if ChittyID is a pending ID
 *
 * @param {string} id - The ID to check
 * @returns {boolean} True if pending format
 */
export function isPendingID(id) {
  return typeof id === "string" && PENDING_ID_RX.test(id);
}

/**
 * Validate that ChittyID is NOT a pending ID
 * Throws error if ID is in pending format
 *
 * @param {string} id - The ID to validate
 * @param {string} operation - Operation name for error message
 * @throws {Error} If ID is pending
 */
export function requireRealChittyID(id, operation = "This operation") {
  if (isPendingID(id)) {
    throw new Error(
      `${operation} requires a real ChittyID from id.chitty.cc. ` +
        `Pending ID "${id}" cannot be used. Please ensure ChittyID service is available.`,
    );
  }
  validateChittyID(id);
}

/**
 * Format ChittyID for display (adds visual separators)
 *
 * @param {string} id - The ChittyID
 * @returns {string} Formatted ID
 */
export function formatChittyID(id) {
  if (!isValidChittyIDFormat(id, true)) {
    return id;
  }

  // Already has separators
  if (id.includes("-")) {
    return id;
  }

  // Add formatting if needed
  return id;
}

/**
 * Validate entity type is allowed
 *
 * @param {string} entity - Entity type to validate
 * @returns {boolean} True if valid entity type
 */
export function isValidEntity(entity) {
  if (!entity || typeof entity !== "string") {
    return false;
  }
  return CHITTYID_ENTITIES.has(entity.toUpperCase());
}

/**
 * Get human-readable entity name
 *
 * @param {string} entity - Entity code
 * @returns {string} Human-readable name
 */
export function getEntityName(entity) {
  const names = {
    PEO: "Person",
    PLACE: "Location",
    PROP: "Property",
    EVNT: "Event",
    AUTH: "Authorization",
    INFO: "Information",
    FACT: "Fact/Evidence",
    CONTEXT: "Context/Case",
    ACTOR: "Actor",
    APIKEY: "API Key",
    SESSN: "Session",
  };
  return names[entity?.toUpperCase()] || entity;
}

/**
 * Generate validation error with helpful message
 *
 * @param {string} id - The invalid ID
 * @param {string} context - Context for error message
 * @returns {Error} Error object with detailed message
 */
export function createValidationError(id, context = "") {
  const contextMsg = context ? ` (${context})` : "";
  return new Error(
    `Invalid ChittyID format${contextMsg}: "${id}". ` +
      `ChittyIDs must be minted from id.chitty.cc. ` +
      `Expected format: XX-Y-ZZZ-AAAA-B-CCCCCC-DDDD-E or CT-XX-Y-ZZZ-AAAA-B-CCCC-D-E`,
  );
}

/**
 * Batch validate multiple ChittyIDs
 *
 * @param {string[]} ids - Array of IDs to validate
 * @param {object} options - Validation options
 * @returns {object} Validation results with valid/invalid arrays
 */
export function validateBatch(ids, options = {}) {
  const results = {
    valid: [],
    invalid: [],
    pending: [],
  };

  for (const id of ids) {
    try {
      validateChittyID(id, options);
      if (isPendingID(id)) {
        results.pending.push(id);
      } else {
        results.valid.push(id);
      }
    } catch (error) {
      results.invalid.push({ id, error: error.message });
    }
  }

  return results;
}

export default {
  CHITTY_ID_RX,
  CHITTY_ID_ALT_RX,
  PENDING_ID_RX,
  CHITTYID_ENTITIES,
  isValidChittyIDFormat,
  validateChittyID,
  parseChittyID,
  getEntityType,
  isPendingID,
  requireRealChittyID,
  formatChittyID,
  isValidEntity,
  getEntityName,
  createValidationError,
  validateBatch,
};
