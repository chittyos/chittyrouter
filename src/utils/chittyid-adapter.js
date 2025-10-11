/**
 * ChittyID Adapter - Uses official @chittyos/chittyid-client
 * Maps custom entity types to official types
 */
import { ChittyIDClient } from "@chittyos/chittyid-client";

let clientInstance = null;

const ENTITY_MAP = {
  SESSN: "CONTEXT",
  APIKEY: "AUTH",
  ID: "INFO",
  SESSION: "CONTEXT",
  KEY: "AUTH",
};

function getClient(env) {
  if (!clientInstance) {
    clientInstance = new ChittyIDClient({
      serviceUrl: env?.CHITTYID_SERVICE_URL || "https://id.chitty.cc/v1",
      apiKey:
        env?.CHITTY_ID_TOKEN ||
        env?.SECRET_CHITTY_ID_TOKEN ||
        process.env.CHITTY_ID_TOKEN,
      timeout: 10000,
    });
  }
  return clientInstance;
}

export async function mintId(entity, purpose, env) {
  const client = getClient(env);
  const mapped = ENTITY_MAP[entity?.toUpperCase()] || entity?.toUpperCase();

  return await client.mint({
    entity: mapped,
    name: purpose,
    metadata: { originalEntity: entity, purpose },
  });
}

export function validateChittyIDFormat(chittyId) {
  const client = getClient({});
  return client.validateFormat(chittyId);
}

export async function validateChittyIDWithService(chittyId, env) {
  const client = getClient(env);
  return client.validate(chittyId);
}

export default { mintId, validateChittyIDFormat, validateChittyIDWithService };
