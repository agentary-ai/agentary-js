import type { 
  Workflow, 
  WorkflowStep, 
  WorkflowIterationResponse,
} from '../types/agent-session';
import type { Tool } from '../types/worker';
import type { WorkflowState } from '../types/workflow-state';
import type { MemoryConfig } from '../types/memory';

import { logger } from '../utils/logger';
import { StepExecutor } from './step-executor';
import { WorkflowStateManager } from './workflow-state';
import { WorkflowResultBuilder } from './result-builder';
import { Session } from '../types/session';
import { WorkflowErrorEvent, WorkflowCancelledEvent } from '../types/events';

/**
 * Orchestrates the entire workflow execution, managing multiple steps
 * and coordinating between the step executor and state management.
 */
export class WorkflowExecutor {
  private stepExecutor: StepExecutor;
  private tools: Tool[];
  private stateManager: WorkflowStateManager;
  private session: Session;

  constructor(
    stepExecutor: StepExecutor, 
    tools: Tool[], 
    stateManager: WorkflowStateManager, 
    session: Session
  ) {
    this.stepExecutor = stepExecutor;
    this.tools = tools;
    this.stateManager = stateManager;
    this.session = session;
  }

  /**
   * Executes the entire workflow, managing multiple steps and coordinating between the step executor and state management.
   * 
   * @param userPrompt - The user prompt to start the workflow
   * @param workflow - The workflow to execute
   * @param memoryConfig - The memory configuration to use for the workflow
   * @returns An async iterable of workflow iteration responses
   */
  async* execute(
    userPrompt: string,
    workflow: Workflow,
    memoryConfig?: MemoryConfig
  ): AsyncIterable<WorkflowIterationResponse> {
    const startTime = Date.now();
    logger.agent.info('Starting workflow execution', {
      workflowId: workflow.id,
      userPrompt,
      stepCount: workflow.steps.length,
      toolCount: workflow.tools.length
    });

    // Emit workflow start event
    const emitter = this.session._eventEmitter;
    if (emitter) {
      emitter.emit({
        type: 'workflow:start',
        workflowId: workflow.id,
        stepCount: workflow.steps.length,
        timestamp: startTime
      });
    }

    logger.agent.debug('Initializing workflow state', {
      workflowId: workflow.id,
      hasMemoryConfig: !!memoryConfig,
      memoryConfigType: memoryConfig?.memoryCompressorConfig?.name,
      maxTokens: memoryConfig?.maxTokens,
      toolCount: this.tools.length
    });

    // Initialize the workflow state
    await this.stateManager.initializeState(
      userPrompt,
      workflow,
      this.tools,
      memoryConfig
    );

    let currentStep: WorkflowStep | undefined;
    let state: WorkflowState | undefined;
    
    try {
      state = this.stateManager.getState();
      
      // Execute the workflow steps
      yield* this.executeWorkflowSteps(state);

      // Handle completion
      currentStep = this.stateManager.findNextStep();
      if (!currentStep) {
        logger.agent.warn('No steps remaining for execution', { 
          workflowId: state.workflow.id, 
          availableSteps: state.workflow.steps.map((step: WorkflowStep) => step.id)
        });
        return;
      }
      
      // Handle maximum iterations reached
      if (this.stateManager.isMaxIterationsReached()) {
        logger.agent.warn('Workflow exceeded maximum iterations', { 
          workflowId: state.workflow.id, 
          maxIterations: state.maxIterations,
          totalTimeMs: Date.now() - state.startTime
        });
        yield WorkflowResultBuilder.createMaxIterationsResult(
          currentStep.id,
          state.startTime,
        );
      } else {
        logger.agent.info('Workflow execution complete', {
          workflowId: state.workflow.id,
          iterations: state.iteration,
          totalTimeMs: Date.now() - state.startTime,
        });

        // Emit workflow complete event
        if (emitter) {
          emitter.emit({
            type: 'workflow:complete',
            workflowId: state.workflow.id,
            totalSteps: state.completedSteps.size,
            iterations: state.iteration,
            duration: Date.now() - startTime,
            timestamp: Date.now()
          });
        }
      }

    } catch (error: any) {
      logger.agent.error('Workflow execution failed', { error: error.message });
      // Emit workflow error event
      if (emitter && state) {
        const event: WorkflowErrorEvent = {
          type: 'workflow:error',
          workflowId: state.workflow.id,
          error: error.message,
          timestamp: Date.now()
        };
        if (currentStep?.id) {
          event.stepId = currentStep.id;
        }
        emitter.emit(event);
      }
      if (!state) {
        // Handle state initialization failure
        logger.agent.error('Failed to initialize workflow state', { error: error.message });
        yield WorkflowResultBuilder.createErrorResult(
          error,
          Date.now()
        );
      } else {
        yield* this.handleWorkflowError(state, currentStep, error);
      }
    }
  }

  /**
   * Executes the workflow steps, managing multiple steps and coordinating between the step executor and state management.
   * 
   * @param state - The workflow state to execute
   * @returns An async iterable of workflow iteration responses
   */
  private async* executeWorkflowSteps(
    state: WorkflowState
  ): AsyncIterable<WorkflowIterationResponse> {
    try {
      while (state.iteration < state.maxIterations) {
        logger.agent.debug('New workflow iteration', {
          workflowId: state.workflow.id,
          iteration: state.iteration,
          maxIterations: state.maxIterations
        });
        
        const currentStep = this.stateManager.findNextStep();
        if (!currentStep) {
          logger.agent.warn('No next available step found', { 
            workflowId: state.workflow.id, 
            availableSteps: state.workflow.steps.map((step: WorkflowStep) => step.id)
          });
          break;
        }

        if (!currentStep.id) {
          logger.agent.error('ID undefined for workflow step', { 
            workflowId: state.workflow.id, 
            step: currentStep
          });
          break;
        }

        // Check timeout
        if (this.stateManager.isTimeout(state)) {
          logger.agent.warn('Workflow timeout exceeded', {
            workflowId: state.workflow.id,
            stepId: currentStep.id,
            elapsedMs: Date.now() - state.startTime,
            timeoutMs: state.timeout
          });

          // Emit workflow timeout event
          const emitter = this.session._eventEmitter;
          if (emitter) {
            emitter.emit({
              type: 'workflow:timeout',
              workflowId: state.workflow.id,
              stepId: currentStep.id,
              duration: Date.now() - state.startTime,
              timestamp: Date.now()
            });
          }

          yield WorkflowResultBuilder.createTimeoutResult(
            currentStep.id,
            state.startTime,
          );
          break;
        }

        // Emit step start event
        const stepStartTime = Date.now();
        const emitter = this.session._eventEmitter;
        if (emitter) {
          emitter.emit({
            type: 'workflow:step:start',
            workflowId: state.workflow.id,
            stepId: currentStep.id,
            stepPrompt: currentStep.prompt,
            iteration: state.iteration,
            timestamp: stepStartTime
          });
        }

        // Execute the step
        const stepResult = await this.stepExecutor.execute(currentStep, state.tools);
        yield stepResult;

        // Emit step complete event
        if (emitter) {
          emitter.emit({
            type: 'workflow:step:complete',
            workflowId: state.workflow.id,
            stepId: currentStep.id,
            success: !stepResult.error,
            duration: Date.now() - stepStartTime,
            hasToolCall: !!stepResult.toolCall,
            hasError: !!stepResult.error,
            timestamp: Date.now()
          });
        }

        // Emit retry event if step failed and will retry
        if (stepResult.error && stepResult.metadata?.willRetry) {
          if (emitter) {
            emitter.emit({
              type: 'workflow:step:retry',
              workflowId: state.workflow.id,
              stepId: currentStep.id,
              attempt: stepResult.metadata.attempt || 1,
              maxAttempts: stepResult.metadata.maxAttempts || 1,
              reason: stepResult.error.message,
              timestamp: Date.now()
            });
          }
        }

        // Cancel workflow if step failed and reached max retries
        if (stepResult.error && stepResult.metadata?.willRetry === false) {
          logger.agent.error('Step reached maximum retries, cancelling workflow', {
            workflowId: state.workflow.id,
            stepId: currentStep.id,
            attempt: stepResult.metadata.attempt,
            maxAttempts: stepResult.metadata.maxAttempts,
            error: stepResult.error.message,
            totalTimeMs: Date.now() - state.startTime
          });

          // Emit workflow cancelled event
          if (emitter) {
            emitter.emit({
              type: 'workflow:cancelled',
              workflowId: state.workflow.id,
              stepId: currentStep.id,
              reason: `Step ${currentStep.id} failed after ${stepResult.metadata.attempt} attempts: ${stepResult.error.message}`,
              timestamp: Date.now()
            });
          }

          yield WorkflowResultBuilder.createErrorResult(
            new Error(`Workflow cancelled: Step ${currentStep.id} failed after ${stepResult.metadata.attempt} attempts - ${stepResult.error.message}`),
            state.startTime
          );
          break;
        }

        logger.agent.debug('Step execution completed, continuing workflow', {
          stepId: currentStep.id,
          hasError: !!stepResult.error,
          willContinue: true,
          iteration: state.iteration
        });

        state.iteration++;    
      }
      logger.agent.debug('Workflow steps execution complete', {
        workflowId: state.workflow.id,
        iterations: state.iteration,
        totalTimeMs: Date.now() - state.startTime
      });

    } catch (error: any) {
      throw error;
    }
  }

  /**
   * Handles a workflow error, logging the error and yielding a result.
   * 
   * @param state - The workflow state to handle the error
   * @param currentStep - The current step to handle the error
   * @param error - The error to handle
   * @returns An async iterable of workflow iteration responses
   */
  private async* handleWorkflowError(
    state: WorkflowState,
    currentStep: WorkflowStep | undefined,
    error: Error
  ): AsyncIterable<WorkflowIterationResponse> {
    logger.agent.error('Workflow execution failed', { 
      workflowId: state.workflow.id, 
      stepId: currentStep?.id ?? 'unknown',
      error: error.message,
      iterations: state.iteration,
      totalTimeMs: Date.now() - state.startTime,
      stack: error.stack
    });
    
    yield WorkflowResultBuilder.createErrorResult(
      error,
      state.startTime,
    );
  }
}