# BC Code Intelligence VSCode Extension - Build Instructions

This document provides instructions for a Claude session to build a VSCode extension that integrates with the BC Code Intelligence MCP server.

## Repository Architecture (3 Repos)

The BC Code Intelligence system uses a **3-repository architecture** with nested git submodules:

```
bc-code-intelligence-vscode/              # NEW REPO - VSCode extension (to be created)
├── bc-code-intelligence-mcp/             # Submodule → github.com/jeremyvyska/bc-code-intelligence-mcp
│   ├── embedded-knowledge/               # Submodule → github.com/jeremyvyska/bc-code-intelligence-knowledge
│   │   ├── specialists/                  # 16 specialist persona definitions
│   │   ├── domains/                      # Knowledge topics organized by domain
│   │   ├── prompts/                      # Workflow prompts
│   │   └── codelens-mappings.yaml        # CodeLens pattern→specialist mappings
│   ├── src/                              # MCP server TypeScript source
│   └── package.json
├── src/                                  # VSCode extension source
│   ├── extension.ts
│   ├── agents/
│   ├── settings/
│   ├── tools/
│   └── prompts/
├── package.json
└── tsconfig.json
```

### Why 3 Repos?

| Repository | Purpose | Update Frequency |
|------------|---------|------------------|
| **bc-code-intelligence-vscode** | VSCode extension UI, settings, tool registration | Feature releases |
| **bc-code-intelligence-mcp** | MCP server logic, tool implementations, layer system | Bug fixes, new tools |
| **bc-code-intelligence-knowledge** | Specialist definitions, knowledge topics, prompts | Continuous (knowledge updates) |

This separation allows:
- **Knowledge updates without code releases**: Fix a typo in a specialist's advice? Update the knowledge repo only.
- **MCP server updates without extension releases**: Add a new tool? Update the MCP repo, extension picks it up.
- **Independent versioning**: Each component can be versioned and tagged separately.
- **Community contributions**: Users can fork the knowledge repo to contribute without touching code.

### Creating the New VSCode Extension Repo

When you create the new `bc-code-intelligence-vscode` repository:

```bash
# 1. Create the new repo
mkdir bc-code-intelligence-vscode
cd bc-code-intelligence-vscode
git init

# 2. Add the MCP server as a submodule
git submodule add https://github.com/jeremyvyska/bc-code-intelligence-mcp.git bc-code-intelligence-mcp

# 3. The MCP repo already has embedded-knowledge as its own submodule
# Initialize nested submodules recursively
git submodule update --init --recursive

# 4. Verify the structure
ls bc-code-intelligence-mcp/embedded-knowledge/specialists/
# Should show: alex-architect.md, sam-coder.md, etc.
```

### Submodule Update Strategy

The extension should handle submodule updates gracefully:
- **embedded-knowledge**: Updated frequently (knowledge improvements)
- **bc-code-intelligence-mcp**: Updated less frequently (code changes)

The MCP server's layer system handles runtime knowledge loading, so the extension doesn't need to restart for knowledge updates - it reads from disk.

---

## Specialist Frontmatter Schema

Specialist files in `embedded-knowledge/specialists/*.md` use YAML frontmatter. The extension must parse this to build chat modes and UI.

### Full Schema

```yaml
---
title: "Sam Coder - Expert Development Specialist"
specialist_id: "sam-coder"           # Unique ID, used in chat mode registration
emoji: "⚡"                           # Used in status bar, tree view, CodeLens
role: "Expert Development"           # Short role description
team: "Development"                  # Used for grouping in tree view sidebar

persona:
  personality: ["results-focused", "thoroughness-minded", "pattern-driven"]
  communication_style: "focused action-oriented language, complete explanations"
  greeting: "⚡ Sam here!"           # Opening message when specialist activates

expertise:
  primary: ["systematic-development", "pattern-application", "code-generation"]
  secondary: ["boilerplate-automation", "pattern-libraries", "performance-implementation"]

domains:                              # Links to knowledge domains in domains/ folder
  - "language-fundamentals"
  - "code-quality"
  - "performance"
  - "api-design"

when_to_use:                          # User-facing guidance for when to consult
  - "You know what you want, need it systematic and done right"
  - "Knowledge-validated standard scenarios"
  - "Pattern application"

collaboration:
  natural_handoffs:                   # Specialists this one frequently hands off to
    - "quinn-tester"
    - "roger-reviewer"
    - "dean-debug"
  team_consultations:                 # Specialists this one consults for expertise
    - "maya-mentor"
    - "alex-architect"

related_specialists:                  # For "you might also like" suggestions
  - "maya-mentor"
  - "alex-architect"
  - "quinn-tester"
---

# Sam Coder - Expert Development Specialist ⚡

(Markdown content follows - this is the system prompt for the chat mode)
```

### TypeScript Interface

```typescript
interface SpecialistDefinition {
  specialist_id: string;
  title: string;
  emoji: string;
  role: string;
  team: string;  // "Development" | "Quality & Testing" | "Planning & Analysis" | "Integration & Business"

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
    natural_handoffs: string[];  // specialist_ids
    team_consultations: string[];  // specialist_ids
  };

  related_specialists: string[];  // specialist_ids

  // The markdown body (everything after frontmatter)
  systemPrompt: string;
}
```

### Parsing Example

```typescript
import * as yaml from 'yaml';
import * as fs from 'fs';
import * as path from 'path';

function parseSpecialistFile(filePath: string): SpecialistDefinition {
  const content = fs.readFileSync(filePath, 'utf-8');

  // Split frontmatter from body
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error(`Invalid frontmatter in ${filePath}`);

  const frontmatter = yaml.parse(match[1]);
  const systemPrompt = match[2].trim();

  return {
    ...frontmatter,
    systemPrompt
  };
}

function loadAllSpecialists(embeddedKnowledgePath: string): SpecialistDefinition[] {
  const specialistsDir = path.join(embeddedKnowledgePath, 'specialists');
  const files = fs.readdirSync(specialistsDir).filter(f => f.endsWith('.md'));

  return files.map(f => parseSpecialistFile(path.join(specialistsDir, f)));
}
```

---

## Existing MCP Tools Reference

The MCP server exposes these tools. The VSCode extension should register them as Language Model Tools.

### Core Knowledge Tools (8 tools)

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `find_bc_knowledge` | Search topics, specialists, workflows | `query`, `search_type` (topics/specialists/workflows/all), `limit` |
| `get_bc_topic` | Get detailed topic content | `topic_id`, `include_samples` |
| `ask_bc_expert` | Consult a specialist | `question`, `context`, `preferred_specialist`, `autonomous_mode` |
| `analyze_al_code` | Analyze AL code for issues | `code`, `analysis_type` (performance/quality/security/patterns/comprehensive), `operation` |
| `start_bc_workflow` | Start multi-phase workflow | `workflow_type`, `context`, `execution_mode`, `checkpoint_id` |
| `advance_workflow` | Progress workflow phase | `workflow_id`, `phase_results`, `next_focus` |
| `get_workflow_help` | Get workflow guidance | `workflow_id`, `help_type` (status/guidance/next-steps/methodology) |
| `list_specialists` | Browse specialists | `domain`, `expertise` (both optional filters) |

### Workspace Tools (2 tools)

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `set_workspace_info` | Set workspace root and available MCPs | `workspace_root`, `available_mcps[]` |
| `get_workspace_info` | Get current workspace info | (none) |

### Debug Tools (6 tools - opt-in)

These are enabled via `developer.enable_diagnostic_tools` setting:

| Tool | Description |
|------|-------------|
| `diagnose_git_layer` | Debug Git layer connection issues |
| `validate_layer_config` | Validate layer configuration |
| `test_azure_devops_pat` | Test Azure DevOps PAT authentication |
| `get_layer_diagnostics` | Get layer loading diagnostics |
| `diagnose_local_layer` | Debug local layer issues |
| `reload_layers` | Force reload all layers |

### Tool Registration Pattern

```typescript
import * as vscode from 'vscode';

// Register MCP tools as VSCode Language Model Tools
function registerMcpTools(mcpClient: McpClient) {
  const tools = [
    {
      name: 'find_bc_knowledge',
      description: 'Search BC knowledge topics, find specialists, or discover workflows',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          search_type: { type: 'string', enum: ['topics', 'specialists', 'workflows', 'all'] },
          limit: { type: 'number', default: 10 }
        },
        required: ['query']
      }
    },
    // ... other tools
  ];

  for (const tool of tools) {
    vscode.lm.registerTool(tool.name, {
      prepareInvocation: (options, token) => ({
        invocationMessage: `Searching BC knowledge...`
      }),
      invoke: async (options, token) => {
        const result = await mcpClient.callTool(tool.name, options.input);
        return new vscode.LanguageModelToolResult([
          new vscode.LanguageModelTextPart(JSON.stringify(result))
        ]);
      }
    });
  }
}
```

---

## Consolidated package.json Template

This template consolidates all `contributes` sections from the instruction documents.

```json
{
  "name": "bc-code-intelligence",
  "displayName": "BC Code Intelligence",
  "description": "AI-powered Business Central development assistant with specialist personas",
  "version": "1.0.0",
  "publisher": "your-publisher-id",
  "engines": {
    "vscode": "^1.100.0"
  },
  "categories": ["AI", "Programming Languages", "Other"],
  "keywords": ["business central", "dynamics 365", "al", "mcp", "ai"],
  "activationEvents": [
    "onLanguage:al",
    "onStartupFinished"
  ],
  "main": "./dist/extension.js",
  "contributes": {
    "chatParticipants": [
      {
        "id": "bc-code-intelligence",
        "name": "BC Code Intelligence",
        "description": "Business Central development assistant with specialist personas",
        "isSticky": true
      }
    ],
    "chatModes": [
      {
        "id": "bc-code-intelligence.sam-coder",
        "name": "Sam Coder",
        "description": "Expert BC/AL development and implementation specialist"
      },
      {
        "id": "bc-code-intelligence.alex-architect",
        "name": "Alex Architect",
        "description": "Architecture and design specialist for BC solutions"
      },
      {
        "id": "bc-code-intelligence.dean-debug",
        "name": "Dean Debug",
        "description": "Debugging and performance optimization specialist"
      },
      {
        "id": "bc-code-intelligence.eva-errors",
        "name": "Eva Errors",
        "description": "Error handling and exception management specialist"
      },
      {
        "id": "bc-code-intelligence.quinn-tester",
        "name": "Quinn Tester",
        "description": "Testing and quality assurance specialist"
      },
      {
        "id": "bc-code-intelligence.roger-reviewer",
        "name": "Roger Reviewer",
        "description": "Code review specialist"
      },
      {
        "id": "bc-code-intelligence.seth-security",
        "name": "Seth Security",
        "description": "Security specialist for BC applications"
      },
      {
        "id": "bc-code-intelligence.jordan-bridge",
        "name": "Jordan Bridge",
        "description": "Integration and events specialist"
      },
      {
        "id": "bc-code-intelligence.logan-legacy",
        "name": "Logan Legacy",
        "description": "Legacy code and upgrade specialist"
      },
      {
        "id": "bc-code-intelligence.uma-ux",
        "name": "Uma UX",
        "description": "User experience specialist for BC"
      },
      {
        "id": "bc-code-intelligence.morgan-market",
        "name": "Morgan Market",
        "description": "AppSource and ISV specialist"
      },
      {
        "id": "bc-code-intelligence.maya-mentor",
        "name": "Maya Mentor",
        "description": "Mentoring and learning specialist"
      },
      {
        "id": "bc-code-intelligence.taylor-docs",
        "name": "Taylor Docs",
        "description": "Documentation specialist"
      },
      {
        "id": "bc-code-intelligence.casey-copilot",
        "name": "Casey Copilot",
        "description": "AI-assisted development specialist"
      },
      {
        "id": "bc-code-intelligence.parker-pragmatic",
        "name": "Parker Pragmatic",
        "description": "AI trust and transparency meta-specialist"
      },
      {
        "id": "bc-code-intelligence.chris-config",
        "name": "Chris Config",
        "description": "MCP configuration specialist"
      }
    ],
    "commands": [
      {
        "command": "bcCodeIntelligence.switchSpecialist",
        "title": "Switch Specialist",
        "category": "BC Code Intelligence"
      },
      {
        "command": "bcCodeIntelligence.workflowAction",
        "title": "Workflow Actions",
        "category": "BC Code Intelligence"
      },
      {
        "command": "bcCodeIntelligence.openSetupWizard",
        "title": "Open Setup Wizard",
        "category": "BC Code Intelligence"
      },
      {
        "command": "bcCodeIntelligence.selectPrompt",
        "title": "Select Prompt",
        "category": "BC Code Intelligence"
      },
      {
        "command": "bcCodeIntelligence.activateSpecialist",
        "title": "Activate Specialist",
        "category": "BC Code Intelligence"
      },
      {
        "command": "bcCodeIntelligence.openPromptInEditor",
        "title": "Open Prompt in Editor",
        "category": "BC Code Intelligence"
      },
      {
        "command": "bcCodeIntelligence.refreshLayer",
        "title": "Refresh Layer",
        "category": "BC Code Intelligence"
      },
      {
        "command": "bcCodeIntelligence.askSpecialistAboutCode",
        "title": "Ask Specialist About Code",
        "category": "BC Code Intelligence"
      }
    ],
    "configuration": {
      "title": "BC Code Intelligence",
      "properties": {
        "bcCodeIntelligence.layers.company.enabled": {
          "type": "boolean",
          "default": false,
          "description": "Enable company knowledge layer",
          "scope": "application"
        },
        "bcCodeIntelligence.layers.company.url": {
          "type": "string",
          "description": "Git repository URL for company knowledge base",
          "scope": "application"
        },
        "bcCodeIntelligence.layers.company.branch": {
          "type": "string",
          "default": "main",
          "description": "Git branch for company layer",
          "scope": "application"
        },
        "bcCodeIntelligence.layers.company.auth": {
          "type": "string",
          "enum": ["none", "token", "ssh", "azure-cli"],
          "default": "none",
          "description": "Authentication method for company layer",
          "scope": "application"
        },
        "bcCodeIntelligence.layers.team.enabled": {
          "type": "boolean",
          "default": false,
          "description": "Enable team knowledge layer",
          "scope": "resource"
        },
        "bcCodeIntelligence.layers.team.url": {
          "type": "string",
          "description": "Git repository URL for team knowledge base",
          "scope": "resource"
        },
        "bcCodeIntelligence.layers.project.enabled": {
          "type": "boolean",
          "default": false,
          "description": "Enable project-specific knowledge layer",
          "scope": "resource"
        },
        "bcCodeIntelligence.layers.project.path": {
          "type": "string",
          "default": "./bc-code-intel-overrides",
          "description": "Path to project layer folder (relative to workspace)",
          "scope": "resource"
        },
        "bcCodeIntelligence.codeLens.enabled": {
          "type": "boolean",
          "default": true,
          "description": "Show specialist suggestions inline in AL code"
        },
        "bcCodeIntelligence.codeLens.maxPerFile": {
          "type": "number",
          "default": 20,
          "description": "Maximum number of CodeLens items per file (0 = unlimited)"
        },
        "bcCodeIntelligence.developer.enableDiagnosticTools": {
          "type": "boolean",
          "default": false,
          "description": "Enable debug/diagnostic tools for troubleshooting"
        }
      }
    },
    "viewsContainers": {
      "activitybar": [
        {
          "id": "bcCodeIntelligence",
          "title": "BC Code Intelligence",
          "icon": "resources/bc-icon.svg"
        }
      ]
    },
    "views": {
      "bcCodeIntelligence": [
        {
          "id": "bcCodeIntelligence.specialists",
          "name": "Specialists"
        },
        {
          "id": "bcCodeIntelligence.prompts",
          "name": "Prompts"
        },
        {
          "id": "bcCodeIntelligence.layers",
          "name": "Layers"
        }
      ]
    },
    "menus": {
      "view/item/context": [
        {
          "command": "bcCodeIntelligence.activateSpecialist",
          "when": "view == bcCodeIntelligence.specialists && viewItem == specialist",
          "group": "inline"
        },
        {
          "command": "bcCodeIntelligence.openPromptInEditor",
          "when": "view == bcCodeIntelligence.prompts && viewItem == prompt"
        },
        {
          "command": "bcCodeIntelligence.refreshLayer",
          "when": "view == bcCodeIntelligence.layers && viewItem == layer"
        }
      ]
    },
    "walkthroughs": [
      {
        "id": "bcCodeIntelligence.welcome",
        "title": "Get Started with BC Code Intelligence",
        "description": "Set up your BC development assistant",
        "steps": [
          {
            "id": "openWizard",
            "title": "Set Up Your Layers",
            "description": "Configure company and project knowledge layers",
            "media": { "markdown": "media/layer-setup.md" },
            "completionEvents": ["onCommand:bcCodeIntelligence.openSetupWizard"]
          }
        ]
      }
    ]
  },
  "scripts": {
    "vscode:prepublish": "npm run build",
    "build": "tsc -p ./",
    "watch": "tsc -watch -p ./",
    "lint": "eslint src --ext ts"
  },
  "devDependencies": {
    "@types/vscode": "^1.100.0",
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0",
    "eslint": "^8.0.0"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "latest",
    "@modelcontextprotocol/sdk": "latest",
    "yaml": "^2.0.0"
  }
}
```

---

## Project Overview

### Extension Architecture

```
bc-code-intelligence-vscode/           # New VSCode extension repo
├── bc-code-intelligence-mcp/          # THIS REPO as a git submodule
│   └── (MCP server, specialists, knowledge base)
├── src/
│   ├── extension.ts                   # Extension entry point
│   ├── agents/                        # Custom agent registration
│   ├── settings/                      # VSCode settings integration
│   ├── tools/                         # Tool registration
│   └── prompts/                       # Prompt/workflow registration
├── package.json
└── tsconfig.json
```

### Core Goals

1. **Specialists → Custom Agents**: The 16 specialist personas defined in the MCP server should register as VSCode Custom Agents
2. **Layer System → VSCode Settings**: Replace the YAML config file approach with native VSCode extension settings (User, Workspace, Folder scopes)
3. **Tools/Prompts → Direct Integration**: Register MCP tools and prompts directly into VSCode for better agentic integration

---

## Reference Repository: waldo.BCTelemetryBuddy

Use https://github.com/waldo1001/waldo.BCTelemetryBuddy as a structural reference. Key patterns to follow:

### Project Structure (Monorepo with npm workspaces)

```
packages/
├── shared/         # Common logic (auth, config, caching)
├── mcp/            # MCP server package
└── extension/      # VSCode extension package
```

### Key Implementation Patterns

#### Chat Participant Registration
```typescript
// In package.json
"chatParticipants": [{
  "id": "bc-code-intelligence",
  "name": "BC Code Intelligence",
  "description": "Business Central development assistant",
  "isSticky": true
}]

// In extension.ts
const participant = vscode.chat.createChatParticipant('bc-code-intelligence', handleChatRequest);
participant.iconPath = vscode.Uri.joinPath(context.extensionUri, 'images', 'icon.png');
```

#### Tool-Calling Loop Pattern
```typescript
async function handleChatRequest(
  request: vscode.ChatRequest,
  context: vscode.ChatContext,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken
) {
  const messages = [systemPrompt, ...conversationHistory];

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const response = await vscode.lm.sendChatRequest(model, messages, { tools: mcpTools });

    const toolCalls = response.stream.filter(part => part instanceof vscode.LanguageModelToolCallPart);

    if (toolCalls.length === 0) {
      // Stream final response to user
      break;
    }

    // Execute tools and append results
    for (const call of toolCalls) {
      const result = await vscode.lm.invokeTool(call.name, call.input, token);
      messages.push({ role: 'tool', content: result });
    }
  }
}
```

#### Configuration Properties Pattern
```json
"configuration": {
  "title": "BC Code Intelligence",
  "properties": {
    "bcCodeIntelligence.layers.company.enabled": { "type": "boolean", "default": false },
    "bcCodeIntelligence.layers.company.url": { "type": "string" },
    "bcCodeIntelligence.layers.company.branch": { "type": "string", "default": "main" },
    "bcCodeIntelligence.cache.strategy": {
      "type": "string",
      "enum": ["none", "minimal", "moderate", "aggressive"],
      "default": "moderate"
    }
  }
}
```

---

## MCP Server Integration Details

### Current Specialist System

The MCP server defines **16 specialist personas** as markdown files with YAML frontmatter in `embedded-knowledge/specialists/`:

| Specialist | ID | Role |
|------------|-----|------|
| Sam Coder | sam-coder | Expert Development/Implementation |
| Alex Architect | alex-architect | Architecture & Design |
| Dean Debug | dean-debug | Debugging & Performance |
| Eva Errors | eva-errors | Error Handling |
| Quinn Tester | quinn-tester | Testing & Quality |
| Roger Reviewer | roger-reviewer | Code Review |
| Seth Security | seth-security | Security |
| Jordan Bridge | jordan-bridge | Integration & Events |
| Logan Legacy | logan-legacy | Legacy Code & Upgrades |
| Uma UX | uma-ux | User Experience |
| Morgan Market | morgan-market | AppSource & ISV |
| Maya Mentor | maya-mentor | Mentoring & Learning |
| Taylor Docs | taylor-docs | Documentation |
| Casey Copilot | casey-copilot | AI-Assisted Development |
| Parker Pragmatic | parker-pragmatic | AI Trust & Transparency |
| Chris Config | chris-config | MCP Configuration |

#### Specialist Definition Structure
```yaml
title: "Name - Role"
specialist_id: "identifier"
emoji: "🔍"
role: "Role Description"
team: "Team Name"
persona:
  personality: ["trait1", "trait2"]
  communication_style: "Description"
  greeting: "Greeting message"
expertise:
  primary: ["expertise1", "expertise2"]
  secondary: ["expertise2", "expertise3"]
domains: ["domain1", "domain2"]
when_to_use: ["scenario1", "scenario2"]
collaboration:
  natural_handoffs: ["specialist-id1", "specialist-id2"]
  team_consultations: ["specialist-id1"]
related_specialists: ["specialist-id1"]
methodologies: ["methodology-id1"]
```

### Current Layer System

The MCP uses a priority-based layer resolution:

| Priority | Layer | Source |
|----------|-------|--------|
| 0 | EMBEDDED | Submodule (always present) |
| 20 | COMPANY | Git repository (org standards) |
| 100 | TEAM | Git repository (team overrides) |
| 300 | PROJECT | Local `./bc-code-intel-overrides/` |

Lower priority number = higher precedence (wins in conflicts)

#### Current Configuration Schema
```typescript
interface BCCodeIntelConfiguration {
  layers: LayerConfiguration[];
  resolution: ResolutionSettings;
  cache: CacheSettings;
  security: SecuritySettings;
  performance: PerformanceSettings;
  developer: DeveloperSettings;
}

interface LayerConfiguration {
  name: string;
  priority: number;
  source: {
    type: 'embedded' | 'git' | 'local' | 'http' | 'npm';
    url?: string;
    branch?: string;
    path?: string;
  };
  enabled: boolean;
  auth?: {
    type: 'token' | 'ssh' | 'basic' | 'oauth' | 'az_cli';
    token_env_var?: string;
  };
  cache_duration?: string;
}
```

### Current Tools (10 Core + 6 Debug)

**Core Tools:**
1. `find_bc_knowledge` - Search BC topics, specialists, workflows
2. `get_bc_topic` - Get detailed content for a specific topic
3. `ask_bc_expert` - Consult a specialist directly
4. `analyze_al_code` - Analyze AL code patterns
5. `start_bc_workflow` - Begin structured workflow
6. `advance_workflow` - Continue workflow to next phase
7. `get_workflow_help` - Get current phase help
8. `list_specialists` - Browse available specialists
9. `set_workspace_info` - Configure workspace context
10. `get_workspace_info` - Get current workspace configuration

**Debug Tools (optional via `developer.enable_diagnostic_tools`):**
- `diagnose_git_layer`, `diagnose_local_layer`, `validate_layer_config`
- `test_azure_devops_pat`, `get_layer_diagnostics`, `reload_layers`

### Current Workflow Prompts (14)

- `code_optimization`, `architecture_review`, `security_audit`, `perf_review`
- `integration_design`, `upgrade_planning`, `testing_strategy`, `dev_onboarding`
- `app_takeover`, `spec_analysis`, `bug_investigation`, `monolith_to_modules`
- `data_flow_tracing`, `full_review`

---

## VSCode Extension Implementation Requirements

### 1. Custom Agent Registration

Each specialist should become a VSCode Custom Agent. Reference the VSCode Custom Agents documentation.

**package.json contribution:**
```json
"contributes": {
  "chatParticipants": [
    {
      "id": "bc-code-intelligence.sam-coder",
      "name": "Sam Coder",
      "description": "Expert BC/AL development and implementation",
      "isSticky": false
    },
    {
      "id": "bc-code-intelligence.alex-architect",
      "name": "Alex Architect",
      "description": "Architecture and design specialist",
      "isSticky": false
    }
    // ... register all 16 specialists
  ]
}
```

**Dynamic loading approach:**
- Read specialist definitions from the MCP submodule at extension activation
- Parse YAML frontmatter to extract metadata
- Register chat participants programmatically
- Use specialist markdown content as system prompts

**Agent handoffs:**
- Implement `collaboration.natural_handoffs` as agent-to-agent transitions
- Maintain conversation context across handoffs
- Use `SpecialistSessionManager` pattern from MCP server

### 2. VSCode Settings Integration

Replace the YAML config file with native VSCode settings. This enables:
- User-level settings (global defaults)
- Workspace-level settings (per-project config)
- Folder-level settings (multi-root workspace support)

**package.json configuration properties:**
```json
"configuration": {
  "title": "BC Code Intelligence",
  "properties": {
    "bcCodeIntelligence.layers.embedded.enabled": {
      "type": "boolean",
      "default": true,
      "description": "Enable the embedded knowledge base layer"
    },
    "bcCodeIntelligence.layers.company.enabled": {
      "type": "boolean",
      "default": false,
      "description": "Enable company-level knowledge layer",
      "scope": "application"
    },
    "bcCodeIntelligence.layers.company.url": {
      "type": "string",
      "description": "Git repository URL for company knowledge base",
      "scope": "application"
    },
    "bcCodeIntelligence.layers.company.branch": {
      "type": "string",
      "default": "main",
      "description": "Git branch for company layer",
      "scope": "application"
    },
    "bcCodeIntelligence.layers.company.auth": {
      "type": "string",
      "enum": ["token", "ssh", "az_cli", "none"],
      "default": "token",
      "description": "Authentication method for company layer",
      "scope": "application"
    },
    "bcCodeIntelligence.layers.company.tokenEnvVar": {
      "type": "string",
      "default": "GITHUB_TOKEN",
      "description": "Environment variable containing auth token",
      "scope": "application"
    },
    "bcCodeIntelligence.layers.team.enabled": {
      "type": "boolean",
      "default": false,
      "scope": "resource"
    },
    "bcCodeIntelligence.layers.team.url": {
      "type": "string",
      "scope": "resource"
    },
    "bcCodeIntelligence.layers.project.enabled": {
      "type": "boolean",
      "default": true,
      "scope": "resource"
    },
    "bcCodeIntelligence.layers.project.path": {
      "type": "string",
      "default": "./bc-code-intel-overrides",
      "scope": "resource"
    },
    "bcCodeIntelligence.cache.strategy": {
      "type": "string",
      "enum": ["none", "minimal", "moderate", "aggressive"],
      "default": "moderate"
    },
    "bcCodeIntelligence.cache.maxSizeMb": {
      "type": "number",
      "default": 100
    },
    "bcCodeIntelligence.developer.debugLayers": {
      "type": "boolean",
      "default": false
    },
    "bcCodeIntelligence.developer.logLevel": {
      "type": "string",
      "enum": ["error", "warn", "info", "debug"],
      "default": "info"
    },
    "bcCodeIntelligence.developer.enableDiagnosticTools": {
      "type": "boolean",
      "default": false,
      "description": "Enable debug/diagnostic MCP tools"
    }
  }
}
```

**Configuration bridge:**
- Create a service that reads VSCode settings
- Transforms to `BCCodeIntelConfiguration` format expected by MCP server
- Passes configuration when starting/connecting to MCP server

### 3. Language Model Tool Registration

Register MCP tools as VSCode Language Model Tools for agent mode integration.

**package.json contribution:**
```json
"contributes": {
  "languageModelTools": [
    {
      "name": "bc-code-intelligence_findKnowledge",
      "tags": ["bc", "business-central", "knowledge"],
      "toolReferenceName": "findBCKnowledge",
      "displayName": "Find BC Knowledge",
      "modelDescription": "Search the Business Central knowledge base for topics, specialists, workflows, and best practices.",
      "userDescription": "Search BC development knowledge",
      "canBeReferencedInPrompt": true,
      "icon": "$(search)",
      "inputSchema": {
        "type": "object",
        "properties": {
          "query": {
            "type": "string",
            "description": "Search query for BC knowledge"
          },
          "search_type": {
            "type": "string",
            "enum": ["topics", "specialists", "workflows", "all"],
            "description": "Type of content to search"
          },
          "bc_version": {
            "type": "string",
            "description": "BC version filter (e.g., '23+', '24')"
          },
          "limit": {
            "type": "number",
            "description": "Maximum results to return"
          }
        },
        "required": ["query"]
      }
    },
    {
      "name": "bc-code-intelligence_askExpert",
      "tags": ["bc", "business-central", "expert", "specialist"],
      "toolReferenceName": "askBCExpert",
      "displayName": "Ask BC Expert",
      "modelDescription": "Consult a BC specialist for expert guidance. Specialists include Sam Coder (development), Alex Architect (architecture), Dean Debug (debugging), and more.",
      "userDescription": "Get expert BC guidance from a specialist",
      "canBeReferencedInPrompt": true,
      "icon": "$(person)",
      "inputSchema": {
        "type": "object",
        "properties": {
          "question": {
            "type": "string",
            "description": "Question for the specialist"
          },
          "context": {
            "type": "string",
            "description": "Additional context about your situation"
          },
          "preferred_specialist": {
            "type": "string",
            "description": "Preferred specialist ID (e.g., 'sam-coder', 'alex-architect')"
          }
        },
        "required": ["question"]
      }
    }
    // ... register all tools
  ]
}
```

**Tool implementation:**
```typescript
class FindKnowledgeTool implements vscode.LanguageModelTool<IFindKnowledgeParams> {
  constructor(private mcpClient: MCPClient) {}

  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<IFindKnowledgeParams>,
    token: vscode.CancellationToken
  ) {
    return {
      invocationMessage: `Searching BC knowledge for "${options.input.query}"...`
    };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<IFindKnowledgeParams>,
    token: vscode.CancellationToken
  ) {
    const result = await this.mcpClient.callTool('find_bc_knowledge', options.input);
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(JSON.stringify(result, null, 2))
    ]);
  }
}
```

### 4. MCP Server Definition Provider

Register the MCP server so VSCode can discover and start it.

**package.json contribution:**
```json
"contributes": {
  "mcpServerDefinitionProviders": [
    {
      "id": "bc-code-intelligence",
      "label": "BC Code Intelligence MCP Server"
    }
  ]
}
```

**Implementation:**
```typescript
vscode.lm.registerMcpServerDefinitionProvider('bc-code-intelligence', {
  onDidChangeMcpServerDefinitions: onConfigChange.event,

  provideMcpServerDefinitions: () => {
    const config = vscode.workspace.getConfiguration('bcCodeIntelligence');

    return [
      new vscode.McpStdioServerDefinition({
        label: 'BC Code Intelligence',
        command: 'node',
        args: [path.join(context.extensionPath, 'bc-code-intelligence-mcp', 'dist', 'index.js')],
        env: buildEnvFromConfig(config),
        version: getPackageVersion()
      })
    ];
  },

  resolveMcpServerDefinition: async (definition) => {
    // Handle any auth setup before server starts
    await ensureAuthentication(definition);
    return definition;
  }
});
```

### 5. Specialists as Chat Modes

Register specialists as chat modes so users can select them from the chat mode dropdown. This is more intuitive than workflow-based modes - users think "I need Sam Coder" not "I need the code optimization workflow."

**package.json contribution:**
```json
"contributes": {
  "chatModes": [
    {
      "id": "bc-code-intelligence.sam-coder",
      "name": "Sam Coder",
      "description": "Expert BC/AL development and implementation specialist"
    },
    {
      "id": "bc-code-intelligence.alex-architect",
      "name": "Alex Architect",
      "description": "Architecture and design specialist for BC solutions"
    },
    {
      "id": "bc-code-intelligence.dean-debug",
      "name": "Dean Debug",
      "description": "Debugging and performance optimization specialist"
    },
    {
      "id": "bc-code-intelligence.eva-errors",
      "name": "Eva Errors",
      "description": "Error handling and exception management specialist"
    },
    {
      "id": "bc-code-intelligence.quinn-tester",
      "name": "Quinn Tester",
      "description": "Testing and quality assurance specialist"
    },
    {
      "id": "bc-code-intelligence.roger-reviewer",
      "name": "Roger Reviewer",
      "description": "Code review specialist"
    },
    {
      "id": "bc-code-intelligence.seth-security",
      "name": "Seth Security",
      "description": "Security specialist for BC applications"
    },
    {
      "id": "bc-code-intelligence.jordan-bridge",
      "name": "Jordan Bridge",
      "description": "Integration and events specialist"
    },
    {
      "id": "bc-code-intelligence.logan-legacy",
      "name": "Logan Legacy",
      "description": "Legacy code and upgrade specialist"
    },
    {
      "id": "bc-code-intelligence.uma-ux",
      "name": "Uma UX",
      "description": "User experience specialist for BC"
    },
    {
      "id": "bc-code-intelligence.morgan-market",
      "name": "Morgan Market",
      "description": "AppSource and ISV specialist"
    },
    {
      "id": "bc-code-intelligence.maya-mentor",
      "name": "Maya Mentor",
      "description": "Mentoring and learning specialist"
    },
    {
      "id": "bc-code-intelligence.taylor-docs",
      "name": "Taylor Docs",
      "description": "Documentation specialist"
    },
    {
      "id": "bc-code-intelligence.casey-copilot",
      "name": "Casey Copilot",
      "description": "AI-assisted development specialist"
    },
    {
      "id": "bc-code-intelligence.parker-pragmatic",
      "name": "Parker Pragmatic",
      "description": "AI trust and transparency meta-specialist"
    },
    {
      "id": "bc-code-intelligence.chris-config",
      "name": "Chris Config",
      "description": "MCP configuration specialist"
    }
  ]
}
```

**Dynamic loading approach:**
- Parse specialist YAML frontmatter at extension activation
- Build chat mode definitions dynamically from specialist metadata
- Use `role` and `when_to_use` fields for descriptions
- Load specialist markdown content as system prompts for each mode

**Workflow prompts** can still be exposed as slash commands within any specialist mode (e.g., `/optimize`, `/review`, `/audit`).

### 6. Dynamic Prompt Handling

**Important limitation:** VSCode slash commands are **static** - they must be defined in `package.json` at build time. There is no runtime API to register new slash commands dynamically.

However, prompts loaded from company/project layers can still be surfaced through alternative approaches:

#### Option A: Generic `/prompt` Command with Discovery
Register a single `/prompt` slash command that discovers and lists available prompts:

```typescript
// User types: /prompt
// Extension responds with list of available prompts from all layers
// User selects or types: /prompt code-review
// Extension loads and executes that prompt

async function handlePromptCommand(request: vscode.ChatRequest) {
  const promptName = request.prompt.trim();

  if (!promptName) {
    // List all available prompts from MCP
    const prompts = await mcpClient.callTool('list_prompts', {});
    return formatPromptList(prompts);
  }

  // Execute the named prompt
  const prompt = await mcpClient.callTool('get_prompt', { name: promptName });
  return executePrompt(prompt, request.context);
}
```

#### Option B: MCP Prompts as Resources
MCP servers can expose prompts natively. VSCode's MCP integration surfaces these as available prompts:

```typescript
// In MCP server - prompts are already dynamic via prompts/list
server.setRequestHandler(ListPromptsRequestSchema, async () => {
  const allPrompts = await layerService.getAllPrompts(); // From all layers
  return { prompts: allPrompts };
});
```

VSCode will discover these via the MCP protocol and make them available.

#### Option C: Quick Pick UI for Prompt Selection
Provide a command that opens a Quick Pick with all available prompts:

```typescript
vscode.commands.registerCommand('bcCodeIntelligence.selectPrompt', async () => {
  const prompts = await mcpClient.callTool('list_prompts', {});

  const selected = await vscode.window.showQuickPick(
    prompts.map(p => ({
      label: p.name,
      description: p.description,
      detail: `Source: ${p.layer}`, // Shows which layer it came from
      prompt: p
    })),
    { placeHolder: 'Select a workflow prompt...' }
  );

  if (selected) {
    // Insert into chat or execute directly
    await executePrompt(selected.prompt);
  }
});
```

#### Option D: Prompt Files Integration
VSCode supports `.github/prompts/*.md` files. The extension could:
1. Watch for layer changes
2. Sync prompts from company/project layers to `.github/prompts/`
3. Let VSCode's native prompt file system handle discovery

```typescript
async function syncPromptsFromLayers() {
  const prompts = await mcpClient.callTool('list_prompts', { include_content: true });
  const promptsDir = path.join(workspaceRoot, '.github', 'prompts');

  for (const prompt of prompts) {
    // Write each prompt as a .prompt.md file
    const filePath = path.join(promptsDir, `${prompt.name}.prompt.md`);
    await fs.writeFile(filePath, prompt.content);
  }
}
```

**Recommended approach:** Combine Options A + B. Use the MCP protocol's native prompt discovery (which IS dynamic), and provide a `/prompt` fallback command for explicit invocation.

---

## VSCode API Reference

### Tools Registration API
From https://code.visualstudio.com/api/extension-guides/ai/tools:

- `vscode.lm.registerTool(name, tool)` - Register a tool implementation
- `vscode.LanguageModelTool<T>` - Interface for tool classes
- `vscode.LanguageModelToolResult` - Return type for tool invocations
- `prepareInvocation()` - Called before invocation, return confirmation messages
- `invoke()` - Execute the tool and return results

**Key properties in package.json:**
- `name` - Unique identifier (`{verb}_{noun}` format)
- `modelDescription` - LLM-focused description
- `userDescription` - End-user friendly description
- `canBeReferencedInPrompt` - Enable in agent/chat mode
- `inputSchema` - JSON schema for parameters
- `when` - Context clause for availability

### MCP Server Registration API
From https://code.visualstudio.com/api/extension-guides/ai/mcp:

- `vscode.lm.registerMcpServerDefinitionProvider(id, provider)` - Register MCP server
- `vscode.McpStdioServerDefinition` - stdio-based server config
- `vscode.McpHttpServerDefinition` - HTTP-based server config

**Server definition properties:**
- `label` - Display name
- `command` - Executable command
- `args` - Command arguments
- `cwd` - Working directory
- `env` - Environment variables
- `version` - Server version

**Development mode** in `.vscode/mcp.json`:
```json
{
  "servers": {
    "bc-code-intelligence": {
      "type": "stdio",
      "command": "node",
      "args": ["./bc-code-intelligence-mcp/dist/index.js"],
      "dev": {
        "watch": "bc-code-intelligence-mcp/src/**/*.ts",
        "debug": { "type": "node" }
      }
    }
  }
}
```

### Copilot Customization
From https://code.visualstudio.com/docs/copilot/customization/overview:

**Custom Agents:**
- Create specialist assistants for specific roles
- Register via `chatParticipants` in package.json
- Implement with `vscode.chat.createChatParticipant()`

**Custom Instructions:**
- Define in `.github/copilot-instructions.md`
- Workspace-level guidelines for Copilot

**Prompt Files:**
- Reusable prompts in `.github/prompts/`
- Scaffold components, generate tests, etc.

---

## Implementation Checklist

### Phase 1: Project Setup
- [ ] Create new repository `bc-code-intelligence-vscode`
- [ ] Add `bc-code-intelligence-mcp` as git submodule
- [ ] Set up npm workspace structure (extension + shared)
- [ ] Configure TypeScript and build pipeline
- [ ] Set up extension activation and entry point

### Phase 2: MCP Server Integration
- [ ] Implement MCP server definition provider
- [ ] Create configuration bridge (VSCode settings → MCP config)
- [ ] Implement MCP client for tool invocation
- [ ] Test server startup and communication

### Phase 3: Settings Integration
- [ ] Define all configuration properties in package.json
- [ ] Implement settings change listeners
- [ ] Create settings UI contribution (if needed)
- [ ] Handle User/Workspace/Folder scope correctly

### Phase 4: Tool Registration
- [ ] Register all 10 core tools as Language Model Tools
- [ ] Implement tool classes with prepareInvocation/invoke
- [ ] Optionally register 6 debug tools based on settings
- [ ] Test tool invocation in agent mode

### Phase 5: Specialists as Chat Modes
- [ ] Parse specialist definitions from submodule (YAML frontmatter)
- [ ] Register chat modes for each specialist
- [ ] Load specialist markdown content as system prompts
- [ ] Implement specialist handoff suggestions
- [ ] Test mode switching and context preservation

### Phase 6: Dynamic Prompt Integration
- [ ] Implement MCP `prompts/list` to return prompts from all layers
- [ ] Register generic `/prompt` slash command for discovery/execution
- [ ] Create Quick Pick UI for prompt selection (`bcCodeIntelligence.selectPrompt`)
- [ ] Implement workflow session management for multi-phase prompts
- [ ] Handle phase progression within specialist modes
- [ ] Consider: Sync layer prompts to `.github/prompts/` for native discovery

### Phase 7: Testing & Polish
- [ ] Write unit tests for core functionality
- [ ] Test multi-workspace scenarios
- [ ] Test layer loading with different auth methods
- [ ] Create extension documentation

---

## Key Files to Reference in MCP Submodule

When implementing the extension, reference these key files:

| Purpose | File Path |
|---------|-----------|
| Specialist definitions | `embedded-knowledge/specialists/*.md` |
| Specialist loading | `src/services/specialist-loader.ts` |
| Specialist discovery | `src/services/specialist-discovery.ts` |
| Session management | `src/services/specialist-session-manager.ts` |
| Layer configuration | `src/types/config-types.ts` |
| Config loading | `src/config/config-loader.ts` |
| Tool definitions | `src/tools/*/schema.ts` |
| Tool handlers | `src/tools/*/handler.ts` |
| Workflow service | `src/services/workflow-service.ts` |
| Server entry point | `src/index.ts` |

---

## Notes for Claude Session

1. **Start with the reference repo**: Use waldo.BCTelemetryBuddy's structure as a template
2. **Submodule approach**: The MCP server runs as a child process, communicate via stdio
3. **Settings priority**: Use VSCode's native scope system (User < Workspace < Folder)
4. **Specialist loading**: Parse YAML frontmatter at activation, cache the results
5. **Tool bridging**: VSCode tools call MCP tools through the stdio client
6. **Error handling**: Implement proper error states for auth failures, layer loading issues
7. **Testing**: The reference repo has patterns for extension testing

When stuck, check the reference repo for patterns. The key insight is that VSCode handles the UI/UX layer while the MCP server (submodule) handles all the business logic.
