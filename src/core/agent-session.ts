import type { 
  AgentSession, 
  Workflow,
  WorkflowIterationResponse, 
} from '../types/agent-session';
import type { Session, CreateSessionArgs, TokenStreamChunk } from '../types/session';
import type { GenerateArgs, Tool } from '../types/worker';
import { createSession } from './session';
import { WorkflowExecutor } from '../workflow/executor';
import { StepExecutor } from '../workflow/step-executor';
import { WorkflowStateManager } from '../workflow/workflow-state';
import { InferenceProviderConfig } from '../types/provider';
import { MemoryConfig } from '../types/memory';
import { EventEmitter } from '../utils/event-emitter';
import { InferenceProviderManager } from '../providers/manager';

/**
 * Implementation of the AgentSession interface that extends the base Session
 * with agentic workflow capabilities, tool calling, and orchestration.
 * 
 * This class wraps a Session instance and adds workflow execution capabilities,
 * allowing for multi-step agentic processes with tool calling and iterative refinement.
 */
export class AgentSessionImpl implements AgentSession {
  /**
   * The underlying session instance that handles basic LLM operations,
   * model management, and event handling.
   */
  private session: Session;
  
  /**
   * Registry of tools available to the agent for function calling.
   * Tools are registered via registerTool() and made available during workflow execution.
   */
  private tools: Tool[] = [];
  
  /**
   * Flag tracking whether this session has been disposed.
   * Once disposed, the session cannot be used and will throw errors.
   */
  private disposed = false;
  
  /**
   * Executes individual workflow steps, handling tool calls and response generation.
   */
  private stepExecutor: StepExecutor;
  
  /**
   * Orchestrates the entire workflow execution, managing multiple steps
   * and coordinating between the step executor and state management.
   */
  private workflowExecutor: WorkflowExecutor;
  
  /**
   * Manages workflow state across iterations, tracking conversation history,
   * tool calls, and step progression.
   */
  private workflowStateManager: WorkflowStateManager;

  /**
   * Creates a new AgentSessionImpl instance.
   * 
   * @param session - The underlying Session instance to wrap
   */
  constructor(session: Session) {
    this.session = session;
    this.workflowStateManager = new WorkflowStateManager(session);
    this.stepExecutor = new StepExecutor(
      session, this.workflowStateManager
    );
    this.workflowExecutor = new WorkflowExecutor(
      this.stepExecutor, 
      this.tools, 
      this.workflowStateManager, 
      session
    );
  }
  
  /**
   * Generates a streaming response from the LLM for the given 
   * prompt and configuration.
   * 
   * @param args - Generation arguments
   * @param args.model - Name of the model to use for generation (must be registered)
   * @param args.messages - Array of conversation messages
   * @param args.tools - Optional array of tools available forfunction calling
   * @param args.maxTokens - Optional maximum number of tokens to generate
   * @param args.temperature - Optional sampling temperature (0-1)
   * @param args.topP - Optional nucleus sampling parameter
   * 
   * @returns Async iterable yielding token chunks as they are generated
   * 
   * @throws {Error} If session is disposed
   * @throws {Error} If model is undefined
   * @throws {Error} If messages are undefined
   * @throws {Error} If model is not registered or initialization fails
   * 
   * @example
   * ```typescript
   * for await (const chunk of session.createResponse({ prompt: "Hello!" })) {
   *   console.log(chunk.token);
   * }
   * ```
   */
  async* createResponse(
    args: GenerateArgs
  ): AsyncIterable<TokenStreamChunk> {
    yield* this.session.createResponse(args);
  }

  /**
   * Registers additional models with the session after creation.
   * 
   * @param models - Record mapping model names to their provider configurations
   * @returns Promise that resolves when all models are registered and ready for use
   */
  async registerModels(
    models: Record<string, InferenceProviderConfig>
  ): Promise<void> {
    await this.session.registerModels(models);
  }

  /**
   * Disposes of this agent session, cleaning up all resources including
   * the underlying session, registered tools, and workflow executors.
   * 
   * @returns Promise that resolves when cleanup is complete
   */
  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    await this.session.dispose();
    this.tools = [];
  }

  /**
   * Registers multiple tools with the agent.
   * 
   * @param tools - Array of tools to register with the agent
   * @throws Error if the session has been disposed
   */
  registerTools(tools: Tool[]): void {
    if (this.disposed) throw new Error('Agent session disposed');
    this.tools.push(...tools);
  }

  /**
   * Returns all tools currently registered with this agent session.
   * 
   * @returns Array of registered tools
   */
  getRegisteredTools(): Tool[] {
    return this.tools;
  }

  /**
   * Executes an agentic workflow with the given prompt as the starting point.
   * 
   * @param prompt - The initial user prompt to start the workflow
   * @param workflow - Configuration for the workflow 
   * @param memoryConfig - Configuration for the memory
   * @returns An async iterable yielding responses for each workflow iteration
   * @throws Error if the session has been disposed
   * 
   * @example
   * ```typescript
   * for await (const iteration of session.runWorkflow("Plan a trip", workflow)) {
   *   console.log(`Step ${iteration.step}:`, iteration.content);
   * }
   * ```
   */
  async* runWorkflow(
    prompt: string,
    workflow: Workflow,
    memoryConfig?: MemoryConfig
  ): AsyncIterable<WorkflowIterationResponse> {
    if (this.disposed) throw new Error('Agent session disposed');
    yield* this.workflowExecutor.execute(prompt, workflow, memoryConfig);
  }

  /**
   * Registers an event handler for session events.
   * 
   * @param eventType - The event type to listen for, or '*' for all events
   * @param handler - The callback function to invoke when the event occurs
   * @returns Function to remove the event listener
   */
  on(eventType: string | '*', handler: any) {
    return this.session.on(eventType, handler);
  }

  /**
   * Removes an event handler previously registered with on().
   * 
   * @param eventType - The event type the handler was registered for
   * @param handler - The callback function to remove
   */
  off(eventType: string | '*', handler: any) {
    this.session.off(eventType, handler);
  }
  
  get _eventEmitter(): EventEmitter {
    return this.session._eventEmitter;
  }
  
  get _providerManager(): InferenceProviderManager {
    return this.session._providerManager;
  }
}

/**
 * Factory function to create a new AgentSession instance.
 * 
 * @param args - Optional configuration for session creation
 * @returns Promise resolving to a configured AgentSession instance
 */
export async function createAgentSession(
  args: CreateSessionArgs = {}
): Promise<AgentSession> {
  const session = await createSession(args);
  return new AgentSessionImpl(session);
}