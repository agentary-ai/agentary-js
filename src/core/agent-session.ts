import { 
  type AgentSession, 
  type WorkflowDefinition, 
  type WorkflowStep,
  type AgentStepResult, 
  type Tool, 
  type Session,
  type CreateSessionArgs,
  type TokenStreamChunk,
  type GenerationTask
} from '../types/api';
import { GenerateArgs } from '../types/worker';
import { createSession } from './session';
import { WorkflowExecutor } from '../workflow/executor';
import { StepExecutor } from '../workflow/step-executor';
import { WorkerManager } from '../workers/manager';

export class AgentSessionImpl implements AgentSession {
  workerManager: WorkerManager;
  private session: Session;
  private tools: Map<string, Tool> = new Map();
  private disposed = false;
  private stepExecutor: StepExecutor;
  private workflowExecutor: WorkflowExecutor;

  constructor(session: Session) {
    this.session = session;
    this.stepExecutor = new StepExecutor(session, this.tools);
    this.workflowExecutor = new WorkflowExecutor(this.stepExecutor, this.tools);
    this.workerManager = session.workerManager;
  }

  // Delegate basic session methods
  async* createResponse(args: GenerateArgs, generationTask?: GenerationTask): AsyncIterable<TokenStreamChunk> {
    if (this.disposed) throw new Error('Agent session disposed');
    
    // Add registered tools to the generation args
    const toolsArray = args.tools ? [...args.tools] : [];
    for (const tool of this.tools.values()) {
      toolsArray.push({
        type: tool.type,
        function: {
          name: tool.function.name,
          description: tool.function.description,
          parameters: tool.function.parameters
        }
      });
    }

    const generateArgs: GenerateArgs = { ...args };
    if (toolsArray.length > 0) {
      generateArgs.tools = toolsArray;
    }
    yield* this.session.createResponse(generateArgs, generationTask);
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    await this.session.dispose();
    this.tools.clear();
  }

  // Agent-specific methods
  registerTool(tool: Tool): void {
    if (this.disposed) throw new Error('Agent session disposed');
    this.tools.set(tool.function.name, tool);
  }

  getRegisteredTools(): Tool[] {
    return Array.from(this.tools.values());
  }

  async* runWorkflow(prompt: string, workflow: WorkflowDefinition): AsyncIterable<AgentStepResult> {
    if (this.disposed) throw new Error('Agent session disposed');
    yield* this.workflowExecutor.execute(prompt, workflow);
  }

  async* executeStep(step: WorkflowStep, context: Record<string, any>): AsyncIterable<AgentStepResult> {
    if (this.disposed) throw new Error('Agent session disposed');
    yield* this.stepExecutor.execute(step, context);
  }
}

export async function createAgentSession(args: CreateSessionArgs = {}): Promise<AgentSession> {
  const session = await createSession(args);
  return new AgentSessionImpl(session);
}
