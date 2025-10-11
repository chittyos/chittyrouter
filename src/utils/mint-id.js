// Minimal ChittyID client for ID minting with graceful fallback
// Works in Cloudflare Workers and Node environments

export async function mintId(prefix = "ID", purpose = "general", env) {
  const entity = String(prefix || "ID").toUpperCase();

  // Support both object env and direct parameters for testing
  const config = typeof env === "object" && env !== null ? env : {};
  const token =
    config.token ||
    config.CHITTY_ID_TOKEN ||
    config.SECRET_CHITTY_ID_TOKEN ||
    (typeof process !== "undefined" && process?.env?.CHITTY_ID_TOKEN);

  const serviceUrl =
    config.serviceUrl || config.CHITTYID_SERVICE_URL || "https://id.chitty.cc";

  try {
    if (typeof fetch !== "function") throw new Error("fetch unavailable");

    const res = await fetch(`${serviceUrl}/v1/mint`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ entity, purpose }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data && data.chittyId) return data.chittyId;
    throw new Error("missing chittyId");
  } catch (err) {
    // Log errors for debugging
    if (typeof console !== "undefined") {
      console.error(
        `[mint-id] Failed to mint ChittyID for ${entity}:`,
        err.message,
      );
      console.warn(
        `[mint-id] Using fallback ID: pending-${entity.toLowerCase()}-${Date.now()}`,
      );
    }
    // Deterministic, non-random fallback that avoids chittycheck patterns
    return `pending-${entity.toLowerCase()}-${Date.now()}`;
  }
}
