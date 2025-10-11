/**
 * Deterministic Vector Generation
 * Replaces Math.random() with seeded PRNG for reproducible embeddings
 */

/**
 * Seeded pseudo-random number generator (Mulberry32)
 * Fast, deterministic PRNG suitable for vector generation
 */
function seededRandom(seed) {
  return function () {
    seed = (seed * 1664525 + 1013904223) | 0;
    const t = (seed + 0x6d2b79f5) | 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Hash string to 32-bit integer seed
 */
function hashToSeed(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

/**
 * Generate deterministic vector from content hash
 */
export function hashToDeterministicVector(contentHash, dimensions = 768) {
  const seed = hashToSeed(contentHash);
  const rng = seededRandom(seed);
  return new Array(dimensions).fill(0).map(() => rng() * 2 - 1);
}

/**
 * Generate deterministic vector from ChittyID
 */
export function chittyIdToVector(chittyId, dimensions = 768) {
  const seed = hashToSeed(chittyId);
  const rng = seededRandom(seed);
  return new Array(dimensions).fill(0).map(() => rng() * 2 - 1);
}

/**
 * Generate deterministic patterns from seed
 */
export function generateDeterministicPatterns(seed, dimensions = 768) {
  const numSeed = typeof seed === "string" ? hashToSeed(seed) : seed;
  const rng = seededRandom(numSeed);
  return new Array(dimensions).fill(0).map(() => rng() * 2 - 1);
}

export default {
  hashToDeterministicVector,
  chittyIdToVector,
  generateDeterministicPatterns,
};
