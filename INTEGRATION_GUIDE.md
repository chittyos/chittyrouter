# Persistent Agents Integration Guide

## Quick Start

### Creating a New Agent

```javascript
// Client-side usage
const response = await fetch('https://router.chitty.cc/platform/agents/my-agent/complete', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    prompt: 'Your task here',
    taskType: 'email_routing', // or 'legal_reasoning', 'triage', etc.
    context: { /* optional context */ }
  })
});

const result = await response.json();
// {
//   success: true,
//   provider: 'workersai',
//   response: '...',
//   cost: 0,
//   agent_id: '...',
//   memory_context_used: true
// }
```

### Task Types

**Simple** (uses Workers AI - FREE):
- `email_routing` - Route emails to departments
- `triage` - Classify and prioritize items
- `summarization` - Quick summaries

**Moderate** (Workers AI or Mistral):
- `document_analysis` - Analyze document content
- `code_generation` - Generate code snippets

**Complex** (Anthropic/OpenAI when configured):
- `legal_reasoning` - Deep legal analysis
- `strategy` - Strategic planning

### Agent Lifecycle

Each agent has a unique ID based on its name:
```javascript
const agentId = env.PERSISTENT_AGENTS.idFromName('email-router');
const agent = env.PERSISTENT_AGENTS.get(agentId);
```

Agents persist across:
- Multiple requests
- Worker restarts
- Deployments

### Memory Tiers

**Working Memory (1 hour)**:
- Recent interactions
- Current session context
- Fast KV retrieval

**Semantic Memory (unlimited)**:
- Vector embeddings of past interactions
- RAG-based similarity search
- Long-term knowledge

**Episodic Memory (90 days)**:
- Complete interaction logs
- Compressed JSON in R2
- Audit trail

**Aggregate Stats (permanent)**:
- Performance metrics
- Learning scores
- Cost tracking

## Integration Examples

### ChittyRouter Email Processing

```javascript
import { ChittyRouterAI } from './ai/intelligent-router.js';

async function routeEmail(emailData, env) {
  // Get persistent agent
  const agentId = env.PERSISTENT_AGENTS.idFromName('email-router');
  const agent = env.PERSISTENT_AGENTS.get(agentId);

  // Delegate to agent
  const response = await agent.fetch(new Request('https://agent/complete', {
    method: 'POST',
    body: JSON.stringify({
      prompt: `Route email from ${emailData.from}: ${emailData.subject}`,
      taskType: 'email_routing',
      context: { email: emailData }
    })
  }));

  return await response.json();
}
```

### Legal Document Analysis

```javascript
async function analyzeLegalDocument(documentText, env) {
  const agentId = env.PERSISTENT_AGENTS.idFromName('legal-analyzer');
  const agent = env.PERSISTENT_AGENTS.get(agentId);

  const response = await agent.fetch(new Request('https://agent/complete', {
    method: 'POST',
    body: JSON.stringify({
      prompt: `Analyze this legal document: ${documentText}`,
      taskType: 'legal_reasoning',
      context: { documentType: 'contract' }
    })
  }));

  return await response.json();
}
```

### Customer Support Triage

```javascript
async function triageTicket(ticket, env) {
  const agentId = env.PERSISTENT_AGENTS.idFromName('support-triage');
  const agent = env.PERSISTENT_AGENTS.get(agentId);

  const response = await agent.fetch(new Request('https://agent/complete', {
    method: 'POST',
    body: JSON.stringify({
      prompt: `Triage: ${ticket.title}\n${ticket.description}`,
      taskType: 'triage',
      context: {
        priority: ticket.priority,
        category: ticket.category
      }
    })
  }));

  const result = await response.json();

  // Agent learns from successful triage
  return {
    department: extractDepartment(result.response),
    urgency: extractUrgency(result.response),
    confidence: result.success ? 'high' : 'low'
  };
}
```

## Monitoring Agent Performance

### Get Agent Statistics

```bash
curl https://router.chitty.cc/platform/agents/email-router/stats
```

Response:
```json
{
  "agent_id": "...",
  "stats": {
    "total_interactions": 150,
    "total_cost": 0.00,
    "provider_usage": {
      "workersai": 145,
      "anthropic": 5
    },
    "task_type_usage": {
      "email_routing": 100,
      "triage": 50
    }
  },
  "model_scores": {
    "email_routing:workersai": 25.5,
    "triage:workersai": 12.8
  }
}
```

### Interpreting Model Scores

Higher scores = better performance for that task/provider combination:
- **0.7** - Baseline score (first interaction)
- **1.4** - Good (2 successful interactions)
- **2.1+** - Excellent (3+ successful interactions)

Scores decrease on failures, guiding the agent to better providers.

## Advanced Features

### Custom Task Complexity

Override default complexity assessment:

```javascript
const response = await agent.fetch(new Request('https://agent/complete', {
  method: 'POST',
  body: JSON.stringify({
    prompt: '...',
    taskType: 'custom_task',
    complexity: 'complex', // Force use of stronger models
    preferredProvider: 'anthropic' // Optional override
  })
}));
```

### Memory Context

Agents automatically recall similar past interactions:

```javascript
// Agent internally does:
const context = await this.memory.recall({
  taskType: 'email_routing',
  limit: 5
});

// Returns similar past experiences for better responses
```

### Self-Healing Example

When a provider fails, agent automatically tries fallbacks:

```
1. Try workersai → fails
2. Auto-fallback to mistral → fails
3. Auto-fallback to anthropic → succeeds
4. Learn: anthropic works better for this task
5. Future requests prefer anthropic
```

## Cost Optimization

### Current Pricing

**Workers AI (FREE tier)**:
- Llama 4 Scout: FREE
- GPT-OSS-120B: FREE
- Gemma 3: FREE

**External Providers** (when configured):
- OpenAI GPT-4: ~$0.03/1k tokens
- Anthropic Claude: ~$0.015/1k tokens
- Mistral: ~$0.001/1k tokens

### Optimization Strategy

Agents automatically:
1. Try Workers AI first (FREE)
2. Use cache when available (50-80% hit rate)
3. Learn which provider works best per task
4. Minimize costs while maximizing quality

### Adding External Providers

```bash
# Add API keys as secrets
wrangler secret put OPENAI_API_KEY
wrangler secret put ANTHROPIC_API_KEY

# Agents will automatically use them for complex tasks
```

## Troubleshooting

### Agent Not Responding

```bash
# Check health
curl https://router.chitty.cc/platform/agents/my-agent/health

# Should return:
# {"status":"healthy","agent_id":"..."}
```

### High Costs

```bash
# Check stats to see provider usage
curl https://router.chitty.cc/platform/agents/my-agent/stats

# If using too many external providers, adjust task complexity:
# Change taskType from 'complex' to 'moderate' or 'simple'
```

### Poor Response Quality

Agents learn over time. After ~10 interactions, quality improves as:
- Better provider selection
- Memory context enriches responses
- Model scores optimize

## API Reference

### POST /platform/agents/{name}/complete

**Request:**
```json
{
  "prompt": "string (required)",
  "taskType": "email_routing|legal_reasoning|triage|... (required)",
  "context": "object (optional)",
  "complexity": "simple|moderate|complex (optional)",
  "preferredProvider": "workersai|anthropic|openai (optional)"
}
```

**Response:**
```json
{
  "success": true,
  "provider": "workersai",
  "response": "Agent response text",
  "usage": {
    "inputTokens": 100,
    "outputTokens": 50
  },
  "cost": 0,
  "cached": false,
  "agent_id": "unique-agent-id",
  "memory_context_used": true,
  "self_healed": false
}
```

### GET /platform/agents/{name}/stats

Returns agent statistics and learning data.

### GET /platform/agents/{name}/health

Returns agent health status.

## Best Practices

1. **Use descriptive agent names**: `email-router`, `legal-analyzer`, not `agent1`
2. **Consistent task types**: Helps learning system optimize
3. **Provide context**: Enriches memory and improves responses
4. **Monitor costs**: Check stats regularly
5. **Let agents learn**: Don't override provider selection unless necessary

## Migration from External APIs

Before:
```javascript
const response = await openai.chat.completions.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: prompt }]
});
// Cost: ~$0.03 per request
```

After:
```javascript
const response = await fetch('https://router.chitty.cc/platform/agents/my-agent/complete', {
  method: 'POST',
  body: JSON.stringify({ prompt, taskType: 'simple' })
});
// Cost: $0 (Workers AI)
// Plus: Memory, learning, self-healing
```

---

**You now have intelligent, learning AI agents that get smarter with every interaction!** 🚀
