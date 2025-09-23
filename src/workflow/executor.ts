import type { 
  AgentWorkflow, 
  WorkflowStep, 
} from '../types/agent-session';
import type { Tool } from '../types/worker';

import { logger } from '../utils/logger';
import { StepExecutor } from './step-executor';

export class WorkflowExecutor {
  private stepExecutor: StepExecutor;
  private tools: Tool[];

  constructor(stepExecutor: StepExecutor, tools: Tool[]) {
    this.stepExecutor = stepExecutor;
    this.tools = tools;
  }

  async* execute(userPrompt: string, agentWorkflow: AgentWorkflow): AsyncIterable<WorkflowStep> {
    logger.agent.info('Starting workflow execution', { 
      workflowId: agentWorkflow.id, 
      workflowName: agentWorkflow.name,
      userPrompt,
      stepCount: agentWorkflow.steps.length,
      toolCount: agentWorkflow.tools.length 
    });

    // Register workflow tools
    this.tools.push(...agentWorkflow.tools);

    const maxIterations = agentWorkflow.maxIterations ?? 10;
    const timeout = agentWorkflow.timeout ?? 60000; // 1 minute default
    const startTime = Date.now();
    const completedSteps = new Set<number>();
    
    // Initialize workflow memory
    agentWorkflow.memory = {
      messages: [
        {
          role: 'system',
          content: agentWorkflow.systemPrompt ?? ''
        },
        {
          role: 'user',
          content: userPrompt
        }
      ],
      context: {}
    };
    
    let iteration = 1;
    let currentStep: WorkflowStep | undefined;
    try {
      while (iteration < maxIterations) {
        currentStep = this.findNextAvailableStep(agentWorkflow.steps, completedSteps);
        if (!currentStep) {
          logger.agent.warn('No next available step found', { 
            workflowId: agentWorkflow.id, 
            availableSteps: agentWorkflow.steps.map(step => step.id)
          });
          break;
        }

        // Check that timeout hasn't been exceeded
        if (Date.now() - startTime > timeout) {
          logger.agent.warn('Workflow timeout exceeded', { 
            workflowId: agentWorkflow.id, 
            stepId: currentStep?.id, 
            elapsedMs: Date.now() - startTime,
            timeoutMs: timeout 
          });
          yield {
            id: currentStep.id,
            prompt: currentStep.prompt,
            complete: true,
            response: {
              error: 'Workflow timeout exceeded',
              metadata: {
                duration: Date.now() - startTime,
                stepType: currentStep.generationTask,
              }
            },
          };
          break;
        }

        // Add maxAttempts and attempts if not already defined
        currentStep.maxAttempts = currentStep.maxAttempts ?? 3;
        currentStep.attempts = currentStep.attempts ?? 0;

        // Execute step
        logger.agent.info('Executing workflow step', { 
          workflowId: agentWorkflow.id, 
          stepId: currentStep.id, 
          stepType: currentStep.generationTask,
          iteration: iteration,
          memory: agentWorkflow.memory,
        });

        await this.stepExecutor.execute(
          currentStep, agentWorkflow.memory, this.tools
        );
        logger.agent.info('Step execution result', {
          currentStep
        });
        if (currentStep.complete) {
          yield currentStep;
          completedSteps.add(currentStep.id);
        } else {
          continue;
        }
        iteration++;
      }

      if (iteration >= maxIterations) {
        logger.agent.warn('Workflow exceeded maximum iterations', { 
          workflowId: agentWorkflow.id, 
          maxIterations,
          totalTimeMs: Date.now() - startTime
        });
        yield {
          id: currentStep?.id ?? -1,
          prompt: currentStep?.prompt ?? '',
          complete: true,
          response: {
            error: 'Workflow exceeded maximum iterations',
            metadata: {
              duration: Date.now() - startTime,
              stepType: currentStep?.generationTask,
            }
          },
        };
      } else {
        logger.agent.info('Workflow completed successfully', { 
          workflowId: agentWorkflow.id, 
          iterations: iteration,
          totalTimeMs: Date.now() - startTime
        });
      }

    } catch (error: any) {
      logger.agent.error('Workflow execution failed', { 
        workflowId: agentWorkflow.id, 
        stepId: currentStep?.id ?? -1,
        error: error.message,
        iterations: iteration,
        totalTimeMs: Date.now() - startTime,
        stack: error.stack
      });
      yield {
        id: currentStep?.id ?? -1,
        prompt: currentStep?.prompt ?? '',
        complete: true,
        response: {
          error: error.message,
          content: `Workflow error: ${error.message}`,
          metadata: {
            duration: Date.now() - startTime,
            stepType: currentStep?.generationTask,
          }
        }
      };
    }
  }

  // TODO: Introduce step dependencies and routing in AgentWorkflow
  private findNextAvailableStep(steps: WorkflowStep[], completedSteps: Set<number>): WorkflowStep | undefined {
    return steps.find(step => {
      // Skip already completed steps
      if (completedSteps.has(step.id)) {
        return false;
      }
      return true;
    });
  }
}