import { Message as HFMessage } from '../../../types/vendor';
import { Message } from '../../../types/worker';
import { NonStreamingResponse } from '../../../types/session';
import { ModelConfig } from '../types';
import { logger } from '../../../utils/logger';

/**
 * Qwen3 0.6B Model Configuration
 */
export const qwen3_06b: ModelConfig = {
  modelId: 'onnx-community/Qwen3-0.6B-ONNX',
  displayName: 'Qwen3 0.6B (ONNX)',   
  toolSupport: true,
  reasoningSupport: true,
  notes: 'Lightweight model optimized for on-device inference',

  messageTransformer: (messages: Message[]) => {
    return messages.flatMap(message => {
      if (Array.isArray(message.content)) {
        return message.content.map(content => {
          switch (content.type) {
            case 'text':
              return {
                role: message.role,
                content: content.text,
              } as HFMessage;
            case 'tool_use':
              return {
                role: message.role,
                content: '',
                tool_calls: [{
                  type: 'function',
                  function: {
                    name: content.name,
                    arguments: content.arguments,
                  },
                }],
              } as HFMessage;
            case 'tool_result':
              return {
                role: 'tool',
                content: content.result,
              } as HFMessage;
            default:
              throw new Error(`Unsupported content type: ${(content as any).type}`);
          }
        });
      }
      return {
        role: message.role,
        content: message.content as string,
      } as HFMessage;
    });
  },

  responseParser: (content: string) => {
    const toolCallRegex = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g;
    const thinkRegex = /<think>([\s\S]*?)<\/think>/g;
    const toolCalls: NonStreamingResponse['toolCalls'] = [];
    let cleanContent = content;
    let reasoning: string | undefined;
    let match;
    
    // Extract reasoning from <think> tags
    const thinkMatch = thinkRegex.exec(content);
    if (thinkMatch && thinkMatch[1]) {
      reasoning = thinkMatch[1].trim();
      // Remove think tags from content
      cleanContent = cleanContent.replace(thinkMatch[0], '').trim();
    }
    
    // Extract tool calls from <tool_call> tags
    while ((match = toolCallRegex.exec(content)) !== null) {
      try {
        const jsonStr = match[1];
        if (!jsonStr) continue;
        
        const toolCallJson = JSON.parse(jsonStr);
        
        toolCalls.push({
          id: `call_${Date.now()}_${toolCalls.length}`,
          type: 'function',
          function: {
            name: toolCallJson.name,
            arguments: typeof toolCallJson.arguments === 'string' 
              ? toolCallJson.arguments 
              : JSON.stringify(toolCallJson.arguments)
          }
        });
        
        // Remove tool call from content
        cleanContent = cleanContent.replace(match[0], '').trim();
      } catch (e) {
        // Invalid JSON, keep in content
      }
    }
    
    // Check for incomplete tool calls (opening tag without closing tag)
    // This can happen when max_new_tokens is reached before completion
    const incompleteRegex = /<tool_call>\s*([\s\S]+?)$/;
    const incompleteMatch = incompleteRegex.exec(cleanContent);
    if (incompleteMatch) {
      try {
        const jsonStr = incompleteMatch[1].trim();
        const toolCallJson = JSON.parse(jsonStr);
        
        // JSON is valid! This is likely a truncated response
        logger.agent?.warn('Detected truncated tool call - closing tag missing', {
          toolName: toolCallJson.name,
          hint: 'Consider increasing maxTokens for this workflow step'
        });
        
        toolCalls.push({
          id: `call_${Date.now()}_${toolCalls.length}`,
          type: 'function',
          function: {
            name: toolCallJson.name,
            arguments: typeof toolCallJson.arguments === 'string' 
              ? toolCallJson.arguments 
              : JSON.stringify(toolCallJson.arguments)
          }
        });
        
        // Remove incomplete tool call from content
        cleanContent = cleanContent.replace(incompleteMatch[0], '').trim();
      } catch (e) {
        // JSON is invalid, likely truly incomplete - leave in content
        logger.agent?.warn('Found incomplete tool call that cannot be parsed', {
          error: (e as Error).message
        });
      }
    }
    
    return {
      content: cleanContent,
      ...(toolCalls.length > 0 && { 
        toolCalls,
        finishReason: 'tool_calls' as const 
      }),
      ...(reasoning && { reasoning })
    };
  },
};