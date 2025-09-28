import type { WorkflowStepResponse } from '../types/agent-session';
import type { GenerationTask } from '../types/session';

export class WorkflowResultBuilder {
  static createTimeoutResult(
    stepId: string | null,
    startTime: number,
    generationTask?: GenerationTask
  ): WorkflowStepResponse {
    return {
      id: stepId ?? 'unknown',
      error: {
        message: 'Workflow timeout exceeded',
      },
      metadata: {
          duration: Date.now() - startTime,
          stepType: generationTask,
      }
    };
  }

  static createMaxIterationsResult(
    stepId: string | null,
    startTime: number,
    generationTask?: GenerationTask
  ): WorkflowStepResponse {
    return {
      id: stepId ?? 'unknown',
      error: {
        message: 'Workflow exceeded maximum iterations',
      },
      metadata: {
        duration: Date.now() - startTime,
        stepType: generationTask,
      }
    };
  }

  static createErrorResult(
    stepId: string | null,
    error: Error,
    startTime: number,
    generationTask?: GenerationTask
  ): WorkflowStepResponse {
    return {
      id: stepId ?? 'unknown',
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