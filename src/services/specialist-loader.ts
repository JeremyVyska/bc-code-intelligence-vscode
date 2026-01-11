import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import type { SpecialistDefinition, SpecialistRegistry } from '../types/index.js';

/**
 * Parses a specialist markdown file with YAML frontmatter
 */
export function parseSpecialistFile(filePath: string): SpecialistDefinition {
  const content = fs.readFileSync(filePath, 'utf-8');

  // Split frontmatter from body
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    throw new Error(`Invalid frontmatter in ${filePath}`);
  }

  const frontmatter = yaml.parse(match[1]) as Omit<SpecialistDefinition, 'systemPrompt'>;
  const systemPrompt = match[2].trim();

  return {
    ...frontmatter,
    systemPrompt,
  };
}

/**
 * Loads all specialist definitions from a directory
 */
export function loadSpecialistsFromDirectory(specialistsDir: string, log?: (msg: string) => void): SpecialistRegistry {
  const registry: SpecialistRegistry = new Map();
  const logFn = log || console.log;

  logFn(`Looking for specialists in: ${specialistsDir}`);

  if (!fs.existsSync(specialistsDir)) {
    logFn(`ERROR: Specialists directory not found: ${specialistsDir}`);
    return registry;
  }

  const files = fs.readdirSync(specialistsDir).filter((f) => f.endsWith('.md'));
  logFn(`Found ${files.length} specialist files: ${files.join(', ')}`);

  for (const file of files) {
    try {
      const filePath = path.join(specialistsDir, file);
      const specialist = parseSpecialistFile(filePath);
      registry.set(specialist.specialist_id, specialist);
      logFn(`Loaded specialist: ${specialist.specialist_id}`);
    } catch (error) {
      logFn(`ERROR: Failed to parse specialist file ${file}: ${error}`);
    }
  }

  return registry;
}

/**
 * Gets the path to the embedded knowledge specialists directory
 */
export function getEmbeddedSpecialistsPath(extensionPath: string): string {
  return path.join(
    extensionPath,
    'bc-code-intelligence-mcp',
    'embedded-knowledge',
    'specialists'
  );
}

/**
 * Specialist loader service that manages loading and caching of specialists
 */
export class SpecialistLoaderService {
  private registry: SpecialistRegistry = new Map();
  private extensionPath: string;
  private logFn: (msg: string) => void;

  constructor(extensionPath: string, logFn?: (msg: string) => void) {
    this.extensionPath = extensionPath;
    this.logFn = logFn || console.log;
    this.logFn(`SpecialistLoaderService initialized with extension path: ${extensionPath}`);
  }

  /**
   * Load all specialists from embedded knowledge
   */
  load(): SpecialistRegistry {
    const specialistsPath = getEmbeddedSpecialistsPath(this.extensionPath);
    this.logFn(`Loading specialists from: ${specialistsPath}`);
    this.registry = loadSpecialistsFromDirectory(specialistsPath, this.logFn);
    this.logFn(`Total specialists loaded: ${this.registry.size}`);
    return this.registry;
  }

  /**
   * Get a specialist by ID
   */
  get(specialistId: string): SpecialistDefinition | undefined {
    return this.registry.get(specialistId);
  }

  /**
   * Get all specialists
   */
  getAll(): SpecialistDefinition[] {
    return Array.from(this.registry.values());
  }

  /**
   * Get specialists grouped by team
   */
  getByTeam(): Map<string, SpecialistDefinition[]> {
    const byTeam = new Map<string, SpecialistDefinition[]>();

    for (const specialist of this.registry.values()) {
      const team = specialist.team;
      if (!byTeam.has(team)) {
        byTeam.set(team, []);
      }
      byTeam.get(team)!.push(specialist);
    }

    return byTeam;
  }

  /**
   * Reload specialists (e.g., after layer changes)
   */
  reload(): SpecialistRegistry {
    this.registry.clear();
    return this.load();
  }
}
