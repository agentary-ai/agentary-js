import { AgentWorkflow } from "./agent-session";
import { Tool } from "./worker";
import { Message } from "./worker";

  export interface StepState {
    id: string;
    // description: string;
    result?: string;
    complete: boolean;
    attempts: number;
    maxAttempts: number;
  }

  export interface ToolResult {
    name: string;
    description: string;
    result: string;
  }
  
  export interface AgentMemory {
    workflowName?: string;
    workflowDescription?: string;
    workflowSystemPrompt?: string;
    workflowUserPrompt: string;
    steps: Record<string, StepState>;
    toolResults: Record<string, ToolResult>;
    context?: Record<string, any>;
    messages?: Message[];
  }

  export interface WorkflowMemoryMetrics {
    messageCount: number;
    estimatedTokens: number;
    lastPruneTime?: number;
    pruneCount: number;
    summarizationCount: number;
    lastSummarizationTime?: number;
    avgStepResultSize: number;
    maxTokenLimit: number;
    warningThreshold: number;
  }
  
  export interface WorkflowState {
    workflow: AgentWorkflow;
    userPrompt: string;
    startTime: number;
    completedSteps: Set<string>;
    iteration: number;
    maxIterations: number;
    timeout: number;
    tools: Tool[];
    steps: Record<string, StepState>;
    toolResults: Record<string, ToolResult>;
  }