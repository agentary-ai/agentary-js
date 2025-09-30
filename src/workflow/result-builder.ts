import type { WorkflowIterationResponse } from '../types/agent-session';
import type { GenerationTask } from '../types/session';

export class WorkflowResultBuilder {
  static createTimeoutResult(
    stepId: string | null,
    startTime: number,
    generationTask?: GenerationTask
  ): WorkflowIterationResponse {
    const response: WorkflowIterationResponse = {
      error: {
        message: 'Workflow timeout exceeded',
      },
      metadata: {
          duration: Date.now() - startTime,
          stepType: generationTask,
      }
    };
    if (stepId) {
      response.stepId = stepId;
    }
    return response;
  }

  static createMaxIterationsResult(
    stepId: string | null,
    startTime: number,
    generationTask?: GenerationTask
  ): WorkflowIterationResponse {
    const response: WorkflowIterationResponse = {
      error: {
        message: 'Workflow exceeded maximum iterations',
      },
      metadata: {
        duration: Date.now() - startTime,
        stepType: generationTask,
      }
    };
    if (stepId) {
      response.stepId = stepId;
    }
    return response;
  }

  static createErrorResult(
    error: Error,
    startTime: number,
    generationTask?: GenerationTask
  ): WorkflowIterationResponse {
    return {
      error: {
        message: error.message,
      },
      metadata: {
        duration: Date.now() - startTime,
        stepType: generationTask,
      }
    };
  }
}