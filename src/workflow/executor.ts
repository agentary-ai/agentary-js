import type { 
  AgentWorkflow, 
  WorkflowStep, 
  WorkflowStepResponse,
} from '../types/agent-session';
import type { Tool } from '../types/worker';
import type { WorkflowState } from '../types/workflow-state';

import { logger } from '../utils/logger';
import { StepExecutor } from './step-executor';
import { WorkflowStateManager } from './workflow-state';
import { WorkflowResultBuilder } from './result-builder';

export class WorkflowExecutor {
  private stepExecutor: StepExecutor;
  private tools: Tool[];
  private stateManager: WorkflowStateManager;

  constructor(stepExecutor: StepExecutor, tools: Tool[], stateManager: WorkflowStateManager) {
    this.stepExecutor = stepExecutor;
    this.tools = tools;
    this.stateManager = stateManager;
  }

  async* execute(userPrompt: string, agentWorkflow: AgentWorkflow): AsyncIterable<WorkflowStepResponse> {
    this.stateManager.logWorkflowStart(agentWorkflow, userPrompt);
    
    this.stateManager.initializeState(
      userPrompt,
      agentWorkflow,
      this.tools
    );
      
    let currentStep: WorkflowStep | undefined;
    let state: WorkflowState | undefined;
    
    try {
      state = this.stateManager.getState();
      
      yield* this.executeWorkflowSteps(state);

      // Handle completion
      currentStep = this.stateManager.findNextStep();
      
      if (this.stateManager.isMaxIterationsReached(state)) {
        logger.agent.warn('Workflow exceeded maximum iterations', { 
          workflowId: state.workflow.id, 
          maxIterations: state.maxIterations,
          totalTimeMs: Date.now() - state.startTime
        });
        yield WorkflowResultBuilder.createMaxIterationsResult(
          currentStep?.id ?? null,
          state.startTime,
          currentStep?.generationTask
        );
      } else {
        this.stateManager.logWorkflowComplete(
          state.workflow.id,
          state.iteration,
          state.startTime
        );
      }

    } catch (error: any) {
      if (!state) {
        // Handle state initialization failure
        logger.agent.error('Failed to initialize workflow state', { error: error.message });
        yield WorkflowResultBuilder.createErrorResult(
          null,
          error,
          Date.now()
        );
      } else {
        yield* this.handleWorkflowError(state, currentStep, error);
      }
    }
  }

  private async* executeWorkflowSteps(
    state: WorkflowState
  ): AsyncIterable<WorkflowStepResponse> {
    while (state.iteration < state.maxIterations) {
      const currentStep = this.stateManager.findNextStep();
      if (!currentStep) {
        logger.agent.warn('No next available step found', { 
          workflowId: state.workflow.id, 
          availableSteps: state.workflow.steps.map(step => step.id)
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
        yield WorkflowResultBuilder.createTimeoutResult(
          currentStep.id,
          state.startTime,
          currentStep.generationTask
        );
        break;
      }

      // Execute the step
      const result = await this.stepExecutor.execute(currentStep, state.tools);
      if (result) {
        yield result;
      }
    }
  }

  private async* handleWorkflowError(
    state: WorkflowState,
    currentStep: WorkflowStep | undefined,
    error: Error
  ): AsyncIterable<WorkflowStepResponse> {
    logger.agent.error('Workflow execution failed', { 
      workflowId: state.workflow.id, 
      stepId: currentStep?.id ?? 'unknown',
      error: error.message,
      iterations: state.iteration,
      totalTimeMs: Date.now() - state.startTime,
      stack: error.stack
    });
    
    yield WorkflowResultBuilder.createErrorResult(
      currentStep?.id ?? null,
      error,
      state.startTime,
      currentStep?.generationTask
    );
  }
}