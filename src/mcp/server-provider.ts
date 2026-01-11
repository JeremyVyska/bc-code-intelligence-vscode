import * as vscode from 'vscode';
import * as path from 'path';
import { getExtensionConfig, configToMcpEnv, onConfigurationChange } from '../services/config-bridge.js';

/**
 * Registers the MCP server definition provider for BC Code Intelligence
 */
export function registerMcpServerProvider(context: vscode.ExtensionContext): vscode.Disposable {
  const onConfigChange = new vscode.EventEmitter<void>();

  // Listen for config changes and notify the MCP system
  const configListener = onConfigurationChange(() => {
    onConfigChange.fire();
  });

  const provider: vscode.McpServerDefinitionProvider<vscode.McpServerDefinition> = {
    provideMcpServerDefinitions: () => {
      const config = getExtensionConfig();
      const mcpServerPath = path.join(
        context.extensionPath,
        'bc-code-intelligence-mcp',
        'dist',
        'index.js'
      );

      // Build environment from config
      const env: Record<string, string> = {
        ...configToMcpEnv(config),
      };

      // Add workspace path if available
      const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (workspacePath) {
        env['BC_INTEL_WORKSPACE_PATH'] = workspacePath;
      }

      return [{
        id: 'bc-code-intelligence',
        label: 'BC Code Intelligence',
        description: 'AI-powered Business Central development assistant',
        command: 'node',
        args: [mcpServerPath],
        env,
      }];
    },
  };

  const registration = vscode.lm.registerMcpServerDefinitionProvider('bc-code-intelligence', provider);

  return vscode.Disposable.from(registration, configListener, onConfigChange);
}
