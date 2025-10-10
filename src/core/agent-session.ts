import type { 
  AgentSession, 
  AgentWorkflow,
  WorkflowIterationResponse, 
} from '../types/agent-session';
import type { Session, CreateSessionArgs, TokenStreamChunk, GenerationTask } from '../types/session';
import type { GenerateArgs, Tool } from '../types/worker';
import { createSession } from './session';
import { WorkflowExecutor } from '../workflow/executor';
import { StepExecutor } from '../workflow/step-executor';
import { WorkerManager } from '../workers/manager';
import { WorkflowStateManager } from '../workflow/workflow-state';

export class AgentSessionImpl implements AgentSession {
  workerManager: WorkerManager;
  private session: Session;
  private tools: Tool[] = [];
  private disposed = false;
  private stepExecutor: StepExecutor;
  private workflowExecutor: WorkflowExecutor;
  private workflowStateManager: WorkflowStateManager;

  constructor(session: Session) {
    this.session = session;
    this.workflowStateManager = new WorkflowStateManager(session);
    this.stepExecutor = new StepExecutor(session, this.workflowStateManager, session);
    this.workflowExecutor = new WorkflowExecutor(this.stepExecutor, this.tools, this.workflowStateManager, session);
    this.workerManager = session.workerManager;
  }

  // Delegate basic session methods
  async* createResponse(
    generateArgs: GenerateArgs, 
    generationTask?: GenerationTask
  ): AsyncIterable<TokenStreamChunk> {
    yield* this.session.createResponse(generateArgs, generationTask);
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    await this.session.dispose();
    this.tools = [];
  }

  registerTool(tool: Tool): void {
    if (this.disposed) throw new Error('Agent session disposed');
    this.tools.push(tool);
  }

  getRegisteredTools(): Tool[] {
    return this.tools;
  }

  async* runWorkflow(
    prompt: string, workflow: AgentWorkflow
  ): AsyncIterable<WorkflowIterationResponse> {
    if (this.disposed) throw new Error('Agent session disposed');
    yield* this.workflowExecutor.execute(prompt, workflow);
  }

  // Delegate event methods
  on(eventType: string | '*', handler: any) {
    return this.session.on(eventType, handler);
  }

  off(eventType: string | '*', handler: any) {
    this.session.off(eventType, handler);
  }
}

export async function createAgentSession(args: CreateSessionArgs = {}): Promise<AgentSession> {
  const session = await createSession(args);
  return new AgentSessionImpl(session);
}
