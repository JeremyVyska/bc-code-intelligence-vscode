/**
 * Specialist definition parsed from YAML frontmatter in specialist markdown files
 */
export interface SpecialistDefinition {
  specialist_id: string;
  title: string;
  emoji: string;
  role: string;
  team: SpecialistTeam;

  persona: {
    personality: string[];
    communication_style: string;
    greeting: string;
  };

  expertise: {
    primary: string[];
    secondary: string[];
  };

  domains: string[];
  when_to_use: string[];

  collaboration: {
    natural_handoffs: string[];
    team_consultations: string[];
  };

  related_specialists: string[];

  /** The markdown body (everything after frontmatter) - used as system prompt */
  systemPrompt: string;
}

export type SpecialistTeam =
  | 'Development'
  | 'Quality & Testing'
  | 'Planning & Analysis'
  | 'Integration & Business';

/**
 * Map of specialist_id to SpecialistDefinition
 */
export type SpecialistRegistry = Map<string, SpecialistDefinition>;
