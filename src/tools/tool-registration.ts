import * as vscode from 'vscode';
import { coreTools, diagnosticTools, type ToolDefinition } from './tool-definitions.js';
import { getExtensionConfig } from '../services/config-bridge.js';

/**
 * Creates a Language Model Tool implementation for an MCP tool
 */
function createToolImplementation(toolDef: ToolDefinition): vscode.LanguageModelTool<Record<string, unknown>> {
  return {
    prepareInvocation(
      options: vscode.LanguageModelToolInvocationPrepareOptions<Record<string, unknown>>,
      _token: vscode.CancellationToken
    ) {
      // Create a user-friendly invocation message
      const inputSummary = Object.entries(options.input || {})
        .slice(0, 2)
        .map(([k, v]) => `${k}: ${String(v).substring(0, 30)}`)
        .join(', ');

      return {
        invocationMessage: `${toolDef.displayName}${inputSummary ? ` (${inputSummary})` : ''}...`,
      };
    },

    async invoke(
      options: vscode.LanguageModelToolInvocationOptions<Record<string, unknown>>,
      token: vscode.CancellationToken
    ): Promise<vscode.LanguageModelToolResult> {
      // Map our tool name to MCP tool name
      // bc-code-intelligence_findKnowledge -> find_bc_knowledge
      const mcpToolName = toolNameToMcp(toolDef.name);

      try {
        // Use VSCode's MCP integration to call the tool
        // The MCP server is registered via registerMcpServerProvider
        // VSCode handles the actual MCP communication
        const result = await vscode.lm.invokeTool(
          `bc-code-intelligence/${mcpToolName}`,
          { input: options.input, toolInvocationToken: undefined },
          token
        );

        return result;
      } catch (error) {
        // If direct MCP invocation fails, return error message
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return new vscode.LanguageModelToolResult([
          new vscode.LanguageModelTextPart(
            JSON.stringify({ error: errorMessage, tool: toolDef.name })
          ),
        ]);
      }
    },
  };
}

/**
 * Converts our tool name format to MCP tool name format
 * bc-code-intelligence_findKnowledge -> find_bc_knowledge
 */
function toolNameToMcp(toolName: string): string {
  // Remove prefix and convert camelCase to snake_case
  const withoutPrefix = toolName.replace('bc-code-intelligence_', '');

  // Map to actual MCP tool names
  const toolMap: Record<string, string> = {
    findKnowledge: 'find_bc_knowledge',
    getTopic: 'get_bc_topic',
    askExpert: 'ask_bc_expert',
    analyzeCode: 'analyze_al_code',
    startWorkflow: 'start_bc_workflow',
    advanceWorkflow: 'advance_workflow',
    getWorkflowHelp: 'get_workflow_help',
    listSpecialists: 'list_specialists',
    setWorkspaceInfo: 'set_workspace_info',
    getWorkspaceInfo: 'get_workspace_info',
    diagnoseGitLayer: 'diagnose_git_layer',
    validateLayerConfig: 'validate_layer_config',
    testAzureDevOpsPat: 'test_azure_devops_pat',
    getLayerDiagnostics: 'get_layer_diagnostics',
    diagnoseLocalLayer: 'diagnose_local_layer',
    reloadLayers: 'reload_layers',
  };

  return toolMap[withoutPrefix] || withoutPrefix;
}

/**
 * Registers all BC Code Intelligence tools as VSCode Language Model Tools
 */
export function registerTools(context: vscode.ExtensionContext): vscode.Disposable {
  const disposables: vscode.Disposable[] = [];

  // Register core tools
  for (const toolDef of coreTools) {
    const tool = createToolImplementation(toolDef);
    const registration = vscode.lm.registerTool(toolDef.name, tool);
    disposables.push(registration);
  }

  // Register diagnostic tools if enabled
  const config = getExtensionConfig();
  if (config.developer.enableDiagnosticTools) {
    for (const toolDef of diagnosticTools) {
      const tool = createToolImplementation(toolDef);
      const registration = vscode.lm.registerTool(toolDef.name, tool);
      disposables.push(registration);
    }
  }

  return vscode.Disposable.from(...disposables);
}
