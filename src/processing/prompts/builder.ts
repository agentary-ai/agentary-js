import { type WorkflowStep } from '../../types/api';
import { getStepConfig } from '../../workflow/step-configs';
import { PROMPT_TEMPLATES } from './templates';

export class PromptBuilder {
  buildSystemPrompt(step: WorkflowStep, context: Record<string, any>): string {
    const config = getStepConfig(step.type);
    const template = PROMPT_TEMPLATES[config.promptTemplate];
    
    let systemPrompt = template.buildSystemPrompt(step.id, step.type, step.description, context);
    
    // Add step-specific behavior instructions
    systemPrompt += config.systemPromptSuffix;

    return systemPrompt;
  }

  buildUserPrompt(step: WorkflowStep, context: Record<string, any>): string {
    const config = getStepConfig(step.type);
    const template = PROMPT_TEMPLATES[config.promptTemplate];
    
    return template.buildUserPrompt(step.id, step.description, context);
  }
}

