import { GenerationTask } from "../../types/session";

export const getPromptSuffix = (stepType: GenerationTask): string => {
    switch (stepType) {
      case 'reasoning':
        return '<instructions>' +
          'Think through this step carefully using <think></think> tags ' +
          'for internal reasoning. Analyze the situation, consider different ' +
          'approaches, and provide clear logical conclusions outside the tags. ' +
          'Do not use tools in this step.' +
          '</instructions>';
      case 'tool_use':
        return '<instructions>' +
          `Use available tools to complete this action. Use <think></think> ` +
          'tags to plan your approach and determine which tools to use.\n\n' +
          'When you need to call a tool, use this exact format:\n' +
          '<tool_call>\n' +
          '{"name": "tool_name", "arguments": {"param": "value"}}\n' +
          `</tool_call>\n\n` +
          'Make sure to call the appropriate tools with proper parameters ' +
          'to complete the required actions.' +
          '</instructions>';
    }
    return '';
  }