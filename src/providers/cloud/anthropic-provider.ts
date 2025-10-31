// import type { GenerateArgs, Message, Tool } from '../../types/worker';
// import type { GenerationTask, TokenStreamChunk } from '../../types/session';
// import type { ProviderType } from '../base';
// import { BaseCloudProvider } from './base-cloud-provider';
// import { logger } from '../../utils/logger';

// /**
//  * Anthropic Claude provider
//  * Implements the Anthropic Messages API format
//  */
// export class AnthropicProvider extends BaseCloudProvider {
//   getProviderType(): ProviderType {
//     return 'anthropic';
//   }

//   async *generate(
//     args: GenerateArgs,
//     generationTask?: GenerationTask
//   ): AsyncIterable<TokenStreamChunk> {
//     if (!this.initialized) {
//       await this.initialize();
//     }

//     const startTime = Date.now();

//     // Emit generation start event
//     this.eventEmitter.emit({
//       type: 'generation:start',
//       providerType: this.getProviderType(),
//       modelName: this.getModelName(),
//       timestamp: startTime
//     });

//     logger.anthropicProvider?.info('Starting generation', {
//       model: this.getModelName(),
//       messageCount: args.messages.length,
//       hasTools: !!args.tools?.length
//     });

//     try {
//       const requestBody = this.buildRequestBody(args);

//       const response = await this.fetchWithRetry(this.config.proxyUrl, {
//         method: 'POST',
//         body: JSON.stringify(requestBody),
//       });

//       yield* this.streamTokens(response, startTime);

//       // Emit generation complete event
//       this.eventEmitter.emit({
//         type: 'generation:complete',
//         providerType: this.getProviderType(),
//         modelName: this.getModelName(),
//         duration: Date.now() - startTime,
//         timestamp: Date.now()
//       });
//     } catch (error: any) {
//       logger.anthropicProvider?.error('Generation failed', {
//         model: this.getModelName(),
//         error: error.message
//       });

//       // Emit generation error event
//       this.eventEmitter.emit({
//         type: 'generation:error',
//         providerType: this.getProviderType(),
//         modelName: this.getModelName(),
//         error: error.message,
//         timestamp: Date.now()
//       });

//       throw error;
//     }
//   }

//   protected buildRequestBody(args: GenerateArgs): any {
//     // Convert messages to Anthropic format
//     const anthropicMessages = this.convertMessages(args.messages);

//     // Extract system message (Anthropic wants it separate)
//     const systemMessage = args.messages.find(m => m.role === 'system');

//     const requestBody: any = {
//       model: this.getModelName(),
//       messages: anthropicMessages,
//       max_tokens: args.max_new_tokens || 4096,
//       stream: true,
//     };

//     // Add system message if present
//     if (systemMessage) {
//       requestBody.system = systemMessage.content;
//     }

//     // Add optional parameters
//     if (args.temperature !== undefined) {
//       requestBody.temperature = args.temperature;
//     }

//     if (args.top_p !== undefined) {
//       requestBody.top_p = args.top_p;
//     }

//     if (args.top_k !== undefined) {
//       requestBody.top_k = args.top_k;
//     }

//     if (args.stop && args.stop.length > 0) {
//       requestBody.stop_sequences = args.stop;
//     }

//     // Add tools if present
//     if (args.tools && args.tools.length > 0) {
//       requestBody.tools = this.convertTools(args.tools);
//     }

//     // Enable thinking mode if requested (for Claude 3.7+ models)
//     if (args.enable_thinking) {
//       requestBody.thinking = {
//         type: 'enabled',
//         budget_tokens: 10000
//       };
//     }

//     return requestBody;
//   }

//   /**
//    * Convert messages from Agentary format to Anthropic format
//    */
//   private convertMessages(messages: Message[]): any[] {
//     return messages
//       .filter(m => m.role !== 'system') // System messages handled separately
//       .map(msg => {
//         // Handle tool results
//         if (msg.role === 'tool') {
//           return {
//             role: 'user',
//             content: [
//               {
//                 type: 'tool_result',
//                 tool_use_id: msg.tool_call_id,
//                 content: msg.content
//               }
//             ]
//           };
//         }

//         // Handle assistant messages with tool calls
//         if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
//           const content: any[] = [];

//           // Add text content if present
//           if (msg.content) {
//             content.push({
//               type: 'text',
//               text: msg.content
//             });
//           }

//           // Add tool uses
//           for (const toolCall of msg.tool_calls) {
//             content.push({
//               type: 'tool_use',
//               id: toolCall.id,
//               name: toolCall.function.name,
//               input: toolCall.function.arguments
//             });
//           }

//           return {
//             role: 'assistant',
//             content
//           };
//         }

//         // Handle regular messages
//         return {
//           role: msg.role === 'assistant' ? 'assistant' : 'user',
//           content: msg.content
//         };
//       });
//   }

//   /**
//    * Convert tools from Agentary format to Anthropic format
//    */
//   private convertTools(tools: Tool[]): any[] {
//     return tools.map(tool => ({
//       name: tool.function.name,
//       description: tool.function.description,
//       input_schema: {
//         type: 'object',
//         properties: tool.function.parameters.properties,
//         required: tool.function.parameters.required
//       }
//     }));
//   }

//   protected convertToTokenChunk(data: any, isFirst: boolean): TokenStreamChunk | null {
//     // Handle different event types from Anthropic streaming
//     switch (data.type) {
//       case 'content_block_start':
//         // Start of a content block (text or tool use)
//         if (data.content_block?.type === 'text') {
//           return {
//             token: '',
//             tokenId: 0,
//             isFirst: true,
//             isLast: false
//           };
//         }
//         return null;

//       case 'content_block_delta':
//         // Token delta
//         if (data.delta?.type === 'text_delta') {
//           return {
//             token: data.delta.text || '',
//             tokenId: 0, // Anthropic doesn't provide token IDs
//             isFirst: isFirst,
//             isLast: false
//           };
//         }

//         // Tool use input delta
//         if (data.delta?.type === 'input_json_delta') {
//           // For tool calls, we accumulate the JSON string
//           return {
//             token: data.delta.partial_json || '',
//             tokenId: 0,
//             isFirst: isFirst,
//             isLast: false
//           };
//         }
//         return null;

//       case 'content_block_stop':
//         // End of a content block
//         return {
//           token: '',
//           tokenId: 0,
//           isFirst: false,
//           isLast: false
//         };

//       case 'message_delta':
//         // Message-level updates (e.g., stop reason)
//         return null;

//       case 'message_stop':
//         // End of message
//         return {
//           token: '',
//           tokenId: 0,
//           isFirst: false,
//           isLast: true
//         };

//       case 'ping':
//         // Keep-alive ping
//         return null;

//       case 'error':
//         // Error from Anthropic
//         throw new Error(data.error?.message || 'Unknown error from Anthropic');

//       default:
//         logger.anthropicProvider?.debug('Unknown event type', { type: data.type });
//         return null;
//     }
//   }
// }
