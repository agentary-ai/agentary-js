import type { 
  AgentWorkflow, 
  WorkflowStep, 
  WorkflowStepResult, 
} from '../types/agent-session';
import type { Tool } from '../types/worker';

import { logger } from '../utils/logger';
import { StepExecutor } from './step-executor';

export class WorkflowExecutor {
  private stepExecutor: StepExecutor;
  private tools: Map<string, Tool>;

  constructor(stepExecutor: StepExecutor, tools: Map<string, Tool>) {
    this.stepExecutor = stepExecutor;
    this.tools = tools;
  }

  async* execute(prompt: string, agentWorkflow: AgentWorkflow): AsyncIterable<WorkflowStepResult> {
    logger.agent.info('Starting workflow execution', { 
      workflowId: agentWorkflow.id, 
      workflowName: agentWorkflow.name,
      prompt,
      stepCount: agentWorkflow.steps.length,
      toolCount: agentWorkflow.tools.length 
    });

    // Register workflow tools
    for (const tool of agentWorkflow.tools) {
      this.tools.set(tool.function.name, tool);
      logger.agent.debug('Registered workflow tool', { toolName: tool.function.name });
    }

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
          content: agentWorkflow.userPrompt
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
          logger.agent.error('No next available step found', { 
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
            stepId: currentStep.id,
            content: 'Workflow timeout exceeded',
            isComplete: true,
            error: 'Timeout'
          };
          break;
        }

        // Execute step
        logger.agent.debug('Executing workflow step', { 
          workflowId: agentWorkflow.id, 
          stepId: currentStep.id, 
          stepType: currentStep.generationTask,
          iteration: iteration 
        });

        const result = await this.stepExecutor.execute(
          currentStep, agentWorkflow.memory, this.tools
        );
        if (result.isComplete) {
          completedSteps.add(currentStep.id);
        } else {
          break;
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
          stepId: currentStep?.id ?? -1,
          content: 'Maximum iterations exceeded',
          isComplete: true,
          error: 'Max iterations'
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
        stack: error.stackå
      });
      yield {
        stepId: currentStep?.id ?? -1,
        content: `Workflow error: ${error.message}`,
        isComplete: true,
        error: error.message
      };
    }
  }

  private findNextAvailableStep(steps: WorkflowStep[], completedSteps: Set<number>): WorkflowStep | undefined {
    return steps.find(step => {
      // Skip already completed steps
      if (completedSteps.has(step.id)) {
        return false;
      }
      // Check if all dependencies are satisfied
      if (step.dependentSteps?.length) {
        return step.dependentSteps.every(depId => completedSteps.has(depId));
      }
      // No dependencies, step is available
      return true;
    });
  }
}