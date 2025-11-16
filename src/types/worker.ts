import { DataType } from "./vendor";
import { InferenceProviderConfig } from "./provider";
import { DeviceProviderConfig } from "./provider";
export type EngineKind = 'auto' | 'webgpu' | 'wasm' | 'webnn';

export interface WorkerInstance {
  worker: Worker;
  model: DeviceProviderConfig;
  initialized: boolean;
  disposed: boolean;
  inflightId: number;
}

export interface InitArgs {
  config: DeviceProviderConfig;
}

export interface ToolUseContent {
  type: 'tool_use';
  id: string;
  name: string;
  arguments: Record<string, any>;
}

export interface ToolResultContent {
  type: 'tool_result';
  tool_use_id: string;
  result: string;
}

export interface TextContent {
  type: 'text';
  text: string;
}

export type MessageContent = ToolUseContent | ToolResultContent | TextContent;

export type MessageRole = 'user' | 'assistant' | 'system';

export interface Message {
  role: MessageRole;
  content: string | MessageContent[];
}

export interface Model {
  name: string;
  config: InferenceProviderConfig;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required: string[];
  };
}

export interface Tool {
  definition: ToolDefinition;
  implementation?: (...args: any[]) => any;
}

export interface GenerateArgs {
  messages: Message[];
  max_new_tokens?: number;
  tools?: ToolDefinition[];
  stream?: boolean;
  stop?: string[];
  temperature?: number;
  enable_thinking?: boolean;
  top_p?: number;
  top_k?: number;
  repetition_penalty?: number;
  seed?: number;
  deterministic?: boolean;
}

export type InboundMessageType = 'init' | 'generate' | 'dispose';

export type InboundMessage = {
  type: InboundMessageType;
  requestId: string;
  args?: InitArgs | GenerateArgs;
}

export interface ErrorArgs {
  error: string;
}

export interface DebugArgs {
  message: string;
  data?: unknown;
}

export interface ChunkArgs {
  token: string;
  tokenId: number;
  isFirst: boolean;
  isLast: boolean;
  ttfbMs?: number;
}

export interface ProgressArgs {
  status: string;
  name: string;
  file: string;
  progress: number;
  loaded: number;
  total: number;
}

export type OutboundMessageType = 'chunk' | 'ack' | 'done' | 'error' | 'debug' | 'progress';

export type OutboundMessage = {
  type: OutboundMessageType;
  requestId: string;
  args?: ChunkArgs | ErrorArgs | DebugArgs | ProgressArgs;
}