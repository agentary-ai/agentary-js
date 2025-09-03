export interface ProcessedContent {
  cleanContent: string;
  thinkingContent: string;
}

export class ContentProcessor {
  removeThinkTags(content: string): ProcessedContent {
    // Extract and remove <think></think> tags while preserving the thinking content separately
    const thinkRegex = /<think>([\s\S]*?)<\/think>/gi;
    const thinkMatches = content.match(thinkRegex);
    
    // Extract thinking content (without tags)
    const thinkingContent = thinkMatches 
      ? thinkMatches.map(match => match.replace(/<\/?think>/gi, '').trim()).join('\n\n')
      : '';
    
    // Remove <think></think> blocks from the main content
    const cleanContent = content.replace(thinkRegex, '').trim();
    
    return { cleanContent, thinkingContent };
  }
}

