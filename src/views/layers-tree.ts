import * as vscode from 'vscode';
import { getExtensionConfig, onConfigurationChange } from '../services/config-bridge.js';

interface LayerInfo {
  name: string;
  type: 'embedded' | 'company' | 'team' | 'project';
  enabled: boolean;
  source?: string;
  priority: number;
}

class LayerItem extends vscode.TreeItem {
  constructor(public readonly layer: LayerInfo) {
    super(layer.name, vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'layer';

    if (layer.enabled) {
      this.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green'));
      this.description = layer.source || 'Active';
    } else {
      this.iconPath = new vscode.ThemeIcon('circle-slash');
      this.description = 'Disabled';
    }

    this.tooltip = new vscode.MarkdownString();
    this.tooltip.appendMarkdown(`**${layer.name}**\n\n`);
    this.tooltip.appendMarkdown(`- Priority: ${layer.priority}\n`);
    this.tooltip.appendMarkdown(`- Status: ${layer.enabled ? 'Enabled' : 'Disabled'}\n`);
    if (layer.source) {
      this.tooltip.appendMarkdown(`- Source: ${layer.source}\n`);
    }
  }
}

export class LayersTreeProvider implements vscode.TreeDataProvider<LayerItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<LayerItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor() {
    // Listen for config changes
    onConfigurationChange(() => this.refresh());
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: LayerItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: LayerItem): LayerItem[] {
    if (element) {
      return [];
    }

    const config = getExtensionConfig();

    const layers: LayerInfo[] = [
      {
        name: 'Embedded',
        type: 'embedded',
        enabled: true, // Always enabled
        source: 'bc-code-intelligence-mcp/embedded-knowledge',
        priority: 0,
      },
      {
        name: 'Company',
        type: 'company',
        enabled: config.layers.company.enabled,
        source: config.layers.company.url,
        priority: 20,
      },
      {
        name: 'Team',
        type: 'team',
        enabled: config.layers.team.enabled,
        source: config.layers.team.url,
        priority: 100,
      },
      {
        name: 'Project',
        type: 'project',
        enabled: config.layers.project.enabled,
        source: config.layers.project.path,
        priority: 300,
      },
    ];

    return layers.map((l) => new LayerItem(l));
  }
}

export function registerLayersView(context: vscode.ExtensionContext): vscode.Disposable {
  const provider = new LayersTreeProvider();

  const treeView = vscode.window.createTreeView('bcCodeIntelligence.layers', {
    treeDataProvider: provider,
  });

  const refreshCommand = vscode.commands.registerCommand(
    'bcCodeIntelligence.refreshLayers',
    () => provider.refresh()
  );

  return vscode.Disposable.from(treeView, refreshCommand);
}
