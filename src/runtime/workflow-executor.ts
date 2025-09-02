import { 
  type WorkflowDefinition, 
  type WorkflowStep, 
  type AgentStepResult, 
  type Tool 
} from '../types/api';
import { logger } from '../utils/logger';
import { StepExecutor } from './step-executor';

export class WorkflowExecutor {
  private stepExecutor: StepExecutor;
  private tools: Map<string, Tool>;

  constructor(stepExecutor: StepExecutor, tools: Map<string, Tool>) {
    this.stepExecutor = stepExecutor;
    this.tools = tools;
  }

  async* execute(workflow: WorkflowDefinition): AsyncIterable<AgentStepResult> {
    logger.agent.info('Starting workflow execution', { 
      workflowId: workflow.id, 
      workflowName: workflow.name,
      stepCount: workflow.steps.length,
      toolCount: workflow.tools.length 
    });

    // Register workflow tools
    for (const tool of workflow.tools) {
      this.tools.set(tool.function.name, tool);
      logger.agent.debug('Registered workflow tool', { toolName: tool.function.name });
    }

    const context: Record<string, any> = {
      workflowId: workflow.id,
      workflowName: workflow.name,
      startTime: Date.now(),
      iteration: 0
    };

    const maxIterations = workflow.maxIterations ?? 10;
    const timeout = workflow.timeout ?? 60000; // 1 minute default
    const startTime = Date.now();

    let currentStepId = workflow.steps[0]?.id;
    let iteration = 0;

    try {
      while (currentStepId && iteration < maxIterations) {
        // Check timeout
        if (Date.now() - startTime > timeout) {
          logger.agent.warn('Workflow timeout exceeded', { 
            workflowId: workflow.id, 
            stepId: currentStepId, 
            elapsedMs: Date.now() - startTime,
            timeoutMs: timeout 
          });
          yield {
            stepId: currentStepId,
            type: 'error',
            content: 'Workflow timeout exceeded',
            isComplete: true,
            error: 'Timeout'
          };
          break;
        }

        const step = workflow.steps.find(s => s.id === currentStepId);
        if (!step) {
          logger.agent.error('Workflow step not found', { 
            workflowId: workflow.id, 
            stepId: currentStepId,
            availableSteps: workflow.steps.map(s => s.id)
          });
          yield {
            stepId: currentStepId,
            type: 'error',
            content: `Step ${currentStepId} not found`,
            isComplete: true,
            error: 'Step not found'
          };
          break;
        }

        // Execute step
        logger.agent.debug('Executing workflow step', { 
          workflowId: workflow.id, 
          stepId: step.id, 
          stepType: step.type,
          iteration: iteration 
        });
        
        let stepCompleted = false;
        let nextStepId: string | undefined;

        for await (const result of this.stepExecutor.execute(step, context)) {
          logger.agent.debug('Step result', result);
          yield result;
          
          if (result.isComplete) {
            stepCompleted = true;
            nextStepId = result.nextStepId;
            
            // Update context with step results (clean content only, no thinking)
            context[step.id] = {
              result: result.content, // This is already the clean content
              toolCall: result.toolCall,
              metadata: result.metadata
            };
          }
        }

        if (!stepCompleted) break;

        // Determine next step
        currentStepId = this.determineNextStep(step, nextStepId);
        iteration++;
      }

      if (iteration >= maxIterations) {
        logger.agent.warn('Workflow exceeded maximum iterations', { 
          workflowId: workflow.id, 
          maxIterations,
          totalTimeMs: Date.now() - startTime
        });
        yield {
          stepId: currentStepId || 'unknown',
          type: 'error',
          content: 'Maximum iterations exceeded',
          isComplete: true,
          error: 'Max iterations'
        };
      } else {
        logger.agent.info('Workflow completed successfully', { 
          workflowId: workflow.id, 
          iterations: iteration,
          totalTimeMs: Date.now() - startTime
        });
      }

    } catch (error: any) {
      logger.agent.error('Workflow execution failed', { 
        workflowId: workflow.id, 
        stepId: currentStepId,
        error: error.message,
        iterations: iteration,
        totalTimeMs: Date.now() - startTime,
        stack: error.stack
      });
      
      yield {
        stepId: currentStepId || 'unknown',
        type: 'error',
        content: `Workflow error: ${error.message}`,
        isComplete: true,
        error: error.message
      };
    }
  }

  private determineNextStep(step: WorkflowStep, providedNextStepId?: string): string | undefined {
    if (providedNextStepId) {
      return providedNextStepId;
    }
    
    if (step.nextSteps?.length) {
      // For now, just take the first next step
      // In the future, this could involve decision logic
      return step.nextSteps[0];
    }
    
    return undefined;
  }
}

