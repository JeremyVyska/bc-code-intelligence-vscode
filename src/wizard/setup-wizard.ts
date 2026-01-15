import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import type { SpecialistDefinition } from '../types/index.js';
import { SpecialistLoaderService } from '../services/specialist-loader.js';

/**
 * Layer types for setup
 */
type LayerType = 'company' | 'team' | 'project';

/**
 * Authentication methods
 */
type AuthMethod = 'none' | 'token' | 'ssh' | 'azure-cli';

/**
 * Setup wizard for configuring knowledge layers
 */
export class SetupWizard {
  private specialistLoader: SpecialistLoaderService;

  constructor(private context: vscode.ExtensionContext) {
    this.specialistLoader = new SpecialistLoaderService(context.extensionPath);
    this.specialistLoader.load();
  }

  /**
   * Start the setup wizard
   */
  async start(): Promise<void> {
    // Show welcome message
    const action = await vscode.window.showQuickPick(
      [
        {
          label: '$(cloud-download) Set up Company Layer',
          description: 'Connect to a company-wide knowledge repository',
          value: 'company' as LayerType,
        },
        {
          label: '$(people) Set up Team Layer',
          description: 'Connect to a team-specific knowledge repository',
          value: 'team' as LayerType,
        },
        {
          label: '$(folder) Set up Project Layer',
          description: 'Create or configure project-local overrides',
          value: 'project' as LayerType,
        },
        {
          label: '$(comment-discussion) Install Specialist Chat Modes',
          description: 'Add specialist personas to Copilot Chat modes dropdown',
          value: 'chatmodes' as const,
        },
        {
          label: '$(settings-gear) Open Settings',
          description: 'Manually configure layer settings',
          value: 'settings' as const,
        },
      ],
      {
        placeHolder: 'Welcome to BC Code Intelligence! What would you like to set up?',
        title: 'BC Code Intelligence Setup',
      }
    );

    if (!action) return;

    if (action.value === 'settings') {
      await vscode.commands.executeCommand(
        'workbench.action.openSettings',
        'bcCodeIntelligence.layers'
      );
      return;
    }

    if (action.value === 'chatmodes') {
      await this.installChatmodes();
      return;
    }

    await this.setupLayer(action.value);
  }

  /**
   * Set up a specific layer type
   */
  private async setupLayer(layerType: LayerType): Promise<void> {
    if (layerType === 'project') {
      await this.setupProjectLayer();
    } else {
      await this.setupGitLayer(layerType);
    }
  }

  /**
   * Set up a Git-based layer (company or team)
   */
  private async setupGitLayer(layerType: LayerType): Promise<void> {
    const layerName = layerType.charAt(0).toUpperCase() + layerType.slice(1);

    // Ask if they have an existing repo
    const hasExisting = await vscode.window.showQuickPick(
      [
        {
          label: '$(link) Connect to existing repository',
          description: 'I have a Git repository with knowledge content',
          value: 'existing',
        },
        {
          label: '$(add) Create new repository',
          description: 'Help me set up a new knowledge repository',
          value: 'new',
        },
      ],
      {
        placeHolder: `Do you have an existing ${layerName} knowledge repository?`,
        title: `${layerName} Layer Setup`,
      }
    );

    if (!hasExisting) return;

    if (hasExisting.value === 'new') {
      await this.showNewRepoInstructions(layerType);
      return;
    }

    // Get repository URL
    const url = await vscode.window.showInputBox({
      prompt: `Enter the Git repository URL for your ${layerName} knowledge base`,
      placeHolder: 'https://github.com/your-org/bc-standards.git',
      validateInput: (value) => {
        if (!value) return 'URL is required';
        if (!value.match(/^(https?:\/\/|git@)/)) {
          return 'Please enter a valid Git URL (https:// or git@)';
        }
        return null;
      },
    });

    if (!url) return;

    // Get branch
    const branch = await vscode.window.showInputBox({
      prompt: 'Enter the branch name',
      value: 'main',
      placeHolder: 'main',
    });

    if (branch === undefined) return;

    // Get authentication method
    const authOptions = [
      {
        label: '$(key) Personal Access Token',
        description: 'Use a PAT stored in an environment variable',
        value: 'token' as AuthMethod,
      },
      {
        label: '$(lock) SSH Key',
        description: 'Use SSH key authentication',
        value: 'ssh' as AuthMethod,
      },
      {
        label: '$(azure) Azure CLI',
        description: 'Use Azure CLI for Azure DevOps repos',
        value: 'azure-cli' as AuthMethod,
      },
      {
        label: '$(unlock) No Authentication',
        description: 'Public repository, no auth needed',
        value: 'none' as AuthMethod,
      },
    ];

    const auth = await vscode.window.showQuickPick(authOptions, {
      placeHolder: 'How should we authenticate to this repository?',
      title: 'Authentication Method',
    });

    if (!auth) return;

    // If token auth, get the env var name
    let tokenEnvVar: string | undefined;
    if (auth.value === 'token') {
      tokenEnvVar = await vscode.window.showInputBox({
        prompt: 'Enter the environment variable name containing your access token',
        value: 'GITHUB_TOKEN',
        placeHolder: 'GITHUB_TOKEN',
      });

      if (tokenEnvVar === undefined) return;
    }

    // Save settings
    const config = vscode.workspace.getConfiguration('bcCodeIntelligence');
    const target = layerType === 'company'
      ? vscode.ConfigurationTarget.Global
      : vscode.ConfigurationTarget.Workspace;

    await config.update(`layers.${layerType}.enabled`, true, target);
    await config.update(`layers.${layerType}.url`, url, target);
    await config.update(`layers.${layerType}.branch`, branch || 'main', target);
    await config.update(`layers.${layerType}.auth`, auth.value, target);

    if (tokenEnvVar) {
      await config.update(`layers.${layerType}.tokenEnvVar`, tokenEnvVar, target);
    }

    vscode.window.showInformationMessage(
      `${layerName} layer configured successfully! The MCP server will sync the knowledge on next start.`
    );
  }

  /**
   * Set up a project layer
   */
  private async setupProjectLayer(): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showWarningMessage(
        'Please open a workspace folder before setting up a project layer.'
      );
      return;
    }

    const config = vscode.workspace.getConfiguration('bcCodeIntelligence');
    const currentPath = config.get<string>('layers.project.path', './bc-code-intel-overrides');

    // Ask about path
    const pathChoice = await vscode.window.showQuickPick(
      [
        {
          label: `$(folder) Use default: ${currentPath}`,
          description: 'Recommended location for project overrides',
          value: 'default',
        },
        {
          label: '$(pencil) Custom path',
          description: 'Choose a different location',
          value: 'custom',
        },
      ],
      {
        placeHolder: 'Where should project-specific knowledge be stored?',
        title: 'Project Layer Location',
      }
    );

    if (!pathChoice) return;

    let projectPath = currentPath;
    if (pathChoice.value === 'custom') {
      const customPath = await vscode.window.showInputBox({
        prompt: 'Enter the path for project overrides (relative to workspace)',
        value: currentPath,
        placeHolder: './bc-code-intel-overrides',
      });

      if (customPath === undefined) return;
      projectPath = customPath;
    }

    // Resolve absolute path
    const absolutePath = path.isAbsolute(projectPath)
      ? projectPath
      : path.join(workspaceFolder.uri.fsPath, projectPath);

    // Check if directory exists
    const exists = fs.existsSync(absolutePath);

    if (!exists) {
      // Offer to create it
      const create = await vscode.window.showQuickPick(
        [
          {
            label: '$(add) Create with template',
            description: 'Create folder with example structure',
            value: 'template',
          },
          {
            label: '$(folder) Create empty',
            description: 'Create an empty folder',
            value: 'empty',
          },
          {
            label: '$(x) Cancel',
            description: "Don't create the folder",
            value: 'cancel',
          },
        ],
        {
          placeHolder: `Folder "${projectPath}" does not exist. Create it?`,
          title: 'Create Project Layer',
        }
      );

      if (!create || create.value === 'cancel') return;

      if (create.value === 'template') {
        await this.scaffoldProjectLayer(absolutePath);
      } else {
        fs.mkdirSync(absolutePath, { recursive: true });
      }
    }

    // Ask about .gitignore
    const gitignorePath = path.join(workspaceFolder.uri.fsPath, '.gitignore');
    const gitignoreExists = fs.existsSync(gitignorePath);
    const relativePath = projectPath.startsWith('./') ? projectPath.slice(2) : projectPath;

    if (gitignoreExists) {
      const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
      const alreadyIgnored = gitignoreContent.includes(relativePath);

      if (!alreadyIgnored) {
        const addToGitignore = await vscode.window.showQuickPick(
          [
            {
              label: '$(git-commit) Track in Git',
              description: 'Share project overrides with the team',
              value: 'track',
            },
            {
              label: '$(eye-closed) Add to .gitignore',
              description: 'Keep project overrides private',
              value: 'ignore',
            },
          ],
          {
            placeHolder: 'Should the project layer be tracked in Git?',
            title: 'Git Tracking',
          }
        );

        if (addToGitignore?.value === 'ignore') {
          fs.appendFileSync(gitignorePath, `\n# BC Code Intelligence project overrides\n${relativePath}/\n`);
          vscode.window.showInformationMessage(`Added ${relativePath} to .gitignore`);
        }
      }
    }

    // Save settings
    await config.update('layers.project.enabled', true, vscode.ConfigurationTarget.Workspace);
    await config.update('layers.project.path', projectPath, vscode.ConfigurationTarget.Workspace);

    vscode.window.showInformationMessage(
      `Project layer configured at ${projectPath}. Add markdown files to customize knowledge for this project.`
    );
  }

  /**
   * Show instructions for creating a new knowledge repository
   */
  private async showNewRepoInstructions(layerType: LayerType): Promise<void> {
    const layerName = layerType.charAt(0).toUpperCase() + layerType.slice(1);

    const doc = await vscode.workspace.openTextDocument({
      language: 'markdown',
      content: `# Creating a ${layerName} Knowledge Repository

## Step 1: Create a Git Repository

Create a new Git repository on your preferred platform:
- **GitHub**: github.com/new
- **Azure DevOps**: dev.azure.com
- **GitLab**: gitlab.com/projects/new

## Step 2: Clone and Add Structure

\`\`\`bash
git clone <your-repo-url>
cd <repo-name>

# Create the folder structure
mkdir -p specialists domains prompts

# Create a README
echo "# ${layerName} BC Knowledge Layer" > README.md

# Create example files
cat > specialists/_template.md << 'EOF'
---
title: "Custom Specialist - Role"
specialist_id: "custom-specialist"
emoji: "🔧"
role: "Role Description"
team: "Development"
persona:
  personality: ["helpful", "thorough"]
  communication_style: "Professional"
  greeting: "🔧 Hello!"
expertise:
  primary: ["skill-1"]
  secondary: ["skill-2"]
domains: ["domain-1"]
when_to_use: ["When you need..."]
collaboration:
  natural_handoffs: []
  team_consultations: []
related_specialists: []
---

# Custom Specialist

Your specialist's knowledge and instructions go here.
EOF

# Commit and push
git add .
git commit -m "Initial layer structure"
git push origin main
\`\`\`

## Step 3: Configure in VS Code

After creating the repository, run the setup wizard again and select "Connect to existing repository".

## Folder Structure

\`\`\`
your-repo/
├── specialists/       # Custom or override specialist definitions
├── domains/          # Knowledge topics organized by domain
├── prompts/          # Custom workflow prompts
├── codelens-mappings.yaml  # Optional: custom CodeLens patterns
└── README.md
\`\`\`

## Tips

- **Override embedded specialists** by creating a file with the same \`specialist_id\`
- **Add new topics** in \`domains/\` to extend the knowledge base
- **Create workflows** in \`prompts/\` for team-specific processes
- Use the \`tspecialist\`, \`ttopic\`, and \`tworkflow\` snippets to quickly create content

When ready, run the command **BC Code Intelligence: Open Setup Wizard** again.
`,
    });

    await vscode.window.showTextDocument(doc, { preview: true });
  }

  /**
   * Scaffold a project layer with template files
   */
  private async scaffoldProjectLayer(absolutePath: string): Promise<void> {
    // Create directories
    const dirs = ['specialists', 'domains', 'prompts'];
    for (const dir of dirs) {
      fs.mkdirSync(path.join(absolutePath, dir), { recursive: true });
    }

    // Create README
    const readme = `# Project Knowledge Overrides

This folder contains project-specific knowledge for BC Code Intelligence.

## Structure

- \`specialists/\` - Override or extend specialist definitions
- \`domains/\` - Project-specific knowledge topics
- \`prompts/\` - Custom workflow prompts

## Usage

Add markdown files with YAML frontmatter to customize the knowledge base for this project.

Use the VS Code snippets (type \`tspecialist\`, \`ttopic\`, or \`tworkflow\`) to get started quickly.

## Examples

See the embedded knowledge in \`bc-code-intelligence-mcp/embedded-knowledge/\` for examples.
`;
    fs.writeFileSync(path.join(absolutePath, 'README.md'), readme);

    // Create a template specialist
    const specialistTemplate = `---
title: "Project Specialist - Local Expert"
specialist_id: "project-specialist"
emoji: "📋"
role: "Project-specific guidance"
team: "Development"

persona:
  personality: ["helpful", "project-aware"]
  communication_style: "Direct and context-aware"
  greeting: "📋 Hello! I'm your project specialist."

expertise:
  primary: ["project-patterns", "local-conventions"]
  secondary: ["team-standards"]

domains:
  - "project-overview"

when_to_use:
  - "When you need project-specific guidance"
  - "For questions about local conventions"

collaboration:
  natural_handoffs:
    - "sam-coder"
  team_consultations: []

related_specialists:
  - "sam-coder"
---

# Project Specialist 📋

I provide guidance specific to this project.

## Project Conventions

Document your project's coding conventions, patterns, and practices here.

## Key Components

List important components, tables, and codeunits here.
`;
    fs.writeFileSync(
      path.join(absolutePath, 'specialists', 'project-specialist.md'),
      specialistTemplate
    );

    vscode.window.showInformationMessage(
      `Created project layer structure at ${absolutePath}`
    );
  }

  /**
   * Install custom specialist agents from company/project layers
   *
   * NOTE: Embedded specialists (Sam, Alex, Dean, etc.) are now bundled with the extension
   * via the chatAgents contribution point in package.json. They're automatically available
   * without manual installation.
   *
   * This method handles CUSTOM specialists defined in company/project knowledge layers.
   * Uses new .agent.md format in .github/agents/ folder.
   */
  private async installChatmodes(): Promise<void> {
    const allSpecialists = this.specialistLoader.getAll();

    // Define the list of embedded specialist IDs (bundled with extension)
    const embeddedSpecialistIds = new Set([
      'sam-coder', 'alex-architect', 'dean-debug', 'eva-errors',
      'quinn-tester', 'roger-reviewer', 'seth-security', 'jordan-bridge',
      'logan-legacy', 'uma-ux', 'morgan-market', 'maya-mentor',
      'taylor-docs', 'lena-pipe', 'victor-versioning', 'parker-pragmatic', 'chris-config'
    ]);

    // Filter to get only custom specialists (from company/project layers)
    const customSpecialists = allSpecialists.filter(
      s => !embeddedSpecialistIds.has(s.specialist_id)
    );

    // If no custom specialists, show info message about bundled agents
    if (customSpecialists.length === 0) {
      const action = await vscode.window.showInformationMessage(
        `All ${embeddedSpecialistIds.size} core specialists are bundled with this extension and automatically available!\n\n` +
        `To add CUSTOM specialists, define them in your company or project knowledge layers.`,
        'Learn More',
        'Open Settings',
        'OK'
      );

      if (action === 'Learn More') {
        // Show instructions for creating custom specialists
        await this.showCustomSpecialistInstructions();
      } else if (action === 'Open Settings') {
        await vscode.commands.executeCommand(
          'workbench.action.openSettings',
          'bcCodeIntelligence.layers'
        );
      }
      return;
    }

    // If we have custom specialists, proceed with installation
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    const globalAgentsDir = path.join(homeDir, '.github', 'agents');

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const projectAgentsDir = workspaceFolder
      ? path.join(workspaceFolder.uri.fsPath, '.github', 'agents')
      : null;

    // Check existing custom agent installations
    const globalExists = fs.existsSync(globalAgentsDir) &&
      fs.readdirSync(globalAgentsDir).some(f =>
        f.endsWith('.agent.md') && !embeddedSpecialistIds.has(f.replace('.agent.md', ''))
      );
    const projectExists = projectAgentsDir && fs.existsSync(projectAgentsDir) &&
      fs.readdirSync(projectAgentsDir).some(f =>
        f.endsWith('.agent.md') && !embeddedSpecialistIds.has(f.replace('.agent.md', ''))
      );

    // Build scope options
    type ScopeOption = { label: string; description: string; value: 'global' | 'project' | 'cancel' };
    const scopeOptions: ScopeOption[] = [
      {
        label: `$(home) User Global${globalExists ? ' (update)' : ''}`,
        description: `${globalAgentsDir} - Available in all projects`,
        value: 'global',
      },
    ];

    if (workspaceFolder) {
      scopeOptions.push({
        label: `$(folder) This Project Only${projectExists ? ' (update)' : ''}`,
        description: `${projectAgentsDir} - Only for this workspace`,
        value: 'project',
      });
    }

    scopeOptions.push({
      label: '$(x) Cancel',
      description: 'Do not install agents',
      value: 'cancel',
    });

    // Ask user for scope
    const scopeChoice = await vscode.window.showQuickPick(scopeOptions, {
      placeHolder: `Install ${customSpecialists.length} custom specialist agent(s) - choose scope`,
      title: 'Install Custom Specialist Agents',
    });

    if (!scopeChoice || scopeChoice.value === 'cancel') return;

    const targetDir = scopeChoice.value === 'global' ? globalAgentsDir : projectAgentsDir!;
    const scopeLabel = scopeChoice.value === 'global' ? 'user global' : 'project';

    // Create directory
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // Generate and write agent files for custom specialists only
    let installedCount = 0;
    for (const specialist of customSpecialists) {
      const filename = `${specialist.specialist_id}.agent.md`;
      const filePath = path.join(targetDir, filename);
      const content = this.generateAgentContent(specialist);

      fs.writeFileSync(filePath, content, 'utf-8');
      installedCount++;
    }

    // Show success message
    const action = await vscode.window.showInformationMessage(
      `Installed ${installedCount} custom specialist agent(s) to ${scopeLabel} scope.\n\n` +
      `Note: ${embeddedSpecialistIds.size} core specialists are already bundled with the extension.`,
      'Open Folder',
      'Reload Window',
      'OK'
    );

    if (action === 'Open Folder') {
      const uri = vscode.Uri.file(targetDir);
      await vscode.commands.executeCommand('revealFileInOS', uri);
    } else if (action === 'Reload Window') {
      await vscode.commands.executeCommand('workbench.action.reloadWindow');
    }
  }

  /**
   * Show instructions for creating custom specialists
   */
  private async showCustomSpecialistInstructions(): Promise<void> {
    const doc = await vscode.workspace.openTextDocument({
      language: 'markdown',
      content: `# Creating Custom Specialists

## Overview

The BC Code Intelligence extension bundles 16 core specialists that are automatically
available. You can create **custom specialists** for your company or project by adding
them to your knowledge layers.

## Where Custom Specialists Go

Custom specialists are defined in your knowledge layer repositories:

- **Company Layer**: Shared across all projects in your organization
- **Team Layer**: Shared across team projects
- **Project Layer**: Specific to a single project (in \`./bc-code-intel-overrides/\`)

## Creating a Custom Specialist

1. In your layer folder, create \`specialists/your-specialist-id.md\`
2. Use YAML frontmatter to define the specialist metadata
3. Write the specialist's system prompt in the body

### Example Custom Specialist

\`\`\`markdown
---
title: "Custom Expert - Domain Specialist"
specialist_id: "custom-expert"
emoji: "🔧"
role: "Domain-specific guidance"
team: "Development"
persona:
  personality: ["helpful", "domain-focused"]
  communication_style: "Technical and precise"
  greeting: "🔧 Custom Expert here!"
expertise:
  primary: ["your-domain"]
  secondary: ["related-skills"]
domains:
  - "your-domain"
when_to_use:
  - "When you need domain-specific guidance"
collaboration:
  natural_handoffs:
    - "sam-coder"
  team_consultations: []
related_specialists:
  - "sam-coder"
---

# Custom Expert 🔧

Your specialist's detailed instructions and knowledge go here.

## Expertise Areas

Document what this specialist knows about...

## Response Patterns

How should this specialist respond to different scenarios...
\`\`\`

## After Creating Custom Specialists

1. Run **BC Code Intelligence: Install Specialist Chat Modes** to generate agent files
2. The custom specialists will be installed to your chosen scope (global or project)
3. Reload VS Code to activate the new agents

## Tips

- Use the \`tspecialist\` snippet to quickly scaffold a new specialist
- Custom specialists can reference and hand off to core specialists
- Project layer specialists override company layer specialists with the same ID
`,
    });

    await vscode.window.showTextDocument(doc, { preview: true });
  }

  /**
   * Generate agent file content for a specialist (new .agent.md format)
   * See: https://code.visualstudio.com/docs/copilot/customization/custom-agents
   */
  private generateAgentContent(specialist: SpecialistDefinition): string {
    // Build the tools list - include BC Code Intelligence MCP tools and common VS Code tools
    // The MCP tools reference must match the id in package.json mcpServerDefinitionProviders
    const tools = [
      'vscode/getProjectSetupInfo',
      'vscode/installExtension',
      'vscode/newWorkspace',
      'vscode/runCommand',
      'vscode/vscodeAPI',
      'vscode/extensions',
      'execute/getTerminalOutput',
      'execute/runTask',
      'execute/getTaskOutput',
      'execute/createAndRunTask',
      'execute/runInTerminal',
      'read/problems',
      'read/readFile',
      'read/terminalSelection',
      'read/terminalLastCommand',
      'edit',
      'search',
      'web/fetch',
      'bc-code-intelligence/*'
    ];

    // Build handoffs list for YAML (specialist IDs to hand off to)
    const handoffsYaml = specialist.collaboration.natural_handoffs
      .map(id => `  - ${id}`)
      .join('\n');

    // Build when to use section
    const whenToUse = specialist.when_to_use
      .map(use => `- ${use}`)
      .join('\n');

    // Build handoffs section with full names for display
    const handoffsList = specialist.collaboration.natural_handoffs
      .map(id => `- \`@${id}\``)
      .join('\n');

    // Build domains list
    const domainsList = specialist.domains
      .map(d => `- ${d}`)
      .join('\n');

    // Escape single quotes in description
    const escapedDescription = `${specialist.title} - ${specialist.role}`.replace(/'/g, "''");

    return `---
name: ${specialist.specialist_id}
description: '${escapedDescription}'
tools: ${JSON.stringify(tools)}
handoffs:
${handoffsYaml || '  # No handoffs defined'}
---

# ${specialist.title} ${specialist.emoji}

You are **${specialist.title}**, a specialized assistant for Business Central AL development.

## CRITICAL: First Actions on EVERY Request

**MANDATORY FIRST STEP** - Before responding to ANY user message:

1. **Call \`mcp_bc_code_intelligence__ask_bc_expert\`** with:
   - \`question\`: The user's actual question/request
   - \`preferred_specialist\`: "${specialist.specialist_id}"
   - This loads your FULL specialist persona, instructions, and provides expert guidance

2. **Then search for relevant knowledge** using \`mcp_bc_code_intelligence__find_bc_knowledge\`

3. **Get detailed topics** with \`mcp_bc_code_intelligence__get_bc_topic\` when you find relevant results

**CRITICAL**: The MCP tools contain your actual expertise and instructions. Without calling them, you're just role-playing without real knowledge. ALWAYS call \`ask_bc_expert\` first!

## Your Role

- **Title**: ${specialist.title}
- **Role**: ${specialist.role}
- **Greeting**: "${specialist.persona.greeting}"
- **Communication Style**: ${specialist.persona.communication_style}
- **Personality**: ${specialist.persona.personality.join(', ')}

## Your Expertise Areas

**Primary Skills**: ${specialist.expertise.primary.join(', ')}

**Secondary Skills**: ${specialist.expertise.secondary.join(', ')}

## Your Knowledge Domains

${domainsList}

## When Users Should Consult You

${whenToUse}

## Available MCP Tools - YOU MUST USE THESE!

### PRIMARY TOOL (Call First on Every Request!)
- **\`mcp_bc_code_intelligence__ask_bc_expert\`** - **ALWAYS CALL THIS FIRST!**
  - Parameters: \`{ question: "user's question", preferred_specialist: "${specialist.specialist_id}" }\`
  - Returns: Your full specialist instructions, persona, expertise, and tailored guidance
  - This is how you GET your actual knowledge - without it you're just pretending!

### Knowledge Tools
- **\`mcp_bc_code_intelligence__find_bc_knowledge\`** - Search the knowledge base for relevant topics
- **\`mcp_bc_code_intelligence__get_bc_topic\`** - Get detailed content on a specific topic
- **\`mcp_bc_code_intelligence__list_specialists\`** - See all available specialists

### Analysis Tools
- **\`mcp_bc_code_intelligence__analyze_al_code\`** - Analyze AL code for patterns, issues, and improvements

### Workflow Tools - USE FOR STRUCTURED TASKS!
- **\`mcp_bc_code_intelligence__start_bc_workflow\`** - Start a structured workflow
- **\`mcp_bc_code_intelligence__advance_workflow\`** - Move to the next phase of an active workflow
- **\`mcp_bc_code_intelligence__get_workflow_help\`** - Get help with current workflow phase

**Available Workflows** (detect from user intent and START automatically):
| User Says | Workflow Type | Description |
|-----------|---------------|-------------|
| "review", "code review", "check this" | \`review-bc-code\` | Systematic code quality review |
| "new app", "create", "start project" | \`new-bc-app\` | New BC application development |
| "enhance", "add feature", "improve" | \`enhance-bc-app\` | Add features to existing app |
| "upgrade", "update BC version" | \`upgrade-bc-version\` | BC version migration |
| "debug", "fix", "troubleshoot" | \`debug-bc-issues\` | Systematic debugging |
| "document", "docs", "help text" | \`document-bc-solution\` | Documentation creation |
| "modernize", "refactor", "clean up" | \`modernize-bc-code\` | Code modernization |
| "onboard", "new developer", "learn" | \`onboard-developer\` | Developer onboarding |
| "took over", "inherited", "understand app" | \`app_takeover\` | App takeover/analysis |

**IMPORTANT**: When user intent matches a workflow, call \`start_bc_workflow\` IMMEDIATELY with the appropriate workflow_type!

## Collaboration - Hand Off When Needed

When a question falls outside your expertise, suggest consulting these specialists:
${handoffsList || '- (None specified)'}

Use \`mcp_bc_code_intelligence__ask_bc_expert\` to get their perspective, or suggest the user switch to that specialist.

## Response Guidelines

1. **Always greet with your persona**: Start responses with your greeting "${specialist.persona.greeting}"
2. **DETECT WORKFLOW INTENT**: If user mentions "review", "debug", "new app", "refactor", etc. - START the matching workflow immediately!
3. **Use your communication style**: ${specialist.persona.communication_style}
4. **Search knowledge first**: Before answering complex questions, search the knowledge base
5. **Cite your sources**: Reference the topic IDs when providing knowledge-based answers
6. **Stay in character**: Maintain your specialist persona throughout the conversation

## Specialist-Specific Instructions

${specialist.systemPrompt}

---
*Custom agent for BC Code Intelligence - ${specialist.title}*
`;
  }

  /**
   * Public method for direct command access
   */
  public async installChatmodesPublic(): Promise<void> {
    await this.installChatmodes();
  }
}

/**
 * Register the setup wizard commands
 */
export function registerSetupWizard(context: vscode.ExtensionContext): vscode.Disposable {
  const wizard = new SetupWizard(context);
  const disposables: vscode.Disposable[] = [];

  // Main setup wizard command
  disposables.push(
    vscode.commands.registerCommand('bcCodeIntelligence.openSetupWizard', () => {
      wizard.start();
    })
  );

  // Direct chatmodes installation command
  disposables.push(
    vscode.commands.registerCommand('bcCodeIntelligence.installChatmodes', () => {
      wizard.installChatmodesPublic();
    })
  );

  return vscode.Disposable.from(...disposables);
}
