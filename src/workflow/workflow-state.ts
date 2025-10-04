import type { AgentWorkflow, WorkflowStep } from '../types/agent-session';
import type { Message, Tool } from '../types/worker';
import type { WorkflowState, StepState } from '../types/workflow-state';
import type { Session } from '../types/session';
import type { MemoryConfig, ToolResult, MemoryMessage } from '../types/memory';

import { logger } from '../utils/logger';
import { MemoryManager } from '../memory/memory-manager';

export class WorkflowStateManager {
  private static readonly DEFAULT_SYSTEM_PROMPT = 
    'You are a helpful AI agent. Think step-by-step. ' +
    'When a tool is needed, call it with minimal arguments. ' +
    'Be concise when replying to the user.';

  private state?: WorkflowState;
  private session: Session;
  private memoryManager: MemoryManager;
  
  constructor(session: Session, memoryConfig?: MemoryConfig) {
    this.session = session;
    this.memoryManager = new MemoryManager(session, memoryConfig);
  }

  async initializeState(userPrompt: string, workflow: AgentWorkflow, tools: Tool[]): Promise<void> {
    // Update memory manager if workflow provides config
    if (workflow.memoryConfig) {
      this.memoryManager = new MemoryManager(this.session, workflow.memoryConfig);
    }
    this.memoryManager.clear();
    await this.addMessagesToMemory([
      { role: 'system', content: workflow.systemPrompt ?? WorkflowStateManager.DEFAULT_SYSTEM_PROMPT, metadata: { type: 'system_instruction' } },
      { role: 'user', content: userPrompt, metadata: { type: 'user_prompt' } }
    ]);

    const steps: Record<string, StepState> = {};
    workflow.steps.forEach(step => {
      steps[step.id] = {
        id: step.id,
        complete: false,
        attempts: 0,
        maxAttempts: step.maxAttempts ?? 3,
      };
    });
    this.state = {
      workflow,
      userPrompt,
      startTime: Date.now(),
      completedSteps: new Set<string>(),
      iteration: 1,
      maxIterations: workflow.maxIterations ?? 10,
      timeout: workflow.timeout ?? 60000,
      tools: [...tools, ...workflow.tools],
      steps,
      toolResults: {},
    };
  }

  async addMessagesToMemory(messages: MemoryMessage[], skipCompression = false): Promise<void> {
    await this.memoryManager.addMessages(messages, skipCompression);
  }

  async getMessages(): Promise<Message[]> {
    return await this.memoryManager.getMessages();
  }

  addToolResult(stepId: string, toolResult: ToolResult): void {
    if (!this.state) {
      throw new Error('State not initialized');
    }
    logger.agent.debug('Adding tool result to memory', {
      stepId,
      toolResult
    });
    this.state.toolResults['step_' + stepId] = toolResult;
  }
  
  getToolResults(): Record<string, ToolResult> {
    if (!this.state) {
      throw new Error('State not initialized');
    }
    return this.state.toolResults;
  }

  async rollbackMessagesToCount(targetCount: number) {
    if (!this.state) {
      throw new Error('State not initialized');
    }
    await this.memoryManager.rollbackToCount(targetCount);
  }

  // getWorkflowPrompts(): Message[] {
  //   if (!this.state) {
  //     throw new Error('State not initialized');
  //   }
    
  //   const toolResults = this.getToolResults();
  //   const basePrompt = this.state.workflow.systemPrompt ?? 
  //     'You are a helpful AI agent. Think step-by-step. When a tool is needed, ' +
  //     'call it with minimal arguments. Be concise when replying to the user.';
    
  //   // Format using memory manager
  //   const toolResultsContext = this.memoryManager.formatToolResults(toolResults);
  //   const systemPrompt = this.memoryManager.formatSystemPrompt(basePrompt, toolResultsContext);
    
  //   return [
  //     { role: 'system', content: systemPrompt },
  //     { role: 'user', content: this.state.userPrompt }
  //   ];
  // }
  
  getFormattedStepInstruction(stepId: string, prompt: string): string {
    return this.memoryManager.formatStepInstruction(stepId, prompt);
  }

  getMessageCount(): number {
    return this.memoryManager.getMessageCount();
  }

  getCurrentTokenCount(): number {
    return this.memoryManager.getTokenCount();
  }

  isContextNearLimit(): boolean {
    return this.memoryManager.isNearLimit();
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
      const stepState = this.state!.steps[step.id];
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

  isMaxIterationsReached(): boolean {
    if (!this.state) {
      throw new Error('State not initialized');
    }
    return this.state.iteration >= this.state.maxIterations;
  }

  getStepState(stepId: string): StepState {
    if (!this.state) {
      throw new Error('State not initialized');
    }
    if (!this.state.steps[stepId]) {
      throw new Error('Step not found');
    }
    return this.state.steps[stepId];
  }

  handleStepCompletion(stepId: string, complete: boolean, result?: string) {
    if (!this.state) {
      throw new Error('State not initialized');
    }
    if (!this.state.steps[stepId]) {
      throw new Error('Step not found');
    }
    this.state.steps[stepId].complete = complete;
    if (result) {
      this.state.steps[stepId].result = result;
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
      
      const futureStepState = this.state.steps[futureStep.id];
      if (!futureStepState) continue;
      
      // If this future step is not complete and hasn't exceeded max attempts, it's still pending
      if (!futureStepState.complete && 
          (!futureStepState.maxAttempts || futureStepState.attempts < futureStepState.maxAttempts)) {
        return false;
      }
    }
    return true;
  }

  createCheckpoint(id: string): void {
    this.memoryManager.createCheckpoint(id);
  }

  rollbackToCheckpoint(id: string): void {
    this.memoryManager.rollbackToCheckpoint(id);
  }
}
