/**
 * Unit Tests for AI State Management
 * Tests all functions in ai-state.js
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AIStateDO } from '../../src/ai/ai-state.js';

// Mock Durable Object state
class MockState {
  constructor() {
    this.storage = new Map();
  }
}

// Mock storage with Durable Object-like interface
class MockStorage {
  constructor() {
    this.data = new Map();
  }

  async get(key) {
    return this.data.get(key);
  }

  async put(key, value) {
    this.data.set(key, value);
    return true;
  }

  async list(options = {}) {
    const entries = new Map();

    for (const [key, value] of this.data.entries()) {
      if (options.prefix && !key.startsWith(options.prefix)) {
        continue;
      }
      entries.set(key, value);
    }

    return entries;
  }

  async delete(key) {
    return this.data.delete(key);
  }

  clear() {
    this.data.clear();
  }
}

describe('AIStateDO', () => {
  let aiState;
  let mockState;
  let mockEnv;

  beforeEach(() => {
    mockState = {
      storage: new MockStorage()
    };

    mockEnv = {
      CHITTY_CHAIN_URL: 'https://test-chain.example.com',
      AI_MODEL: '@cf/meta/llama-3.1-8b-instruct'
    };

    aiState = new AIStateDO(mockState, mockEnv);
  });

  afterEach(() => {
    vi.clearAllMocks();
    mockState.storage.clear();
  });

  describe('fetch routing', () => {
    it('should handle store-ai-analysis requests', async () => {
      const analysisData = {
        chittyId: 'CHITTY-123',
        category: 'lawsuit',
        priority: 'HIGH',
        case_related: true
      };

      const request = new Request('http://localhost/store-ai-analysis', {
        method: 'POST',
        body: JSON.stringify(analysisData)
      });

      const response = await aiState.fetch(request);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      expect(result.chittyId).toBe('CHITTY-123');
      expect(result.stored).toBe(true);
    });

    it('should handle get-ai-history requests', async () => {
      // First store some analysis data
      await mockState.storage.put('ai-analysis:CHITTY-123', {
        chittyId: 'CHITTY-123',
        category: 'lawsuit',
        priority: 'HIGH'
      });

      const request = new Request('http://localhost/get-ai-history?chittyId=CHITTY-123');

      const response = await aiState.fetch(request);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.found).toBe(true);
      expect(result.chittyId).toBe('CHITTY-123');
      expect(result.analysis).toBeDefined();
    });

    it('should handle store-agent-result requests', async () => {
      const agentData = {
        taskId: 'TASK-456',
        success: true,
        agents_used: ['legal_analyzer', 'document_processor']
      };

      const request = new Request('http://localhost/store-agent-result', {
        method: 'POST',
        body: JSON.stringify(agentData)
      });

      const response = await aiState.fetch(request);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      expect(result.taskId).toBe('TASK-456');
    });

    it('should handle get-case-intelligence requests', async () => {
      // Store some case intelligence
      await mockState.storage.put('case-intelligence:SMITH_v_JONES', {
        caseId: 'SMITH_v_JONES',
        communications: [],
        ai_insights: {}
      });

      const request = new Request('http://localhost/get-case-intelligence?caseId=SMITH_v_JONES');

      const response = await aiState.fetch(request);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.found).toBe(true);
      expect(result.caseId).toBe('SMITH_v_JONES');
    });

    it('should handle update-ai-learning requests', async () => {
      const learningData = {
        type: 'case_classification',
        pattern: 'lawsuit_pattern',
        accuracy: 0.85
      };

      const request = new Request('http://localhost/update-ai-learning', {
        method: 'POST',
        body: JSON.stringify(learningData)
      });

      const response = await aiState.fetch(request);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      expect(result.learning_updated).toBe(true);
    });

    it('should return default response for unknown paths', async () => {
      const request = new Request('http://localhost/unknown-path');

      const response = await aiState.fetch(request);
      const text = await response.text();

      expect(response.status).toBe(200);
      expect(text).toBe('AI State DO Active');
    });

    it('should handle errors gracefully', async () => {
      // Mock JSON parsing to fail
      const request = new Request('http://localhost/store-ai-analysis', {
        method: 'POST',
        body: 'invalid json'
      });

      const response = await aiState.fetch(request);

      expect(response.status).toBe(500);
    });
  });

  describe('storeAIAnalysis', () => {
    it('should store AI analysis with version info', async () => {
      const analysisData = {
        chittyId: 'CHITTY-123',
        category: 'lawsuit',
        priority: 'HIGH',
        case_related: true,
        case_pattern: 'SMITH_v_JONES'
      };

      const response = await aiState.storeAIAnalysis(analysisData);
      const result = await response.json();

      expect(result.success).toBe(true);

      // Verify data was stored correctly
      const stored = await mockState.storage.get('ai-analysis:CHITTY-123');
      expect(stored.chittyId).toBe('CHITTY-123');
      expect(stored.version).toBe('2.0.0-ai');
      expect(stored.stored_at).toBeDefined();
    });

    it('should update case intelligence for case-related analysis', async () => {
      const analysisData = {
        chittyId: 'CHITTY-123',
        category: 'lawsuit',
        priority: 'HIGH',
        case_related: true,
        case_pattern: 'SMITH_v_JONES',
        key_topics: ['contract dispute', 'damages'],
        sentiment: 'urgent'
      };

      await aiState.storeAIAnalysis(analysisData);

      // Verify case intelligence was created
      const caseIntelligence = await mockState.storage.get('case-intelligence:SMITH_v_JONES');
      expect(caseIntelligence).toBeDefined();
      expect(caseIntelligence.caseId).toBe('SMITH_v_JONES');
      expect(caseIntelligence.communications).toHaveLength(1);
    });

    it('should not update case intelligence for non-case-related analysis', async () => {
      const analysisData = {
        chittyId: 'CHITTY-456',
        category: 'inquiry',
        priority: 'LOW',
        case_related: false
      };

      await aiState.storeAIAnalysis(analysisData);

      // Verify no case intelligence was created
      const caseKeys = await mockState.storage.list({ prefix: 'case-intelligence:' });
      expect(caseKeys.size).toBe(0);
    });
  });

  describe('getAIHistory', () => {
    it('should return analysis when found', async () => {
      const analysisData = {
        chittyId: 'CHITTY-123',
        category: 'lawsuit',
        priority: 'HIGH'
      };

      await mockState.storage.put('ai-analysis:CHITTY-123', analysisData);

      const response = await aiState.getAIHistory('CHITTY-123');
      const result = await response.json();

      expect(result.found).toBe(true);
      expect(result.chittyId).toBe('CHITTY-123');
      expect(result.analysis).toEqual(analysisData);
    });

    it('should return not found when analysis does not exist', async () => {
      const response = await aiState.getAIHistory('NONEXISTENT-ID');
      const result = await response.json();

      expect(result.found).toBe(false);
      expect(result.chittyId).toBe('NONEXISTENT-ID');
    });
  });

  describe('storeAgentResult', () => {
    it('should store agent result and update metrics', async () => {
      const agentData = {
        taskId: 'TASK-123',
        success: true,
        agents_used: ['legal_analyzer', 'document_processor']
      };

      const response = await aiState.storeAgentResult(agentData);
      const result = await response.json();

      expect(result.success).toBe(true);
      expect(result.taskId).toBe('TASK-123');

      // Verify data was stored
      const stored = await mockState.storage.get('agent-result:TASK-123');
      expect(stored.taskId).toBe('TASK-123');
      expect(stored.stored_at).toBeDefined();

      // Verify metrics were updated
      const metrics = await mockState.storage.get('agent-metrics');
      expect(metrics).toBeDefined();
      expect(metrics.total_tasks).toBe(1);
    });
  });

  describe('getCaseIntelligence', () => {
    it('should return case intelligence with AI insights', async () => {
      const caseData = {
        caseId: 'SMITH_v_JONES',
        communications: [
          { chittyId: 'CHITTY-1', category: 'lawsuit', priority: 'HIGH' }
        ],
        ai_insights: {
          categories: { lawsuit: 2 },
          priorities: { HIGH: 1, NORMAL: 1 }
        }
      };

      await mockState.storage.put('case-intelligence:SMITH_v_JONES', caseData);

      // Store related analysis
      await mockState.storage.put('ai-analysis:CHITTY-1', {
        chittyId: 'CHITTY-1',
        case_pattern: 'SMITH_v_JONES',
        category: 'lawsuit',
        priority: 'HIGH'
      });

      const response = await aiState.getCaseIntelligence('SMITH_v_JONES');
      const result = await response.json();

      expect(result.found).toBe(true);
      expect(result.caseId).toBe('SMITH_v_JONES');
      expect(result.intelligence).toBeDefined();
      expect(result.related_analyses).toBeDefined();
      expect(result.ai_insights).toBeDefined();
    });

    it('should return not found for non-existent case', async () => {
      const response = await aiState.getCaseIntelligence('NONEXISTENT_CASE');
      const result = await response.json();

      expect(result.found).toBe(false);
      expect(result.caseId).toBe('NONEXISTENT_CASE');
      expect(result.intelligence).toBeNull();
    });
  });

  describe('updateCaseIntelligence', () => {
    it('should create new case intelligence', async () => {
      const analysisData = {
        chittyId: 'CHITTY-123',
        case_pattern: 'DOE_v_COMPANY',
        category: 'lawsuit',
        priority: 'HIGH',
        sentiment: 'urgent',
        key_topics: ['contract', 'breach']
      };

      await aiState.updateCaseIntelligence(analysisData);

      const caseIntelligence = await mockState.storage.get('case-intelligence:DOE_v_COMPANY');
      expect(caseIntelligence).toBeDefined();
      expect(caseIntelligence.caseId).toBe('DOE_v_COMPANY');
      expect(caseIntelligence.communications).toHaveLength(1);
      expect(caseIntelligence.ai_insights.categories.lawsuit).toBe(1);
      expect(caseIntelligence.timeline).toHaveLength(1);
    });

    it('should update existing case intelligence', async () => {
      // Create initial case intelligence
      const initialData = {
        caseId: 'EXISTING_CASE',
        communications: [],
        ai_insights: { categories: {}, priorities: {} },
        timeline: []
      };

      await mockState.storage.put('case-intelligence:EXISTING_CASE', initialData);

      const analysisData = {
        chittyId: 'CHITTY-456',
        case_pattern: 'EXISTING_CASE',
        category: 'document_submission',
        priority: 'NORMAL',
        sentiment: 'neutral',
        key_topics: ['evidence']
      };

      await aiState.updateCaseIntelligence(analysisData);

      const updated = await mockState.storage.get('case-intelligence:EXISTING_CASE');
      expect(updated.communications).toHaveLength(1);
      expect(updated.ai_insights.categories.document_submission).toBe(1);
      expect(updated.timeline).toHaveLength(1);
      expect(updated.updated_at).toBeDefined();
    });

    it('should handle missing case pattern gracefully', async () => {
      const analysisData = {
        chittyId: 'CHITTY-789',
        category: 'inquiry'
        // No case_pattern or case_id
      };

      await aiState.updateCaseIntelligence(analysisData);

      // Should not create any case intelligence
      const caseKeys = await mockState.storage.list({ prefix: 'case-intelligence:' });
      expect(caseKeys.size).toBe(0);
    });
  });

  describe('aggregateInsights', () => {
    it('should aggregate insights correctly', () => {
      const intelligence = {
        ai_insights: {
          categories: { lawsuit: 1 },
          priorities: { HIGH: 1 },
          sentiment_trends: [],
          key_topics: { contract: 2 }
        }
      };

      const newAnalysis = {
        category: 'lawsuit',
        priority: 'CRITICAL',
        sentiment: 'urgent',
        urgency_score: 0.95,
        key_topics: ['contract', 'damages']
      };

      const insights = aiState.aggregateInsights(intelligence, newAnalysis);

      expect(insights.categories.lawsuit).toBe(2);
      expect(insights.priorities.CRITICAL).toBe(1);
      expect(insights.sentiment_trends).toHaveLength(1);
      expect(insights.key_topics.contract).toBe(3);
      expect(insights.key_topics.damages).toBe(1);
      expect(insights.case_health).toBeDefined();
    });

    it('should handle empty intelligence', () => {
      const intelligence = {};
      const newAnalysis = {
        category: 'inquiry',
        priority: 'LOW',
        sentiment: 'neutral',
        urgency_score: 0.3,
        key_topics: ['question']
      };

      const insights = aiState.aggregateInsights(intelligence, newAnalysis);

      expect(insights.categories.inquiry).toBe(1);
      expect(insights.priorities.LOW).toBe(1);
      expect(insights.sentiment_trends).toHaveLength(1);
      expect(insights.key_topics.question).toBe(1);
    });
  });

  describe('calculateCaseHealth', () => {
    it('should calculate healthy score for normal case', () => {
      const insights = {
        priorities: { NORMAL: 5, LOW: 3 },
        sentiment_trends: [
          { sentiment: 'neutral' },
          { sentiment: 'positive' },
          { sentiment: 'neutral' }
        ]
      };

      const health = aiState.calculateCaseHealth(insights);

      expect(health).toBeGreaterThan(0.5);
      expect(health).toBeLessThanOrEqual(1.0);
    });

    it('should calculate poor health for problematic case', () => {
      const insights = {
        priorities: { CRITICAL: 4, HIGH: 6 },
        sentiment_trends: [
          { sentiment: 'negative' },
          { sentiment: 'negative' },
          { sentiment: 'negative' },
          { sentiment: 'negative' },
          { sentiment: 'negative' }
        ]
      };

      const health = aiState.calculateCaseHealth(insights);

      expect(health).toBeLessThan(0.5);
      expect(health).toBeGreaterThanOrEqual(0.1);
    });

    it('should handle empty insights', () => {
      const insights = {};

      const health = aiState.calculateCaseHealth(insights);

      expect(health).toBe(0.7); // baseline
    });
  });

  describe('getRelatedAnalyses', () => {
    it('should find related analyses for case', async () => {
      // Store multiple analyses
      await mockState.storage.put('ai-analysis:CHITTY-1', {
        chittyId: 'CHITTY-1',
        case_pattern: 'TARGET_CASE',
        category: 'lawsuit',
        priority: 'HIGH',
        timestamp: '2024-01-01T00:00:00Z'
      });

      await mockState.storage.put('ai-analysis:CHITTY-2', {
        chittyId: 'CHITTY-2',
        case_pattern: 'OTHER_CASE',
        category: 'inquiry',
        priority: 'LOW',
        timestamp: '2024-01-02T00:00:00Z'
      });

      await mockState.storage.put('ai-analysis:CHITTY-3', {
        chittyId: 'CHITTY-3',
        case_id: 'TARGET_CASE',
        category: 'document_submission',
        priority: 'NORMAL',
        timestamp: '2024-01-03T00:00:00Z'
      });

      const related = await aiState.getRelatedAnalyses('TARGET_CASE');

      expect(related).toHaveLength(2);
      expect(related[0].chittyId).toBe('CHITTY-3'); // Most recent first
      expect(related[1].chittyId).toBe('CHITTY-1');
    });

    it('should return empty array when no related analyses found', async () => {
      const related = await aiState.getRelatedAnalyses('NONEXISTENT_CASE');

      expect(related).toHaveLength(0);
    });
  });

  describe('generateAIInsights', () => {
    it('should generate comprehensive AI insights', () => {
      const intelligence = {
        ai_insights: {
          case_health: 0.8,
          categories: { lawsuit: 3, inquiry: 1 },
          priorities: { HIGH: 2, NORMAL: 2 }
        }
      };

      const analyses = [
        { chittyId: 'CHITTY-1', category: 'lawsuit', priority: 'HIGH' },
        { chittyId: 'CHITTY-2', category: 'inquiry', priority: 'NORMAL' }
      ];

      const insights = aiState.generateAIInsights(intelligence, analyses);

      expect(insights.total_communications).toBe(2);
      expect(insights.case_health).toBe(0.8);
      expect(insights.primary_categories).toBeDefined();
      expect(insights.priority_distribution).toBeDefined();
      expect(insights.recent_activity).toHaveLength(2);
      expect(insights.recommendations).toBeDefined();
    });
  });

  describe('getTopCategories', () => {
    it('should return top categories sorted by count', () => {
      const categories = {
        lawsuit: 5,
        inquiry: 2,
        document_submission: 8,
        emergency: 1
      };

      const top = aiState.getTopCategories(categories);

      expect(top).toHaveLength(3);
      expect(top[0].category).toBe('document_submission');
      expect(top[0].count).toBe(8);
      expect(top[1].category).toBe('lawsuit');
      expect(top[1].count).toBe(5);
      expect(top[2].category).toBe('inquiry');
      expect(top[2].count).toBe(2);
    });

    it('should handle empty categories', () => {
      const top = aiState.getTopCategories(null);

      expect(top).toEqual([]);
    });
  });

  describe('generateRecommendations', () => {
    it('should generate recommendations based on case health', () => {
      const intelligence = {
        ai_insights: {
          case_health: 0.3,
          priorities: { CRITICAL: 10 }
        },
        communications: Array(15).fill({ timestamp: new Date().toISOString() })
      };

      const recommendations = aiState.generateRecommendations(intelligence);

      expect(recommendations).toContain('Case requires immediate attention due to low health score');
      expect(recommendations).toContain('High number of critical communications - consider escalation');
      expect(recommendations).toContain('High communication volume - consider case review');
    });

    it('should return empty recommendations for healthy case', () => {
      const intelligence = {
        ai_insights: {
          case_health: 0.9,
          priorities: { NORMAL: 3, LOW: 2 }
        },
        communications: [
          { timestamp: '2024-01-01T00:00:00Z' }
        ]
      };

      const recommendations = aiState.generateRecommendations(intelligence);

      expect(recommendations).toHaveLength(0);
    });
  });

  describe('updateAILearning', () => {
    it('should create new learning data', async () => {
      const learningData = {
        type: 'routing_accuracy',
        pattern: 'lawsuit_pattern',
        accuracy: 0.92
      };

      const response = await aiState.updateAILearning(learningData);
      const result = await response.json();

      expect(result.success).toBe(true);
      expect(result.learning_updated).toBe(true);

      const stored = await mockState.storage.get('ai-learning:routing_accuracy');
      expect(stored.type).toBe('routing_accuracy');
      expect(stored.patterns.lawsuit_pattern).toBe(1);
      expect(Object.keys(stored.accuracy_metrics)).toHaveLength(1);
    });

    it('should update existing learning data', async () => {
      // Create initial learning data
      await mockState.storage.put('ai-learning:classification', {
        type: 'classification',
        patterns: { lawsuit: 2 },
        accuracy_metrics: {},
        created_at: '2024-01-01T00:00:00Z'
      });

      const learningData = {
        type: 'classification',
        pattern: 'lawsuit',
        accuracy: 0.88
      };

      await aiState.updateAILearning(learningData);

      const stored = await mockState.storage.get('ai-learning:classification');
      expect(stored.patterns.lawsuit).toBe(3);
      expect(Object.keys(stored.accuracy_metrics)).toHaveLength(1);
      expect(stored.updated_at).toBeDefined();
    });
  });

  describe('updateAgentMetrics', () => {
    it('should create initial agent metrics', async () => {
      const agentData = {
        success: true,
        agents_used: ['legal_analyzer', 'document_processor']
      };

      await aiState.updateAgentMetrics(agentData);

      const metrics = await mockState.storage.get('agent-metrics');
      expect(metrics.total_tasks).toBe(1);
      expect(metrics.agent_performance.legal_analyzer.tasks_completed).toBe(1);
      expect(metrics.agent_performance.legal_analyzer.success_count).toBe(1);
      expect(metrics.agent_performance.legal_analyzer.success_rate).toBe(1.0);
      expect(metrics.success_rate).toBe(1.0);
    });

    it('should update existing agent metrics', async () => {
      // Create initial metrics
      await mockState.storage.put('agent-metrics', {
        total_tasks: 2,
        success_rate: 0.5,
        agent_performance: {
          legal_analyzer: {
            tasks_completed: 2,
            success_count: 1,
            success_rate: 0.5
          }
        },
        created_at: '2024-01-01T00:00:00Z'
      });

      const agentData = {
        success: true,
        agents_used: ['legal_analyzer', 'new_agent']
      };

      await aiState.updateAgentMetrics(agentData);

      const metrics = await mockState.storage.get('agent-metrics');
      expect(metrics.total_tasks).toBe(3);
      expect(metrics.agent_performance.legal_analyzer.tasks_completed).toBe(3);
      expect(metrics.agent_performance.legal_analyzer.success_count).toBe(2);
      expect(metrics.agent_performance.new_agent.tasks_completed).toBe(1);
      expect(metrics.updated_at).toBeDefined();
    });

    it('should handle failed agent tasks', async () => {
      const agentData = {
        success: false,
        agents_used: ['failing_agent']
      };

      await aiState.updateAgentMetrics(agentData);

      const metrics = await mockState.storage.get('agent-metrics');
      expect(metrics.agent_performance.failing_agent.success_count).toBe(0);
      expect(metrics.agent_performance.failing_agent.success_rate).toBe(0);
    });
  });
});