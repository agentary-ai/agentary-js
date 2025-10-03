import type { AgentWorkflow, WorkflowStep, AgentMemoryConfig } from '../types/agent-session';
import type { Message, Tool } from '../types/worker';
import type { WorkflowState, AgentMemory, StepState, WorkflowMemoryMetrics } from '../types/workflow-state';
import type { Session } from '../types/session';
import type { 
  MemoryStrategy, 
  MemoryFormatter, 
  CompressionStrategy,
  MemoryMessage,
  MemoryConfig,
  ToolResult
} from '../types/memory';

import { logger } from '../utils/logger';
import { TokenCounter } from '../utils/token-counter';
import { SlidingWindowStrategy } from '../memory/strategies/sliding-window-strategy';
import { DefaultMemoryFormatter } from '../memory/formatters/default-formatter';
import { SummarizationCompressionStrategy } from '../memory/strategies/summarization-compression';

export class WorkflowStateManager {
  private readonly DEFAULT_MAX_TOKENS = 2048;
  private readonly DEFAULT_WARNING_THRESHOLD = 0.8;

  private state?: WorkflowState;
  private session: Session | undefined;
  private tokenCounter: TokenCounter;
  private memoryStrategy: MemoryStrategy;
  private memoryFormatter: MemoryFormatter;
  private compressionStrategy?: CompressionStrategy;
  private memoryConfig?: MemoryConfig;
  
  constructor(session?: Session, memoryConfig?: MemoryConfig | AgentMemoryConfig) {
    this.session = session;
    this.tokenCounter = new TokenCounter();
    
    // Convert legacy config to new config if needed
    const normalizedConfig = this.normalizeMemoryConfig(memoryConfig);
    if (normalizedConfig) {
      this.memoryConfig = normalizedConfig;
    }
    
    // Use provided or default strategies
    this.memoryStrategy = normalizedConfig?.strategy || 
      new SlidingWindowStrategy(normalizedConfig?.maxTokens || this.DEFAULT_MAX_TOKENS);
    
    this.memoryFormatter = normalizedConfig?.formatter || 
      new DefaultMemoryFormatter();
    
    if (normalizedConfig?.compressionStrategy) {
      this.compressionStrategy = normalizedConfig.compressionStrategy;
    }
    
    // Enable auto-compression with summarization if legacy config indicates it
    if (this.isLegacyConfig(memoryConfig) && memoryConfig?.enableMessageSummarization && session) {
      this.compressionStrategy = new SummarizationCompressionStrategy();
    }
  }
  
  private isLegacyConfig(config?: MemoryConfig | AgentMemoryConfig): config is AgentMemoryConfig {
    return config ? 'enableMessageSummarization' in config : false;
  }
  
  private normalizeMemoryConfig(config?: MemoryConfig | AgentMemoryConfig): MemoryConfig | undefined {
    if (!config) return undefined;
    
    // If it's already new format, return as is
    if ('strategy' in config || 'formatter' in config || 'compressionStrategy' in config) {
      return config as MemoryConfig;
    }
    
    // Convert legacy config
    const legacyConfig = config as AgentMemoryConfig;
    const autoCompressValue = legacyConfig.enableMessagePruning || legacyConfig.enableMessageSummarization;
    
    const memoryConfig: MemoryConfig = {
      maxTokens: legacyConfig.maxMemoryTokens || this.DEFAULT_MAX_TOKENS,
      compressionThreshold: this.DEFAULT_WARNING_THRESHOLD
    };
    
    if (autoCompressValue) {
      memoryConfig.autoCompress = true;
    }
    
    return memoryConfig;
  }

  initializeState(userPrompt: string, workflow: AgentWorkflow, tools: Tool[]): void {
    // Update memory config and strategy if workflow provides one
    if (workflow.memoryConfig) {
      const normalizedConfig = this.normalizeMemoryConfig(workflow.memoryConfig);
      if (normalizedConfig) {
        this.memoryConfig = normalizedConfig;
      }
      
      if (normalizedConfig?.strategy) {
        this.memoryStrategy = normalizedConfig.strategy;
      }
      if (normalizedConfig?.formatter) {
        this.memoryFormatter = normalizedConfig.formatter;
      }
      if (normalizedConfig?.compressionStrategy) {
        this.compressionStrategy = normalizedConfig.compressionStrategy;
      }
    }
    
    this.state = {
      workflow,
      startTime: Date.now(),
      completedSteps: new Set<string>(),
      iteration: 1,
      maxIterations: workflow.maxIterations ?? 10,
      timeout: workflow.timeout ?? 60000,
      tools: [...tools, ...workflow.tools],
      memory: this.initializeMemory(
        workflow.steps,
        workflow.systemPrompt,
        userPrompt,
        workflow.name,
        workflow.description,
        workflow.context,
      ),
    };
    if (workflow.systemPrompt) {
      this.state.systemPrompt = workflow.systemPrompt;
    }
    
    // Clear memory strategy for fresh start
    this.memoryStrategy.clear();
    
    // Initialize memory metrics
    this.initializeMemoryMetrics();
  }

  private initializeMemory(
    workflowSteps: WorkflowStep[],
    workflowSystemPrompt: string | undefined,
    workflowUserPrompt: string,
    workflowName: string | undefined,
    workflowDescription: string | undefined,
    context: Record<string, any> | undefined,
  ): AgentMemory {
    const stepsState: Record<string, StepState> = {};
    workflowSteps.forEach(step => {
      stepsState[step.id] = {
        id: step.id,
        description: step.description,
        complete: false,
        attempts: 0,
        maxAttempts: step.maxAttempts ?? 3,
      };
    });

    const memory: AgentMemory = {
      workflowUserPrompt,
      steps: stepsState,
      toolResults: {},
      messages: [],
    };
    if (workflowName) {
      memory.workflowName = workflowName;
    }
    if (workflowDescription) {
      memory.workflowDescription = workflowDescription;
    }
    if (workflowSystemPrompt) {
      memory.workflowSystemPrompt = workflowSystemPrompt;
    }
    if (context) {
      memory.context = context;
    }
    return memory;
  }

  private initializeMemoryMetrics(): void {
    if (!this.state) {
      throw new Error('State not initialized');
    }
    
    const strategyMetrics = this.memoryStrategy.getMetrics();
    this.state.memoryMetrics = {
      messageCount: strategyMetrics.messageCount,
      estimatedTokens: strategyMetrics.estimatedTokens,
      pruneCount: strategyMetrics.compressionCount,
      summarizationCount: strategyMetrics.compressionCount,
      avgStepResultSize: 0,
      maxTokenLimit: this.memoryConfig?.maxTokens || this.DEFAULT_MAX_TOKENS,
      warningThreshold: this.memoryConfig?.compressionThreshold || this.DEFAULT_WARNING_THRESHOLD,
    };
  }

  private updateMemoryMetrics(): void {
    if (!this.state) return;
    
    const strategyMetrics = this.memoryStrategy.getMetrics();
    
    // Update workflow state metrics
    if (this.state.memoryMetrics) {
      this.state.memoryMetrics.messageCount = strategyMetrics.messageCount;
      this.state.memoryMetrics.estimatedTokens = strategyMetrics.estimatedTokens;
      this.state.memoryMetrics.summarizationCount = strategyMetrics.compressionCount;
      this.state.memoryMetrics.pruneCount = strategyMetrics.compressionCount;
      
      if (strategyMetrics.lastCompressionTime !== undefined) {
        this.state.memoryMetrics.lastSummarizationTime = strategyMetrics.lastCompressionTime;
        this.state.memoryMetrics.lastPruneTime = strategyMetrics.lastCompressionTime;
      }
    }
    
    // Calculate average step result size
    const stepResults = Object.values(this.state.memory.steps)
      .filter(s => s.result)
      .map(s => s.result!.length);
    
    if (this.state.memoryMetrics && stepResults.length > 0) {
      this.state.memoryMetrics.avgStepResultSize = 
        stepResults.reduce((a, b) => a + b, 0) / stepResults.length;
    }
    
    // Update current token count
    this.state.currentTokenCount = strategyMetrics.estimatedTokens;
    this.state.tokenCountLastUpdated = new Date();
    
    logger.agent.debug('Memory metrics updated', {
      messageCount: strategyMetrics.messageCount,
      estimatedTokens: strategyMetrics.estimatedTokens,
      compressionCount: strategyMetrics.compressionCount
    });
  }

  private async checkMemoryPressure(): Promise<void> {
    if (!this.state?.memoryMetrics) return;
    
    const metrics = this.memoryStrategy.getMetrics();
    const config = this.memoryConfig || { 
      maxTokens: this.DEFAULT_MAX_TOKENS, 
      compressionThreshold: this.DEFAULT_WARNING_THRESHOLD 
    };
    
    // Check if compression is needed
    if (this.compressionStrategy?.shouldCompress(metrics, config)) {
      logger.agent.warn('Memory pressure detected, compressing', {
        currentTokens: metrics.estimatedTokens,
        maxTokens: config.maxTokens,
        messageCount: metrics.messageCount
      });
      
      const messages = await this.memoryStrategy.retrieve();
      const targetTokens = Math.floor((config.maxTokens || this.DEFAULT_MAX_TOKENS) * 0.6);
      
      const compressed = await this.compressionStrategy.compress(
        messages,
        targetTokens,
        this.session
      );
      
      this.memoryStrategy.clear();
      await this.memoryStrategy.add(compressed);
      this.updateMemoryMetrics();
    } else if (this.isContextNearLimit()) {
      // Fallback to simple pruning if no compression strategy
      const targetTokens = Math.floor((config.maxTokens || this.DEFAULT_MAX_TOKENS) * 0.7);
      if (this.memoryStrategy.compress) {
        await this.memoryStrategy.compress({
          targetTokens,
          preserveTypes: ['system', 'summary']
        });
        this.updateMemoryMetrics();
      }
    }
  }


  async addMessagesToMemory(messages: Message[], skipCompression = false): Promise<void> {
    if (!this.state) {
      throw new Error('State not initialized');
    }
    
    logger.agent.debug('Adding messages to memory', {
      messageCount: messages.length,
      skipCompression
    });
    
    // Convert to MemoryMessage format with metadata
    const memoryMessages: MemoryMessage[] = messages.map(m => ({
      role: m.role,
      content: m.content,
      metadata: {
        timestamp: Date.now(),
        type: this.inferMessageType(m)
      }
    }));
    
    // Add to memory strategy
    await this.memoryStrategy.add(memoryMessages);
    
    // Also add to legacy memory for backward compatibility
    if (!this.state.memory.messages) {
      this.state.memory.messages = [];
    }
    this.state.memory.messages.push(...messages);
    
    // Update metrics
    this.updateMemoryMetrics();
    
    // Check memory pressure if not skipped
    if (!skipCompression) {
      await this.checkMemoryPressure();
    }
  }
  
  private inferMessageType(message: Message): 'system' | 'user' | 'assistant' | 'tool_result' | 'step' | 'summary' {
    if (message.role === 'system') return 'system';
    if (message.content.startsWith('**Step:**')) return 'step';
    if (message.role === 'user') {
      try {
        JSON.parse(message.content);
        return 'tool_result';
      } catch {
        return 'user';
      }
    }
    return 'assistant';
  }

  async getMessages(): Promise<Message[]> {
    if (!this.state) {
      throw new Error('State not initialized');
    }
    
    // Retrieve from memory strategy and format
    const memoryMessages = await this.memoryStrategy.retrieve();
    return this.memoryFormatter.formatMessages(memoryMessages);
  }

  addToolResultToMemory(stepId: string, toolResult: ToolResult): void {
    if (!this.state) {
      throw new Error('State not initialized');
    }
    
    logger.agent.debug('Adding tool result to memory', {
      stepId,
      toolResult
    });
    this.state.memory.toolResults['step_' + stepId] = toolResult;
  }
  
  getToolResults(): Record<string, ToolResult> {
    if (!this.state) {
      throw new Error('State not initialized');
    }
    return this.state.memory.toolResults;
  }

  async rollbackMessagesToCount(targetCount: number) {
    if (!this.state) {
      throw new Error('State not initialized');
    }
    
    const currentMessages = await this.memoryStrategy.retrieve();
    const currentCount = currentMessages.length;
    
    if (currentCount > targetCount) {
      // Clear and re-add only the messages we want to keep
      this.memoryStrategy.clear();
      await this.memoryStrategy.add(currentMessages.slice(0, targetCount));
      
      // Also update legacy memory
      if (this.state.memory.messages) {
        this.state.memory.messages.splice(targetCount);
      }
      
      this.updateMemoryMetrics();
      
      logger.agent.debug('Rolled back messages', { 
        from: currentCount, 
        to: targetCount,
        removed: currentCount - targetCount,
        newTokenCount: this.state.currentTokenCount
      });
    }
  }

  getWorkflowPrompts(): Message[] {
    if (!this.state) {
      throw new Error('State not initialized');
    }
    
    const toolResults = this.getToolResults();
    const basePrompt = this.state.systemPrompt ?? 
      'You are a helpful AI agent. Think step-by-step. When a tool is needed, ' +
      'call it with minimal arguments. Be concise when replying to the user.';
    
    // Format tool results using the formatter if available
    const toolResultsContext = this.memoryFormatter.formatToolResults 
      ? this.memoryFormatter.formatToolResults(toolResults)
      : this.formatToolResultsDefault(toolResults);
    
    const systemPrompt = this.memoryFormatter.formatSystemPrompt
      ? this.memoryFormatter.formatSystemPrompt(basePrompt, toolResultsContext)
      : basePrompt + (toolResultsContext ? '\n' + toolResultsContext : '');
    
    return [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: this.state.memory.workflowUserPrompt }
    ];
  }
  
  private formatToolResultsDefault(toolResults: Record<string, ToolResult>): string {
    if (Object.values(toolResults).length === 0) return '';
    
    return '**Tool Results:**\n' +
      Object.values(toolResults)
        .map(tr => `${tr.name}: ${tr.description}\n${tr.result}`)
        .join('\n');
  }
  
  getFormattedStepInstruction(stepId: string, prompt: string): string {
    return this.memoryFormatter.formatStepInstruction
      ? this.memoryFormatter.formatStepInstruction(stepId, prompt)
      : `**Step:** ${stepId}: ${prompt}`;
  }

  getMessageCount(): number {
    if (!this.state) {
      throw new Error('State not initialized');
    }
    return this.memoryStrategy.getMetrics().messageCount;
  }

  getCurrentTokenCount(): number {
    if (!this.state) {
      throw new Error('State not initialized');
    }
    return this.memoryStrategy.getMetrics().estimatedTokens;
  }

  getMemoryMetrics(): WorkflowMemoryMetrics | undefined {
    return this.state?.memoryMetrics;
  }

  isContextNearLimit(): boolean {
    if (!this.state?.memoryMetrics) return false;
    const { estimatedTokens, maxTokenLimit, warningThreshold } = this.state.memoryMetrics;
    return estimatedTokens > maxTokenLimit * warningThreshold;
  }

  getState(): WorkflowState {
    if (!this.state) {
      throw new Error('State not initialized');
    }
    return this.state;
  }

  // TODO: Support intelligent step selection
  findNextStep(): WorkflowStep | undefined {
    if (!this.state) {
      throw new Error('State not initialized');
    }

    logger.agent.debug('Finding next step', {
      workflowId: this.state.workflow.id,
      iteration: this.state.iteration,
      maxIterations: this.state.maxIterations,
      completedSteps: Array.from(this.state.completedSteps)
    });
    const completedSteps = this.state.completedSteps;
    return this.state.workflow.steps.find(step => {
      if (!step.id || completedSteps.has(step.id)) {
        logger.agent.debug('Skipping step', {
          stepId: step.id,
          completedSteps: Array.from(completedSteps)
        });
        return false;
      }
      
      // Check if step has exceeded max retry attempts
      const stepState = this.state!.memory.steps[step.id];
      if (stepState && stepState.maxAttempts && stepState.attempts >= stepState.maxAttempts) {
        logger.agent.debug('Step has exceeded max retry attempts', {
          stepId: step.id,
          attempts: stepState.attempts,
          maxAttempts: stepState.maxAttempts
        });
        return false;
      }
      
      logger.agent.debug('Returning step', {
        stepId: step.id,
      });
      return true;
    });
  }

  isTimeout(state: WorkflowState): boolean {
    return Date.now() - state.startTime > state.timeout;
  }

  isMaxIterationsReached(state: WorkflowState): boolean {
    return state.iteration >= state.maxIterations;
  }

  getStepState(stepId: string): StepState {
    if (!this.state) {
      throw new Error('State not initialized');
    }
    if (!this.state.memory.steps[stepId]) {
      throw new Error('Step not found');
    }
    return this.state.memory.steps[stepId];
  }

  handleStepCompletion(stepId: string, complete: boolean, result?: string) {
    if (!this.state) {
      throw new Error('State not initialized');
    }
    if (!this.state.memory.steps[stepId]) {
      throw new Error('Step not found');
    }
    this.state.memory.steps[stepId].complete = complete;
    if (result) {
      this.state.memory.steps[stepId].result = result;
    }

    // Only add to completedSteps if the step actually completed successfully
    if (complete) {
      this.state.completedSteps.add(stepId);
    }
  }

  isLastStep(stepId: string): boolean {
    if (!this.state) {
      throw new Error('State not initialized');
    }
    const workflow = this.state.workflow;
    const steps = workflow.steps;
    
    // Find the current step's index
    const currentStepIndex = steps.findIndex(step => step.id === stepId);
    if (currentStepIndex === -1) {
      throw new Error('Step not found in workflow');
    }
    
    // Check if there are any remaining incomplete steps after this one
    for (let i = currentStepIndex + 1; i < steps.length; i++) {
      const futureStep = steps[i];
      if (!futureStep?.id) continue;
      
      const futureStepState = this.state.memory.steps[futureStep.id];
      if (!futureStepState) continue;
      
      // If this future step is not complete and hasn't exceeded max attempts, it's still pending
      if (!futureStepState.complete && 
          (!futureStepState.maxAttempts || futureStepState.attempts < futureStepState.maxAttempts)) {
        return false;
      }
    }
    return true;
  }
}
