import * as vscode from 'vscode';
import { SpecialistLoaderService } from './services/specialist-loader.js';
import { registerMcpServerProvider } from './mcp/server-provider.js';
import { registerChatParticipant } from './chat/participant.js';
import { registerSpecialistsView, registerPromptsView, registerLayersView } from './views/index.js';
import { registerCommands } from './commands/index.js';
import { registerTools } from './tools/index.js';

let outputChannel: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext): void {
  outputChannel = vscode.window.createOutputChannel('BC Code Intelligence');
  outputChannel.appendLine('BC Code Intelligence extension activating...');

  try {
    // Initialize specialist loader
    const specialistLoader = new SpecialistLoaderService(context.extensionPath);
    const specialists = specialistLoader.load();
    outputChannel.appendLine(`Loaded ${specialists.size} specialists`);

    // Register MCP server provider
    const mcpProvider = registerMcpServerProvider(context);
    context.subscriptions.push(mcpProvider);
    outputChannel.appendLine('MCP server provider registered');

    // Register chat participant
    const chatParticipant = registerChatParticipant(context, specialistLoader, outputChannel);
    context.subscriptions.push(chatParticipant);
    outputChannel.appendLine('Chat participant registered');

    // Register tree views
    const specialistsView = registerSpecialistsView(context, specialistLoader);
    context.subscriptions.push(specialistsView);

    const promptsView = registerPromptsView(context);
    context.subscriptions.push(promptsView);

    const layersView = registerLayersView(context);
    context.subscriptions.push(layersView);
    outputChannel.appendLine('Tree views registered');

    // Register commands
    const commands = registerCommands(context, specialistLoader);
    context.subscriptions.push(commands);
    outputChannel.appendLine('Commands registered');

    // Register Language Model Tools
    const tools = registerTools(context);
    context.subscriptions.push(tools);
    outputChannel.appendLine('Language Model Tools registered');

    // Add output channel to subscriptions
    context.subscriptions.push(outputChannel);

    outputChannel.appendLine('BC Code Intelligence extension activated successfully!');

    // Show welcome message on first activation
    const hasShownWelcome = context.globalState.get<boolean>('hasShownWelcome');
    if (!hasShownWelcome) {
      vscode.window
        .showInformationMessage(
          'BC Code Intelligence is ready! Click to get started.',
          'Open Specialists',
          'Configure Layers'
        )
        .then((selection) => {
          if (selection === 'Open Specialists') {
            vscode.commands.executeCommand('bcCodeIntelligence.specialists.focus');
          } else if (selection === 'Configure Layers') {
            vscode.commands.executeCommand('bcCodeIntelligence.openSetupWizard');
          }
        });
      context.globalState.update('hasShownWelcome', true);
    }
  } catch (error) {
    outputChannel.appendLine(`Activation error: ${error}`);
    console.error('BC Code Intelligence activation failed:', error);
    vscode.window.showErrorMessage(
      `BC Code Intelligence failed to activate: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

export function deactivate(): void {
  outputChannel?.appendLine('BC Code Intelligence extension deactivating...');
}
