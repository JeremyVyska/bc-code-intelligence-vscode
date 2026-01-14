import * as vscode from 'vscode';
import type { SpecialistLoaderService } from '../services/specialist-loader.js';

/**
 * CodeLens mapping entry from codelens-mappings.yaml or MCP
 */
export interface CodeLensMapping {
  pattern: string;
  specialist: string;
  label: string;
  specialistEmoji?: string;
}

/**
 * Default CodeLens mappings for AL files
 * Used as fallback when MCP is unavailable
 */
const DEFAULT_CODELENS_MAPPINGS: CodeLensMapping[] = [
  {
    pattern: '\\bError\\s*\\(',
    specialist: 'eva-errors',
    label: 'Ask Eva about ErrorInfo',
  },
  {
    pattern: '\\bMessage\\s*\\(',
    specialist: 'eva-errors',
    label: 'Review messaging with Eva',
  },
  {
    pattern: 'OnBefore|OnAfter|\\[EventSubscriber',
    specialist: 'jordan-bridge',
    label: 'Review with Jordan',
  },
  {
    pattern: 'TableData|RIMD|Permissions',
    specialist: 'seth-security',
    label: 'Security review with Seth',
  },
  {
    pattern: '\\[Test\\]',
    specialist: 'quinn-tester',
    label: 'Ask Quinn about testing',
  },
  {
    pattern: 'HttpClient|WebServiceActionContext',
    specialist: 'jordan-bridge',
    label: 'Integration review with Jordan',
  },
  {
    pattern: 'Assert\\.',
    specialist: 'quinn-tester',
    label: 'Test assertion review with Quinn',
  },
  {
    pattern: 'CALCFIELDS|CALCSUMS|SETAUTOCALCFIELDS',
    specialist: 'dean-debug',
    label: 'Performance review with Dean',
  },
  {
    pattern: 'FindSet|FindFirst|Get\\s*\\(',
    specialist: 'dean-debug',
    label: 'Query optimization with Dean',
  },
  {
    pattern: 'Obsolete|ObsoleteState',
    specialist: 'logan-legacy',
    label: 'Upgrade guidance with Logan',
  },
  {
    pattern: 'trigger\\s+On',
    specialist: 'sam-coder',
    label: 'Trigger implementation with Sam',
  },
  {
    pattern: 'procedure\\s+\\w+',
    specialist: 'roger-reviewer',
    label: 'Code review with Roger',
  },
];

/**
 * CodeLens provider for AL files with specialist suggestions
 */
export class BCCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  private mappings: CodeLensMapping[] = [];
  private compiledPatterns: Map<CodeLensMapping, RegExp> = new Map();

  constructor(private specialistLoader: SpecialistLoaderService) {
    // Start with defaults, then try MCP
    this.loadDefaultMappings();
    this.loadMappingsFromMcp();
  }

  /**
   * Load default CodeLens mappings (fallback)
   */
  private loadDefaultMappings(): void {
    this.mappings = [...DEFAULT_CODELENS_MAPPINGS];
    this.enrichAndCompileMappings();
  }

  /**
   * Load CodeLens mappings from MCP server
   * Falls back to defaults if MCP unavailable
   */
  private async loadMappingsFromMcp(): Promise<void> {
    try {
      const result = await vscode.lm.invokeTool(
        'bc-code-intelligence/get_codelens_mappings',
        { input: {}, toolInvocationToken: undefined },
        new vscode.CancellationTokenSource().token
      );

      // Parse the result
      if (result && result instanceof vscode.LanguageModelToolResult) {
        for (const part of result.content) {
          if (part instanceof vscode.LanguageModelTextPart) {
            const parsed = JSON.parse(part.value);
            if (parsed.mappings && Array.isArray(parsed.mappings)) {
              this.mappings = parsed.mappings.map((m: any) => ({
                pattern: m.pattern,
                specialist: m.specialist,
                label: m.label,
                specialistEmoji: m.specialistEmoji,
              }));
              this.enrichAndCompileMappings();
              this._onDidChangeCodeLenses.fire();
              console.log(`[CodeLens] Loaded ${this.mappings.length} mappings from MCP (${parsed.layer_count} layers)`);
              return;
            }
          }
        }
      }
    } catch (error) {
      // MCP not available or error - keep using defaults
      console.log('[CodeLens] MCP unavailable, using default mappings:', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Enrich mappings with emoji and compile regex patterns
   */
  private enrichAndCompileMappings(): void {
    // Add emoji from specialist definitions (if not already present)
    for (const mapping of this.mappings) {
      if (!mapping.specialistEmoji) {
        const specialist = this.specialistLoader.get(mapping.specialist);
        if (specialist) {
          mapping.specialistEmoji = specialist.emoji;
        }
      }
    }

    // Compile patterns
    this.compiledPatterns.clear();
    for (const mapping of this.mappings) {
      try {
        this.compiledPatterns.set(mapping, new RegExp(mapping.pattern, 'g'));
      } catch (error) {
        console.error(`Invalid CodeLens pattern: ${mapping.pattern}`, error);
      }
    }
  }

  /**
   * Refresh mappings (e.g., when layers change)
   */
  refresh(): void {
    // Try MCP first, will fall back to defaults
    this.loadDefaultMappings();
    this.loadMappingsFromMcp();
    this._onDidChangeCodeLenses.fire();
  }

  /**
   * Provide CodeLens for a document
   */
  provideCodeLenses(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): vscode.CodeLens[] {
    // Only process AL files
    if (document.languageId !== 'al') {
      return [];
    }

    // Check if CodeLens is enabled
    const config = vscode.workspace.getConfiguration('bcCodeIntelligence');
    if (!config.get<boolean>('codeLens.enabled', true)) {
      return [];
    }

    const maxPerFile = config.get<number>('codeLens.maxPerFile', 20);
    const lenses: vscode.CodeLens[] = [];
    const text = document.getText();

    // Track which lines already have a lens to avoid duplicates
    const lensLines = new Set<number>();

    for (const mapping of this.mappings) {
      const regex = this.compiledPatterns.get(mapping);
      if (!regex) continue;

      // Reset regex state
      regex.lastIndex = 0;

      let match;
      while ((match = regex.exec(text)) !== null) {
        const position = document.positionAt(match.index);
        const line = position.line;

        // Skip if already have a lens on this line
        if (lensLines.has(line)) {
          continue;
        }

        // Skip matches inside comments
        const lineText = document.lineAt(line).text;
        if (this.isInsideComment(lineText, position.character)) {
          continue;
        }

        // Create the range for this line
        const range = new vscode.Range(line, 0, line, 0);

        // Create CodeLens
        const emoji = mapping.specialistEmoji || '💡';
        lenses.push(
          new vscode.CodeLens(range, {
            title: `${emoji} ${mapping.label}`,
            command: 'bcCodeIntelligence.askSpecialistAboutCode',
            arguments: [document.uri, range, mapping.specialist],
          })
        );

        lensLines.add(line);

        // Respect maxPerFile limit
        if (maxPerFile > 0 && lenses.length >= maxPerFile) {
          return lenses;
        }
      }
    }

    return lenses;
  }

  /**
   * Check if a position is inside a comment
   */
  private isInsideComment(lineText: string, charIndex: number): boolean {
    // Check for single-line comment
    const singleLineComment = lineText.indexOf('//');
    if (singleLineComment !== -1 && charIndex > singleLineComment) {
      return true;
    }

    // Check if inside a block comment on this line (simplified check)
    const blockCommentStart = lineText.indexOf('/*');
    const blockCommentEnd = lineText.indexOf('*/');

    if (blockCommentStart !== -1 && charIndex > blockCommentStart) {
      // If block comment starts before and no end after, we're in comment
      if (blockCommentEnd === -1 || blockCommentEnd < charIndex) {
        return true;
      }
    }

    return false;
  }

  /**
   * Resolve CodeLens (not needed since we provide commands in provideCodeLenses)
   */
  resolveCodeLens(
    codeLens: vscode.CodeLens,
    _token: vscode.CancellationToken
  ): vscode.CodeLens {
    return codeLens;
  }
}

/**
 * Register the CodeLens provider
 */
export function registerCodeLensProvider(
  context: vscode.ExtensionContext,
  specialistLoader: SpecialistLoaderService
): vscode.Disposable {
  const provider = new BCCodeLensProvider(specialistLoader);

  // Register for AL files
  const registration = vscode.languages.registerCodeLensProvider(
    { language: 'al', scheme: 'file' },
    provider
  );

  // Listen for configuration changes
  const configListener = vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration('bcCodeIntelligence.codeLens')) {
      provider.refresh();
    }
  });

  return vscode.Disposable.from(registration, configListener);
}
