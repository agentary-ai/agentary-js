import type { 
  AgentSession, 
  AgentWorkflow,
  WorkflowStepResult, 
} from '../types/agent-session';
import type { Session, CreateSessionArgs, TokenStreamChunk, GenerationTask } from '../types/session';
import type { GenerateArgs, Tool } from '../types/worker';
import { logger } from '../utils/logger';
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
    this.stepExecutor = new StepExecutor(session);
    this.workflowExecutor = new WorkflowExecutor(this.stepExecutor, this.tools);
    this.workerManager = session.workerManager;
  }

  // Delegate basic session methods
  async* createResponse(
    generateArgs: GenerateArgs, 
    generationTask?: GenerationTask
  ): AsyncIterable<TokenStreamChunk> {
    logger.agent.debug('Creating agent session response', { generateArgs, generationTask });
    yield* this.session.createResponse(generateArgs, generationTask);
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    await this.session.dispose();
    this.tools.clear();
  }

  registerTool(tool: Tool): void {
    if (this.disposed) throw new Error('Agent session disposed');
    this.tools.set(tool.function.name, tool);
  }

  getRegisteredTools(): Tool[] {
    return Array.from(this.tools.values());
  }

  async* runWorkflow(
    prompt: string, workflow: AgentWorkflow
  ): AsyncIterable<WorkflowStepResult> {
    if (this.disposed) throw new Error('Agent session disposed');
    yield* this.workflowExecutor.execute(prompt, workflow);
  }
}

export async function createAgentSession(args: CreateSessionArgs = {}): Promise<AgentSession> {
  const session = await createSession(args);
  return new AgentSessionImpl(session);
}
