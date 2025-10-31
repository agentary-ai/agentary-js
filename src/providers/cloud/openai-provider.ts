// import type { GenerateArgs, Message, Tool } from '../../types/worker';
// import type { GenerationTask, TokenStreamChunk } from '../../types/session';
// import type { ProviderType } from '../base';
// import { BaseCloudProvider } from './base-cloud-provider';
// import { logger } from '../../utils/logger';

// /**
//  * OpenAI provider
//  * Implements the OpenAI Chat Completions API format
//  */
// export class OpenAIProvider extends BaseCloudProvider {
//   getProviderType(): ProviderType {
//     return 'openai';
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

//     logger.openaiProvider?.info('Starting generation', {
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
//       logger.openaiProvider?.error('Generation failed', {
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
//     const requestBody: any = {
//       model: this.getModelName(),
//       messages: this.convertMessages(args.messages),
//       stream: true,
//     };

//     // Add optional parameters
//     if (args.max_new_tokens !== undefined) {
//       requestBody.max_tokens = args.max_new_tokens;
//     }

//     if (args.temperature !== undefined) {
//       requestBody.temperature = args.temperature;
//     }

//     if (args.top_p !== undefined) {
//       requestBody.top_p = args.top_p;
//     }

//     if (args.stop && args.stop.length > 0) {
//       requestBody.stop = args.stop;
//     }

//     if (args.seed !== undefined) {
//       requestBody.seed = args.seed;
//     }

//     // Add tools if present
//     if (args.tools && args.tools.length > 0) {
//       requestBody.tools = this.convertTools(args.tools);
//       requestBody.tool_choice = 'auto';
//     }

//     // OpenAI-specific: reasoning models support reasoning effort
//     if (args.enable_thinking && this.getModelName().includes('o1')) {
//       requestBody.reasoning_effort = 'high';
//     }

//     return requestBody;
//   }

//   /**
//    * Convert messages from Agentary format to OpenAI format
//    */
//   private convertMessages(messages: Message[]): any[] {
//     return messages.map(msg => {
//       // Handle tool results
//       if (msg.role === 'tool') {
//         return {
//           role: 'tool',
//           tool_call_id: msg.tool_call_id,
//           content: msg.content
//         };
//       }

//       // Handle assistant messages with tool calls
//       if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
//         return {
//           role: 'assistant',
//           content: msg.content || null,
//           tool_calls: msg.tool_calls.map(tc => ({
//             id: tc.id,
//             type: 'function',
//             function: {
//               name: tc.function.name,
//               arguments: JSON.stringify(tc.function.arguments)
//             }
//           }))
//         };
//       }

//       // Handle regular messages
//       return {
//         role: msg.role,
//         content: msg.content
//       };
//     });
//   }

//   /**
//    * Convert tools from Agentary format to OpenAI format
//    */
//   private convertTools(tools: Tool[]): any[] {
//     return tools.map(tool => ({
//       type: 'function',
//       function: {
//         name: tool.function.name,
//         description: tool.function.description,
//         parameters: {
//           type: 'object',
//           properties: tool.function.parameters.properties,
//           required: tool.function.parameters.required
//         }
//       }
//     }));
//   }

//   protected convertToTokenChunk(data: any, isFirst: boolean): TokenStreamChunk | null {
//     // OpenAI streaming format uses "choices" array
//     if (!data.choices || data.choices.length === 0) {
//       return null;
//     }

//     const choice = data.choices[0];
//     const delta = choice.delta;

//     // Handle text content
//     if (delta.content) {
//       return {
//         token: delta.content,
//         tokenId: 0, // OpenAI doesn't provide token IDs in streaming
//         isFirst: isFirst,
//         isLast: choice.finish_reason !== null
//       };
//     }

//     // Handle tool calls
//     if (delta.tool_calls && delta.tool_calls.length > 0) {
//       const toolCall = delta.tool_calls[0];

//       // Accumulate function arguments as tokens
//       if (toolCall.function?.arguments) {
//         return {
//           token: toolCall.function.arguments,
//           tokenId: 0,
//           isFirst: isFirst,
//           isLast: false
//         };
//       }
//     }

//     // Handle finish
//     if (choice.finish_reason) {
//       return {
//         token: '',
//         tokenId: 0,
//         isFirst: false,
//         isLast: true
//       };
//     }

//     return null;
//   }
// }
