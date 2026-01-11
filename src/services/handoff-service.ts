import * as vscode from 'vscode';
import type { SpecialistDefinition, SpecialistRegistry } from '../types/index.js';

/**
 * Specialist handoff suggestion
 */
export interface HandoffSuggestion {
  fromSpecialist: string;
  toSpecialist: string;
  reason: string;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Keywords/patterns that suggest a specialist handoff
 */
const HANDOFF_TRIGGERS: Record<string, { keywords: string[]; patterns: RegExp[] }> = {
  'dean-debug': {
    keywords: ['debug', 'debugger', 'breakpoint', 'trace', 'step through', 'inspect'],
    patterns: [/why (is|does|doesn't|isn't)/i, /not working/i, /error|exception/i],
  },
  'eva-errors': {
    keywords: ['error', 'exception', 'errorinfo', 'try catch', 'error handling'],
    patterns: [/handle.*(error|exception)/i, /Error\s*\(/i],
  },
  'quinn-tester': {
    keywords: ['test', 'testing', 'unit test', 'test coverage', 'testmethod'],
    patterns: [/\[Test\]/i, /how (to|do I) test/i],
  },
  'roger-reviewer': {
    keywords: ['review', 'code review', 'feedback', 'best practice', 'improve'],
    patterns: [/review (this|my|the)/i, /what do you think/i],
  },
  'seth-security': {
    keywords: ['security', 'permission', 'authorization', 'authentication', 'entitlement'],
    patterns: [/permission|security|RIMD|TableData/i],
  },
  'alex-architect': {
    keywords: ['architecture', 'design', 'structure', 'pattern', 'refactor'],
    patterns: [/how should I (structure|design|organize)/i, /best (way|approach)/i],
  },
  'jordan-bridge': {
    keywords: ['integration', 'api', 'event', 'subscriber', 'webhook', 'external'],
    patterns: [/EventSubscriber|OnBefore|OnAfter/i, /integrate with/i],
  },
  'logan-legacy': {
    keywords: ['upgrade', 'migration', 'legacy', 'nav', 'c/al', 'obsolete'],
    patterns: [/upgrade (from|to)/i, /migrate|migration/i],
  },
  'uma-ux': {
    keywords: ['ui', 'ux', 'user experience', 'page', 'layout', 'action'],
    patterns: [/user (experience|interface)/i, /look(s)? (good|better|nice)/i],
  },
  'morgan-market': {
    keywords: ['appsource', 'marketplace', 'publish', 'certification', 'isv'],
    patterns: [/appsource|publish|marketplace/i, /submit (to|for)/i],
  },
  'maya-mentor': {
    keywords: ['learn', 'explain', 'understand', 'beginner', 'new to'],
    patterns: [/explain (to me|how|what|why)/i, /I('m| am) (new|learning)/i],
  },
  'taylor-docs': {
    keywords: ['document', 'documentation', 'comment', 'readme', 'help text'],
    patterns: [/document(ation)?|xmlcomment/i, /write.*doc/i],
  },
  'casey-copilot': {
    keywords: ['copilot', 'ai', 'generate', 'prompt', 'llm'],
    patterns: [/copilot|AI (generate|assist)/i],
  },
  'parker-pragmatic': {
    keywords: ['trust', 'verify', 'skeptical', 'double check', 'correct'],
    patterns: [/is this (correct|right|accurate)/i, /should I trust/i],
  },
  'chris-config': {
    keywords: ['config', 'configure', 'settings', 'layer', 'mcp'],
    patterns: [/configure|configuration|settings/i, /layer.*setup/i],
  },
};

/**
 * Service for suggesting specialist handoffs based on conversation context
 */
export class HandoffService {
  constructor(private specialists: SpecialistRegistry) {}

  /**
   * Analyze a message and suggest potential specialist handoffs
   */
  suggestHandoffs(
    currentSpecialistId: string,
    userMessage: string
  ): HandoffSuggestion[] {
    const suggestions: HandoffSuggestion[] = [];
    const currentSpecialist = this.specialists.get(currentSpecialistId);

    if (!currentSpecialist) {
      return suggestions;
    }

    // Check each specialist for potential handoff
    for (const [specialistId, triggers] of Object.entries(HANDOFF_TRIGGERS)) {
      // Skip if same specialist or not in natural handoffs
      if (specialistId === currentSpecialistId) {
        continue;
      }

      const score = this.calculateHandoffScore(userMessage, triggers);

      if (score > 0) {
        const targetSpecialist = this.specialists.get(specialistId);
        if (!targetSpecialist) continue;

        // Check if this is a natural handoff from current specialist
        const isNaturalHandoff = currentSpecialist.collaboration.natural_handoffs.includes(specialistId);

        suggestions.push({
          fromSpecialist: currentSpecialistId,
          toSpecialist: specialistId,
          reason: this.generateHandoffReason(targetSpecialist, triggers, userMessage),
          confidence: this.scoreToConfidence(score, isNaturalHandoff),
        });
      }
    }

    // Sort by confidence (high > medium > low)
    const confidenceOrder = { high: 0, medium: 1, low: 2 };
    suggestions.sort((a, b) => confidenceOrder[a.confidence] - confidenceOrder[b.confidence]);

    // Return top 2 suggestions
    return suggestions.slice(0, 2);
  }

  /**
   * Calculate how strongly a message matches handoff triggers
   */
  private calculateHandoffScore(
    message: string,
    triggers: { keywords: string[]; patterns: RegExp[] }
  ): number {
    let score = 0;
    const lowerMessage = message.toLowerCase();

    // Check keywords
    for (const keyword of triggers.keywords) {
      if (lowerMessage.includes(keyword.toLowerCase())) {
        score += 1;
      }
    }

    // Check patterns (weighted higher)
    for (const pattern of triggers.patterns) {
      if (pattern.test(message)) {
        score += 2;
      }
    }

    return score;
  }

  /**
   * Convert score to confidence level
   */
  private scoreToConfidence(score: number, isNaturalHandoff: boolean): 'high' | 'medium' | 'low' {
    // Boost score if it's a natural handoff
    const adjustedScore = isNaturalHandoff ? score + 1 : score;

    if (adjustedScore >= 4) return 'high';
    if (adjustedScore >= 2) return 'medium';
    return 'low';
  }

  /**
   * Generate a human-readable reason for the handoff suggestion
   */
  private generateHandoffReason(
    targetSpecialist: SpecialistDefinition,
    triggers: { keywords: string[]; patterns: RegExp[] },
    userMessage: string
  ): string {
    // Find which keywords/patterns matched
    const matchedKeywords: string[] = [];
    const lowerMessage = userMessage.toLowerCase();

    for (const keyword of triggers.keywords) {
      if (lowerMessage.includes(keyword.toLowerCase())) {
        matchedKeywords.push(keyword);
      }
    }

    if (matchedKeywords.length > 0) {
      const keywordList = matchedKeywords.slice(0, 2).join(' and ');
      return `Your question about ${keywordList} aligns with ${targetSpecialist.title.split(' - ')[0]}'s expertise in ${targetSpecialist.expertise.primary[0]}.`;
    }

    return `${targetSpecialist.title.split(' - ')[0]} specializes in ${targetSpecialist.role}.`;
  }

  /**
   * Format handoff suggestions as a markdown string for display
   */
  formatSuggestionsAsMarkdown(suggestions: HandoffSuggestion[]): string {
    if (suggestions.length === 0) {
      return '';
    }

    const lines = ['\n---\n', '💡 **Specialist suggestions:**\n'];

    for (const suggestion of suggestions) {
      const specialist = this.specialists.get(suggestion.toSpecialist);
      if (specialist) {
        const confidenceEmoji = suggestion.confidence === 'high' ? '🎯' : suggestion.confidence === 'medium' ? '👍' : '💭';
        lines.push(`${confidenceEmoji} **${specialist.emoji} ${specialist.title.split(' - ')[0]}**: ${suggestion.reason}`);
      }
    }

    return lines.join('\n');
  }
}
