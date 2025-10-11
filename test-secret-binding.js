/**
 * Diagnostic Worker to Test Secret Binding
 * Deploy this temporarily to test if secrets are accessible
 */

export default {
  async fetch(request, env, ctx) {
    const diagnostics = {
      timestamp: new Date().toISOString(),
      url: request.url,
      method: request.method,

      // Test secret binding
      secretBindings: {
        CHITTY_ID_TOKEN: {
          exists: env.CHITTY_ID_TOKEN !== undefined,
          type: typeof env.CHITTY_ID_TOKEN,
          length: env.CHITTY_ID_TOKEN ? env.CHITTY_ID_TOKEN.length : 0,
          preview: env.CHITTY_ID_TOKEN
            ? env.CHITTY_ID_TOKEN.substring(0, 10) + "..."
            : null,
        },
      },

      // Test other bindings
      otherBindings: {
        AI: env.AI !== undefined,
        EMAIL_ANALYTICS: env.EMAIL_ANALYTICS !== undefined,
        RATE_LIMITS: env.RATE_LIMITS !== undefined,
        DEFAULT_FORWARD: env.DEFAULT_FORWARD !== undefined,
        SERVICE_NAME: env.SERVICE_NAME !== undefined,
      },

      // List all env keys (non-secret values)
      envKeys: Object.keys(env).filter(
        (key) =>
          !key.includes("TOKEN") &&
          !key.includes("SECRET") &&
          !key.includes("KEY"),
      ),
    };

    return new Response(JSON.stringify(diagnostics, null, 2), {
      headers: {
        "Content-Type": "application/json",
      },
    });
  },
};
