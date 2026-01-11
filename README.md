# BC Code Intelligence

AI-powered Business Central development assistant with specialist personas for VSCode.

## Overview

BC Code Intelligence brings 16 AI specialist personas to your Business Central/AL development workflow. Each specialist has deep expertise in specific areas - from debugging and testing to architecture and security - providing contextual guidance through VSCode's chat interface.

## Features

### Specialist Personas

| Specialist | Expertise |
|------------|-----------|
| **Sam Coder** | Core BC/AL development and implementation |
| **Alex Architect** | Solution architecture and design patterns |
| **Dean Debug** | Debugging and troubleshooting |
| **Eva Errors** | Error handling and exception management |
| **Quinn Tester** | Testing strategies and test automation |
| **Roger Reviewer** | Code review and quality assurance |
| **Seth Security** | Security, permissions, and entitlements |
| **Jordan Bridge** | Integrations, APIs, and events |
| **Logan Legacy** | Upgrades, migrations, and legacy code |
| **Uma UX** | User experience and page design |
| **Morgan Market** | AppSource publishing and ISV concerns |
| **Maya Mentor** | Learning and onboarding |
| **Taylor Docs** | Documentation and comments |
| **Casey Copilot** | AI-assisted development |
| **Parker Pragmatic** | AI trust and verification |
| **Chris Config** | MCP configuration and setup |

### Knowledge Layers

BC Code Intelligence uses a layered knowledge system:

1. **Embedded** - Built-in BC/AL best practices (always active)
2. **Company** - Organization-wide standards from a Git repository
3. **Team** - Team-specific overrides
4. **Project** - Local project customizations

### Workflows

Multi-phase guided workflows for complex tasks:

- Code Optimization
- Architecture Review
- Security Audit
- Testing Strategy
- Bug Investigation

## Installation

### Prerequisites

- VSCode 1.100.0 or later
- GitHub Copilot extension (for chat functionality)
- Node.js 20+ (for MCP server)

### From Source

```bash
# Clone the repository with submodules
git clone --recursive https://github.com/jeremyvyska/bc-code-intelligence-vscode.git
cd bc-code-intelligence-vscode

# Install dependencies
npm install

# Build
npm run compile
```

### Development

Press F5 in VSCode to launch the Extension Development Host for testing.

## Configuration

### Layer Settings

Configure knowledge layers in VSCode settings:

```json
{
  "bcCodeIntelligence.layers.company.enabled": true,
  "bcCodeIntelligence.layers.company.url": "https://github.com/your-org/bc-standards.git",
  "bcCodeIntelligence.layers.company.branch": "main",
  "bcCodeIntelligence.layers.company.auth": "token",

  "bcCodeIntelligence.layers.project.enabled": true,
  "bcCodeIntelligence.layers.project.path": "./bc-code-intel-overrides"
}
```

### Available Settings

| Setting | Description | Default |
|---------|-------------|---------|
| `bcCodeIntelligence.layers.company.enabled` | Enable company layer | `false` |
| `bcCodeIntelligence.layers.company.url` | Git URL for company knowledge | - |
| `bcCodeIntelligence.layers.company.auth` | Auth method (none/token/ssh/azure-cli) | `none` |
| `bcCodeIntelligence.layers.team.enabled` | Enable team layer | `false` |
| `bcCodeIntelligence.layers.project.enabled` | Enable project layer | `true` |
| `bcCodeIntelligence.layers.project.path` | Path to project overrides | `./bc-code-intel-overrides` |
| `bcCodeIntelligence.codeLens.enabled` | Show inline specialist suggestions | `true` |
| `bcCodeIntelligence.developer.enableDiagnosticTools` | Enable debug tools | `false` |

## Usage

### Chat with Specialists

1. Open the GitHub Copilot Chat panel
2. Select a specialist chat mode (e.g., "Sam Coder")
3. Ask your BC/AL development questions

### Sidebar

The BC Code Intelligence sidebar provides:

- **Specialists** - Browse and activate specialists by team
- **Prompts** - Access workflow prompts
- **Layers** - View active knowledge layers

### Commands

| Command | Description |
|---------|-------------|
| `BC Code Intelligence: Switch Specialist` | Change active specialist |
| `BC Code Intelligence: Workflow Actions` | Start or manage workflows |
| `BC Code Intelligence: Open Setup Wizard` | Configure layers |

## Architecture

```
bc-code-intelligence-vscode/
├── bc-code-intelligence-mcp/          # MCP server (submodule)
│   └── embedded-knowledge/            # Knowledge base (nested submodule)
│       ├── specialists/               # Specialist definitions
│       ├── domains/                   # Knowledge topics
│       └── prompts/                   # Workflow prompts
├── src/
│   ├── extension.ts                   # Entry point
│   ├── chat/                          # Chat participant
│   ├── mcp/                           # MCP server integration
│   ├── services/                      # Core services
│   ├── tools/                         # Language Model Tools
│   ├── views/                         # Sidebar tree views
│   └── types/                         # TypeScript types
└── package.json                       # Extension manifest
```

## Contributing

Contributions are welcome! Please see the [Contributing Guide](CONTRIBUTING.md) for details.

### Creating Custom Specialists

Specialists are defined as Markdown files with YAML frontmatter:

```markdown
---
specialist_id: "custom-specialist"
title: "Custom Specialist - Your Role"
emoji: "🔧"
role: "Your specialist role"
team: "Development"
persona:
  personality: ["helpful", "thorough"]
  communication_style: "Professional and clear"
  greeting: "🔧 Hello! I'm here to help."
expertise:
  primary: ["skill-1", "skill-2"]
  secondary: ["skill-3"]
---

# Custom Specialist

Your specialist's system prompt goes here...
```

## Related Projects

- [bc-code-intelligence-mcp](https://github.com/jeremyvyska/bc-code-intelligence-mcp) - The MCP server
- [bc-code-intelligence](https://github.com/jeremyvyska/bc-code-intelligence) - Knowledge base
- [waldo.BCTelemetryBuddy](https://github.com/waldo1001/waldo.BCTelemetryBuddy) - Inspiration/reference

## License

[MIT](LICENSE)

## Acknowledgments

- Inspired by the BC development community
- Built with the [Model Context Protocol](https://modelcontextprotocol.io/)
- Reference architecture from [waldo.BCTelemetryBuddy](https://github.com/waldo1001/waldo.BCTelemetryBuddy)
