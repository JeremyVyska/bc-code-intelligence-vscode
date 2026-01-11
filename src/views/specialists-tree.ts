import * as vscode from 'vscode';
import type { SpecialistLoaderService } from '../services/specialist-loader.js';
import type { SpecialistDefinition } from '../types/index.js';

type TreeItem = TeamItem | SpecialistItem;

class TeamItem extends vscode.TreeItem {
  constructor(
    public readonly teamName: string,
    public readonly specialists: SpecialistDefinition[]
  ) {
    super(teamName, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = 'team';
    this.iconPath = new vscode.ThemeIcon('organization');
  }
}

class SpecialistItem extends vscode.TreeItem {
  constructor(public readonly specialist: SpecialistDefinition) {
    super(
      `${specialist.emoji} ${specialist.title.split(' - ')[0]}`,
      vscode.TreeItemCollapsibleState.None
    );
    this.contextValue = 'specialist';
    this.description = specialist.role;
    this.tooltip = new vscode.MarkdownString();
    this.tooltip.appendMarkdown(`**${specialist.title}**\n\n`);
    this.tooltip.appendMarkdown(`${specialist.persona.greeting}\n\n`);
    this.tooltip.appendMarkdown(`**When to use:**\n`);
    for (const use of specialist.when_to_use) {
      this.tooltip.appendMarkdown(`- ${use}\n`);
    }

    this.command = {
      command: 'bcCodeIntelligence.activateSpecialist',
      title: 'Activate Specialist',
      arguments: [specialist.specialist_id],
    };
  }
}

export class SpecialistsTreeProvider implements vscode.TreeDataProvider<TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private specialistLoader: SpecialistLoaderService) {}

  refresh(): void {
    this.specialistLoader.reload();
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TreeItem): TreeItem[] {
    if (!element) {
      // Root level - return teams
      const byTeam = this.specialistLoader.getByTeam();
      const teamOrder = [
        'Development',
        'Quality & Testing',
        'Planning & Analysis',
        'Integration & Business',
      ];

      const teams: TeamItem[] = [];
      for (const teamName of teamOrder) {
        const specialists = byTeam.get(teamName);
        if (specialists && specialists.length > 0) {
          teams.push(new TeamItem(teamName, specialists));
        }
      }

      // Add any teams not in the predefined order
      for (const [teamName, specialists] of byTeam) {
        if (!teamOrder.includes(teamName) && specialists.length > 0) {
          teams.push(new TeamItem(teamName, specialists));
        }
      }

      return teams;
    }

    if (element instanceof TeamItem) {
      return element.specialists.map((s) => new SpecialistItem(s));
    }

    return [];
  }
}

export function registerSpecialistsView(
  context: vscode.ExtensionContext,
  specialistLoader: SpecialistLoaderService
): vscode.Disposable {
  const provider = new SpecialistsTreeProvider(specialistLoader);

  const treeView = vscode.window.createTreeView('bcCodeIntelligence.specialists', {
    treeDataProvider: provider,
    showCollapseAll: true,
  });

  const refreshCommand = vscode.commands.registerCommand(
    'bcCodeIntelligence.refreshSpecialists',
    () => provider.refresh()
  );

  return vscode.Disposable.from(treeView, refreshCommand);
}
