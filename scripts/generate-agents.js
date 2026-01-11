/**
 * Generate bundled .agent.md files from embedded specialist definitions
 *
 * This script reads the specialist markdown files from embedded-knowledge/specialists/
 * and generates corresponding .agent.md files in assets/agents/ for VS Code's
 * chatAgents contribution point.
 *
 * Run: node scripts/generate-agents.js
 */

const fs = require('fs');
const path = require('path');
const yaml = require('yaml');

const SPECIALISTS_DIR = path.join(__dirname, '..', 'bc-code-intelligence-mcp', 'embedded-knowledge', 'specialists');
const AGENTS_DIR = path.join(__dirname, '..', 'assets', 'agents');

/**
 * Parse a specialist markdown file with YAML frontmatter
 */
function parseSpecialistFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');

  // Split frontmatter from body
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    throw new Error(`Invalid frontmatter in ${filePath}`);
  }

  const frontmatter = yaml.parse(match[1]);
  const systemPrompt = match[2].trim();

  return {
    ...frontmatter,
    systemPrompt,
  };
}

/**
 * Convert specialist_id to Camel-Case for better UI display
 * e.g., "alex-architect" -> "Alex-Architect"
 */
function toCamelCase(id) {
  return id.split('-').map(part =>
    part.charAt(0).toUpperCase() + part.slice(1)
  ).join('-');
}

// Handoffs removed - VS Code shows handoff buttons after EVERY message which is too noisy

/**
 * Generate agent file content for a specialist
 *
 * IMPORTANT: These agent files are THIN SHIMS that instruct Copilot to fetch
 * the real specialist instructions from the MCP. We do NOT duplicate the full
 * specialist content here - that would create maintenance nightmares.
 */
function generateAgentContent(specialist) {
  // Build the tools list - include BC Code Intelligence MCP tools and common VS Code tools
  const tools = [
    'vscode/getProjectSetupInfo',
    'vscode/runCommand',
    'vscode/vscodeAPI',
    'execute/getTerminalOutput',
    'execute/runTask',
    'execute/runInTerminal',
    'read/problems',
    'read/readFile',
    'read/terminalSelection',
    'edit',
    'search',
    'bc-code-intelligence/*'
  ];

  // Convert to Camel-Case for display
  const agentName = toCamelCase(specialist.specialist_id);

  // Escape single quotes in description
  const escapedDescription = `${specialist.title} - ${specialist.role}`.replace(/'/g, "''");

  // Generate a LEAN agent file - a simple checklist that directs the agent to discover
  // capabilities from the MCP rather than hardcoding workflow knowledge here
  return `---
name: ${agentName}
description: '${escapedDescription}'
tools: ${JSON.stringify(tools)}
---

# ${specialist.title} ${specialist.emoji}

You are **${specialist.title}**, a Business Central AL development specialist.

## Startup Checklist

**For EVERY conversation, complete these steps in order:**

1. **Initialize workspace context:**
   \`\`\`
   vscode/getProjectSetupInfo  ->  set_workspace_info({ workspace_path: "..." })
   \`\`\`
   This loads company/project knowledge layers. Do this FIRST.

2. **Load your persona and instructions:**
   \`\`\`
   ask_bc_expert({ question: "<user's question>", preferred_specialist: "${specialist.specialist_id}" })
   \`\`\`
   Follow ALL instructions returned, including any workflow suggestions.

3. **Discover available workflows:**
   \`\`\`
   workflow_list()
   \`\`\`
   ALWAYS call this exact tool (NOT list_specialists). Review the returned workflows and either:
   - Start a matching workflow with \`workflow_start\`, OR
   - Offer the user a choice if multiple could apply, OR
   - Explain why you're proceeding without a workflow if none fit

## Your MCP Tools

| Tool | When to Use |
|------|-------------|
| \`set_workspace_info\` | First call - initializes layers for this workspace |
| \`ask_bc_expert\` | Second call - loads your full instructions |
| \`workflow_list\` | Discover available structured workflows |
| \`workflow_start\` | Begin a workflow (pass \`workflow_type\` from list) |
| \`find_bc_knowledge\` | Search for BC topics and patterns |
| \`get_bc_topic\` | Get full content of a specific topic |
| \`analyze_al_code\` | Analyze code (use \`workspace_path\` or \`file_path\`) |

## Quick Reference

- **Greeting**: "${specialist.persona?.greeting || ''}"
- **Role**: ${specialist.role}

## Critical Rules

- **NEVER** pass \`code: "workspace"\` to analyze_al_code - use actual file paths
- **ALWAYS** call set_workspace_info before other MCP tools
- **ALWAYS** follow instructions returned by ask_bc_expert
- **ALWAYS** call workflow_list (not just consider it - actually call the tool)

---
*This agent discovers its capabilities from the BC Code Intelligence MCP*
`;
}

/**
 * Main function
 */
function main() {
  console.log('Generating bundled agent files...\n');

  // Ensure output directory exists
  if (!fs.existsSync(AGENTS_DIR)) {
    fs.mkdirSync(AGENTS_DIR, { recursive: true });
    console.log(`Created directory: ${AGENTS_DIR}`);
  }

  // Read all specialist files
  const files = fs.readdirSync(SPECIALISTS_DIR).filter(f => f.endsWith('.md'));
  console.log(`Found ${files.length} specialist files\n`);

  const agents = [];

  for (const file of files) {
    try {
      const filePath = path.join(SPECIALISTS_DIR, file);
      const specialist = parseSpecialistFile(filePath);

      // Generate agent content
      const agentContent = generateAgentContent(specialist);

      // Use Camel-Case for filename
      const agentName = toCamelCase(specialist.specialist_id);
      const agentFilename = `${agentName}.agent.md`;
      const agentPath = path.join(AGENTS_DIR, agentFilename);
      fs.writeFileSync(agentPath, agentContent, 'utf-8');

      console.log(`  Generated: ${agentFilename}`);

      // Collect agent info for package.json
      agents.push({
        name: agentName,
        path: `./assets/agents/${agentFilename}`,
        description: `${specialist.title} - ${specialist.role}`
      });

    } catch (error) {
      console.error(`  ERROR processing ${file}: ${error.message}`);
    }
  }

  console.log(`\nGenerated ${agents.length} agent files`);

  // Output the chatAgents JSON for package.json
  console.log('\n--- chatAgents for package.json ---\n');
  console.log(JSON.stringify(agents, null, 2));

  // Write the chatAgents config to a temp file for easy copy
  const configPath = path.join(__dirname, 'chatAgents.json');
  fs.writeFileSync(configPath, JSON.stringify(agents, null, 2));
  console.log(`\nWrote chatAgents config to: ${configPath}`);
}

main();
