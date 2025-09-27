import { GenerationTask } from "../../types/session";

export const getPromptSuffix = (stepType: GenerationTask): string => {
    switch (stepType) {
      case 'reasoning':
        return '<step_instructions>' +
          'Use <think></think> tags for reasoning. ' +
          'Output ONLY your conclusion outside the tags. ' +
          'No tools available.' +
          '</step_instructions>';
      case 'tool_use':
        return '<step_instructions>' +
          'Use <think></think> tags to plan. ' +
          'Call tools using:\n' +
          '<tool_call>\n' +
          '{"name": "tool_name", "arguments": {"param": "value"}}\n' +
          '</tool_call>\n' +
          'Output ONLY tool calls or direct results.' +
          '</step_instructions>';
    }
    return '';
  }