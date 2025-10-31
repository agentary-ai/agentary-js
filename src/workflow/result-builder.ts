import type { WorkflowIterationResponse } from '../types/agent-session';

/**
 * Builds the result of a workflow iteration.
 */
export class WorkflowResultBuilder {
  static createTimeoutResult(
    stepId: string | null,
    startTime: number,
  ): WorkflowIterationResponse {
    const response: WorkflowIterationResponse = {
      error: {
        message: 'Workflow timeout exceeded',
      },
      metadata: {
          duration: Date.now() - startTime,
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
  ): WorkflowIterationResponse {
    const response: WorkflowIterationResponse = {
      error: {
        message: 'Workflow exceeded maximum iterations',
      },
      metadata: {
        duration: Date.now() - startTime,
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
  ): WorkflowIterationResponse {
    return {
      error: {
        message: error.message,
      },
      metadata: {
        duration: Date.now() - startTime,
      }
    };
  }
}