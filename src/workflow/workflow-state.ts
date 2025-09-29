import type { AgentWorkflow, WorkflowStep } from '../types/agent-session';
import type { Message, Tool } from '../types/worker';
import type { WorkflowState, AgentMemory, StepState, WorkflowMemoryMetrics } from '../types/workflow-state';

import { logger } from '../utils/logger';
import { TokenCounter } from '../utils/token-counter';

export class WorkflowStateManager {
  private state?: WorkflowState;
  private tokenCounter: TokenCounter;
  private readonly DEFAULT_MAX_TOKENS = 600;
  private readonly DEFAULT_WARNING_THRESHOLD = 0.8;

  constructor() {
    this.tokenCounter = new TokenCounter();
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

    const messages: Message[] = [
      {
        role: 'system',
        content: workflowSystemPrompt || 'You are a helpful AI agent. Think step-by-step. When a tool ' +
          'is needed, call it with minimal arguments. Be concise when replying to the user.'
      },
      {
        role: 'user', 
        content: workflowUserPrompt
      }
    ];

    const memory: AgentMemory = {
      workflowUserPrompt,
      steps: stepsState,
      messages,
    };
    if (workflowName) {
      memory.workflowName = workflowName;
    }
    if (workflowDescription) {
      memory.workflowDescription = workflowDescription;
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
      avgStepResultSize: 0,
      maxTokenLimit: this.DEFAULT_MAX_TOKENS,
      warningThreshold: this.DEFAULT_WARNING_THRESHOLD,
    };
  }

  private updateTokenCount(): void {
    if (!this.state?.memory.messages) return;
    
    const tokenCount = this.tokenCounter.estimateTokens(this.state.memory.messages);
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

  private checkMemoryPressure(): void {
    if (!this.state?.memoryMetrics) return;
    
    const { estimatedTokens, maxTokenLimit, warningThreshold } = this.state.memoryMetrics;
    const utilizationPercent = (estimatedTokens / maxTokenLimit) * 100;
    
    if (estimatedTokens > maxTokenLimit * warningThreshold) {
      logger.agent.warn('Approaching context limit', {
        currentTokens: estimatedTokens,
        maxTokens: maxTokenLimit,
        utilizationPercent,
        messageCount: this.state.memoryMetrics.messageCount
      });
      
      // Trigger aggressive pruning to 60% of limit
      const targetTokens = Math.floor(maxTokenLimit * 0.6);
      this.pruneMessageHistory(targetTokens);
    }
  }

  private pruneMessageHistory(targetTokenCount: number): void {
    if (!this.state?.memory.messages) return;
    
    const originalCount = this.state.memory.messages.length;
    const originalTokens = this.state.currentTokenCount ?? 0;
    
    // Always preserve system message and initial user prompt
    const systemMessages = this.state.memory.messages.slice(0, 2);
    let currentTokens = this.tokenCounter.estimateTokens(systemMessages);
    
    // Collect recent messages that fit within the target limit
    const recentMessages = this.state.memory.messages.slice(2).reverse();
    const messagesToKeep: Message[] = [];
    
    for (const message of recentMessages) {
      const messageTokens = this.tokenCounter.estimateMessageTokens(message);
      if (currentTokens + messageTokens > targetTokenCount) break;
      
      messagesToKeep.unshift(message); // Add to beginning to maintain chronological order
      currentTokens += messageTokens;
    }
    
    // Combine preserved system messages with recent messages in correct order
    this.state.memory.messages = [...systemMessages, ...messagesToKeep];

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

  addMessageToMemory(message: Message, skipPruning = false) {
    if (!this.state) {
      throw new Error('State not initialized');
    }
    this.state.memory.messages?.push(message);
    this.updateTokenCount();
    
    // Skip memory pressure check and pruning if requested (e.g., for last step)
    if (!skipPruning) {
      this.checkMemoryPressure();
    }
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

  // Allow dynamic adjustment of max token limit
  setMaxTokenLimit(limit: number): void {
    if (!this.state?.memoryMetrics) return;
    this.state.memoryMetrics.maxTokenLimit = limit;
    logger.agent.info('Updated max token limit', { newLimit: limit });
    this.checkMemoryPressure();
  }

  getState(): WorkflowState {
    if (!this.state) {
      throw new Error('State not initialized');
    }
    return this.state;
  }

  getSystemMessage(): string {
    if (!this.state) {
      throw new Error('State not initialized');
    }
    return `${this.state.systemPrompt ? `${this.state.systemPrompt}\n\n` : 'You are a helpful AI agent. Think step-by-step. When a tool is needed, call it with minimal arguments. Be concise when replying to the user.\n'}${this.buildContextString(this.state.memory)}`;
  }

  private buildContextString(memory: AgentMemory): string {
    let contextSection = '<system_instructions>\n';
    contextSection += 'You are an AI agent executing a specific step of a workflow. Follow these critical rules:\n\n';
    contextSection += '1. **ONLY provide the direct answer** to what the step asks for\n';
    contextSection += '2. **DO NOT include**:\n';
    contextSection += '   - Greetings or pleasantries ("Hello!", "I\'d be happy to help")\n';
    contextSection += '   - Explanations of what you\'re doing ("Let me...", "I\'ll...")\n';
    contextSection += '   - Summaries or conclusions ("In summary...", "To conclude...")\n';
    contextSection += '   - Any meta-commentary about the task\n';
    contextSection += '3. **For tool use**: When asked to use a tool, output ONLY the tool call in this format:\n';
    contextSection += '   <tool_call>{"name": "tool_name", "arguments": {"param1": "value1", "param2": "value2"}}</tool_call>\n';
    contextSection += '   - Replace values with actual data from the context\n';
    contextSection += '   - Do NOT add any text before or after the tool call\n';
    contextSection += '4. **Be concise**: Use the minimum words needed for clarity\n';
    contextSection += '5. **Stay focused**: Address only what the current step requests\n';
    contextSection += '</system_instructions>\n\n';
    
    contextSection += '<workflow_context>\n';
    
    // Add workflow context if available
    if (memory.workflowName) {
      contextSection += `Workflow: ${memory.workflowName}\n`;
    }
    if (memory.workflowDescription) {
      contextSection += `Description: ${memory.workflowDescription}\n`;
    }
    contextSection += `User Request: ${memory.workflowUserPrompt}\n\n`;
    
    // Add any global context
    if (memory.context) {
      contextSection += 'Global Context:\n';
      Object.entries(memory.context).forEach(([key, value]) => {
        contextSection += `  ${key}: ${JSON.stringify(value)}\n`;
      });
      contextSection += '\n';
    }
    
    // Add completed steps and their results
    const completedSteps = Object.values(memory.steps).filter(step => step.complete);
    if (completedSteps.length > 0) {
      contextSection += 'Previous Step Results:\n';
      completedSteps.forEach(step => {
        if (step.result) {
          // Truncate long results if needed to avoid context overflow
          const maxResultLength = 500;
          const result = step.result.length > maxResultLength 
            ? step.result.substring(0, maxResultLength) + '... [truncated]'
            : step.result;
          contextSection += `${step.id} (${step.description}): ${result}\n`;
        }
      });
      contextSection += '\n';
    }
    contextSection += '</workflow_context>\n\n';
    
    return contextSection;
  }

  // TODO: Support intelligent step selection
  findNextStep(): WorkflowStep | undefined {
    if (!this.state) {
      throw new Error('State not initialized');
    }
    const completedSteps = this.state.completedSteps;
    return this.state.workflow.steps.find(step => {
      if (!step.id || completedSteps.has(step.id)) {
        return false;
      }
      
      // Check if step has exceeded max retry attempts
      const stepState = this.state!.memory.steps[step.id];
      if (stepState && stepState.maxAttempts && stepState.attempts >= stepState.maxAttempts) {
        return false;
      }
      
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
