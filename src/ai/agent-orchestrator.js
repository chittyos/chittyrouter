/**
 * Agent Orchestrator - Coordinates multiple AI agents for complex tasks
 * Enables ChittyRouter to handle multi-step legal workflows
 */

export class AgentOrchestrator {
  constructor(ai, env) {
    this.ai = ai;
    this.env = env;
    this.activeAgents = new Map();
  }

  /**
   * Execute complex tasks using multiple coordinated AI agents
   */
  async executeTask(taskData) {
    console.log('🎯 Agent orchestrator executing task:', taskData.type);

    try {
      const taskId = `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Determine required agents based on task type
      const requiredAgents = this.determineRequiredAgents(taskData);

      // Initialize agents
      const agents = await this.initializeAgents(requiredAgents);

      // Execute coordinated workflow
      const result = await this.coordinateAgents(taskId, taskData, agents);

      return {
        taskId,
        success: true,
        result,
        agents_used: requiredAgents,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ Agent orchestration failed:', error);
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Determine which AI agents are needed for a task
   */
  determineRequiredAgents(taskData) {
    const agentMap = {
      'case_analysis': ['legal_analyzer', 'document_processor', 'timeline_builder'],
      'document_review': ['document_analyzer', 'compliance_checker', 'risk_assessor'],
      'client_communication': ['message_composer', 'tone_analyzer', 'response_generator'],
      'court_preparation': ['deadline_tracker', 'document_organizer', 'calendar_coordinator'],
      'evidence_processing': ['evidence_analyzer', 'chain_builder', 'verification_agent'],
      'intake_processing': ['triage_agent', 'client_classifier', 'routing_optimizer']
    };

    return agentMap[taskData.type] || ['general_assistant'];
  }

  /**
   * Initialize AI agents with specific roles
   */
  async initializeAgents(agentTypes) {
    const agents = {};

    for (const agentType of agentTypes) {
      try {
        agents[agentType] = await this.createAgent(agentType);
        console.log(`🤖 Initialized ${agentType} agent`);
      } catch (error) {
        console.error(`Failed to initialize ${agentType}:`, error);
      }
    }

    return agents;
  }

  /**
   * Create specialized AI agent
   */
  async createAgent(agentType) {
    const agentConfigs = {
      legal_analyzer: {
        role: 'Legal Analysis Specialist',
        expertise: 'Case law, precedents, legal strategy',
        prompt_prefix: 'You are a legal analysis expert. Analyze legal documents and cases with precision.'
      },
      document_processor: {
        role: 'Document Processing Specialist',
        expertise: 'Document classification, extraction, organization',
        prompt_prefix: 'You are a document processing expert. Classify and extract key information from legal documents.'
      },
      timeline_builder: {
        role: 'Legal Timeline Specialist',
        expertise: 'Chronological analysis, deadline tracking',
        prompt_prefix: 'You are a timeline specialist. Build chronological sequences and track important dates.'
      },
      compliance_checker: {
        role: 'Compliance Verification Specialist',
        expertise: 'Regulatory compliance, legal requirements',
        prompt_prefix: 'You are a compliance expert. Verify legal and regulatory compliance.'
      },
      message_composer: {
        role: 'Legal Communication Specialist',
        expertise: 'Professional legal communication, client relations',
        prompt_prefix: 'You are a legal communication expert. Compose professional, clear legal communications.'
      },
      evidence_analyzer: {
        role: 'Evidence Analysis Specialist',
        expertise: 'Evidence evaluation, chain of custody, admissibility',
        prompt_prefix: 'You are an evidence analysis expert. Evaluate evidence quality and admissibility.'
      },
      triage_agent: {
        role: 'Legal Triage Specialist',
        expertise: 'Priority assessment, case categorization',
        prompt_prefix: 'You are a legal triage expert. Assess priority and categorize legal matters.'
      }
    };

    const config = agentConfigs[agentType] || agentConfigs.legal_analyzer;

    return {
      type: agentType,
      config,
      id: `${agentType}-${Date.now()}`,
      status: 'initialized'
    };
  }

  /**
   * Coordinate multiple agents to complete complex task
   */
  async coordinateAgents(taskId, taskData, agents) {
    const workflow = this.createWorkflow(taskData.type, taskData);
    const results = {};

    console.log(`🔄 Executing ${workflow.steps.length} workflow steps`);

    for (const step of workflow.steps) {
      try {
        const agent = agents[step.agent];
        if (!agent) {
          console.warn(`⚠️ Agent ${step.agent} not available, skipping step`);
          continue;
        }

        console.log(`🔧 Executing step: ${step.description}`);

        const stepResult = await this.executeAgentStep(agent, step, taskData, results);
        results[step.name] = stepResult;

        // Check if step has dependencies that failed
        if (stepResult.error && step.critical) {
          throw new Error(`Critical step failed: ${step.description}`);
        }

      } catch (error) {
        console.error(`Step '${step.description}' failed:`, error);
        results[step.name] = { error: error.message };
      }
    }

    // Compile final result
    return this.compileWorkflowResults(workflow, results);
  }

  /**
   * Create workflow based on task type
   */
  createWorkflow(taskType, taskData) {
    const workflows = {
      case_analysis: {
        steps: [
          {
            name: 'analyze_case',
            agent: 'legal_analyzer',
            description: 'Analyze case details and legal implications',
            critical: true
          },
          {
            name: 'process_documents',
            agent: 'document_processor',
            description: 'Process and categorize case documents',
            critical: false
          },
          {
            name: 'build_timeline',
            agent: 'timeline_builder',
            description: 'Create chronological case timeline',
            critical: false
          }
        ]
      },
      document_review: {
        steps: [
          {
            name: 'analyze_document',
            agent: 'document_analyzer',
            description: 'Analyze document content and structure',
            critical: true
          },
          {
            name: 'check_compliance',
            agent: 'compliance_checker',
            description: 'Verify regulatory compliance',
            critical: true
          },
          {
            name: 'assess_risk',
            agent: 'risk_assessor',
            description: 'Assess potential legal risks',
            critical: false
          }
        ]
      },
      client_communication: {
        steps: [
          {
            name: 'analyze_request',
            agent: 'triage_agent',
            description: 'Analyze client communication request',
            critical: true
          },
          {
            name: 'compose_response',
            agent: 'message_composer',
            description: 'Compose appropriate response',
            critical: true
          }
        ]
      }
    };

    return workflows[taskType] || {
      steps: [{
        name: 'general_analysis',
        agent: 'legal_analyzer',
        description: 'General legal analysis',
        critical: true
      }]
    };
  }

  /**
   * Execute individual agent step
   */
  async executeAgentStep(agent, step, taskData, previousResults) {
    const prompt = this.buildAgentPrompt(agent, step, taskData, previousResults);

    try {
      const response = await this.ai.run('@cf/meta/llama-3.1-8b-instruct', {
        messages: [{ role: 'user', content: prompt }]
      });

      return {
        success: true,
        result: response.response,
        agent: agent.type,
        step: step.name,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        agent: agent.type,
        step: step.name,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Build specialized prompt for agent
   */
  buildAgentPrompt(agent, step, taskData, previousResults) {
    let prompt = agent.config.prompt_prefix + '\n\n';

    prompt += `TASK: ${step.description}\n\n`;

    prompt += `TASK DATA:\n${JSON.stringify(taskData, null, 2)}\n\n`;

    if (Object.keys(previousResults).length > 0) {
      prompt += `PREVIOUS RESULTS:\n${JSON.stringify(previousResults, null, 2)}\n\n`;
    }

    prompt += `Please provide a detailed analysis and recommendations based on your expertise as a ${agent.config.role}.`;

    return prompt;
  }

  /**
   * Compile final workflow results
   */
  compileWorkflowResults(workflow, results) {
    const summary = {
      workflow_type: workflow.type,
      total_steps: workflow.steps.length,
      completed_steps: Object.keys(results).length,
      success_rate: this.calculateSuccessRate(results),
      results,
      recommendations: this.generateRecommendations(results)
    };

    return summary;
  }

  /**
   * Calculate workflow success rate
   */
  calculateSuccessRate(results) {
    const total = Object.keys(results).length;
    const successful = Object.values(results).filter(r => r.success).length;
    return total > 0 ? (successful / total) : 0;
  }

  /**
   * Generate recommendations based on results
   */
  generateRecommendations(results) {
    const recommendations = [];

    for (const [stepName, result] of Object.entries(results)) {
      if (result.error) {
        recommendations.push(`Review and retry step: ${stepName}`);
      }
    }

    if (recommendations.length === 0) {
      recommendations.push('All workflow steps completed successfully');
    }

    return recommendations;
  }

  /**
   * Get status of all active agents
   */
  getAgentStatus() {
    return {
      active_agents: this.activeAgents.size,
      agent_types: Array.from(this.activeAgents.keys()),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Cleanup completed agents
   */
  cleanupAgents() {
    this.activeAgents.clear();
    console.log('🧹 Agent cleanup completed');
  }
}