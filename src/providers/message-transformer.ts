import type { Message, MessageContent, ToolUseContent, ToolResultContent, TextContent } from '../types/worker';

/**
 * Supported model provider types for message transformation
 */
export type ModelProvider = 'anthropic' | 'openai';

export namespace OpenAI {
  export interface Message {
    role: 'user' | 'assistant' | 'developer' | 'system';
    content: string | (FunctionCallContent | FunctionCallOutputContent)[];
  }

  export interface FunctionCallContent {
    type: 'function_call';
    call_id: string;
    name: string;
    arguments: Record<string, any>;
  }

  export interface FunctionCallOutputContent {
    type: 'function_call_output';
    call_id: string;
    output: string;
  }
}

/**
 * Transform messages to the target provider format
 * 
 * @param messages - Array of messages in native Anthropic format
 * @param provider - Target provider ('anthropic' or 'openai')
 * @returns Transformed messages
 */
export function transformMessagesToProvider(
  messages: Message[],
  provider: ModelProvider
): Message[] | OpenAI.Message[] {
  switch (provider) {
    case 'anthropic':
      return messages;
    case 'openai':
      return messages.map((message: Message): OpenAI.Message => {
        if (typeof message.content === 'string') {
          return message as OpenAI.Message;
        }
    
        // Transform content array
        const transformedContent = message.content.map(content => 
          transformContentToOpenAI(content)
        );
    
        return {
          ...message,
          content: transformedContent
        } as OpenAI.Message;
      });
    default:
      throw new Error(`Unsupported model provider: ${provider}`);
  }
}

/**
 * Transform messages from provider format to native Anthropic format
 * 
 * @param messages - Array of messages from provider
 * @param provider - Source provider ('anthropic' or 'openai')
 * @returns Messages in native Anthropic format
 */
export function transformMessagesFromProvider(
  messages: Message[],
  provider: ModelProvider
): Message[] {
  switch (provider) {
    case 'anthropic':
      return messages;
    case 'openai':
      // Transform from OpenAI format
      return messages.map(message => {
        if (typeof message.content === 'string') {
          return message;
        }

        // Transform content array
        const transformedContent = message.content.map(content => 
          transformContentFromOpenAI(content)
        );

        return {
          ...message,
          content: transformedContent
        };
      });
    default:
      throw new Error(`Unsupported model provider: ${provider}`);
  }
}

/**
 * Transform a single content item to OpenAI format
 * 
 * @param content - Content in standard format
 * @returns Content in OpenAI format
 */
export function transformContentToOpenAI(
  content: MessageContent
): OpenAI.FunctionCallContent | OpenAI.FunctionCallOutputContent | TextContent {
  switch (content.type) {
    case 'text':
      // Text content is the same in both formats
      return content;

    case 'tool_use':
      return {
        type: 'function_call',
        call_id: content.id,
        name: content.name,
        arguments: content.arguments
      } as OpenAI.FunctionCallContent;

    case 'tool_result':
      return {
        type: 'function_call_output',
        call_id: content.tool_use_id,
        output: content.result
      } as OpenAI.FunctionCallOutputContent;

    default:
      // Unknown type - pass through
      return content;
  }
}

/**
 * Transform a single content item from OpenAI format to Anthropic format
 * 
 * @param content - Content in OpenAI format
 * @returns Content in Anthropic format
 */
export function transformContentFromOpenAI(
  content: MessageContent | OpenAI.FunctionCallContent | OpenAI.FunctionCallOutputContent
): MessageContent {
  // Type guard for function_call
  if ('type' in content && content.type === 'function_call') {
    const functionCall = content as OpenAI.FunctionCallContent;
    return {
      type: 'tool_use',
      id: functionCall.call_id,
      name: functionCall.name,
      arguments: functionCall.arguments
    } as ToolUseContent;
  }

  // Type guard for tool
    if ('type' in content && content.type === 'function_call_output') {
    const functionCallOutput = content as OpenAI.FunctionCallOutputContent;
    return {
      type: 'tool_result',
      tool_use_id: functionCallOutput.call_id,
      result: functionCallOutput.output
    } as ToolResultContent;
  }

  // Text or unknown - pass through
  return content as MessageContent;
}

