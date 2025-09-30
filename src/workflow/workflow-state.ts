import type { AgentWorkflow, WorkflowStep } from '../types/agent-session';
import type { Message, Tool } from '../types/worker';
import type { WorkflowState, AgentMemory, StepState, WorkflowMemoryMetrics, ToolResult } from '../types/workflow-state';
import type { Session } from '../types/session';

import { logger } from '../utils/logger';
import { TokenCounter } from '../utils/token-counter';
import { ContentProcessor } from '../processing/content';

export class WorkflowStateManager {
  private readonly DEFAULT_MAX_TOKENS = 512;
  private readonly DEFAULT_WARNING_THRESHOLD = 0.8;

  private state?: WorkflowState;
  private session: Session | undefined;
  private tokenCounter: TokenCounter;
  private contentProcessor: ContentProcessor;
  
  constructor(session?: Session) {
    this.session = session;
    this.tokenCounter = new TokenCounter();
    this.contentProcessor = new ContentProcessor();
  }

  initializeState(userPrompt: string, workflow: AgentWorkflow, tools: Tool[]): void {
    this.state = {
      workflow,
      startTime: Date.now(),
      completedSteps: new Set<string>(),
      iteration: 1,
      maxIterations: workflow.maxIterations ?? 10,
      timeout: workflow.timeout ?? 60000,
      tools: [...tools, ...workflow.tools],
      memoryConfig: {
        enableMessageSummarization: workflow.memoryConfig?.enableMessageSummarization ?? false,
        enableMessagePruning: workflow.memoryConfig?.enableMessagePruning ?? false,
        enableMessageHistory: workflow.memoryConfig?.enableMessageHistory ?? false,
        enableToolResultStorage: workflow.memoryConfig?.enableToolResultStorage ?? false,
        maxMemoryTokens: workflow.memoryConfig?.maxMemoryTokens ?? this.DEFAULT_MAX_TOKENS,
      },
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
    
    // Initialize memory metrics and token counting
    this.initializeMemoryMetrics();
    this.updateTokenCount();
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
    
    this.state.memoryMetrics = {
      messageCount: this.state.memory.messages?.length ?? 0,
      estimatedTokens: 0,
      pruneCount: 0,
      summarizationCount: 0,
      avgStepResultSize: 0,
      maxTokenLimit: this.DEFAULT_MAX_TOKENS,
      warningThreshold: this.DEFAULT_WARNING_THRESHOLD,
    };
  }

  private getToolResultsInstruction(toolResults: Record<string, ToolResult>): Message[] {
    if (Object.values(toolResults).length === 0) {
      return [];
    }
    return [{ role: 'system', content: 'Refer to the following tool results when generating your response:\n' +
      Object.values(toolResults).map(toolResult => 
        `${toolResult.name}: ${toolResult.description}\n${toolResult.result}`
      ).join('\n') }];
  }

  private updateTokenCount(): void {
    if (!this.state?.memory.messages) return;
    
    const messageHistoryTokenCount = this.tokenCounter.estimateTokens(this.state.memory.messages);
    
    let toolResultsInstruction: Message[] = [];
    if (this.state.memoryConfig?.enableToolResultStorage) {
      toolResultsInstruction = this.getToolResultsInstruction(this.state.memory.toolResults);
    }
    const toolResultsTokenCount = this.tokenCounter.estimateTokens(toolResultsInstruction);
    const tokenCount = messageHistoryTokenCount + toolResultsTokenCount;

    this.state.currentTokenCount = tokenCount;
    this.state.tokenCountLastUpdated = new Date();
    
    if (this.state.memoryMetrics) {
      this.state.memoryMetrics.estimatedTokens = tokenCount;
      this.state.memoryMetrics.messageCount = this.state.memory.messages.length;
      this.updateMemoryMetrics();
    }
    
    logger.agent.debug('Token count updated', {
      tokenCount,
      messageCount: this.state.memory.messages.length,
      utilizationPercent: (tokenCount / this.DEFAULT_MAX_TOKENS) * 100
    });
  }

  private updateMemoryMetrics(): void {
    if (!this.state?.memoryMetrics) return;
    
    const stepResults = Object.values(this.state.memory.steps)
      .filter(s => s.result)
      .map(s => s.result!.length);
    
    this.state.memoryMetrics.avgStepResultSize = stepResults.length > 0 
      ? stepResults.reduce((a, b) => a + b, 0) / stepResults.length 
      : 0;
  }

  private async checkMemoryPressure(): Promise<void> {
    if (!this.state?.memoryMetrics) return;
    
    const { estimatedTokens, maxTokenLimit, warningThreshold } = this.state.memoryMetrics;
    const utilizationPercent = (estimatedTokens / maxTokenLimit) * 100;
    
    if (estimatedTokens > maxTokenLimit * warningThreshold) {
      logger.agent.warn('Approaching context limit', {
        currentTokens: estimatedTokens,
        maxTokens: maxTokenLimit,
        utilizationPercent,
        messageCount: this.state.memoryMetrics.messageCount,
        summarizationEnabled: this.state.memoryConfig?.enableMessageSummarization ?? false,
        pruningEnabled: this.state.memoryConfig?.enableMessagePruning ?? false
      });

      await this.summarizeMessages();
      const targetTokens = Math.floor(maxTokenLimit * 0.6);
      this.pruneMessageHistory(targetTokens);
    }
  }

  private async summarizeMessages(): Promise<void> {
    if (!this.state?.memory.messages || !this.session 
      || !this.state.memoryConfig?.enableMessageSummarization) return;
    
    const originalCount = this.state.memory.messages.length;
    const originalTokens = this.state.currentTokenCount ?? 0;
        
    logger.agent.debug('Summarizing messages', {
      messagesToSummarize: this.state.memory.messages.map(m => m.content),
      messageCount: this.state.memory.messages.length
    });
    
    try {
      // Create summarization prompt
      const summarizationMessages: Message[] = [
        {
          role: 'system',
          content: 'Summarize conversation history into key facts only. ' +
          'Be extremely concise.'
        },
        {
          role: 'user',
          content: 'Summarize this conversation: ' +
          `${this.state.memory.messages.map((msg) => `${msg.role}: ${msg.content}`).join('\n')}`
        }
      ];
      
      // Generate summary using the session
      let response = '';
      for await (const chunk of this.session.createResponse({
        messages: summarizationMessages,
        temperature: 0.1,
        max_new_tokens: 2048
      }, 'chat')) {
        if (!chunk.isLast) {
          response += chunk.token;
        }
      }

      const { cleanContent } = this.contentProcessor.removeThinkTags(response);
      
      // Create summarized message
      const summaryMessage: Message = {
        role: 'assistant',
        content: cleanContent
      };
      
      // Replace message history with system, user, and summary
      this.state.memory.messages = [summaryMessage];
      
      // Update metrics
      if (this.state.memoryMetrics) {
        this.state.memoryMetrics.summarizationCount += 1;
        this.state.memoryMetrics.lastSummarizationTime = Date.now();
      }
      
      this.updateTokenCount();
      
      logger.agent.info('Message history summarized', {
        originalMessageCount: originalCount,
        newMessageCount: this.state.memory.messages.length,
        removedMessages: originalCount - this.state.memory.messages.length,
        originalTokens,
        newTokens: this.state.currentTokenCount,
        summarizationCount: this.state.memoryMetrics?.summarizationCount ?? 0,
        summaryLength: cleanContent.length
      });
      logger.agent.debug('Summary', {
        summary: cleanContent
      });
      
    } catch (error: any) {
      logger.agent.error('Failed to summarize messages', {
        error: error.message,
        messageCount: this.state.memory.messages.length
      });
    }
  }

  private pruneMessageHistory(targetTokenCount: number): void {
    if (!this.state?.memory.messages 
      || !this.state.memoryConfig?.enableMessagePruning) return;
    
    const originalCount = this.state.memory.messages.length;
    const originalTokens = this.state.currentTokenCount ?? 0;
    
    // Estimate tokens for workflow prompts
    const workflowPrompts = this.getWorkflowPrompts();
    let currentTokens = this.tokenCounter.estimateTokens(workflowPrompts);
    
    // Collect recent messages that fit within the target limit
    const recentMessages = this.state.memory.messages.reverse();
    const messagesToKeep: Message[] = [];
    
    for (const message of recentMessages) {
      const messageTokens = this.tokenCounter.estimateTokens([message]);
      if (currentTokens + messageTokens > targetTokenCount) break;
      
      messagesToKeep.unshift(message); // Add to beginning to maintain chronological order
      currentTokens += messageTokens;
    }
    
    // Combine preserved system messages with recent messages in correct order
    this.state.memory.messages = messagesToKeep;

    this.updateTokenCount();
    
    logger.agent.info('Message history pruned', {
      originalMessageCount: originalCount,
      newMessageCount: this.state.memory.messages.length,
      removedMessages: originalCount - this.state.memory.messages.length,
      originalTokens,
      newTokens: this.state.currentTokenCount,
      targetTokens: targetTokenCount,
      pruneCount: this.state.memoryMetrics?.pruneCount ?? 0
    });
  }

  async addMessagesToMemory(messages: Message[], skipPruning = false): Promise<void> {
    if (!this.state || !this.state.memoryConfig?.enableMessageHistory) {
      throw new Error('State not initialized');
    }
    logger.agent.debug('Adding messages to memory', {
      messages,
      skipPruning
    });
    this.state.memory.messages?.push(...messages);
    this.updateTokenCount();
    
    // Skip memory pressure check and pruning if requested (e.g., for last step)
    if (!skipPruning) {
      await this.checkMemoryPressure();
    }
  }

  getMessages(): Message[] {
    if (!this.state) {
      throw new Error('State not initialized');
    }
    return this.state.memory.messages ?? [];
  }

  addToolResultToMemory(stepId: string, toolResult: ToolResult): void {
    if (!this.state) {
      throw new Error('State not initialized');
    }
    if (this.state.memoryConfig?.enableToolResultStorage) {
      logger.agent.debug('Adding tool result to memory', {
        stepId,
        toolResult
      });
      this.state.memory.toolResults['step_' + stepId] = toolResult;
    }
  }
  
  getToolResults(): Record<string, ToolResult> {
    if (!this.state) {
      throw new Error('State not initialized');
    }
    return this.state.memory.toolResults;
  }

  rollbackMessagesToCount(targetCount: number) {
    if (!this.state) {
      throw new Error('State not initialized');
    }
    if (!this.state.memory.messages) {
      return;
    }
    const currentCount = this.state.memory.messages.length;
    if (currentCount > targetCount) {
      this.state.memory.messages.splice(targetCount);
      this.updateTokenCount();
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
    let systemPrompt = this.state.systemPrompt ?? 'You are ' +
      'a helpful AI agent. Think step-by-step. When a tool is needed, ' +
      'call it with minimal arguments. Be concise when replying to the ' +
      'user.';

    // systemPrompt = systemPrompt + '\n**Workflow Steps:**\n' +
    //   Object.values(this.state.memory.steps).map(step => step.description).join('\n');
    
    return [
      { role: 'system', content: systemPrompt +
        `${Object.values(toolResults).length > 0 ? '**Tool Results:**\n' +
            Object.values(toolResults).map(
              toolResult => `${toolResult.name}: ${toolResult.description}\n${toolResult.result}`).join('\n') : ''}`
      },
      { role: 'user', content: this.state.memory.workflowUserPrompt }
    ];
  }

  getMessageCount(): number {
    if (!this.state) {
      throw new Error('State not initialized');
    }
    return this.state.memory.messages?.length ?? 0;
  }

  getCurrentTokenCount(): number {
    if (!this.state) {
      throw new Error('State not initialized');
    }
    return this.state.currentTokenCount ?? 0;
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

  isStepComplete(stepId: string): boolean {
    if (!this.state) {
      throw new Error('State not initialized');
    }
    if (!this.state.memory.steps[stepId]) {
      throw new Error('Step not found');
    }
    return this.state.memory.steps[stepId].complete;
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

  logStepExecution(
    workflow: AgentWorkflow,
    step: WorkflowStep,
    iteration: number,
  ): void {
    logger.agent.info('Executing workflow step', { 
      workflowId: workflow.id, 
      stepId: step.id, 
      stepType: step.generationTask,
      iteration,
    });
  }
}
