import * as vscode from 'vscode';

interface PromptInfo {
  name: string;
  description: string;
  category: string;
}

class PromptCategoryItem extends vscode.TreeItem {
  constructor(
    public readonly categoryName: string,
    public readonly prompts: PromptInfo[]
  ) {
    super(categoryName, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = 'promptCategory';
    this.iconPath = new vscode.ThemeIcon('folder');
  }
}

class PromptItem extends vscode.TreeItem {
  constructor(public readonly prompt: PromptInfo) {
    super(prompt.name, vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'prompt';
    this.description = prompt.description;
    this.iconPath = new vscode.ThemeIcon('note');

    this.command = {
      command: 'bcCodeIntelligence.selectPrompt',
      title: 'Select Prompt',
      arguments: [prompt.name],
    };
  }
}

type TreeItem = PromptCategoryItem | PromptItem;

export class PromptsTreeProvider implements vscode.TreeDataProvider<TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  // Workflow prompts from the MCP server
  private readonly workflowPrompts: PromptInfo[] = [
    { name: 'code_optimization', description: 'Optimize code performance', category: 'Development' },
    { name: 'architecture_review', description: 'Review solution architecture', category: 'Planning' },
    { name: 'security_audit', description: 'Audit security concerns', category: 'Quality' },
    { name: 'perf_review', description: 'Performance review', category: 'Quality' },
    { name: 'integration_design', description: 'Design integrations', category: 'Planning' },
    { name: 'upgrade_planning', description: 'Plan BC upgrades', category: 'Planning' },
    { name: 'testing_strategy', description: 'Define testing approach', category: 'Quality' },
    { name: 'dev_onboarding', description: 'Onboard new developers', category: 'Development' },
    { name: 'app_takeover', description: 'Take over existing app', category: 'Development' },
    { name: 'spec_analysis', description: 'Analyze specifications', category: 'Planning' },
    { name: 'bug_investigation', description: 'Investigate bugs', category: 'Quality' },
    { name: 'monolith_to_modules', description: 'Modularize monolith', category: 'Planning' },
    { name: 'data_flow_tracing', description: 'Trace data flows', category: 'Development' },
    { name: 'full_review', description: 'Comprehensive review', category: 'Quality' },
  ];

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TreeItem): TreeItem[] {
    if (!element) {
      // Root level - return categories
      const categories = new Map<string, PromptInfo[]>();

      for (const prompt of this.workflowPrompts) {
        if (!categories.has(prompt.category)) {
          categories.set(prompt.category, []);
        }
        categories.get(prompt.category)!.push(prompt);
      }

      return Array.from(categories.entries()).map(
        ([name, prompts]) => new PromptCategoryItem(name, prompts)
      );
    }

    if (element instanceof PromptCategoryItem) {
      return element.prompts.map((p) => new PromptItem(p));
    }

    return [];
  }
}

export function registerPromptsView(context: vscode.ExtensionContext): vscode.Disposable {
  const provider = new PromptsTreeProvider();

  const treeView = vscode.window.createTreeView('bcCodeIntelligence.prompts', {
    treeDataProvider: provider,
    showCollapseAll: true,
  });

  const refreshCommand = vscode.commands.registerCommand(
    'bcCodeIntelligence.refreshPrompts',
    () => provider.refresh()
  );

  return vscode.Disposable.from(treeView, refreshCommand);
}
