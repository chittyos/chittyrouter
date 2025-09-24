/**
 * Unit Tests for Agent Orchestrator
 * Tests all functions in agent-orchestrator.js
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AgentOrchestrator } from '../../src/ai/agent-orchestrator.js';
import { mockAI } from '../mocks/ai-responses.js';

describe('AgentOrchestrator', () => {
  let orchestrator;
  let mockEnv;

  beforeEach(() => {
    mockEnv = {
      CHITTY_CHAIN_URL: 'https://test-chain.example.com',
      AI_MODEL: '@cf/meta/llama-3.1-8b-instruct'
    };

    orchestrator = new AgentOrchestrator(mockAI, mockEnv);
    mockAI.reset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('executeTask', () => {
    it('should execute case analysis task successfully', async () => {
      const taskData = {
        type: 'case_analysis',
        caseId: 'SMITH_v_JONES',
        documents: ['contract.pdf', 'evidence.pdf'],
        priority: 'HIGH'
      };

      const result = await orchestrator.executeTask(taskData);

      expect(result.success).toBe(true);
      expect(result.taskId).toBeDefined();
      expect(result.agents_used).toEqual(['legal_analyzer', 'document_processor', 'timeline_builder']);
      expect(result.result.total_steps).toBe(3);
      expect(result.timestamp).toBeDefined();
    });

    it('should execute document review task', async () => {
      const taskData = {
        type: 'document_review',
        documents: ['contract.pdf'],
        compliance_requirements: ['HIPAA', 'SOX']
      };

      const result = await orchestrator.executeTask(taskData);

      expect(result.success).toBe(true);
      expect(result.agents_used).toEqual(['document_analyzer', 'compliance_checker', 'risk_assessor']);
      expect(result.result.total_steps).toBe(3);
    });

    it('should execute client communication task', async () => {
      const taskData = {
        type: 'client_communication',
        clientEmail: 'client@example.com',
        requestType: 'status_update',
        caseId: 'DOE_v_COMPANY'
      };

      const result = await orchestrator.executeTask(taskData);

      expect(result.success).toBe(true);
      expect(result.agents_used).toEqual(['triage_agent', 'message_composer']);
      expect(result.result.total_steps).toBe(2);
    });

    it('should handle unknown task types with general agent', async () => {
      const taskData = {
        type: 'unknown_task_type',
        data: 'test data'
      };

      const result = await orchestrator.executeTask(taskData);

      expect(result.success).toBe(true);
      expect(result.agents_used).toEqual(['general_assistant']);
    });

    it('should handle orchestration failures gracefully', async () => {
      const failingAI = {
        run: vi.fn().mockRejectedValue(new Error('Agent coordination failed'))
      };

      const failingOrchestrator = new AgentOrchestrator(failingAI, mockEnv);

      const taskData = {
        type: 'case_analysis',
        caseId: 'TEST_CASE'
      };

      const result = await failingOrchestrator.executeTask(taskData);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Agent coordination failed');
      expect(result.timestamp).toBeDefined();
    });
  });

  describe('determineRequiredAgents', () => {
    it('should determine agents for case analysis', () => {
      const taskData = { type: 'case_analysis' };

      const agents = orchestrator.determineRequiredAgents(taskData);

      expect(agents).toEqual(['legal_analyzer', 'document_processor', 'timeline_builder']);
    });

    it('should determine agents for document review', () => {
      const taskData = { type: 'document_review' };

      const agents = orchestrator.determineRequiredAgents(taskData);

      expect(agents).toEqual(['document_analyzer', 'compliance_checker', 'risk_assessor']);
    });

    it('should determine agents for client communication', () => {
      const taskData = { type: 'client_communication' };

      const agents = orchestrator.determineRequiredAgents(taskData);

      expect(agents).toEqual(['message_composer', 'tone_analyzer', 'response_generator']);
    });

    it('should determine agents for court preparation', () => {
      const taskData = { type: 'court_preparation' };

      const agents = orchestrator.determineRequiredAgents(taskData);

      expect(agents).toEqual(['deadline_tracker', 'document_organizer', 'calendar_coordinator']);
    });

    it('should determine agents for evidence processing', () => {
      const taskData = { type: 'evidence_processing' };

      const agents = orchestrator.determineRequiredAgents(taskData);

      expect(agents).toEqual(['evidence_analyzer', 'chain_builder', 'verification_agent']);
    });

    it('should determine agents for intake processing', () => {
      const taskData = { type: 'intake_processing' };

      const agents = orchestrator.determineRequiredAgents(taskData);

      expect(agents).toEqual(['triage_agent', 'client_classifier', 'routing_optimizer']);
    });

    it('should default to general assistant for unknown types', () => {
      const taskData = { type: 'unknown_type' };

      const agents = orchestrator.determineRequiredAgents(taskData);

      expect(agents).toEqual(['general_assistant']);
    });
  });

  describe('initializeAgents', () => {
    it('should initialize all requested agents', async () => {
      const agentTypes = ['legal_analyzer', 'document_processor', 'timeline_builder'];

      const agents = await orchestrator.initializeAgents(agentTypes);

      expect(Object.keys(agents)).toHaveLength(3);
      expect(agents.legal_analyzer).toBeDefined();
      expect(agents.document_processor).toBeDefined();
      expect(agents.timeline_builder).toBeDefined();

      expect(agents.legal_analyzer.type).toBe('legal_analyzer');
      expect(agents.legal_analyzer.status).toBe('initialized');
      expect(agents.legal_analyzer.id).toBeDefined();
    });

    it('should handle agent initialization failures', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Mock createAgent to fail for one agent type
      const originalCreateAgent = orchestrator.createAgent;
      orchestrator.createAgent = vi.fn().mockImplementation((type) => {
        if (type === 'failing_agent') {
          throw new Error('Agent initialization failed');
        }
        return originalCreateAgent.call(orchestrator, type);
      });

      const agentTypes = ['legal_analyzer', 'failing_agent'];

      const agents = await orchestrator.initializeAgents(agentTypes);

      expect(Object.keys(agents)).toHaveLength(1);
      expect(agents.legal_analyzer).toBeDefined();
      expect(agents.failing_agent).toBeUndefined();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to initialize failing_agent'));

      orchestrator.createAgent = originalCreateAgent;
      consoleSpy.mockRestore();
    });
  });

  describe('createAgent', () => {
    it('should create legal analyzer agent', async () => {
      const agent = await orchestrator.createAgent('legal_analyzer');

      expect(agent.type).toBe('legal_analyzer');
      expect(agent.config.role).toBe('Legal Analysis Specialist');
      expect(agent.config.expertise).toContain('Case law');
      expect(agent.config.prompt_prefix).toContain('legal analysis expert');
      expect(agent.status).toBe('initialized');
      expect(agent.id).toContain('legal_analyzer');
    });

    it('should create document processor agent', async () => {
      const agent = await orchestrator.createAgent('document_processor');

      expect(agent.type).toBe('document_processor');
      expect(agent.config.role).toBe('Document Processing Specialist');
      expect(agent.config.expertise).toContain('Document classification');
    });

    it('should create timeline builder agent', async () => {
      const agent = await orchestrator.createAgent('timeline_builder');

      expect(agent.type).toBe('timeline_builder');
      expect(agent.config.role).toBe('Legal Timeline Specialist');
      expect(agent.config.expertise).toContain('Chronological analysis');
    });

    it('should create compliance checker agent', async () => {
      const agent = await orchestrator.createAgent('compliance_checker');

      expect(agent.type).toBe('compliance_checker');
      expect(agent.config.role).toBe('Compliance Verification Specialist');
      expect(agent.config.expertise).toContain('Regulatory compliance');
    });

    it('should default to legal analyzer for unknown agent types', async () => {
      const agent = await orchestrator.createAgent('unknown_agent_type');

      expect(agent.type).toBe('unknown_agent_type');
      expect(agent.config.role).toBe('Legal Analysis Specialist'); // Default config
    });
  });

  describe('coordinateAgents', () => {
    it('should coordinate agents for case analysis workflow', async () => {
      const taskData = { type: 'case_analysis', caseId: 'TEST_CASE' };
      const agents = {
        legal_analyzer: await orchestrator.createAgent('legal_analyzer'),
        document_processor: await orchestrator.createAgent('document_processor'),
        timeline_builder: await orchestrator.createAgent('timeline_builder')
      };

      const result = await orchestrator.coordinateAgents('task-123', taskData, agents);

      expect(result.workflow_type).toBeUndefined(); // Not set by createWorkflow
      expect(result.total_steps).toBe(3);
      expect(result.completed_steps).toBe(3);
      expect(result.success_rate).toBeGreaterThan(0);
      expect(result.results).toBeDefined();
      expect(result.recommendations).toBeDefined();
    });

    it('should handle missing agents gracefully', async () => {
      const taskData = { type: 'case_analysis' };
      const agents = {
        legal_analyzer: await orchestrator.createAgent('legal_analyzer')
        // Missing document_processor and timeline_builder
      };

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await orchestrator.coordinateAgents('task-123', taskData, agents);

      expect(result.completed_steps).toBeLessThan(3); // Some steps skipped
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Agent document_processor not available'));

      consoleSpy.mockRestore();
    });

    it('should handle critical step failures', async () => {
      const taskData = { type: 'document_review' };
      const agents = {
        document_analyzer: await orchestrator.createAgent('document_analyzer'),
        compliance_checker: await orchestrator.createAgent('compliance_checker')
      };

      // Mock executeAgentStep to fail for critical step
      const originalExecuteAgentStep = orchestrator.executeAgentStep;
      orchestrator.executeAgentStep = vi.fn().mockImplementation((agent, step) => {
        if (step.critical && step.name === 'analyze_document') {
          return Promise.resolve({ error: 'Analysis failed', agent: agent.type, step: step.name });
        }
        return originalExecuteAgentStep.call(orchestrator, agent, step, taskData, {});
      });

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await orchestrator.coordinateAgents('task-123', taskData, agents);

      expect(result.results.analyze_document.error).toBeDefined();
      expect(consoleErrorSpy).toHaveBeenCalled();

      orchestrator.executeAgentStep = originalExecuteAgentStep;
      consoleErrorSpy.mockRestore();
    });
  });

  describe('createWorkflow', () => {
    it('should create case analysis workflow', () => {
      const workflow = orchestrator.createWorkflow('case_analysis', {});

      expect(workflow.steps).toHaveLength(3);
      expect(workflow.steps[0].name).toBe('analyze_case');
      expect(workflow.steps[0].agent).toBe('legal_analyzer');
      expect(workflow.steps[0].critical).toBe(true);

      expect(workflow.steps[1].name).toBe('process_documents');
      expect(workflow.steps[1].agent).toBe('document_processor');
      expect(workflow.steps[1].critical).toBe(false);

      expect(workflow.steps[2].name).toBe('build_timeline');
      expect(workflow.steps[2].agent).toBe('timeline_builder');
      expect(workflow.steps[2].critical).toBe(false);
    });

    it('should create document review workflow', () => {
      const workflow = orchestrator.createWorkflow('document_review', {});

      expect(workflow.steps).toHaveLength(3);
      expect(workflow.steps[0].name).toBe('analyze_document');
      expect(workflow.steps[0].agent).toBe('document_analyzer');
      expect(workflow.steps[0].critical).toBe(true);

      expect(workflow.steps[1].name).toBe('check_compliance');
      expect(workflow.steps[1].agent).toBe('compliance_checker');
      expect(workflow.steps[1].critical).toBe(true);

      expect(workflow.steps[2].name).toBe('assess_risk');
      expect(workflow.steps[2].agent).toBe('risk_assessor');
      expect(workflow.steps[2].critical).toBe(false);
    });

    it('should create client communication workflow', () => {
      const workflow = orchestrator.createWorkflow('client_communication', {});

      expect(workflow.steps).toHaveLength(2);
      expect(workflow.steps[0].name).toBe('analyze_request');
      expect(workflow.steps[0].agent).toBe('triage_agent');
      expect(workflow.steps[0].critical).toBe(true);

      expect(workflow.steps[1].name).toBe('compose_response');
      expect(workflow.steps[1].agent).toBe('message_composer');
      expect(workflow.steps[1].critical).toBe(true);
    });

    it('should create default workflow for unknown types', () => {
      const workflow = orchestrator.createWorkflow('unknown_type', {});

      expect(workflow.steps).toHaveLength(1);
      expect(workflow.steps[0].name).toBe('general_analysis');
      expect(workflow.steps[0].agent).toBe('legal_analyzer');
      expect(workflow.steps[0].critical).toBe(true);
    });
  });

  describe('executeAgentStep', () => {
    it('should execute agent step successfully', async () => {
      const agent = await orchestrator.createAgent('legal_analyzer');
      const step = {
        name: 'analyze_case',
        description: 'Analyze case details',
        critical: true
      };
      const taskData = { caseId: 'TEST_CASE' };
      const previousResults = {};

      const result = await orchestrator.executeAgentStep(agent, step, taskData, previousResults);

      expect(result.success).toBe(true);
      expect(result.result).toBeDefined();
      expect(result.agent).toBe('legal_analyzer');
      expect(result.step).toBe('analyze_case');
      expect(result.timestamp).toBeDefined();
    });

    it('should handle agent step failures', async () => {
      const failingAI = {
        run: vi.fn().mockRejectedValue(new Error('Agent step failed'))
      };

      const failingOrchestrator = new AgentOrchestrator(failingAI, mockEnv);
      const agent = await failingOrchestrator.createAgent('legal_analyzer');
      const step = { name: 'test_step', description: 'Test step' };

      const result = await failingOrchestrator.executeAgentStep(agent, step, {}, {});

      expect(result.success).toBe(false);
      expect(result.error).toBe('Agent step failed');
      expect(result.agent).toBe('legal_analyzer');
      expect(result.step).toBe('test_step');
    });
  });

  describe('buildAgentPrompt', () => {
    it('should build comprehensive prompt for agent', () => {
      const agent = {
        config: {
          prompt_prefix: 'You are a legal analysis expert.',
          role: 'Legal Analysis Specialist'
        }
      };

      const step = {
        description: 'Analyze case documents'
      };

      const taskData = {
        caseId: 'SMITH_v_JONES',
        documents: ['contract.pdf']
      };

      const previousResults = {
        previous_step: { result: 'Previous analysis complete' }
      };

      const prompt = orchestrator.buildAgentPrompt(agent, step, taskData, previousResults);

      expect(prompt).toContain('You are a legal analysis expert.');
      expect(prompt).toContain('TASK: Analyze case documents');
      expect(prompt).toContain('SMITH_v_JONES');
      expect(prompt).toContain('Previous analysis complete');
      expect(prompt).toContain('Legal Analysis Specialist');
    });

    it('should handle empty previous results', () => {
      const agent = {
        config: {
          prompt_prefix: 'You are an expert.',
          role: 'Specialist'
        }
      };

      const step = { description: 'Test task' };
      const taskData = { id: 'test' };
      const previousResults = {};

      const prompt = orchestrator.buildAgentPrompt(agent, step, taskData, previousResults);

      expect(prompt).toContain('You are an expert.');
      expect(prompt).toContain('TASK: Test task');
      expect(prompt).toContain('"id": "test"');
      expect(prompt).not.toContain('PREVIOUS RESULTS:');
    });
  });

  describe('compileWorkflowResults', () => {
    it('should compile successful workflow results', () => {
      const workflow = { type: 'test_workflow', steps: [{}, {}, {}] };
      const results = {
        step1: { success: true, result: 'Step 1 complete' },
        step2: { success: true, result: 'Step 2 complete' },
        step3: { success: false, error: 'Step 3 failed' }
      };

      const summary = orchestrator.compileWorkflowResults(workflow, results);

      expect(summary.total_steps).toBe(3);
      expect(summary.completed_steps).toBe(3);
      expect(summary.success_rate).toBe(2/3); // 2 successful out of 3
      expect(summary.results).toBe(results);
      expect(summary.recommendations).toContain('Review and retry step: step3');
    });

    it('should compile fully successful workflow', () => {
      const workflow = { steps: [{}, {}] };
      const results = {
        step1: { success: true },
        step2: { success: true }
      };

      const summary = orchestrator.compileWorkflowResults(workflow, results);

      expect(summary.success_rate).toBe(1.0);
      expect(summary.recommendations).toContain('All workflow steps completed successfully');
    });
  });

  describe('calculateSuccessRate', () => {
    it('should calculate success rate correctly', () => {
      const results = {
        step1: { success: true },
        step2: { success: false },
        step3: { success: true },
        step4: { success: true }
      };

      const rate = orchestrator.calculateSuccessRate(results);

      expect(rate).toBe(0.75); // 3 out of 4 successful
    });

    it('should handle empty results', () => {
      const results = {};

      const rate = orchestrator.calculateSuccessRate(results);

      expect(rate).toBe(0);
    });

    it('should handle all successful results', () => {
      const results = {
        step1: { success: true },
        step2: { success: true }
      };

      const rate = orchestrator.calculateSuccessRate(results);

      expect(rate).toBe(1.0);
    });
  });

  describe('generateRecommendations', () => {
    it('should generate recommendations for failed steps', () => {
      const results = {
        step1: { success: true },
        step2: { error: 'Failed step' },
        step3: { success: true },
        step4: { error: 'Another failure' }
      };

      const recommendations = orchestrator.generateRecommendations(results);

      expect(recommendations).toContain('Review and retry step: step2');
      expect(recommendations).toContain('Review and retry step: step4');
      expect(recommendations).toHaveLength(2);
    });

    it('should generate success message when all steps succeed', () => {
      const results = {
        step1: { success: true },
        step2: { success: true }
      };

      const recommendations = orchestrator.generateRecommendations(results);

      expect(recommendations).toContain('All workflow steps completed successfully');
      expect(recommendations).toHaveLength(1);
    });
  });

  describe('getAgentStatus', () => {
    it('should return agent status information', () => {
      // Add some mock active agents
      orchestrator.activeAgents.set('agent1', { type: 'legal_analyzer' });
      orchestrator.activeAgents.set('agent2', { type: 'document_processor' });

      const status = orchestrator.getAgentStatus();

      expect(status.active_agents).toBe(2);
      expect(status.agent_types).toContain('agent1');
      expect(status.agent_types).toContain('agent2');
      expect(status.timestamp).toBeDefined();
    });

    it('should handle no active agents', () => {
      const status = orchestrator.getAgentStatus();

      expect(status.active_agents).toBe(0);
      expect(status.agent_types).toHaveLength(0);
    });
  });

  describe('cleanupAgents', () => {
    it('should cleanup all active agents', () => {
      // Add some mock active agents
      orchestrator.activeAgents.set('agent1', { type: 'legal_analyzer' });
      orchestrator.activeAgents.set('agent2', { type: 'document_processor' });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      orchestrator.cleanupAgents();

      expect(orchestrator.activeAgents.size).toBe(0);
      expect(consoleSpy).toHaveBeenCalledWith('🧹 Agent cleanup completed');

      consoleSpy.mockRestore();
    });
  });
});