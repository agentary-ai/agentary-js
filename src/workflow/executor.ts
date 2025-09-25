import type { 
  AgentWorkflow, 
  WorkflowStep, 
  AgentMemory,
  AgentMemoryConfig,
} from '../types/agent-session';
import type { Session } from '../types/session';
import type { Tool, Message, Model, GenerateArgs } from '../types/worker';

import { logger } from '../utils/logger';
import { StepExecutor } from './step-executor';
import { ContentProcessor } from '../processing/content/processor';

export class WorkflowExecutor {
  private stepExecutor: StepExecutor;
  private tools: Tool[];
  private session: Session;
  private contentProcessor: ContentProcessor;

  constructor(stepExecutor: StepExecutor, tools: Tool[], session: Session) {
    this.stepExecutor = stepExecutor;
    this.tools = tools;
    this.session = session;
    this.contentProcessor = new ContentProcessor();
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
    const completedSteps = new Set<string>();
    
    // Initialize workflow memory with optimization settings
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
      context: {
        workflowName: agentWorkflow.name,
      },
      toolResults: {}
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

        if (!currentStep.id) {
          logger.agent.error('ID undefined for workflow step', { 
            workflowId: agentWorkflow.id, 
            step: currentStep
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

        // Apply context optimization before executing step
        // TODO: Support parallel execution to minimize latency
        if (agentWorkflow.memoryConfig?.summarizationEnabled) {
          await this.optimizeMemory(userPrompt, agentWorkflow.memory, agentWorkflow.memoryConfig);
        }

        // Execute step
        logger.agent.info('Executing workflow step', { 
          workflowId: agentWorkflow.id, 
          stepId: currentStep.id, 
          stepType: currentStep.generationTask,
          iteration: iteration,
          messageCount: agentWorkflow.memory.messages.length,
        });

        await this.stepExecutor.execute(
          currentStep, agentWorkflow.memory, this.tools
        );
        
        // Store tool results for potential reuse
        if (currentStep.response?.toolCall?.result) {
          agentWorkflow.memory.toolResults![`step_${currentStep.id}`] = {
            tool: currentStep.response.toolCall.name,
            args: currentStep.response.toolCall.args,
            result: currentStep.response.toolCall.result
          };
        }
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
          id: currentStep?.id ?? 'unknown',
          prompt: currentStep?.prompt ?? 'unknown',
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
        logger.agent.info('Workflow execution complete', { 
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
        id: currentStep?.id ?? 'unknown',
        prompt: currentStep?.prompt ?? 'unknown',
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
  
  private async optimizeMemory(userPrompt: string, agentMemory: AgentMemory, agentMemoryConfig: AgentMemoryConfig): Promise<void> {
    if (agentMemoryConfig.maxMessages && agentMemory.messages.length >= agentMemoryConfig.maxMessages) {
      const systemMessage = agentMemory.messages.find(m => m.role === 'system');
      const nonSystemMessages = agentMemory.messages.filter(m => m.role !== 'system');

      // Keep the most recent messages
      const keepCount = Math.floor(agentMemoryConfig.maxMessages / 2);
      const toSummarize = nonSystemMessages.slice(0, -keepCount);
      const toKeep = nonSystemMessages.slice(-keepCount);

      const summary = await this.summarizeMessages(
        toSummarize, 
        systemMessage, 
        agentMemoryConfig.summarizationModel, 
        agentMemoryConfig.summarizationMaxTokens
      );
      agentMemory.messages = [
        ...(systemMessage ? [systemMessage] : []),
        {
          role: 'user',
          content: userPrompt
        },
        {
          role: 'system',
          content: summary
        },
        ...toKeep,
      ];
    }
  }

  private async summarizeMessages(
    messageHistory: Message[],
    systemPrompt?: Message,
    model?: Model,
    maxTokens?: number
  ): Promise<string> {
    const messages: Message[] = [
      {
        role: 'system',
        content: 'You are a helpful assistant that summarizes ' +
        'user and assistant messages from an agent workflow. ' + 
        (systemPrompt ? 
          'Refer to the following system prompt for context ' +
          'from the original workflow: ' + systemPrompt.content : 'No system prompt provided.') +
        'Your final response should be in the form of an updated system prompt ' +
        'that captures the key points and context.'
      },
      {
        role: 'user',
        content: 'Summarize the key points and context from the ' +
        'following messages:\n' + messageHistory.map(m => `${m.role}: ${m.content}`).join('\n')
      }
    ]

    const generateArgs: GenerateArgs = {
      messages,
      temperature: 0.1,
      max_new_tokens: maxTokens ?? 1024
    }
    if (model) {
      generateArgs['model'] = model
    }

    let response = '';
    // Default to assigned reasoning model in session created
    for await (const chunk of this.session.createResponse(generateArgs, 'reasoning')) {
      if (!chunk.isLast) {
        response += chunk.token;
      }
    }
    const { cleanContent } = this.contentProcessor.removeThinkTags(response);
    return cleanContent;
  }

  // TODO: Introduce step dependencies and routing in AgentWorkflow
  private findNextAvailableStep(steps: WorkflowStep[], completedSteps: Set<string>): WorkflowStep | undefined {
    return steps.find(step => {
      // Skip already completed steps
      if (completedSteps.has(step.id)) {
        return false;
      }
      return true;
    });
  }

  // === FUTURE ENHANCEMENTS ===
  
  // TODO: Implement adaptive context filtering based on step requirements
  // private adaptiveContextFilter(memory: AgentMemory, step: WorkflowStep): AgentMemory {
  //   // Filter messages based on step.contextRequirements
  //   // Keep only relevant tool results and previous step outputs
  // }
  
  // TODO: Implement token-based memory limits
  // private optimizeByTokenLimit(memory: AgentMemory, maxTokens: number): AgentMemory {
  //   // Estimate token count and trim messages to fit within limit
  // }
  
  // TODO: Implement entity memory with confidence decay
  // private entityMemory: EntityMemoryManager;
  // private updateEntityMemory(step: WorkflowStep): void {
  //   // Extract and store entities from step responses
  //   // Apply confidence decay over time
  // }
  
  // TODO: Implement step snapshots for debugging and replay
  // private snapshots: StepSnapshot[] = [];
  // private createSnapshot(step: WorkflowStep, memory: AgentMemory): void {
  //   // Create immutable snapshot of step state
  //   // Store for debugging and potential rollback
  // }
  
  // TODO: Implement workflow state persistence
  // async saveWorkflowState(workflowId: string): Promise<void> {
  //   // Serialize workflow state to storage
  // }
  // async loadWorkflowState(workflowId: string): Promise<AgentWorkflow | null> {
  //   // Restore workflow from storage
  // }
}