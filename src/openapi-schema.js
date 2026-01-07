/**
 * OpenAPI Schema Service for ChatGPT Integration
 * Serves the OpenAPI specification at a static endpoint
 */

const openAPISchema = {
  openapi: "3.1.0",
  info: {
    title: "ChittyChat AI Gateway",
    description:
      "Universal AI Platform Connector for ChatGPT, Claude, and other AI models",
    version: "1.0.0",
  },
  servers: [
    {
      url: "https://ai.chitty.cc",
      description: "Production AI Gateway",
    },
  ],
  paths: {
    "/v1/chat/completions": {
      post: {
        operationId: "createChatCompletion",
        summary: "Create a chat completion",
        description: "Generate AI responses using various models",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["messages"],
                properties: {
                  model: {
                    type: "string",
                    description: "Model to use",
                    default: "@cf/meta/llama-3.1-8b-instruct",
                  },
                  messages: {
                    type: "array",
                    description: "Messages in the conversation",
                    items: {
                      type: "object",
                      required: ["role", "content"],
                      properties: {
                        role: {
                          type: "string",
                          enum: ["system", "user", "assistant"],
                          description: "Role of the message sender",
                        },
                        content: {
                          type: "string",
                          description: "Content of the message",
                        },
                      },
                    },
                  },
                  temperature: {
                    type: "number",
                    description: "Sampling temperature",
                    default: 0.7,
                    minimum: 0,
                    maximum: 2,
                  },
                  max_tokens: {
                    type: "number",
                    description: "Maximum tokens to generate",
                    default: 1000,
                  },
                  stream: {
                    type: "boolean",
                    description: "Stream the response",
                    default: false,
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "Successful response",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    id: {
                      type: "string",
                    },
                    object: {
                      type: "string",
                    },
                    created: {
                      type: "number",
                    },
                    model: {
                      type: "string",
                    },
                    choices: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          index: {
                            type: "number",
                          },
                          message: {
                            type: "object",
                            properties: {
                              role: {
                                type: "string",
                              },
                              content: {
                                type: "string",
                              },
                            },
                          },
                          finish_reason: {
                            type: "string",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/v1/models": {
      get: {
        operationId: "listModels",
        summary: "List available models",
        responses: {
          200: {
            description: "List of available models",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: {
                            type: "string",
                          },
                          object: {
                            type: "string",
                          },
                          owned_by: {
                            type: "string",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/health": {
      get: {
        operationId: "healthCheck",
        summary: "Check service health",
        responses: {
          200: {
            description: "Service is healthy",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: {
                      type: "string",
                    },
                    service: {
                      type: "string",
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

/**
 * Handle OpenAPI schema requests
 */
export async function handleOpenAPISchema(request) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // Serve as JSON for direct API access
  if (pathname === "/openapi.json" || pathname === "/api/openapi.json") {
    return new Response(JSON.stringify(openAPISchema, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  // Serve as YAML for ChatGPT Custom GPT
  if (pathname === "/openapi.yaml" || pathname === "/api/openapi.yaml") {
    const yamlContent = convertToYAML(openAPISchema);
    return new Response(yamlContent, {
      headers: {
        "Content-Type": "text/yaml",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  // Serve as HTML page with schema display
  if (pathname === "/openapi" || pathname === "/api/schema") {
    return new Response(generateSchemaHTML(), {
      headers: {
        "Content-Type": "text/html",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  return null;
}

/**
 * Convert JSON to YAML
 */
function convertToYAML(obj) {
  const indent = "  ";

  function stringify(obj, depth = 0) {
    const currentIndent = indent.repeat(depth);
    const nextIndent = indent.repeat(depth + 1);

    if (obj === null) return "null";
    if (typeof obj === "boolean") return obj.toString();
    if (typeof obj === "number") return obj.toString();
    if (typeof obj === "string") {
      if (obj.includes("\n") || obj.includes(":") || obj.includes("#")) {
        return `|\n${nextIndent}${obj.split("\n").join("\n" + nextIndent)}`;
      }
      return obj.includes(" ") || obj === "" ? `"${obj}"` : obj;
    }

    if (Array.isArray(obj)) {
      return obj
        .map((item) => {
          const value = stringify(item, depth + 1);
          if (typeof item === "object" && item !== null) {
            return `\n${currentIndent}- ${value
              .trim()
              .split("\n")
              .map((line, i) => (i === 0 ? line : `  ${line}`))
              .join("\n")}`;
          }
          return `\n${currentIndent}- ${value}`;
        })
        .join("");
    }

    if (typeof obj === "object") {
      return Object.entries(obj)
        .map(([key, value]) => {
          const val = stringify(value, depth + 1);
          if (typeof value === "object" && value !== null) {
            return `\n${currentIndent}${key}:${val}`;
          }
          return `\n${currentIndent}${key}: ${val}`;
        })
        .join("");
    }
  }

  return stringify(obj).trim();
}

/**
 * Generate HTML page displaying the schema
 */
function generateSchemaHTML() {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ChittyChat OpenAPI Schema - ChatGPT Integration</title>
    <style>
        body {
            background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
            color: #e0e0e0;
            font-family: 'Monaco', 'Courier New', monospace;
            padding: 20px;
            margin: 0;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        h1 {
            color: #00ff88;
            text-align: center;
            font-size: 2.5em;
            text-shadow: 0 0 20px rgba(0,255,136,0.5);
        }
        .info {
            background: rgba(0,0,0,0.4);
            border: 1px solid #00ff88;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
        }
        .endpoints {
            display: grid;
            gap: 20px;
        }
        .endpoint {
            background: rgba(0,0,0,0.3);
            border-left: 3px solid #00ff88;
            padding: 15px;
            border-radius: 5px;
        }
        .method {
            display: inline-block;
            padding: 4px 8px;
            background: #00ff88;
            color: #000;
            font-weight: bold;
            border-radius: 3px;
            margin-right: 10px;
        }
        .path {
            color: #ffcc00;
            font-weight: bold;
        }
        .description {
            color: #b0b0b0;
            margin-top: 10px;
        }
        .links {
            background: rgba(0,0,0,0.5);
            padding: 20px;
            border-radius: 8px;
            margin: 30px 0;
            text-align: center;
        }
        a {
            color: #00ff88;
            text-decoration: none;
            margin: 0 20px;
            padding: 10px 20px;
            border: 1px solid #00ff88;
            border-radius: 5px;
            display: inline-block;
            transition: all 0.3s;
        }
        a:hover {
            background: #00ff88;
            color: #000;
            box-shadow: 0 0 20px rgba(0,255,136,0.5);
        }
        pre {
            background: rgba(0,0,0,0.7);
            padding: 15px;
            border-radius: 5px;
            overflow-x: auto;
            border: 1px solid #333;
        }
        code {
            color: #00ff88;
        }
        .integration-guide {
            background: rgba(0,50,100,0.3);
            border: 1px solid #0088ff;
            border-radius: 8px;
            padding: 20px;
            margin: 30px 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🤖 ChittyChat AI Gateway</h1>

        <div class="info">
            <h2>OpenAPI Schema for ChatGPT Custom GPT Integration</h2>
            <p><strong>Version:</strong> 1.0.0</p>
            <p><strong>Base URL:</strong> <code>https://ai.chitty.cc</code></p>
            <p><strong>Description:</strong> Universal AI Platform Connector supporting ChatGPT, Claude, and other AI models</p>
        </div>

        <div class="integration-guide">
            <h2>📋 Quick Setup for ChatGPT Custom GPT</h2>
            <ol>
                <li>Go to ChatGPT → Create Custom GPT</li>
                <li>In the "Configure" tab, find "Actions"</li>
                <li>Click "Import from URL" or "Add Action"</li>
                <li>Enter this URL: <code>https://ai.chitty.cc/openapi.json</code></li>
                <li>Or copy the schema from: <a href="/openapi.json">JSON</a> or <a href="/openapi.yaml">YAML</a></li>
                <li>Test with the health endpoint first</li>
            </ol>
        </div>

        <div class="links">
            <h3>📥 Download Schema</h3>
            <a href="/openapi.json">📄 JSON Format</a>
            <a href="/openapi.yaml">📝 YAML Format</a>
            <a href="https://chat.openai.com/gpts/editor" target="_blank">🚀 Open ChatGPT GPT Builder</a>
        </div>

        <div class="endpoints">
            <h2>Available Endpoints</h2>

            <div class="endpoint">
                <span class="method">POST</span>
                <span class="path">/v1/chat/completions</span>
                <div class="description">
                    Create chat completions with AI models. Compatible with OpenAI API format.
                </div>
                <pre><code>{
  "messages": [
    {"role": "user", "content": "Hello!"}
  ],
  "model": "@cf/meta/llama-3.1-8b-instruct",
  "temperature": 0.7
}</code></pre>
            </div>

            <div class="endpoint">
                <span class="method">GET</span>
                <span class="path">/v1/models</span>
                <div class="description">
                    List all available AI models
                </div>
            </div>

            <div class="endpoint">
                <span class="method">GET</span>
                <span class="path">/health</span>
                <div class="description">
                    Check service health status
                </div>
            </div>
        </div>

        <div class="info" style="margin-top: 40px;">
            <h3>🔧 Testing the Integration</h3>
            <pre><code># Test with curl
curl -X POST https://ai.chitty.cc/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -d '{
    "messages": [{"role": "user", "content": "Hello from ChatGPT!"}],
    "model": "@cf/meta/llama-3.1-8b-instruct"
  }'</code></pre>
        </div>

        <div style="text-align: center; margin-top: 40px; color: #666;">
            <p>Part of the ChittyOS Platform • <a href="https://chitty.cc">chitty.cc</a></p>
        </div>
    </div>
</body>
</html>
  `;
}

export { openAPISchema };
