# Knowledge Pattern V2: Relevance-Based Detection

## Overview

This document describes how to update knowledge files in `embedded-knowledge/` (and company/project layers) to support the new relevance-based code analysis system.

### Key Change

Previously, knowledge files were documentation that existed alongside hardcoded regex patterns. Now, knowledge files **drive detection** through explicit relevance signals.

### Backward Compatibility

All new fields are **optional**. Existing knowledge files will continue to work without modification. Adding relevance signals improves detection precision but is not required.

---

## New Frontmatter Fields

### `relevance_signals`

Describes what code characteristics indicate this knowledge topic is relevant.

```yaml
relevance_signals:
  # AL language constructs that suggest this topic applies
  constructs:
    - "FindSet"
    - "FindFirst"
    - "repeat"
    - "until"
    - "Next()"

  # General keywords to match in code or context
  keywords:
    - "loop"
    - "iteration"
    - "record"
    - "field access"

  # Phrases indicating an anti-pattern is present
  # (used for pattern_type: bad topics)
  anti_pattern_indicators:
    - "field access in loop without SetLoadFields"
    - "multiple field reads before FindSet"

  # Phrases indicating a good pattern is present
  # (used for pattern_type: good topics)
  positive_pattern_indicators:
    - "SetLoadFields before FindSet"
    - "limited field selection"
```

### `applicable_object_types`

Which AL object types this knowledge applies to. Helps filter irrelevant matches.

```yaml
applicable_object_types:
  - "codeunit"
  - "page"
  - "report"
  - "query"
```

Valid values: `codeunit`, `page`, `table`, `report`, `query`, `xmlport`, `enum`, `interface`, `permissionset`, `profile`

### `relevance_threshold`

Minimum relevance score (0.0 to 1.0) required to surface this topic. Higher values mean stricter matching.

```yaml
relevance_threshold: 0.6  # Only show if 60%+ confident
```

Default if not specified: `0.3`

---

## Field Reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `relevance_signals` | object | No | Container for detection signals |
| `relevance_signals.constructs` | string[] | No | AL constructs to detect (FindSet, CalcFields, etc.) |
| `relevance_signals.keywords` | string[] | No | General keywords for matching |
| `relevance_signals.anti_pattern_indicators` | string[] | No | Phrases indicating bad patterns |
| `relevance_signals.positive_pattern_indicators` | string[] | No | Phrases indicating good patterns |
| `applicable_object_types` | string[] | No | AL object types this applies to |
| `relevance_threshold` | number | No | Minimum score to surface (0.0-1.0) |

---

## Construct Reference

The following AL constructs are recognized by the relevance system. Use these exact names in your `relevance_signals.constructs` array:

### Record Operations
| Construct | Detects |
|-----------|---------|
| `FindSet` | `.FindSet()` calls |
| `FindFirst` | `.FindFirst()` calls |
| `FindLast` | `.FindLast()` calls |
| `Next` | `.Next()` calls |
| `Insert` | `.Insert()` calls |
| `Modify` | `.Modify()` calls |
| `Delete` | `.Delete()` calls |
| `DeleteAll` | `.DeleteAll()` calls |
| `ModifyAll` | `.ModifyAll()` calls |

### Filtering & Keys
| Construct | Detects |
|-----------|---------|
| `SetRange` | `.SetRange()` calls |
| `SetFilter` | `.SetFilter()` calls |
| `SetLoadFields` | `.SetLoadFields()` calls |

### Calculations
| Construct | Detects |
|-----------|---------|
| `CalcFields` | `.CalcFields()` calls |
| `CalcSums` | `.CalcSums()` calls |

### Validation & Errors
| Construct | Detects |
|-----------|---------|
| `TestField` | `.TestField()` calls |
| `FieldError` | `.FieldError()` calls |
| `Validate` | `.Validate()` calls |
| `Error` | `Error()` calls |

### User Interaction
| Construct | Detects |
|-----------|---------|
| `Confirm` | `Confirm()` calls |
| `Message` | `Message()` calls |
| `Dialog` | `Dialog.` usage |

### Control Flow
| Construct | Detects |
|-----------|---------|
| `repeat` | `repeat` keyword |
| `until` | `until` keyword |

### Integration & Events
| Construct | Detects |
|-----------|---------|
| `HttpClient` | `HttpClient` usage |
| `JsonToken` | `JsonToken` usage |
| `EventSubscriber` | `[EventSubscriber]` attribute |
| `IntegrationEvent` | `[IntegrationEvent]` attribute |
| `Codeunit.Run` | `Codeunit.Run()` calls |

---

## Examples

### Example 1: Performance Pattern (SetLoadFields)

```yaml
---
title: "AL SetLoadFields Performance Optimization"
domain: "dean-debug"
difficulty: "intermediate"
bc_versions: "14+"
tags: ["performance", "setloadfields", "optimization", "memory", "data-access"]
type: "performance-pattern"
category: "optimization"
pattern_type: "good"
severity: "medium"
impact_level: "high"

# V2: Relevance detection signals
relevance_signals:
  constructs:
    - "FindSet"
    - "FindFirst"
    - "FindLast"
    - "repeat"
    - "until"
    - "Next"
  keywords:
    - "record"
    - "field"
    - "loop"
    - "iteration"
    - "memory"
    - "performance"
  anti_pattern_indicators:
    - "multiple field access in loop"
    - "field read without SetLoadFields"
    - "FindSet without field restriction"
  positive_pattern_indicators:
    - "SetLoadFields"
    - "selective field loading"

applicable_object_types:
  - "codeunit"
  - "page"
  - "report"
  - "query"

relevance_threshold: 0.5
---

# AL SetLoadFields Performance Optimization

## Overview

SetLoadFields enables selective field loading in AL, dramatically reducing memory
consumption and improving performance by loading only required fields from database
records...
```

### Example 2: Anti-Pattern (Missing Validation)

```yaml
---
title: "Record Insertion Without Validation"
domain: "best-practices"
difficulty: "beginner"
bc_versions: "14+"
tags: ["validation", "data-integrity", "insert", "testfield"]
type: "code-pattern"
category: "validation"
pattern_type: "bad"
severity: "high"
impact_level: "high"

relevance_signals:
  constructs:
    - "Insert"
  keywords:
    - "record"
    - "insert"
    - "validate"
    - "required"
  anti_pattern_indicators:
    - "Insert without TestField"
    - "Insert without validation"
    - "missing field validation before insert"

applicable_object_types:
  - "codeunit"
  - "page"

relevance_threshold: 0.6
---

# Record Insertion Without Validation

## Problem

Inserting records without validating required fields can lead to data integrity
issues and runtime errors...
```

### Example 3: Security Pattern

```yaml
---
title: "Hardcoded Credentials Detection"
domain: "security"
difficulty: "beginner"
bc_versions: "14+"
tags: ["security", "credentials", "secrets", "configuration"]
type: "code-pattern"
category: "security"
pattern_type: "bad"
severity: "critical"
impact_level: "high"

relevance_signals:
  constructs: []  # No specific constructs
  keywords:
    - "password"
    - "secret"
    - "token"
    - "apikey"
    - "credential"
    - "authorization"
  anti_pattern_indicators:
    - "hardcoded password"
    - "password := '"
    - "secret := '"
    - "token assignment"

applicable_object_types:
  - "codeunit"
  - "page"
  - "table"

relevance_threshold: 0.7  # High threshold - only flag if confident
---

# Hardcoded Credentials Detection

## Critical Security Issue

Hardcoded credentials in source code pose significant security risks...
```

### Example 4: Architecture Pattern (Events)

```yaml
---
title: "Event-Driven Architecture Patterns"
domain: "architecture"
difficulty: "advanced"
bc_versions: "14+"
tags: ["events", "subscribers", "publishers", "loose-coupling", "extensibility"]
type: "architecture-pattern"
category: "architecture"
pattern_type: "good"
severity: "low"
impact_level: "medium"

relevance_signals:
  constructs:
    - "EventSubscriber"
    - "IntegrationEvent"
  keywords:
    - "event"
    - "subscriber"
    - "publisher"
    - "integration"
    - "extensibility"
  positive_pattern_indicators:
    - "IntegrationEvent attribute"
    - "EventSubscriber attribute"
    - "event-driven"

applicable_object_types:
  - "codeunit"

relevance_threshold: 0.4  # Lower threshold - good patterns are informational
---

# Event-Driven Architecture Patterns

## Overview

Business Central's event system enables loose coupling between components...
```

### Example 5: Mixed Domain Topic

```yaml
---
title: "SIFT Technology for Aggregation Performance"
domain:
  - "dean-debug"
  - "performance"
difficulty: "intermediate"
bc_versions: "14+"
tags: ["sift", "calcsums", "aggregation", "flowfields", "performance"]
type: "performance-pattern"
category: "optimization"
pattern_type: "good"
severity: "medium"
impact_level: "high"

relevance_signals:
  constructs:
    - "CalcSums"
    - "CalcFields"
    - "repeat"
    - "until"
    - "Next"
  keywords:
    - "sum"
    - "total"
    - "aggregate"
    - "count"
    - "average"
    - "flowfield"
    - "sift"
  anti_pattern_indicators:
    - "manual summation in loop"
    - "+= in repeat until"
    - "accumulator variable in loop"
  positive_pattern_indicators:
    - "CalcSums"
    - "SumIndexFields"
    - "MaintainSIFTIndex"

applicable_object_types:
  - "codeunit"
  - "report"
  - "query"

relevance_threshold: 0.5
---

# SIFT Technology for Aggregation Performance

## Overview

SIFT (SumIndexField Technology) provides pre-calculated aggregations...
```

---

## Migration Guide

### Step 1: Identify High-Value Topics

Start with topics that:
- Have `type: "code-pattern"` or `type: "performance-pattern"`
- Have `pattern_type: "bad"` (anti-patterns are highest value)
- Are frequently referenced in code reviews
- Cover common performance issues

### Step 2: Analyze the Pattern

For each topic, identify:
1. **What AL constructs indicate this topic applies?**
   - Look at sample code in the topic
   - Consider what someone would be doing to trigger this pattern

2. **What keywords are associated?**
   - Domain terms (performance, security, validation)
   - Technical terms (loop, record, field)

3. **What indicates the anti-pattern vs. good pattern?**
   - For `pattern_type: bad`: What code smell indicates the problem?
   - For `pattern_type: good`: What indicates correct implementation?

### Step 3: Add Relevance Signals

Add the `relevance_signals` block with appropriate values:

```yaml
relevance_signals:
  constructs:
    - # List constructs from the reference above
  keywords:
    - # Domain and technical terms
  anti_pattern_indicators:
    - # For bad patterns: what indicates the problem
  positive_pattern_indicators:
    - # For good patterns: what indicates correct usage
```

### Step 4: Set Thresholds

Choose `relevance_threshold` based on pattern importance:

| Threshold | Use Case |
|-----------|----------|
| 0.3 - 0.4 | Informational topics, good patterns |
| 0.5 - 0.6 | Standard patterns, common issues |
| 0.7 - 0.8 | Critical issues, security concerns |
| 0.9+ | Only flag with very high confidence |

### Step 5: Test Detection

After updating, test with sample code:

1. Create a test AL file with the pattern
2. Run `analyze_al_code` against it
3. Verify the topic appears in `relevant_knowledge`
4. Check the `relevance_score` is appropriate

---

## Best Practices

### DO

- **Be specific with constructs**: Use exact construct names from the reference
- **Include multiple indicators**: More signals = better matching
- **Use meaningful keywords**: Terms that appear in relevant code
- **Set appropriate thresholds**: Higher for critical issues
- **Test your signals**: Verify detection works as expected

### DON'T

- **Don't over-specify**: Too many required signals = missed matches
- **Don't use generic keywords**: "code", "function" are too broad
- **Don't set threshold too high**: May miss valid matches
- **Don't duplicate signals**: Each signal should add value
- **Don't forget object types**: Filter to relevant AL objects

---

## Troubleshooting

### Topic Not Being Detected

1. **Check constructs**: Are you using exact names from the reference?
2. **Lower threshold**: Try `relevance_threshold: 0.3` temporarily
3. **Add keywords**: Include terms from your test code
4. **Check object type**: Is `applicable_object_types` filtering it out?

### Too Many False Positives

1. **Raise threshold**: Increase `relevance_threshold`
2. **Be more specific**: Use more precise constructs
3. **Add negative signals**: Use `anti_pattern_indicators` to require problem signatures
4. **Filter object types**: Limit `applicable_object_types`

### Topic Detected But Low Score

1. **Add more signals**: Include additional constructs/keywords
2. **Check signal overlap**: Ensure signals match actual code patterns
3. **Review indicators**: Anti/positive pattern indicators boost relevance

---

## File Checklist

When updating a knowledge file, verify:

- [ ] `relevance_signals` block is valid YAML
- [ ] `constructs` use exact names from reference
- [ ] `keywords` are meaningful and specific
- [ ] `anti_pattern_indicators` match actual code smells (for bad patterns)
- [ ] `positive_pattern_indicators` match actual good practices (for good patterns)
- [ ] `applicable_object_types` uses valid AL object types
- [ ] `relevance_threshold` is appropriate for severity
- [ ] File still passes frontmatter validation
- [ ] Tested with sample code

---

## Priority Topics for Migration

### High Priority (Critical Patterns)

These topics should be migrated first:

1. **Security patterns**
   - Hardcoded credentials
   - SQL injection risks
   - Permission validation

2. **Performance anti-patterns**
   - Manual summation vs SIFT
   - Missing SetLoadFields
   - Individual record operations in loops

3. **Data safety patterns**
   - Bulk operations without filters
   - Delete without confirmation

### Medium Priority (Common Patterns)

4. **Validation patterns**
   - Missing TestField
   - Weak field validation

5. **Error handling patterns**
   - Silent error handling
   - Missing transaction handling

### Lower Priority (Informational)

6. **Good practice patterns**
   - Event-driven architecture
   - Interface usage
   - Proper API design

---

## Version Compatibility

| Field | Introduced | Required |
|-------|------------|----------|
| `relevance_signals` | V2 | No |
| `applicable_object_types` | V2 | No |
| `relevance_threshold` | V2 | No |

All fields are optional. Knowledge files without these fields will:
- Continue to be indexed by title, tags, and content
- Be matched with lower precision
- Work with legacy regex-based detection as fallback
