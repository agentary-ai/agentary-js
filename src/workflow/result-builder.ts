import type { WorkflowStep } from '../types/agent-session';
import type { GenerationTask } from '../types/session';

export class WorkflowResultBuilder {
  static createTimeoutResult(
    stepId: string | null,
    prompt: string,
    startTime: number,
    generationTask?: GenerationTask
  ): WorkflowStep {
    return {
      id: stepId ?? 'unknown',
      prompt: prompt ?? 'unknown',
      complete: true,
      response: {
        error: 'Workflow timeout exceeded',
        metadata: {
          duration: Date.now() - startTime,
          stepType: generationTask,
        }
      },
    };
  }

  static createMaxIterationsResult(
    stepId: string | null,
    prompt: string,
    startTime: number,
    generationTask?: GenerationTask
  ): WorkflowStep {
    return {
      id: stepId ?? 'unknown',
      prompt: prompt ?? 'unknown',
      complete: true,
      response: {
        error: 'Workflow exceeded maximum iterations',
        metadata: {
          duration: Date.now() - startTime,
          stepType: generationTask,
        }
      },
    };
  }

  static createErrorResult(
    stepId: string | null,
    prompt: string,
    error: Error,
    startTime: number,
    generationTask?: GenerationTask
  ): WorkflowStep {
    return {
      id: stepId ?? 'unknown',
      prompt: prompt ?? 'unknown',
      complete: true,
      response: {
        error: error.message,
        content: `Workflow error: ${error.message}`,
        metadata: {
          duration: Date.now() - startTime,
          stepType: generationTask,
        }
      }
    };
  }
}
