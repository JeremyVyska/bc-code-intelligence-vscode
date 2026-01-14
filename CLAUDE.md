# Claude Code Notes

## Project Overview

This is a VS Code extension for Business Central (AL) development. Key structure:

- **Root**: VS Code extension (TypeScript, esbuild bundled)
- **bc-code-intelligence-mcp/**: Git submodule - MCP server providing AI tools
- **src/chat/**: Chat participant implementations (specialists like @eva-errors, @sam-coder)
- **assets/specialists/**: YAML definitions for each specialist persona
- **scripts/**: Build helpers (agent generation, etc.)

### Build Commands
- `npm run compile` - TypeScript check
- `npm run build` - Bundle extension with esbuild
- `npx vsce package` - Create .vsix (runs prepublish: build + build:mcp + generate-agents)

### Key Concepts
- **Specialists**: AI personas with domain expertise (defined in `assets/specialists/*.yaml`)
- **MCP Server**: Provides tools for knowledge lookup, code analysis, workflows
- **Layers**: Configurable knowledge sources (local files, git repos, Azure DevOps)

### Specialists Surface Two Ways

1. **Chat Modes** (Copilot agent mode)
   - Generated `.agent.md` files in `assets/agents/`
   - Built by `scripts/generate-agents.js` from specialist YAML definitions
   - Registered via `chatAgents` in `package.json`

2. **Chat Participants** (e.g., `@eva-errors`, `@sam-coder`)
   - Implemented in `src/chat/participant.ts`
   - Dynamically registered at extension activation
   - Can invoke MCP tools during conversation
   - Tries to load specialist definition from YAML for prompt context from the .agent.md like the Chat Mode, but with a fallback system prompt

---

## VS Code Chat Participants & MCP Tools

### Tool Naming Convention
VS Code registers MCP tools with a transformed name format:
- MCP server ID: `bc-code-intelligence`
- MCP tool name: `set_workspace_info`
- VS Code tool name: `mcp_bc_code_intel_set_workspace_info`

Pattern: `mcp_` + server ID (hyphens→underscores, truncated) + `_` + tool name

### Invoking Tools from Chat Participants
When calling `vscode.lm.invokeTool()`:
1. Use the exact tool name from `vscode.lm.tools` (the `mcp_*` format)
2. Always pass `toolInvocationToken` from the chat request - required for chat participant context
3. Tool names in model responses may differ from registered names - maintain a mapping if needed

### Tool Discovery
```typescript
// Find MCP tools for your server
const mcpTools = vscode.lm.tools.filter(t => t.name.startsWith('mcp_bc_code_intel_'));
```
