/**
 * Cloudflare Randomness Beacon Integration
 * Provides cryptographically secure randomness via drand
 */

/**
 * Get cryptographically secure random value from Cloudflare Randomness Beacon
 * Falls back to Web Crypto API if beacon unavailable
 */
export async function getCloudflareRandomness(env) {
  // Check if randomness beacon is enabled
  if (env?.RANDOMNESS_BEACON !== "true") {
    return crypto.getRandomValues(new Uint32Array(1))[0] / 0xffffffff;
  }

  try {
    const response = await fetch("https://drand.cloudflare.com/public/latest", {
      signal: AbortSignal.timeout(2000), // 2s timeout
    });

    if (!response.ok) {
      throw new Error(`Beacon returned ${response.status}`);
    }

    const data = await response.json();
    return parseInt(data.randomness.slice(0, 16), 16) / 0xffffffffffffffff;
  } catch (error) {
    console.warn(
      "Cloudflare Randomness Beacon unavailable, using crypto.getRandomValues:",
      error.message,
    );
    return crypto.getRandomValues(new Uint32Array(1))[0] / 0xffffffff;
  }
}

export default { getCloudflareRandomness };
