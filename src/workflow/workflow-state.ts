import type { AgentWorkflow, WorkflowStep } from '../types/agent-session';
import type { Tool } from '../types/worker';
import type { WorkflowState, AgentMemory, StepState } from '../types/workflow-state';

import { logger } from '../utils/logger';

export class WorkflowStateManager {
  private state?: WorkflowState;

  initializeState(userPrompt: string, workflow: AgentWorkflow, tools: Tool[]): void {
    this.state = {
      workflow,
      startTime: Date.now(),
      completedSteps: new Set<string>(),
      iteration: 1,
      maxIterations: workflow.maxIterations ?? 10,
      timeout: workflow.timeout ?? 60000,
      tools: [...tools, ...workflow.tools],
      memory: this.initializeMemory(
        workflow.steps,
        userPrompt,
        workflow.name,
        workflow.description,
        workflow.context,
      ),
    };
    if (workflow.systemPrompt) {
      this.state.systemPrompt = workflow.systemPrompt;
    }
  }

  private initializeMemory(
    workflowSteps: WorkflowStep[],
    workflowUserPrompt: string,
    workflowName: string | undefined,
    workflowDescription: string | undefined,
    context: Record<string, any> | undefined,
  ): AgentMemory {
    const stepsState: Record<string, StepState> = {};
    workflowSteps.forEach(step => {
      stepsState[step.id] = {
        id: step.id,
        description: step.description,
        complete: false,
        attempts: 0,
        maxAttempts: step.maxAttempts ?? 3,
      };
    });

    const memory: AgentMemory = {
      workflowUserPrompt,
      steps: stepsState,
    };
    if (workflowName) {
      memory.workflowName = workflowName;
    }
    if (workflowDescription) {
      memory.workflowDescription = workflowDescription;
    }
    if (context) {
      memory.context = context;
    }
    return memory;
  }

  getState(): WorkflowState {
    if (!this.state) {
      throw new Error('State not initialized');
    }
    return this.state;
  }

  getSystemMessage(): string {
    if (!this.state) {
      throw new Error('State not initialized');
    }
    return `${this.state.systemPrompt ? `${this.state.systemPrompt}\n\n` : ''}${this.buildContextString(this.state.memory)}`;
  }

  private buildContextString(memory: AgentMemory): string {
    let contextSection = '<system_instructions>\n';
    contextSection += 'You are an AI agent executing a specific step of a workflow. Follow these critical rules:\n\n';
    contextSection += '1. **ONLY provide the direct answer** to what the step asks for\n';
    contextSection += '2. **DO NOT include**:\n';
    contextSection += '   - Greetings or pleasantries ("Hello!", "I\'d be happy to help")\n';
    contextSection += '   - Explanations of what you\'re doing ("Let me...", "I\'ll...")\n';
    contextSection += '   - Summaries or conclusions ("In summary...", "To conclude...")\n';
    contextSection += '   - Any meta-commentary about the task\n';
    contextSection += '3. **For tool use**: Call tools directly without announcing it\n';
    contextSection += '4. **Be concise**: Use the minimum words needed for clarity\n';
    contextSection += '5. **Stay focused**: Address only what the current step requests\n';
    contextSection += '</system_instructions>\n\n';
    
    contextSection += '<workflow_context>\n';
    
    // Add workflow context if available
    if (memory.workflowName) {
      contextSection += `Workflow: ${memory.workflowName}\n`;
    }
    if (memory.workflowDescription) {
      contextSection += `Description: ${memory.workflowDescription}\n`;
    }
    contextSection += `User Request: ${memory.workflowUserPrompt}\n\n`;
    
    // Add any global context
    if (memory.context) {
      contextSection += 'Global Context:\n';
      Object.entries(memory.context).forEach(([key, value]) => {
        contextSection += `  ${key}: ${JSON.stringify(value)}\n`;
      });
      contextSection += '\n';
    }
    
    // Add completed steps and their results
    const completedSteps = Object.values(memory.steps).filter(step => step.complete);
    if (completedSteps.length > 0) {
      contextSection += 'Previous Step Results:\n';
      completedSteps.forEach(step => {
        if (step.result) {
          // Truncate long results if needed to avoid context overflow
          const maxResultLength = 500;
          const result = step.result.length > maxResultLength 
            ? step.result.substring(0, maxResultLength) + '... [truncated]'
            : step.result;
          contextSection += `${step.id} (${step.description}): ${result}\n`;
        }
      });
      contextSection += '\n';
    }
    contextSection += '</workflow_context>\n\n';
    
    return contextSection;
  }

  findNextStep(): WorkflowStep | undefined {
    if (!this.state) {
      throw new Error('State not initialized');
    }
    const completedSteps = this.state.completedSteps;
    return this.state.workflow.steps.find(step => {
      if (!step.id || completedSteps.has(step.id)) {
        return false;
      }
      return true;
    });
  }

  isTimeout(state: WorkflowState): boolean {
    return Date.now() - state.startTime > state.timeout;
  }

  isMaxIterationsReached(state: WorkflowState): boolean {
    return state.iteration >= state.maxIterations;
  }

  getStepState(stepId: string): StepState {
    if (!this.state) {
      throw new Error('State not initialized');
    }
    if (!this.state.memory.steps[stepId]) {
      throw new Error('Step not found');
    }
    return this.state.memory.steps[stepId];
  }

  updateStepResult(stepId: string, result: string) {
    if (!this.state) {
      throw new Error('State not initialized');
    }
    if (!this.state.memory.steps[stepId]) {
      throw new Error('Step not found');
    }
    this.state.memory.steps[stepId].result = result;
  }

  updateStepCompletion(stepId: string, complete: boolean) {
    if (!this.state) {
      throw new Error('State not initialized');
    }
    if (!this.state.memory.steps[stepId]) {
      throw new Error('Step not found');
    }
    this.state.memory.steps[stepId].complete = complete;
    this.state.completedSteps.add(stepId);
  }

  isStepComplete(stepId: string): boolean {
    if (!this.state) {
      throw new Error('State not initialized');
    }
    if (!this.state.memory.steps[stepId]) {
      throw new Error('Step not found');
  }
    return this.state.memory.steps[stepId].complete;
  }

  logWorkflowStart(workflow: AgentWorkflow, userPrompt: string): void {
    logger.agent.info('Starting workflow execution', { 
      workflowId: workflow.id, 
      workflowName: workflow.name,
      userPrompt,
      stepCount: workflow.steps.length,
      toolCount: workflow.tools.length 
    });
  }

  logStepExecution(
    workflow: AgentWorkflow,
    step: WorkflowStep,
    iteration: number,
  ): void {
    logger.agent.info('Executing workflow step', { 
      workflowId: workflow.id, 
      stepId: step.id, 
      stepType: step.generationTask,
      iteration,
    });
  }

  logWorkflowComplete(
    workflowId: string,
    iterations: number,
    startTime: number
  ): void {
    logger.agent.info('Workflow execution complete', { 
      workflowId,
      iterations,
      totalTimeMs: Date.now() - startTime
    });
  }
}
