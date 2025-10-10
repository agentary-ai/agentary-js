import type { 
  AgentWorkflow, 
  WorkflowStep, 
  WorkflowIterationResponse,
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
  private eventSession: any;

  constructor(stepExecutor: StepExecutor, tools: Tool[], stateManager: WorkflowStateManager, eventSession: any) {
    this.stepExecutor = stepExecutor;
    this.tools = tools;
    this.stateManager = stateManager;
    this.eventSession = eventSession;
  }

  async* execute(userPrompt: string, agentWorkflow: AgentWorkflow): AsyncIterable<WorkflowIterationResponse> {
    const startTime = Date.now();
    logger.agent.info('Starting workflow execution', {
      workflowId: agentWorkflow.id,
      workflowName: agentWorkflow.name,
      userPrompt,
      stepCount: agentWorkflow.steps.length,
      toolCount: agentWorkflow.tools.length
    });

    // Emit workflow start event
    const emitter = this.eventSession?._eventEmitter;
    if (emitter) {
      emitter.emit({
        type: 'workflow:start',
        workflowId: agentWorkflow.id,
        workflowName: agentWorkflow.name,
        stepCount: agentWorkflow.steps.length,
        timestamp: startTime
      });
    }

    await this.stateManager.initializeState(
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
      if (!currentStep) {
        logger.agent.warn('No steps remaining for execution', { 
          workflowId: state.workflow.id, 
          availableSteps: state.workflow.steps.map(step => step.id)
        });
        return;
      }
      
      if (this.stateManager.isMaxIterationsReached()) {
        logger.agent.warn('Workflow exceeded maximum iterations', { 
          workflowId: state.workflow.id, 
          maxIterations: state.maxIterations,
          totalTimeMs: Date.now() - state.startTime
        });
        yield WorkflowResultBuilder.createMaxIterationsResult(
          currentStep.id,
          state.startTime,
          currentStep?.generationTask
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
      // Emit workflow error event
      if (emitter && state) {
        emitter.emit({
          type: 'workflow:error',
          workflowId: state.workflow.id,
          stepId: currentStep?.id,
          error: error.message,
          timestamp: Date.now()
        });
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

  private async* executeWorkflowSteps(
    state: WorkflowState
  ): AsyncIterable<WorkflowIterationResponse> {
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

        // Emit workflow timeout event
        const emitter = this.eventSession?._eventEmitter;
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
          currentStep.generationTask
        );
        break;
      }

      // Emit step start event
      const stepStartTime = Date.now();
      const emitter = this.eventSession?._eventEmitter;
      if (emitter) {
        emitter.emit({
          type: 'workflow:step:start',
          workflowId: state.workflow.id,
          stepId: currentStep.id,
          stepDescription: currentStep.description,
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
  }

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
      currentStep?.generationTask
    );
  }
}