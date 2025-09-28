import { AgentWorkflow } from "./agent-session";
import { Tool } from "./worker";
import { Message } from "./worker";

export interface StepState {
    id: string;
    description: string;
    result?: string;
    complete: boolean;
    attempts: number;
    maxAttempts: number;
  }
  
  export interface AgentMemory {
    workflowName?: string;
    workflowDescription?: string;
    workflowUserPrompt: string;
    steps: Record<string, StepState>;
    context?: Record<string, any>;
    messages?: Message[];
  }

  export interface WorkflowMemoryMetrics {
    messageCount: number;
    estimatedTokens: number;
    lastPruneTime?: number;
    pruneCount: number;
    avgStepResultSize: number;
    maxTokenLimit: number;
    warningThreshold: number;
  }
  
  export interface WorkflowState {
    workflow: AgentWorkflow;
    systemPrompt?: string;
    startTime: number;
    completedSteps: Set<string>;
    iteration: number;
    maxIterations: number;
    timeout: number;
    tools: Tool[];
    memory: AgentMemory;
    currentTokenCount?: number;
    tokenCountLastUpdated?: Date;
    memoryMetrics?: WorkflowMemoryMetrics;
  }