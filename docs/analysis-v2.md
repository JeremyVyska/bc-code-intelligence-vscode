# Analysis V2: Knowledge-Driven Code Analysis

## Overview

This document describes the architectural changes required to transform `analyze_al_code` from a regex-based pattern matcher to a knowledge-driven relevance system.

### Core Principle

**Knowledge files drive detection, not the other way around.**

Instead of hardcoded regex patterns with knowledge files as documentation, the system will:
1. Index all knowledge files at startup using BM25 text search
2. Extract code characteristics from AL code being analyzed
3. Match code characteristics against knowledge file signals
4. Return relevant knowledge topics ranked by relevance score
5. Let agents review high-scoring matches for deeper semantic analysis

### Two-Phase Analysis Pattern

This design follows the existing workflow v2 architecture:

- **Phase 1 (Node/Fast)**: `RelevanceIndexService` identifies candidate knowledge topics
- **Phase 2 (Agent/Deep)**: Agent reviews code + relevant knowledge to determine actual issues

---

## Dependencies

### New Packages

Add to `bc-code-intelligence-mcp/package.json`:

```json
{
  "dependencies": {
    "wink-bm25-text-search": "^3.0.0",
    "wink-nlp": "^2.0.0",
    "wink-eng-lite-web-model": "^1.0.0"
  }
}
```

**Alternative**: The existing `fuse.js` dependency could be used for a simpler implementation, but BM25 provides better document retrieval characteristics (term frequency saturation, document length normalization).

---

## File Changes

### 1. Schema Update: `src/types/bc-knowledge.ts`

Extend `AtomicTopicFrontmatterSchema` with new optional fields for relevance detection.

```typescript
// Add these fields to the existing Zod schema

// Relevance detection signals - how to identify when this knowledge applies
relevance_signals: z.object({
  // AL language constructs that indicate this topic may be relevant
  constructs: z.array(z.string()).optional(),

  // General keywords to match against code or context
  keywords: z.array(z.string()).optional(),

  // Phrases indicating an anti-pattern is present
  anti_pattern_indicators: z.array(z.string()).optional(),

  // Phrases indicating a good pattern is present
  positive_pattern_indicators: z.array(z.string()).optional(),
}).optional(),

// Which AL object types this knowledge applies to
applicable_object_types: z.array(z.string()).optional(),

// Minimum relevance score (0.0-1.0) to surface this topic
relevance_threshold: z.number().min(0).max(1).optional(),
```

**Backward Compatibility**: All new fields are optional. Existing knowledge files without these fields will continue to work - they simply won't participate in relevance-based detection and will fall back to legacy behavior.

---

### 2. New Service: `src/services/relevance-index-service.ts`

Create a new service that indexes knowledge files for fast relevance matching.

```typescript
/**
 * RelevanceIndexService
 *
 * Indexes all knowledge topics at startup using BM25 for fast relevance matching.
 * Replaces regex-based pattern detection with knowledge-driven discovery.
 *
 * ## Design Principles
 *
 * 1. **Knowledge-First**: Detection signals come from knowledge files, not hardcoded patterns
 * 2. **Fast First-Pass**: BM25 provides sub-millisecond relevance scoring
 * 3. **Backward Compatible**: Topics without relevance_signals are indexed by title/tags/content
 * 4. **Layer-Aware**: Respects layer priority (project > team > company > embedded)
 */

import BM25 from 'wink-bm25-text-search';
import winkNLP from 'wink-nlp';
import model from 'wink-eng-lite-web-model';

export interface CodeCharacteristics {
  /** Detected AL constructs (FindSet, repeat, CalcFields, etc.) */
  constructs: string[];

  /** AL object type if detectable (codeunit, page, table, etc.) */
  objectType: string | null;

  /** Semantic flags for quick filtering */
  hasLoops: boolean;
  hasFieldAccess: boolean;
  hasRecordOperations: boolean;
  hasValidation: boolean;
  hasErrorHandling: boolean;
  hasSecurityCalls: boolean;

  /** Raw tokens for BM25 matching */
  tokens: string[];
}

export interface RelevanceMatch {
  topicId: string;
  title: string;
  relevanceScore: number;        // 0.0 - 1.0 normalized
  matchedSignals: string[];      // Which constructs/keywords matched
  domain: string;
  category?: string;
  severity?: string;
  patternType?: 'good' | 'bad' | 'unknown';
  applicableObjectTypes?: string[];
}

export interface FindRelevantTopicsOptions {
  /** Maximum topics to return (default: 10) */
  limit?: number;

  /** Minimum relevance score threshold (default: 0.3) */
  minScore?: number;

  /** Filter by AL object type */
  objectType?: string;

  /** Filter by category (performance, security, etc.) */
  category?: string;

  /** Include topics without relevance_signals (legacy mode) */
  includeLegacyTopics?: boolean;
}

export class RelevanceIndexService {
  private engine: BM25;
  private nlp: ReturnType<typeof winkNLP>;
  private initialized: boolean = false;
  private topicMetadata: Map<string, TopicMetadata> = new Map();

  // AL construct detection patterns (simple, fast regex)
  private readonly constructPatterns: Array<{ name: string; pattern: RegExp }> = [
    { name: 'FindSet', pattern: /\.FindSet\s*\(/gi },
    { name: 'FindFirst', pattern: /\.FindFirst\s*\(/gi },
    { name: 'FindLast', pattern: /\.FindLast\s*\(/gi },
    { name: 'Next', pattern: /\.Next\s*\(/gi },
    { name: 'repeat', pattern: /\brepeat\b/gi },
    { name: 'until', pattern: /\buntil\b/gi },
    { name: 'SetLoadFields', pattern: /\.SetLoadFields\s*\(/gi },
    { name: 'SetRange', pattern: /\.SetRange\s*\(/gi },
    { name: 'SetFilter', pattern: /\.SetFilter\s*\(/gi },
    { name: 'CalcFields', pattern: /\.CalcFields\s*\(/gi },
    { name: 'CalcSums', pattern: /\.CalcSums\s*\(/gi },
    { name: 'Insert', pattern: /\.Insert\s*\(/gi },
    { name: 'Modify', pattern: /\.Modify\s*\(/gi },
    { name: 'Delete', pattern: /\.Delete\s*\(/gi },
    { name: 'DeleteAll', pattern: /\.DeleteAll\s*\(/gi },
    { name: 'ModifyAll', pattern: /\.ModifyAll\s*\(/gi },
    { name: 'TestField', pattern: /\.TestField\s*\(/gi },
    { name: 'FieldError', pattern: /\.FieldError\s*\(/gi },
    { name: 'Validate', pattern: /\.Validate\s*\(/gi },
    { name: 'Error', pattern: /\bError\s*\(/gi },
    { name: 'Confirm', pattern: /\bConfirm\s*\(/gi },
    { name: 'Message', pattern: /\bMessage\s*\(/gi },
    { name: 'Dialog', pattern: /\bDialog\./gi },
    { name: 'HttpClient', pattern: /\bHttpClient\b/gi },
    { name: 'JsonToken', pattern: /\bJsonToken\b/gi },
    { name: 'EventSubscriber', pattern: /\[EventSubscriber\b/gi },
    { name: 'IntegrationEvent', pattern: /\[IntegrationEvent\b/gi },
    { name: 'Codeunit.Run', pattern: /Codeunit\.Run\s*\(/gi },
  ];

  // Object type detection
  private readonly objectTypePattern = /^\s*(codeunit|page|table|report|query|xmlport|enum|interface|permissionset|profile)\s+\d+/im;

  constructor(private layerService: MultiContentLayerService) {
    this.nlp = winkNLP(model);
  }

  /**
   * Initialize the relevance index by loading all knowledge topics
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log('🔍 RelevanceIndexService: Building knowledge index...');
    const startTime = Date.now();

    // Initialize BM25 engine
    this.engine = new BM25();

    // Configure BM25 with NLP pipeline
    this.engine.defineConfig({
      fldWeights: {
        title: 2,
        constructs: 3,      // High weight for construct matches
        keywords: 2,
        tags: 1.5,
        content: 1
      },
      bm25Params: { k1: 1.2, b: 0.75 }
    });

    // Define text preparation pipeline
    this.engine.definePrepTasks([
      this.nlp.readDoc.bind(this.nlp),
      (doc: any) => doc.tokens().out(),
    ]);

    // Load all topics from all layers
    const allTopicIds = this.layerService.getAllTopicIds();
    let indexedCount = 0;
    let legacyCount = 0;

    for (const topicId of allTopicIds) {
      const resolution = await this.layerService.resolveTopic(topicId);
      if (!resolution?.topic) continue;

      const topic = resolution.topic;
      const fm = topic.frontmatter;

      // Build document for indexing
      const doc: Record<string, string> = {
        title: topic.title || '',
        tags: (fm.tags || []).join(' '),
        content: this.extractContentSummary(topic.content, 500),
      };

      // Add relevance signals if present (v2 topics)
      if (fm.relevance_signals) {
        doc.constructs = [
          ...(fm.relevance_signals.constructs || []),
          ...(fm.relevance_signals.keywords || []),
        ].join(' ');

        doc.indicators = [
          ...(fm.relevance_signals.anti_pattern_indicators || []),
          ...(fm.relevance_signals.positive_pattern_indicators || []),
        ].join(' ');
      } else {
        legacyCount++;
      }

      // Add to BM25 index
      this.engine.addDoc(doc, topicId);

      // Store metadata for result enrichment
      this.topicMetadata.set(topicId, {
        title: topic.title,
        domain: this.getPrimaryDomain(fm.domain),
        category: fm.category,
        severity: fm.severity,
        patternType: fm.pattern_type,
        applicableObjectTypes: fm.applicable_object_types,
        relevanceThreshold: fm.relevance_threshold,
        hasRelevanceSignals: !!fm.relevance_signals,
        relevanceSignals: fm.relevance_signals,
      });

      indexedCount++;
    }

    // Consolidate the index for searching
    this.engine.consolidate();

    this.initialized = true;
    console.log(`🔍 RelevanceIndexService: Indexed ${indexedCount} topics (${legacyCount} legacy) in ${Date.now() - startTime}ms`);
  }

  /**
   * Extract code characteristics for relevance matching
   */
  extractCodeCharacteristics(code: string): CodeCharacteristics {
    const constructs: string[] = [];

    // Detect AL constructs
    for (const { name, pattern } of this.constructPatterns) {
      pattern.lastIndex = 0;
      if (pattern.test(code)) {
        constructs.push(name);
      }
    }

    // Detect object type
    const objectTypeMatch = code.match(this.objectTypePattern);
    const objectType = objectTypeMatch ? objectTypeMatch[1].toLowerCase() : null;

    // Semantic flags
    const hasLoops = /\brepeat\b[\s\S]*?\buntil\b/i.test(code) ||
                     /\bwhile\b[\s\S]*?\bdo\b/i.test(code) ||
                     /\bfor\b[\s\S]*?\bto\b/i.test(code);

    const hasFieldAccess = /\.\s*"[^"]+"/g.test(code);
    const hasRecordOperations = constructs.some(c =>
      ['FindSet', 'FindFirst', 'FindLast', 'Insert', 'Modify', 'Delete'].includes(c)
    );
    const hasValidation = constructs.some(c =>
      ['TestField', 'FieldError', 'Validate'].includes(c)
    );
    const hasErrorHandling = constructs.some(c =>
      ['Error', 'Codeunit.Run'].includes(c)
    ) || /\bif\s+not\b/i.test(code);
    const hasSecurityCalls = /User\.|Permission|Security/i.test(code);

    // Tokenize for BM25
    const tokens = this.nlp.readDoc(code).tokens().out();

    return {
      constructs,
      objectType,
      hasLoops,
      hasFieldAccess,
      hasRecordOperations,
      hasValidation,
      hasErrorHandling,
      hasSecurityCalls,
      tokens,
    };
  }

  /**
   * Find relevant knowledge topics for the given code
   */
  async findRelevantTopics(
    code: string,
    options: FindRelevantTopicsOptions = {}
  ): Promise<RelevanceMatch[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    const {
      limit = 10,
      minScore = 0.3,
      objectType,
      category,
      includeLegacyTopics = true,
    } = options;

    // Extract characteristics from code
    const characteristics = this.extractCodeCharacteristics(code);

    // Build search query from characteristics
    const queryParts = [
      ...characteristics.constructs,
      characteristics.objectType || '',
    ].filter(Boolean);

    if (queryParts.length === 0) {
      // No detectable constructs - use content-based search
      queryParts.push(...characteristics.tokens.slice(0, 50));
    }

    const query = queryParts.join(' ');

    // Search BM25 index
    const searchResults = this.engine.search(query, limit * 2); // Get extra for filtering

    // Process and filter results
    const matches: RelevanceMatch[] = [];

    for (const result of searchResults) {
      const topicId = result[0] as string;
      const rawScore = result[1] as number;
      const metadata = this.topicMetadata.get(topicId);

      if (!metadata) continue;

      // Skip legacy topics if not included
      if (!includeLegacyTopics && !metadata.hasRelevanceSignals) continue;

      // Filter by object type if specified
      if (objectType && metadata.applicableObjectTypes) {
        if (!metadata.applicableObjectTypes.includes(objectType)) continue;
      }

      // Filter by category if specified
      if (category && metadata.category !== category) continue;

      // Normalize score to 0-1 range
      const normalizedScore = this.normalizeScore(rawScore, searchResults);

      // Apply topic-specific threshold
      const threshold = metadata.relevanceThreshold ?? minScore;
      if (normalizedScore < threshold) continue;

      // Determine which signals matched
      const matchedSignals = this.identifyMatchedSignals(
        characteristics,
        metadata.relevanceSignals
      );

      matches.push({
        topicId,
        title: metadata.title,
        relevanceScore: normalizedScore,
        matchedSignals,
        domain: metadata.domain,
        category: metadata.category,
        severity: metadata.severity,
        patternType: metadata.patternType,
        applicableObjectTypes: metadata.applicableObjectTypes,
      });
    }

    // Sort by relevance and limit
    return matches
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, limit);
  }

  /**
   * Rebuild the index (call when layers are reloaded)
   */
  async rebuildIndex(): Promise<void> {
    this.initialized = false;
    this.topicMetadata.clear();
    await this.initialize();
  }

  // --- Private Helpers ---

  private extractContentSummary(content: string, maxLength: number): string {
    // Remove markdown formatting, get first N chars
    return content
      .replace(/^#+\s+/gm, '')
      .replace(/\*\*/g, '')
      .replace(/`/g, '')
      .substring(0, maxLength);
  }

  private getPrimaryDomain(domain: string | string[] | undefined): string {
    if (!domain) return 'unknown';
    return Array.isArray(domain) ? domain[0] : domain;
  }

  private normalizeScore(score: number, allResults: any[]): number {
    if (allResults.length === 0) return 0;
    const maxScore = allResults[0][1] as number;
    if (maxScore === 0) return 0;
    return Math.min(1, score / maxScore);
  }

  private identifyMatchedSignals(
    characteristics: CodeCharacteristics,
    signals?: RelevanceSignals
  ): string[] {
    if (!signals) return characteristics.constructs.slice(0, 5);

    const matched: string[] = [];

    // Check construct matches
    if (signals.constructs) {
      for (const construct of signals.constructs) {
        if (characteristics.constructs.some(c =>
          c.toLowerCase() === construct.toLowerCase()
        )) {
          matched.push(construct);
        }
      }
    }

    return matched;
  }
}

interface TopicMetadata {
  title: string;
  domain: string;
  category?: string;
  severity?: string;
  patternType?: 'good' | 'bad' | 'unknown';
  applicableObjectTypes?: string[];
  relevanceThreshold?: number;
  hasRelevanceSignals: boolean;
  relevanceSignals?: RelevanceSignals;
}

interface RelevanceSignals {
  constructs?: string[];
  keywords?: string[];
  anti_pattern_indicators?: string[];
  positive_pattern_indicators?: string[];
}
```

---

### 3. Update: `src/services/code-analysis-service.ts`

Modify the existing service to use `RelevanceIndexService` while maintaining backward compatibility.

#### A. Constructor Changes

```typescript
export class CodeAnalysisService {
  private patternCache: ALCodePattern[] | null = null;
  private cacheExpiry: number = 0;
  private readonly CACHE_TTL = 5 * 60 * 1000;

  // NEW: Relevance-based detection
  private relevanceIndexService: RelevanceIndexService | null = null;
  private useRelevanceBasedDetection: boolean = true;

  constructor(
    private knowledgeService: KnowledgeService,
    relevanceIndexService?: RelevanceIndexService  // Optional for backward compatibility
  ) {
    this.relevanceIndexService = relevanceIndexService || null;
    this.useRelevanceBasedDetection = !!relevanceIndexService;
  }

  /**
   * Enable or disable relevance-based detection
   * When disabled, falls back to legacy regex patterns
   */
  setUseRelevanceBasedDetection(enabled: boolean): void {
    this.useRelevanceBasedDetection = enabled && !!this.relevanceIndexService;
  }
```

#### B. Update `detectPatterns()` Method

Replace the existing implementation with a hybrid approach:

```typescript
/**
 * Detect AL patterns in code
 *
 * V2 Behavior (with RelevanceIndexService):
 *   Uses knowledge-driven relevance matching
 *
 * Legacy Behavior (without RelevanceIndexService):
 *   Falls back to regex-based pattern matching
 */
private async detectPatterns(code: string): Promise<ALCodePattern[]> {
  // V2: Use relevance-based detection if available
  if (this.useRelevanceBasedDetection && this.relevanceIndexService) {
    return this.detectPatternsV2(code);
  }

  // Legacy: Fall back to regex-based detection
  return this.detectPatternsLegacy(code);
}

/**
 * V2: Knowledge-driven pattern detection
 */
private async detectPatternsV2(code: string): Promise<ALCodePattern[]> {
  const relevantTopics = await this.relevanceIndexService!.findRelevantTopics(code, {
    limit: 20,
    minScore: 0.3,
    includeLegacyTopics: true,  // Include topics without relevance_signals
  });

  console.log(`🔍 detectPatternsV2: Found ${relevantTopics.length} relevant topics`);

  const patterns: ALCodePattern[] = [];

  for (const match of relevantTopics) {
    const topic = await this.knowledgeService.getTopic(match.topicId);
    if (!topic) continue;

    const fm = topic.frontmatter;

    patterns.push({
      name: match.topicId,
      pattern_type: (fm.pattern_type as 'good' | 'bad' | 'unknown') || 'unknown',
      regex_patterns: [],  // Not used in V2 detection
      description: fm.description || topic.title,
      related_topics: fm.related_topics || [],
      severity: fm.severity,
      category: fm.category,
      impact_level: fm.impact_level,
      detection_confidence: this.scoreToConfidence(match.relevanceScore),
    });
  }

  // If no V2 results, fall back to legacy patterns
  if (patterns.length === 0) {
    console.log('🔍 detectPatternsV2: No matches, falling back to legacy');
    return this.detectPatternsLegacy(code);
  }

  return patterns;
}

/**
 * Legacy: Regex-based pattern detection (existing implementation)
 * Preserved for backward compatibility
 */
private async detectPatternsLegacy(code: string): Promise<ALCodePattern[]> {
  const detected: ALCodePattern[] = [];
  const patterns = await this.loadPatterns();

  for (const pattern of patterns) {
    if (pattern.regex_patterns.length === 0) continue;

    for (const regex of pattern.regex_patterns) {
      regex.lastIndex = 0;
      if (regex.test(code)) {
        detected.push(pattern);
        break;
      }
    }
  }

  return detected;
}

/**
 * Convert relevance score (0-1) to confidence level
 */
private scoreToConfidence(score: number): 'low' | 'medium' | 'high' {
  if (score >= 0.7) return 'high';
  if (score >= 0.5) return 'medium';
  return 'low';
}
```

#### C. Update `suggestTopics()` Method

```typescript
/**
 * Suggest relevant topics based on code analysis
 */
private async suggestTopics(
  code: string,
  detectedPatterns: ALCodePattern[],
  bcVersion?: string
): Promise<TopicSearchResult[]> {

  // V2: Use relevance index if available
  if (this.useRelevanceBasedDetection && this.relevanceIndexService) {
    const relevantTopics = await this.relevanceIndexService.findRelevantTopics(code, {
      limit: 10,
      minScore: 0.5,
    });

    const results: TopicSearchResult[] = [];

    for (const match of relevantTopics) {
      const topic = await this.knowledgeService.getTopic(match.topicId);
      if (!topic) continue;

      const fm = topic.frontmatter;
      const domains = Array.isArray(fm.domain) ? fm.domain : [fm.domain || 'unknown'];

      results.push({
        id: match.topicId,
        title: topic.title,
        domain: domains[0],
        domains: domains.length > 1 ? domains : undefined,
        difficulty: fm.difficulty,
        relevance_score: match.relevanceScore,
        summary: topic.content.substring(0, 200) + '...',
        tags: fm.tags || [],
        prerequisites: fm.prerequisites || [],
        estimated_time: fm.estimated_time,
      });
    }

    return results;
  }

  // Legacy: Use existing implementation
  // ... (keep existing code)
}
```

---

### 4. Update: `src/tools/analyze_al_code/handler.ts`

Enhance the output to include relevance metadata.

```typescript
// In the multi-file analysis section, enhance the summary output:

const summary = {
  files_analyzed: filesToAnalyze.length,
  file_results: allResults,
  total_issues: aggregatedIssues.length,
  issues_by_severity: {
    critical: aggregatedIssues.filter((i: any) => i.severity === 'critical').length,
    high: aggregatedIssues.filter((i: any) => i.severity === 'high').length,
    medium: aggregatedIssues.filter((i: any) => i.severity === 'medium').length,
    low: aggregatedIssues.filter((i: any) => i.severity === 'low').length
  },
  patterns_detected: Array.from(aggregatedPatterns),
  issues: aggregatedIssues.slice(0, 50),
  optimization_opportunities: aggregatedOpportunities.slice(0, 20),
  suggested_topics: Array.from(aggregatedTopics.values()).slice(0, 10),

  // NEW: Relevance-based knowledge matches
  relevant_knowledge: Array.from(aggregatedTopics.values()).slice(0, 10).map((topic: any) => ({
    topic_id: topic.id,
    title: topic.title,
    relevance_score: topic.relevance_score || 0.8,
    domain: topic.domain,
    category: topic.category,
    matched_signals: topic.matched_signals || [],
    recommendation: topic.severity === 'high' || topic.severity === 'critical'
      ? 'Review recommended'
      : 'Consider reviewing'
  })),

  // Existing workflow integration (unchanged)
  workflow_integration: {
    instruction: 'If running within a workflow session, pass suggested_topics to workflow_progress(expand_checklist=...) to add them to the current file\'s checklist.',
    expand_checklist_payload: Array.from(aggregatedTopics.values()).slice(0, 10).map((topic: any) => ({
      topic_id: topic.id,
      relevance_score: topic.relevance_score || 0.8,
      description: topic.title || topic.description
    }))
  }
};
```

---

### 5. Service Wiring: `src/index.ts` (or service factory)

Update service initialization to include `RelevanceIndexService`.

```typescript
import { RelevanceIndexService } from './services/relevance-index-service.js';

// ... existing initialization code ...

// Create layer service
const layerService = new MultiContentLayerService();
await layerService.initialize();

// NEW: Create relevance index service
const relevanceIndexService = new RelevanceIndexService(layerService);
await relevanceIndexService.initialize();

// Create knowledge service
const knowledgeService = new KnowledgeService(config, layerService);

// Update code analysis service with relevance index
const codeAnalysisService = new CodeAnalysisService(
  knowledgeService,
  relevanceIndexService  // NEW: Enable V2 detection
);

// ... rest of initialization ...
```

---

## Backward Compatibility

### Knowledge Files Without `relevance_signals`

Topics that don't have the new `relevance_signals` frontmatter will:

1. **Still be indexed**: Using title, tags, and content summary
2. **Still be searchable**: BM25 will match based on content
3. **Have lower precision**: Without explicit signals, matching is less targeted
4. **Work with legacy detection**: The `getFallbackPatterns()` regex list remains available

### Custom Company/Project Layers

Organizations with existing custom knowledge layers:

1. **No migration required**: Existing files continue to work
2. **Opt-in enhancement**: Add `relevance_signals` to improve detection
3. **Priority preserved**: Layer priority (project > company > embedded) still applies
4. **Gradual adoption**: Can add signals to high-value topics first

### Fallback Chain

```
1. Try V2 relevance-based detection
   └── If RelevanceIndexService is available AND has matches
       └── Return relevance-matched topics

2. Fall back to legacy regex detection
   └── If no V2 matches OR RelevanceIndexService unavailable
       └── Use getFallbackPatterns() regex matching

3. Final fallback
   └── If no patterns detected
       └── Return empty results (no false positives)
```

---

## Testing Strategy

### Unit Tests

1. **RelevanceIndexService**
   - Index building from mock topics
   - Code characteristic extraction
   - Relevance scoring accuracy
   - Object type filtering

2. **CodeAnalysisService**
   - V2 detection with relevance service
   - Legacy fallback without relevance service
   - Hybrid detection (V2 + legacy)

### Integration Tests

1. **Full pipeline**: Code → Analysis → Relevant Topics
2. **Layer priority**: Project overrides company overrides embedded
3. **Backward compatibility**: Legacy topics still work
4. **Workflow integration**: Topics flow to checklist expansion

---

## Performance Considerations

### Index Build Time

- **Target**: < 2 seconds for 500 topics
- **Mitigation**: Build index at startup, rebuild on layer changes only

### Query Time

- **Target**: < 10ms per file analyzed
- **BM25**: Sub-millisecond search on in-memory index
- **Bottleneck**: Topic resolution for result enrichment

### Memory Usage

- **BM25 Index**: ~1-5 MB for 500 topics (depending on content size)
- **Metadata Map**: ~100 KB for 500 topics
- **Mitigation**: Content summaries limited to 500 chars

---

## Migration Checklist

- [ ] Add new dependencies to package.json
- [ ] Update `AtomicTopicFrontmatterSchema` with new fields
- [ ] Create `RelevanceIndexService`
- [ ] Update `CodeAnalysisService` constructor
- [ ] Add `detectPatternsV2()` method
- [ ] Update `suggestTopics()` for V2
- [ ] Enhance `analyze_al_code` handler output
- [ ] Update service wiring in index.ts
- [ ] Add unit tests for new service
- [ ] Add integration tests for full pipeline
- [ ] Update high-value embedded knowledge with `relevance_signals`
