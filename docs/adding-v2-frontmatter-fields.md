# Adding V2 Frontmatter Fields to Existing Company Layers

## Overview

Two new frontmatter field groups enhance code analysis in company/project layers:

- **`detection`** - Regex-based pattern scanning for company standards enforcement
- **`relevance_signals`** - Semantic matching to surface relevant knowledge

Both are **optional** and work together during `analyze_al_code`:

1. **Detection phase** (runs first) - Regex patterns populate `company_standards_violations`
2. **Relevance phase** (runs second) - Semantic matching populates `suggested_topics`

## detection Field

### Purpose
Enforce company-specific coding standards with exact regex pattern matching.

### Structure
```yaml
detection:
  enabled: true                           # Required: enable pattern scanning
  pattern: "(Caption\\s*=.*(?!Comment))"  # Required: JavaScript regex
  check_type: "warning"                   # Optional: error|warning|info (default: warning)
```

### Usage in Code
- Defined in [code-analysis-service.ts](../bc-code-intelligence-mcp/src/services/code-analysis-service.ts#L906)
- Checks: `if (detection && detection.enabled && detection.pattern)`
- Used to create regex: `new RegExp(detection.pattern, "gi")`
- Results sorted by layer priority (project=100, team=50, company=25, embedded=0)

### YAML Escaping (Critical!)

**❌ Wrong - Will Fail**
```yaml
detection:
  pattern: '(Error)\([\'"]'  # YAML parser error with escaped quotes in single quotes
```

**✅ Right - Double Backslashes**
```yaml
detection:
  pattern: "(Caption\\s*=\\s*['\"][^'\"]+['\"])"
```

**✅ Best - Literal Block Style**
```yaml
detection:
  pattern: |
    (Caption\s*=\s*['"][^'"]+['"])
```

### Example
```yaml
---
title: "Danish Caption Comments Required"
domain: "company-standards"

detection:
  enabled: true
  pattern: |
    Caption\s*=.*(?!Comment)
  check_type: "warning"
---
```

## relevance_signals Field

### Purpose
Describe code characteristics that indicate when this topic is relevant (semantic matching).

### Structure
```yaml
relevance_signals:
  constructs: [FindSet, repeat, until]           # AL language constructs
  keywords: [loop, iteration, performance]       # Domain/technical terms
  properties: [Caption, Comment]                 # AL properties/fields
  anti_pattern_indicators: [field access without SetLoadFields]     # For bad patterns
  positive_pattern_indicators: [SetLoadFields before FindSet]       # For good patterns
```

### Usage in Code
- Defined in [bc-knowledge.ts](../bc-code-intelligence-mcp/src/types/bc-knowledge.ts#L134) using Zod schema
- Indexed by [relevance-index-service.ts](../bc-code-intelligence-mcp/src/services/relevance-index-service.ts#L178-L186)
- Fields are joined into searchable strings:
  - `constructs` → space-separated string
  - `keywords` → space-separated string (includes indicators)
  - `properties` → treated as keywords
- Topics without `relevance_signals` still work (backward compatible)

### Example
```yaml
---
title: "Performance - Field Access in Loops"
domain: "performance"

relevance_signals:
  constructs: [FindSet, repeat, until, Next]
  keywords: [loop, iteration, field access, performance]
  properties: [Caption, Comment]
  anti_pattern_indicators:
    - "field access in loop without SetLoadFields"
    - "multiple field reads in iteration"
  positive_pattern_indicators:
    - "SetLoadFields before FindSet"
---
```

## Additional V2 Fields

These complement `detection` and `relevance_signals`:

```yaml
applicable_object_types: [codeunit, page, table]  # Filter by AL object type
relevance_threshold: 0.6                          # Min score 0.0-1.0 (default: 0.3)
```

## Migration Checklist for Existing Layers

1. **Identify enforcement topics** that need exact pattern matching → add `detection`
2. **Identify guidance topics** that benefit from semantic matching → add `relevance_signals`  
3. **Test regex patterns** before committing (PowerShell: `$code -match $pattern`)
4. **Validate frontmatter** using the validator:
   ```powershell
   ./bc-code-intelligence-mcp/embedded-knowledge/scripts/frontmatter_validator.ps1 -Path "your-layer-path"
   ```
5. **Set appropriate thresholds**:
   - 0.3-0.4: Informational topics
   - 0.5-0.6: Standard patterns
   - 0.7-0.8: Critical issues
   - 0.9+: Very high confidence only

## Key Differences

| Feature | `detection` | `relevance_signals` |
|---------|------------|-------------------|
| **Matching** | Exact regex | Semantic/keyword |
| **Use Case** | Standards enforcement | Knowledge surfacing |
| **Results Section** | `company_standards_violations` | `suggested_topics` |
| **Required Fields** | `enabled`, `pattern` | None (all optional) |
| **Runs When** | First (priority-based) | Second (relevance-based) |
| **Layer Priority** | Explicit (100/50/25/0) | Boosted (+100/+50/+25/+0) |

## Complete Example

```yaml
---
title: "Caption Localization Standards"
domain: "company-standards"
difficulty: "beginner"
bc_versions: "14+"
tags: [captions, localization, danish, comments]

# Enforce exact pattern compliance
detection:
  enabled: true
  pattern: |
    Caption\s*=\s*['"][^'"]+['"]
  check_type: "warning"

# Help semantic discovery
relevance_signals:
  constructs: [Caption]
  properties: [Caption, Comment]
  keywords: [caption, localization, danish, translation]
  anti_pattern_indicators:
    - "missing danish comment"
    - "no caption comment"
  positive_pattern_indicators:
    - "danish comment present"
    - "caption with comment"

# Filter and threshold
applicable_object_types: [table, page, enum]
relevance_threshold: 0.5
---
```

## References

- [Custom Pattern Detection Guide](../bc-code-intelligence-mcp/embedded-knowledge/domains/chris-config/custom-pattern-detection.md)
- [Knowledge Pattern V2 Documentation](../bc-code-intelligence-mcp/embedded-knowledge/docs/knowledge-pattern-v2.md)
- [Content Types Structure](../bc-code-intelligence-mcp/embedded-knowledge/domains/chris-config/content-types-structure.md)
