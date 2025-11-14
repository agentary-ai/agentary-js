import type { Workflow, WorkflowStep } from '../types/agent-session';
import type { Message, Tool } from '../types/worker';
import type { WorkflowState, StepState } from '../types/workflow-state';
import type { Session } from '../types/session';
import type { MemoryConfig, ToolResult, MemoryMessage } from '../types/memory';

import { logger } from '../utils/logger';
import { MemoryManager } from '../memory/memory-manager';

/**
 * Manages workflow state across iterations, tracking conversation history,
 * tool calls, and step progression.
 */
export class WorkflowStateManager {
  private static readonly DEFAULT_SYSTEM_PROMPT = 
    'You are a helpful AI agent. Think step-by-step. ' +
    'When a tool is needed, call it with minimal arguments. ' +
    'Be concise when replying to the user.';

  private state?: WorkflowState;
  private session: Session;
  private memoryManager?: MemoryManager;
  
  constructor(session: Session) {
    this.session = session;
  }

  /**
   * Initializes the workflow state.
   * 
   * @param userPrompt - The user prompt to start the workflow.
   * @param workflow - The workflow to execute.
   * @param tools - The tools to use in the workflow.
   * @param memoryConfig - The memory configuration to use.
   */
  async initializeState(
    userPrompt: string, 
    workflow: Workflow, 
    tools: Tool[],
    memoryConfig?: MemoryConfig
  ): Promise<void> {
    logger.agent.debug('Creating memory manager', {
      workflowId: workflow.id,
      hasCustomConfig: !!memoryConfig,
      maxTokens: memoryConfig?.maxTokens
    });

    // Update memory manager if workflow provides config
    this.memoryManager = new MemoryManager(
      this.session,
      memoryConfig
    );

    const initialMessages = [
      { role: 'system', content: workflow.systemPrompt ?? WorkflowStateManager.DEFAULT_SYSTEM_PROMPT, metadata: { type: 'system_instruction' } },
      { role: 'user', content: userPrompt, metadata: { type: 'user_prompt' } }
    ] as MemoryMessage[];
    await this.addMessagesToMemory(initialMessages);

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

    logger.agent.info('Workflow state ready', {
      workflowId: workflow.id,
      stepCount: workflow.steps.length,
      toolCount: this.state.tools.length,
      maxIterations: this.state.maxIterations
    });
  }

  /**
   * Adds messages to memory.
   * 
   * @param messages - The messages to add to memory.
   * @param skipCompression - Whether to skip compression.
   */
  async addMessagesToMemory(messages: MemoryMessage[], skipCompression = false): Promise<void> {
    if (!this.memoryManager) {
      throw new Error('Memory manager not initialized');
    }
    await this.memoryManager.addMessages(messages, skipCompression);
  }

  /**
   * Gets the messages from memory.
   * 
   * @returns The messages from memory.
   */
  async getMessages(): Promise<Message[]> {
    if (!this.memoryManager) {
      throw new Error('Memory manager not initialized');
    }
    return await this.memoryManager.getMessages();
  }

  /**
   * Adds a tool result to the workflow state.
   * 
   * @param stepId - The ID of the step that called the tool.
   * @param toolResult - The result of the tool call.
   */
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
  
  /**
   * Gets the tool results from the workflow state.
   * 
   * @returns The tool results from the workflow state.
   */
  getToolResults(): Record<string, ToolResult> {
    if (!this.state) {
      throw new Error('State not initialized');
    }
    return this.state.toolResults;
  }

  // /**
  //  * Rolls back the messages to the target count.
  //  * 
  //  * @param targetCount - The target count to roll back to.
  //  */
  // async rollbackMessagesToCount(targetCount: number) {
  //   if (!this.memoryManager) {
  //     throw new Error('Memory manager not initialized');
  //   }
  //   if (!this.state) {
  //     throw new Error('State not initialized');
  //   }
  //   await this.memoryManager.rollbackToCount(targetCount);
  // }
  
  /**
   * Gets the formatted step instruction.
   * 
   * @param stepId - The ID of the step.
   * @param prompt - The prompt to format.
   * @returns The formatted step instruction.
   */
  getFormattedStepInstruction(stepId: string, prompt: string): string {
    if (!this.memoryManager) {
      throw new Error('Memory manager not initialized');
    }
    return this.memoryManager.formatStepInstruction(stepId, prompt);
  }

  /**
   * Gets the message count from memory.
   * 
   * @returns The message count from memory.
   */
  getMessageCount(): number {
    if (!this.memoryManager) {
      throw new Error('Memory manager not initialized');
    }
    return this.memoryManager.getMessageCount();
  }

  /**
   * Gets the current token count from memory.
   * 
   * @returns The current token count from memory.
   */
  getCurrentTokenCount(): number {
    if (!this.memoryManager) {
      throw new Error('Memory manager not initialized');
    }
    return this.memoryManager.getTokenCount();
  }

  /**
   * Gets the workflow state.
   * 
   * @returns The workflow state.
   */
  getState(): WorkflowState {
    if (!this.state) {
      throw new Error('State not initialized');
    }
    return this.state;
  }

  /**
   * Finds the next step to execute.
   * 
   * TODO: Support intelligent step selection
   * 
   * @returns The next step to execute.
   */
  findNextStep(): WorkflowStep | undefined {
    if (!this.state) {
      throw new Error('State not initialized');
    }

    logger.agent.debug('Finding next step in workflow', {
      workflowId: this.state.workflow.id,
      iteration: this.state.iteration,
      maxIterations: this.state.maxIterations,
      completedSteps: Array.from(this.state.completedSteps)
    });
    
    const completedSteps = this.state.completedSteps;

    return this.state.workflow.steps.find((step: WorkflowStep) => {
      if (!step.id || completedSteps.has(step.id)) {
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
      
      logger.agent.debug('Found next step for execution', {
        stepId: step.id,
      });
      return true;
    });
  }

  /**
   * Checks if the workflow has timed out.
   * 
   * @param state - The workflow state.
   * @returns True if the workflow has timed out, false otherwise.
   */
  isTimeout(state: WorkflowState): boolean {
    return Date.now() - state.startTime > state.timeout;
  }

  /**
   * Checks if the maximum number of iterations has been reached.
   * 
   * @returns True if the maximum number of iterations has been reached, false otherwise.
   */
  isMaxIterationsReached(): boolean {
    if (!this.state) {
      throw new Error('State not initialized');
    }
    return this.state.iteration >= this.state.maxIterations;
  }

  /**
   * Gets the step state.
   * 
   * @param stepId - The ID of the step.
   * @returns The step state.
   */
  getStepState(stepId: string): StepState {
    if (!this.state) {
      throw new Error('State not initialized');
    }
    if (!this.state.steps[stepId]) {
      throw new Error('Step not found');
    }
    return this.state.steps[stepId];
  }

  /**
   * Handles the completion of a step.
   * 
   * @param stepId - The ID of the step.
   * @param complete - Whether the step completed successfully.
   * @param result - The result of the step.
   */
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

  /**
   * Checks if the step is the last step.
   * 
   * @param stepId - The ID of the step.
   * @returns True if the step is the last step, false otherwise.
   */
  isLastStep(stepId: string): boolean {
    if (!this.state) {
      throw new Error('State not initialized');
    }
    const workflow = this.state.workflow;
    const steps = workflow.steps;
    
    // Find the current step's index
    const currentStepIndex = steps.findIndex((step: WorkflowStep) => step.id === stepId);
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

  /**
   * Creates a checkpoint.
   * 
   * @param id - The ID of the checkpoint.
   */
  createCheckpoint(id: string): void {
    if (!this.memoryManager) {
      throw new Error('Memory manager not initialized');
    }
    this.memoryManager.createCheckpoint(id);
  }

  rollbackToCheckpoint(id: string): void {
    if (!this.memoryManager) {
      throw new Error('Memory manager not initialized');
    }
    this.memoryManager.rollbackToCheckpoint(id);
  }
}
