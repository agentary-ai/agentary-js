import type { GenerateArgs, Message, MessageContent, ToolUseContent, ToolResultContent, TextContent } from '../types/worker';

/**
 * Supported model provider types for message transformation
 */
export type ModelProvider = 'anthropic' | 'openai';

/**
 * OpenAI Response API types
 * https://platform.openai.com/docs/api-reference/responses
 */
export namespace OpenAI {
  /**
   * Request format types
   */
  export namespace Request {
    export interface InputText {
      type: 'input_text';
      text: string;
    }

    export interface InputMessage {
      type: 'message';
      role: 'user' | 'system' | 'developer';
      content: string | Array<InputText>;
    }

    export interface FunctionCall {
      type: 'function_call';
      call_id: string;
      name: string;
      arguments: string;
    }

    export interface FunctionCallOutput {
      type: 'function_call_output';
      call_id: string;
      output: string;
    }

    export type InputItem = InputMessage | FunctionCall | FunctionCallOutput;
  }

  /**
   * Response format types
   */
  export namespace Response {
    export interface OutputText {
      type: 'output_text';
      text: string;
      annotations?: any[];
    }

    export interface OutputRefusal {
      type: 'refusal';
      refusal: string;
    }

    export interface OutputMessage {
      id: string;
      type: 'message';
      role: 'assistant';
      content: Array<OutputText | OutputRefusal>;
      status: 'in_progress' | 'completed' | 'incomplete';
    }

    export interface FunctionCall {
      type: 'function_call';
      id: string;
      call_id: string;
      name: string;
      arguments: string;
      status?: 'in_progress' | 'completed' | 'incomplete';
    }

    export type OutputItem = OutputMessage | FunctionCall;

    export interface Usage {
      input_tokens: number;
      output_tokens: number;
      total_tokens: number;
    }

    export interface IncompleteDetails {
      reason: 'max_output_tokens' | 'content_filter';
    }

    export interface Error {
      code: string;
      message: string;
    }

    export interface ResponseObject {
      id: string;
      object: 'response';
      created_at: number;
      status: 'in_progress' | 'completed' | 'incomplete' | 'failed' | 'cancelled';
      model: string;
      output: Array<OutputItem>;
      usage?: Usage;
      error?: Error | null;
      incomplete_details?: IncompleteDetails | null;
    }
  }
}

/**
 * Transform GenerateArgs to OpenAI Response API request format
 * 
 * @param generateArgs - Native GenerateArgs format
 * @param provider - Target provider ('anthropic' or 'openai')
 * @returns Transformed request payload for the provider
 */
export function transformArgs(
  generateArgs: GenerateArgs,
  provider: ModelProvider
): any {
  switch (provider) {
    case 'openai': {
      // Transform messages to OpenAI input items
      const inputItems: OpenAI.Request.InputItem[] = [];
      
      for (const message of generateArgs.messages) {
        if (typeof message.content === 'string') {
          // Simple text message
          inputItems.push({
            type: 'message',
            role: message.role === 'assistant' ? 'developer' : message.role,
            content: message.content
          });
        } else {
          // Complex message with tool calls/results
          const messageContent: OpenAI.Request.InputText[] = [];
          
          for (const content of message.content) {
            if (content.type === 'text') {
              messageContent.push({
                type: 'input_text',
                text: content.text
              });
            } else if (content.type === 'tool_use') {
              // Add text content as message if present
              if (messageContent.length > 0) {
                inputItems.push({
                  type: 'message',
                  role: message.role === 'assistant' ? 'developer' : message.role,
                  content: messageContent.splice(0, messageContent.length)
                });
              }
              // Add function call
              inputItems.push({
                type: 'function_call',
                call_id: content.id,
                name: content.name,
                arguments: typeof content.arguments === 'string' 
                  ? content.arguments 
                  : JSON.stringify(content.arguments)
              });
            } else if (content.type === 'tool_result') {
              // Add function call output
              inputItems.push({
                type: 'function_call_output',
                call_id: content.tool_use_id,
                output: content.result
              });
            }
          }
          
          // Add remaining text content as message
          if (messageContent.length > 0) {
            inputItems.push({
              type: 'message',
              role: message.role === 'assistant' ? 'developer' : message.role,
              content: messageContent
            });
          }
        }
      }
      
      // Transform tools to include type field for OpenAI
      const tools = generateArgs.tools?.map(tool => ({
        type: 'function' as const,
        ...tool
      }));

      // Destructure to exclude fields we don't want in the OpenAI payload
      const { max_new_tokens, messages: _, ...restArgs } = generateArgs;

      // Return full OpenAI request payload
      return {
        ...restArgs,
        input: inputItems,
        tools, // Override with transformed tools (or undefined if no tools)
        max_output_tokens: max_new_tokens // Transform max_new_tokens to max_output_tokens
      };
    }
    
    default:
      return generateArgs;
  }
}

/**
 * Transform OpenAI Response API response to native Message format
 * 
 * @param responseData - OpenAI Response API response object
 * @param provider - Source provider ('anthropic' or 'openai')
 * @returns Messages in native format
 */
export function transformResponse(
  responseData: any,
  provider: ModelProvider
): Message[] {
  switch (provider) {
    case 'openai': {
      const messages: Message[] = [];
      
      if (!responseData.output || !Array.isArray(responseData.output)) {
        return messages;
      }
      
      // Process each output item
      for (const outputItem of responseData.output) {
        if (outputItem.type === 'message') {
          // Extract text content from message
          const content: MessageContent[] = [];
          
          for (const contentItem of outputItem.content || []) {
            if (contentItem.type === 'output_text') {
              content.push({
                type: 'text',
                text: contentItem.text
              });
            }
          }
          
          messages.push({
            role: 'assistant',
            content: content.length === 1 && content[0]?.type === 'text' 
              ? content[0].text 
              : content
          });
        } else if (outputItem.type === 'function_call') {
          // Handle function calls as tool_use
          messages.push({
            role: 'assistant',
            content: [{
              type: 'tool_use',
              id: outputItem.call_id,
              name: outputItem.name,
              arguments: typeof outputItem.arguments === 'string'
                ? JSON.parse(outputItem.arguments)
                : outputItem.arguments
            }]
          });
        }
      }
      
      return messages;
    }
    
    default:
      return [];
  }
}

/**
 * Transform messages array to provider-specific format
 * Backward-compatible alias for transformArgs that only transforms messages
 * 
 * @param messages - Array of messages in native format
 * @param provider - Target provider
 * @returns Transformed messages array for the provider
 */
export function transformMessagesToProvider(
  messages: Message[],
  provider: ModelProvider
): Message[] | any[] {
  if (provider === 'openai') {
    // Use transformArgs to get the full transformed payload
    const transformed = transformArgs({ messages } as GenerateArgs, provider);
    return transformed.input || messages;
  }
  
  return messages;
}

