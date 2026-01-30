/**
 * ChittyRouter Entry Point - Minimal wrapper
 * Delegates all routing to unified-worker.js
 */
import UnifiedWorker from "./unified-worker.js";
export { SyncStateDurableObject, AIStateDO } from "./unified-worker.js";

export default {
  async fetch(request, env, ctx) {
    return await UnifiedWorker.fetch(request, env, ctx);
  }
};
