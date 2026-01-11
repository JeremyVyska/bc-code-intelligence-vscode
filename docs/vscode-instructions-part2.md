# BC Code Intelligence VSCode Extension - Part 2: Enhancements

This document covers additional features beyond the core MVP (see [vscode-instructions.md](vscode-instructions.md)).

---

## Approved Enhancements

### 1. Status Bar Indicator

Show the active specialist and workflow state in the status bar.

**Display States:**
```
[⚡ Sam Coder] [▶ Start Workflow]     ← No active workflow
[⚡ Sam Coder] [📋 Review 2/4]        ← Workflow in progress (phase 2 of 4)
[⚡ Sam Coder] [✓ Review Complete]   ← Workflow just finished
```

**Features:**
- **Specialist indicator**: Display as `[emoji] [name]`, click to switch specialists
- **Workflow indicator**: Shows current workflow state, click for workflow actions

**Click behaviors:**
| State | Click Action |
|-------|--------------|
| No workflow | Quick Pick to select and start a workflow |
| Workflow active | Menu: "View Progress", "Advance Phase", "Abandon Workflow" |
| Workflow complete | Quick Pick to start another or dismiss |

**Implementation:**
```typescript
// Two status bar items side by side
const specialistStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 101);
const workflowStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);

specialistStatusBar.command = 'bcCodeIntelligence.switchSpecialist';
workflowStatusBar.command = 'bcCodeIntelligence.workflowAction';

specialistStatusBar.show();
workflowStatusBar.show();

function updateSpecialistStatus(specialist: SpecialistDefinition) {
  specialistStatusBar.text = `${specialist.emoji} ${specialist.name}`;
  specialistStatusBar.tooltip = `Active: ${specialist.name}\nClick to switch`;
}

function updateWorkflowStatus(workflow: WorkflowSession | null) {
  if (!workflow) {
    workflowStatusBar.text = '$(play) Start Workflow';
    workflowStatusBar.tooltip = 'Click to start a workflow';
  } else if (workflow.status === 'complete') {
    workflowStatusBar.text = `$(check) ${workflow.name} Complete`;
    workflowStatusBar.tooltip = 'Workflow finished. Click for options.';
  } else {
    workflowStatusBar.text = `$(list-ordered) ${workflow.name} ${workflow.currentPhase}/${workflow.totalPhases}`;
    workflowStatusBar.tooltip = `Phase: ${workflow.currentPhaseName}\nClick for workflow options`;
  }
}

// Quick Pick for switching specialists
vscode.commands.registerCommand('bcCodeIntelligence.switchSpecialist', async () => {
  const specialists = await getLoadedSpecialists();

  const selected = await vscode.window.showQuickPick(
    specialists.map(s => ({
      label: `${s.emoji} ${s.name}`,
      description: s.role,
      specialist: s
    })),
    { placeHolder: 'Switch to specialist...' }
  );

  if (selected) {
    await activateSpecialist(selected.specialist);
    updateSpecialistStatus(selected.specialist);
  }
});

// Workflow actions
vscode.commands.registerCommand('bcCodeIntelligence.workflowAction', async () => {
  const workflow = await getCurrentWorkflow();

  if (!workflow) {
    // No active workflow - show workflow picker
    const prompts = await mcpClient.callTool('list_prompts', { type: 'workflow' });
    const selected = await vscode.window.showQuickPick(
      prompts.map(p => ({
        label: p.name,
        description: p.description,
        prompt: p
      })),
      { placeHolder: 'Select a workflow to start...' }
    );

    if (selected) {
      const session = await mcpClient.callTool('start_bc_workflow', {
        workflow_type: selected.prompt.id
      });
      updateWorkflowStatus(session);
    }
  } else {
    // Active workflow - show action menu
    const action = await vscode.window.showQuickPick([
      { label: '$(eye) View Progress', action: 'view' },
      { label: '$(arrow-right) Advance to Next Phase', action: 'advance' },
      { label: '$(question) Get Phase Help', action: 'help' },
      { label: '$(close) Abandon Workflow', action: 'abandon' }
    ], { placeHolder: `${workflow.name} - Phase ${workflow.currentPhase}/${workflow.totalPhases}` });

    if (action) {
      switch (action.action) {
        case 'view':
          // Show workflow progress panel
          await showWorkflowProgress(workflow);
          break;
        case 'advance':
          const advanced = await mcpClient.callTool('advance_workflow', { session_id: workflow.id });
          updateWorkflowStatus(advanced);
          break;
        case 'help':
          const help = await mcpClient.callTool('get_workflow_help', { session_id: workflow.id });
          // Show help in chat or panel
          break;
        case 'abandon':
          await abandonWorkflow(workflow.id);
          updateWorkflowStatus(null);
          break;
      }
    }
  }
});
```

**package.json contribution:**
```json
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
  }
]
```

**Effort:** ~4-5 hours

---

### 2. Setup Wizard with Layer Bootstrapping

A guided wizard that helps users both connect to existing layers AND bootstrap new ones.

**Wizard Flow:**

```
┌─────────────────────────────────────────────────────────────┐
│  Welcome to BC Code Intelligence!                           │
│                                                             │
│  Let's set up your knowledge layers.                        │
│                                                             │
│  ○ Embedded layer is already active (16 specialists)        │
│                                                             │
│  Would you like to set up additional layers?                │
│                                                             │
│  [Set up Company Layer]  [Set up Project Layer]  [Skip]     │
└─────────────────────────────────────────────────────────────┘
```

#### Company Layer Flow

```
┌─────────────────────────────────────────────────────────────┐
│  Company Layer Setup                                        │
│                                                             │
│  Do you have an existing company knowledge repo?            │
│                                                             │
│  [Yes, connect to existing]    [No, help me create one]     │
└─────────────────────────────────────────────────────────────┘
```

**Path A: Connect to Existing**
1. Enter Git URL
2. Select auth method (Token, SSH, Azure CLI)
3. Wizard validates repo structure via MCP `validate_layer_repo` tool
4. If valid → Configure and sync
5. If invalid → Offer to scaffold missing folders

**Path B: Create New**
1. Instructions: "Create an empty Git repo and paste the URL"
2. User provides URL
3. Wizard detects Git provider (GitHub, Azure DevOps, GitLab)
4. Wizard clones repo locally (temp)
5. Wizard scaffolds structure via MCP `scaffold_layer_repo` tool
6. Wizard commits and pushes
7. Configure auth in VSCode settings

#### Project Layer Flow

```
┌─────────────────────────────────────────────────────────────┐
│  Project Layer Setup                                        │
│                                                             │
│  Project layers store workspace-specific knowledge.         │
│  Default location: ./bc-code-intel-overrides/               │
│                                                             │
│  [Create project layer]    [Use custom path]    [Skip]      │
└─────────────────────────────────────────────────────────────┘
```

**Create Project Layer:**
1. Scaffold directly in workspace (no Git needed)
2. Create folder structure
3. Add to .gitignore option (if user wants private overrides)
4. Optionally walk through creating first content

#### Settings Scope

The wizard saves settings to appropriate VSCode scopes:

| Layer | Scope | Rationale |
|-------|-------|-----------|
| Company | **User** (`ConfigurationTarget.Global`) | Applies across all workspaces; auth tokens are personal |
| Team | **Workspace** (`ConfigurationTarget.Workspace`) | May vary by project/client |
| Project | **Workspace** (`ConfigurationTarget.Workspace`) | Path is relative to workspace |

For multi-root workspaces, Team and Project layers use **Folder** scope (`ConfigurationTarget.WorkspaceFolder`).

The wizard should explain this to users:
> "Company layer settings will be saved to your user profile and apply to all your workspaces."
> "Project layer settings will be saved to this workspace only."

#### Scaffolded Structure

Both company and project layers get this structure:

```
/specialists/           # Custom or override specialists
  /_template.md         # Template for creating new specialists
/domains/               # Knowledge topics by domain
  /_template.md         # Template for creating new topics
/prompts/               # Workflow prompts
  /_template.md         # Template for creating prompts
/indexes/               # Optional tag indexes
README.md               # Instructions for contributors
layer-config.yaml       # Layer metadata (name, priority, etc.)
```

#### MCP Tools Required

These tools should be added to the MCP server to support the wizard:

```typescript
// Validate an existing layer repo has correct structure
{
  name: 'validate_layer_repo',
  description: 'Check if a repository has valid layer structure',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Local path to repo' }
    },
    required: ['path']
  }
}
// Returns: { valid: boolean, missing: string[], suggestions: string[] }

// Scaffold a new layer with required structure
{
  name: 'scaffold_layer_repo',
  description: 'Create layer folder structure with templates',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Target path' },
      layer_type: { type: 'string', enum: ['company', 'team', 'project'] },
      layer_name: { type: 'string', description: 'Display name for layer' },
      include_examples: { type: 'boolean', default: true }
    },
    required: ['path', 'layer_type', 'layer_name']
  }
}
// Creates folders, templates, README, layer-config.yaml

// Helper to create properly-formatted content
{
  name: 'create_layer_content',
  description: 'Create a new topic, specialist, or prompt in a layer',
  inputSchema: {
    type: 'object',
    properties: {
      layer_path: { type: 'string' },
      content_type: { type: 'string', enum: ['topic', 'specialist', 'prompt'] },
      name: { type: 'string' },
      metadata: { type: 'object' }  // Type-specific fields
    },
    required: ['layer_path', 'content_type', 'name']
  }
}
```

#### Webview Implementation

Use a multi-step webview wizard (similar to BCTelemetryBuddy's SetupWizardProvider):

```typescript
class LayerSetupWizardProvider implements vscode.WebviewViewProvider {
  private currentStep: 'welcome' | 'company' | 'project' | 'complete' = 'welcome';

  resolveWebviewView(webviewView: vscode.WebviewView) {
    webviewView.webview.html = this.getHtmlForStep(this.currentStep);

    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case 'setupCompanyLayer':
          await this.handleCompanyLayerSetup(message.data);
          break;
        case 'setupProjectLayer':
          await this.handleProjectLayerSetup(message.data);
          break;
        case 'scaffoldRepo':
          await this.scaffoldRepository(message.data);
          break;
        case 'validateRepo':
          const result = await mcpClient.callTool('validate_layer_repo', message.data);
          webviewView.webview.postMessage({ command: 'validationResult', result });
          break;
      }
    });
  }

  private async scaffoldRepository(data: { url: string; layerType: string; name: string }) {
    // Clone to temp, scaffold, commit, push
    const tempPath = await this.cloneToTemp(data.url);
    await mcpClient.callTool('scaffold_layer_repo', {
      path: tempPath,
      layer_type: data.layerType,
      layer_name: data.name,
      include_examples: true
    });
    await this.commitAndPush(tempPath, 'Initial layer structure');
    await this.cleanup(tempPath);
  }
}
```

**package.json contribution:**
```json
"commands": [
  {
    "command": "bcCodeIntelligence.openSetupWizard",
    "title": "Open Setup Wizard",
    "category": "BC Code Intelligence"
  }
],
"walkthroughs": [
  {
    "id": "bcCodeIntelligence.welcome",
    "title": "Get Started with BC Code Intelligence",
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
```

**Effort:** ~10-14 hours (wizard UI + MCP tools + Git operations)

---

### 3. Tree View Sidebar

A dedicated sidebar panel for browsing specialists, prompts, and layers.

**Structure:**
```
BC CODE INTELLIGENCE
├── Specialists
│   ├── Development (7)
│   │   ├── ⚡ Sam Coder
│   │   ├── 🤖 Casey Copilot
│   │   ├── ⚙️ Chris Config
│   │   ├── 👩‍🏫 Maya Mentor
│   │   ├── 🤝 Parker Pragmatic
│   │   ├── 📚 Taylor Docs
│   │   └── 🎨 Uma UX
│   ├── Quality & Testing (5)
│   │   ├── 🔍 Dean Debug
│   │   ├── ⚠️ Eva Errors
│   │   ├── 🧪 Quinn Tester
│   │   ├── 📝 Roger Reviewer
│   │   └── 🔒 Seth Security
│   ├── Planning & Analysis (2)
│   │   ├── 🏗️ Alex Architect
│   │   └── 🏛️ Logan Legacy
│   └── Integration & Business (2)
│       ├── 🌉 Jordan Bridge
│       └── 🏪 Morgan Market
├── Prompts
│   ├── Embedded (14)
│   ├── Company (3)
│   └── Project (2)
└── Layers
    ├── ✓ Embedded
    ├── ✓ Company
    └── ✓ Project
```

**Features:**
- Specialists grouped by existing `team` field in frontmatter
- Click specialist to activate as current chat mode
- Click prompt to execute it
- Layers show active/inactive status
- Context menu actions (e.g., "Open in Editor" for prompts)

**package.json contribution:**
```json
"contributes": {
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
  }
}
```

**Implementation:**
```typescript
class SpecialistsTreeDataProvider implements vscode.TreeDataProvider<SpecialistTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<SpecialistTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  async getChildren(element?: SpecialistTreeItem): Promise<SpecialistTreeItem[]> {
    if (!element) {
      // Root level: return team groups
      const specialists = await mcpClient.callTool('list_specialists', {});
      const teams = this.groupByTeam(specialists);
      return Object.keys(teams).map(team => new SpecialistTreeItem(
        team,
        `(${teams[team].length})`,
        vscode.TreeItemCollapsibleState.Collapsed,
        'team'
      ));
    }

    if (element.type === 'team') {
      // Team level: return specialists in that team
      const specialists = await mcpClient.callTool('list_specialists', { team: element.label });
      return specialists.map(s => new SpecialistTreeItem(
        `${s.emoji} ${s.name}`,
        s.role,
        vscode.TreeItemCollapsibleState.None,
        'specialist',
        s
      ));
    }

    return [];
  }

  getTreeItem(element: SpecialistTreeItem): vscode.TreeItem {
    return element;
  }

  private groupByTeam(specialists: SpecialistDefinition[]): Record<string, SpecialistDefinition[]> {
    return specialists.reduce((acc, s) => {
      const team = s.team || 'Other';
      if (!acc[team]) acc[team] = [];
      acc[team].push(s);
      return acc;
    }, {} as Record<string, SpecialistDefinition[]>);
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }
}

class SpecialistTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly description: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly type: 'team' | 'specialist',
    public readonly specialist?: SpecialistDefinition
  ) {
    super(label, collapsibleState);
    this.tooltip = specialist?.role || label;

    if (type === 'specialist' && specialist) {
      this.command = {
        command: 'bcCodeIntelligence.activateSpecialist',
        title: 'Activate Specialist',
        arguments: [specialist]
      };
      this.contextValue = 'specialist';
    }
  }
}

// Register the tree view
const specialistsProvider = new SpecialistsTreeDataProvider();
vscode.window.registerTreeDataProvider('bcCodeIntelligence.specialists', specialistsProvider);

// Similar providers for Prompts and Layers...
```

**Context Menu Actions:**
```json
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
}
```

**Effort:** ~6-8 hours

---

### 4. CodeLens Integration

Show inline specialist suggestions above AL code elements based on pattern matching.

**Example display:**
```al
// Above an Error() call:
[⚠️ Ask Eva about ErrorInfo]
Error(CustomerNotFoundLbl, CustomerNo);

// Above an event subscriber:
[🌉 Review with Jordan]
[EventSubscriber(ObjectType::Codeunit, Codeunit::"Sales-Post", 'OnBeforePostSalesDoc', '', false, false)]
local procedure HandleOnBeforePostSalesDoc(...)
```

**Architecture: Centralized Mapping Files**

Rather than bloating specialist frontmatter, use a dedicated `codelens-mappings.yaml` in each layer:

```yaml
# embedded-knowledge/codelens-mappings.yaml
mappings:
  - pattern: "\\bError\\s*\\("
    specialist: eva-errors
    label: "Ask Eva about ErrorInfo"

  - pattern: "\\bMessage\\s*\\("
    specialist: eva-errors
    label: "Review messaging with Eva"

  - pattern: "OnBefore|OnAfter|\\[EventSubscriber"
    specialist: jordan-bridge
    label: "Review with Jordan"

  - pattern: "TableData|RIMD|Permissions"
    specialist: seth-security
    label: "Security review with Seth"

  - pattern: "\\[Test\\]"
    specialist: quinn-tester
    label: "Ask Quinn about testing"

  - pattern: "HttpClient|WebServiceActionContext"
    specialist: jordan-bridge
    label: "Integration review with Jordan"
```

**Layer Merge Behavior:**
- All patterns from all active layers are combined (additive)
- If same pattern appears in multiple layers, higher priority layer wins
- Company/project layers can add domain-specific patterns

**Dynamic Refresh on Layer Changes:**

CodeLens supports dynamic refresh via the `onDidChangeCodeLenses` event:

```typescript
class BCCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  private mappings: CodeLensMapping[] = [];

  constructor(private mcpClient: McpClient) {
    // Reload mappings when layers change
    mcpClient.onLayersChanged(() => {
      this.loadMappings();
      this._onDidChangeCodeLenses.fire(); // Triggers VSCode to re-request CodeLens
    });
  }

  private async loadMappings() {
    // Get merged mappings from all active layers
    const result = await this.mcpClient.callTool('get_codelens_mappings', {});
    this.mappings = result.mappings;
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    if (document.languageId !== 'al') return [];

    const lenses: vscode.CodeLens[] = [];
    const text = document.getText();

    for (const mapping of this.mappings) {
      const regex = new RegExp(mapping.pattern, 'g');
      let match;

      while ((match = regex.exec(text))) {
        // Skip matches inside comments
        const line = document.positionAt(match.index).line;
        const lineText = document.lineAt(line).text;
        if (this.isInsideComment(lineText, match.index - document.offsetAt(new vscode.Position(line, 0)))) {
          continue;
        }

        const range = new vscode.Range(line, 0, line, 0);

        lenses.push(new vscode.CodeLens(range, {
          title: `${mapping.specialistEmoji} ${mapping.label}`,
          command: 'bcCodeIntelligence.askSpecialistAboutCode',
          arguments: [document.uri, range, mapping.specialist]
        }));
      }
    }

    return lenses;
  }

  private isInsideComment(lineText: string, charIndex: number): boolean {
    const commentStart = lineText.indexOf('//');
    return commentStart !== -1 && charIndex > commentStart;
  }

  refresh(): void {
    this._onDidChangeCodeLenses.fire();
  }
}

// Register for AL files
const codeLensProvider = new BCCodeLensProvider(mcpClient);
vscode.languages.registerCodeLensProvider(
  { language: 'al' },
  codeLensProvider
);

// Command to handle CodeLens clicks
vscode.commands.registerCommand('bcCodeIntelligence.askSpecialistAboutCode',
  async (uri: vscode.Uri, range: vscode.Range, specialistId: string) => {
    // Get the code around the clicked location
    const document = await vscode.workspace.openTextDocument(uri);
    const codeContext = getCodeContext(document, range);

    // Switch to specialist and start conversation with code context
    await activateSpecialist(specialistId);
    await startChatWithContext(codeContext);
  }
);
```

**MCP Tool for Mapping Retrieval:**

```typescript
{
  name: 'get_codelens_mappings',
  description: 'Get merged CodeLens mappings from all active layers',
  inputSchema: {
    type: 'object',
    properties: {},
    required: []
  }
}
// Returns: { mappings: CodeLensMapping[] }
// Each mapping includes: pattern, specialist, label, specialistEmoji
```

**Settings:**

```json
"bcCodeIntelligence.codeLens.enabled": {
  "type": "boolean",
  "default": true,
  "description": "Show specialist suggestions inline in AL code"
},
"bcCodeIntelligence.codeLens.maxPerFile": {
  "type": "number",
  "default": 20,
  "description": "Maximum number of CodeLens items per file (0 = unlimited)"
}
```

**package.json contribution:**
```json
"contributes": {
  "configuration": {
    "properties": {
      "bcCodeIntelligence.codeLens.enabled": {
        "type": "boolean",
        "default": true,
        "description": "Show specialist suggestions inline in AL code"
      }
    }
  }
}
```

**Effort:** ~8-12 hours (provider + MCP tool + mapping file in embedded-knowledge)

---

### 5. Layer Content Snippets

Provide VSCode snippets for authoring layer content (specialists, topics, prompts). Similar to how AL extension provides `ttable`, `tcodeunit`, etc.

**Snippet Prefixes:**

| Prefix | Description |
|--------|-------------|
| `tspecialist` | Full specialist definition with frontmatter |
| `ttopic` | Knowledge topic with frontmatter |
| `tworkflow` | Multi-phase workflow prompt |
| `tprompt` | Simple prompt (non-workflow) |
| `tcodelens` | CodeLens mapping entry (for YAML files) |

**package.json contribution:**

```json
"contributes": {
  "snippets": [
    {
      "language": "markdown",
      "path": "./snippets/bc-layer-content.json"
    },
    {
      "language": "yaml",
      "path": "./snippets/bc-layer-yaml.json"
    }
  ]
}
```

**Snippet File: snippets/bc-layer-content.json**

```json
{
  "BC Specialist Definition": {
    "prefix": "tspecialist",
    "description": "BC Code Intelligence Specialist definition with full frontmatter",
    "body": [
      "---",
      "title: \"${1:Specialist Name} - ${2:Role Title}\"",
      "specialist_id: \"${3:specialist-id}\"",
      "emoji: \"${4:🔧}\"",
      "role: \"${2:Role Title}\"",
      "team: \"${5|Development,Quality & Testing,Planning & Analysis,Integration & Business|}\"",
      "",
      "persona:",
      "  personality: [\"${6:helpful}\", \"${7:knowledgeable}\", \"${8:thorough}\"]",
      "  communication_style: \"${9:Clear and professional}\"",
      "  greeting: \"${4:🔧} ${10:Hello! I'm here to help.}\"",
      "",
      "expertise:",
      "  primary: [\"${11:primary-skill-1}\", \"${12:primary-skill-2}\"]",
      "  secondary: [\"${13:secondary-skill-1}\"]",
      "",
      "domains:",
      "  - \"${14:domain-1}\"",
      "  - \"${15:domain-2}\"",
      "",
      "when_to_use:",
      "  - \"${16:When you need help with...}\"",
      "  - \"${17:For questions about...}\"",
      "",
      "collaboration:",
      "  natural_handoffs:",
      "    - \"${18:specialist-id}\"",
      "  team_consultations:",
      "    - \"${19:specialist-id}\"",
      "",
      "related_specialists:",
      "  - \"${20:specialist-id}\"",
      "---",
      "",
      "# ${1:Specialist Name} - ${2:Role Title} ${4:🔧}",
      "",
      "## Overview",
      "",
      "${21:Describe what this specialist helps with.}",
      "",
      "## Expertise Areas",
      "",
      "- ${22:Area 1}",
      "- ${23:Area 2}",
      "",
      "## Approach",
      "",
      "${24:How this specialist approaches problems and provides guidance.}",
      ""
    ]
  },

  "BC Knowledge Topic": {
    "prefix": "ttopic",
    "description": "BC Code Intelligence knowledge topic with frontmatter",
    "body": [
      "---",
      "title: \"${1:Topic Title}\"",
      "topic_id: \"${2:topic-id}\"",
      "tags: [\"${3:tag1}\", \"${4:tag2}\", \"${5:tag3}\"]",
      "specialists: [\"${6:sam-coder}\"]",
      "bc_versions: [\"${7|BC22+,BC21+,BC20+,All|}\"]",
      "difficulty: \"${8|beginner,intermediate,advanced|}\"",
      "---",
      "",
      "# ${1:Topic Title}",
      "",
      "## Overview",
      "",
      "${9:Brief description of this topic and why it matters.}",
      "",
      "## Key Concepts",
      "",
      "### ${10:Concept 1}",
      "",
      "${11:Explanation of the first key concept.}",
      "",
      "### ${12:Concept 2}",
      "",
      "${13:Explanation of the second key concept.}",
      "",
      "## Best Practices",
      "",
      "1. **${14:Practice 1}**: ${15:Description}",
      "2. **${16:Practice 2}**: ${17:Description}",
      "",
      "## Code Examples",
      "",
      "```al",
      "procedure ${18:ExampleProcedure}()",
      "begin",
      "    ${19:// Your code here}",
      "end;",
      "```",
      "",
      "## Common Pitfalls",
      "",
      "- ${20:Pitfall 1 and how to avoid it}",
      "- ${21:Pitfall 2 and how to avoid it}",
      "",
      "## Related Topics",
      "",
      "- [[${22:related-topic-1}]]",
      "- [[${23:related-topic-2}]]",
      ""
    ]
  },

  "BC Workflow Prompt": {
    "prefix": "tworkflow",
    "description": "BC Code Intelligence multi-phase workflow prompt",
    "body": [
      "---",
      "title: \"${1:Workflow Name}\"",
      "prompt_id: \"${2:workflow-id}\"",
      "type: \"workflow\"",
      "phases: ${3:3}",
      "specialists:",
      "  - \"${4:sam-coder}\"",
      "  - \"${5:roger-reviewer}\"",
      "description: \"${6:Brief description of what this workflow accomplishes}\"",
      "---",
      "",
      "# ${1:Workflow Name}",
      "",
      "## Phase 1: ${7:Discovery}",
      "",
      "### Objective",
      "${8:What this phase accomplishes.}",
      "",
      "### Steps",
      "1. ${9:Step one}",
      "2. ${10:Step two}",
      "3. ${11:Step three}",
      "",
      "### Checklist",
      "- [ ] ${12:Item 1 completed}",
      "- [ ] ${13:Item 2 completed}",
      "",
      "### Next Phase Trigger",
      "${14:When to advance to Phase 2.}",
      "",
      "---",
      "",
      "## Phase 2: ${15:Implementation}",
      "",
      "### Objective",
      "${16:What this phase accomplishes.}",
      "",
      "### Steps",
      "1. ${17:Step one}",
      "2. ${18:Step two}",
      "",
      "### Checklist",
      "- [ ] ${19:Item 1 completed}",
      "- [ ] ${20:Item 2 completed}",
      "",
      "### Next Phase Trigger",
      "${21:When to advance to Phase 3.}",
      "",
      "---",
      "",
      "## Phase 3: ${22:Verification}",
      "",
      "### Objective",
      "${23:What this phase accomplishes.}",
      "",
      "### Steps",
      "1. ${24:Step one}",
      "2. ${25:Step two}",
      "",
      "### Completion Criteria",
      "- ${26:Criterion 1}",
      "- ${27:Criterion 2}",
      ""
    ]
  },

  "BC Simple Prompt": {
    "prefix": "tprompt",
    "description": "BC Code Intelligence simple prompt (non-workflow)",
    "body": [
      "---",
      "title: \"${1:Prompt Name}\"",
      "prompt_id: \"${2:prompt-id}\"",
      "type: \"${3|quick-action,template|}\"",
      "specialists:",
      "  - \"${4:sam-coder}\"",
      "description: \"${5:What this prompt does}\"",
      "---",
      "",
      "# ${1:Prompt Name}",
      "",
      "## Instructions",
      "",
      "${6:Detailed instructions for the AI when this prompt is invoked.}",
      "",
      "## Context Required",
      "",
      "- ${7:What context the user should provide}",
      "- ${8:Any code or files needed}",
      "",
      "## Expected Output",
      "",
      "${9:What the user should expect to receive.}",
      ""
    ]
  }
}
```

**Snippet File: snippets/bc-layer-yaml.json**

```json
{
  "BC CodeLens Mapping": {
    "prefix": "tcodelens",
    "description": "CodeLens pattern-to-specialist mapping entry",
    "body": [
      "  - pattern: \"${1:\\\\bError\\\\s*\\\\(}\"",
      "    specialist: ${2:eva-errors}",
      "    label: \"${3:Ask Eva about ErrorInfo}\""
    ]
  },

  "BC Layer Config": {
    "prefix": "tlayerconfig",
    "description": "Layer configuration file content",
    "body": [
      "name: ${1:Layer Name}",
      "type: ${2|company,team,project|}",
      "priority: ${3:20}",
      "description: ${4:Description of this knowledge layer}",
      "version: ${5:1.0.0}"
    ]
  }
}
```

**Activation Context:**

Snippets should ideally only activate in layer folders. While VSCode doesn't support folder-based snippet activation directly, we can:

1. Use distinctive prefixes (`t` for template) to avoid conflicts
2. Document that these are for layer content authoring
3. Consider a future enhancement: language mode for `.md` files in layer folders

**Effort:** ~2-3 hours (snippet definitions + testing)

---

## Under Consideration

<!-- Items being discussed -->

---

## Decided Against

### Diagnostics/Problems Panel Integration

**What it would do:** Surface specialist findings (security issues, code smells, performance anti-patterns) directly in VSCode's Problems panel.

**Why not:**
- **Scope expectations**: Users would expect project-wide analysis, not just open files. Running `analyze_al_code` across an entire project is expensive and slow.
- **Severity subjectivity**: Deciding what's an Error vs Warning vs Info is contentious. A "missing ErrorInfo" might be critical to one team and informational to another.
- **Configuration burden**: Every knowledge topic would need severity metadata, making layer authoring more complex.
- **Overlap with AL Language extension**: Could conflict with or duplicate existing AL diagnostics, creating confusion.
- **Performance concerns**: Running analysis on every save would impact editor responsiveness.

**Alternative:** Users can ask specialists directly for code review, or use the CodeLens integration to get contextual suggestions without the overhead of real-time diagnostics.

---

### Webview Panels (Specialist Directory, Layer Inspector, Workflow Progress)

**What it would do:** Rich HTML/CSS panels for browsing specialists visually, debugging layer resolution, and tracking workflow progress.

**Why not:**
- **Diminishing returns**: The Tree View sidebar already provides specialist/prompt/layer browsing with less complexity.
- **High effort**: Each webview panel is ~16-24 hours of work (HTML/CSS, message passing, state management).
- **Maintenance burden**: Webviews require separate frontend code, increasing long-term maintenance.
- **Status bar covers workflows**: The workflow status bar indicator with Quick Pick menus handles workflow state adequately.

**Alternative:** Tree View sidebar + status bar provide 80% of the value at 20% of the effort. Revisit webviews if user feedback strongly requests richer UI.

---

### Inline Completions / Ghost Text

**What it would do:** Show specialist-driven suggestions as faded "ghost text" while typing, like Copilot does.

**Why not:**
- **Wrong tool for the job**: Inline completions are for *code completion* (finishing the line). Our specialists provide *advice about code*, not code generation.
- **Copilot conflict**: Would directly compete with Copilot's completions, creating a confusing UX where two systems fight over ghost text.
- **Mismatch of value**: If a user types `Error(`, Copilot suggests the error message. Eva's value is explaining *why* to use ErrorInfo instead - that's advice, not a completion.
- **Latency requirements**: Ghost text needs to appear in <100ms. MCP round-trips are too slow for real-time completion.

**Alternative:** CodeLens provides the right surface - visible, contextual, non-intrusive, and doesn't interfere with code completion.

---

### Notebook Support (BC Analysis Notebooks)

**What it would do:** Custom `.bcanalysis` notebook type for structured multi-step investigations with specialist cells.

**Why not:**
- **Conflicts with workflows**: Notebooks and workflows both solve "structured investigation" but in incompatible ways. We've already invested in the workflow system.
- **User confusion**: "Should I start a workflow or create a notebook?" is a bad UX question.
- **High effort**: Custom notebook controllers are ~30-40 hours of work.
- **Niche use case**: Most users want quick answers, not formal investigation documents.

**Alternative:** The workflow system (via prompts) already handles multi-phase structured processes. The chat interface with conversation history serves the same purpose as notebook cells.
