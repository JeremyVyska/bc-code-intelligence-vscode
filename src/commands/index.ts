import * as vscode from 'vscode';
import type { SpecialistLoaderService } from '../services/specialist-loader.js';

export function registerCommands(
  context: vscode.ExtensionContext,
  specialistLoader: SpecialistLoaderService
): vscode.Disposable {
  const disposables: vscode.Disposable[] = [];

  // Switch specialist command
  disposables.push(
    vscode.commands.registerCommand('bcCodeIntelligence.switchSpecialist', async () => {
      const specialists = specialistLoader.getAll();

      const items = specialists.map((s) => ({
        label: `${s.emoji} ${s.title.split(' - ')[0]}`,
        description: s.role,
        detail: s.when_to_use[0],
        specialist: s,
      }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a specialist...',
        matchOnDescription: true,
        matchOnDetail: true,
      });

      if (selected) {
        // Open chat with the selected specialist
        await vscode.commands.executeCommand('workbench.action.chat.open', {
          query: `@${selected.specialist.specialist_id} `,
        });
      }
    })
  );

  // Activate specialist command (from tree view)
  disposables.push(
    vscode.commands.registerCommand(
      'bcCodeIntelligence.activateSpecialist',
      async (specialistId: string) => {
        await vscode.commands.executeCommand('workbench.action.chat.open', {
          query: `@${specialistId} `,
        });
      }
    )
  );

  // Select prompt command - just opens setup wizard for now
  // (Workflows are managed by the MCP server, not the extension UI)
  disposables.push(
    vscode.commands.registerCommand(
      'bcCodeIntelligence.selectPrompt',
      async () => {
        vscode.window.showInformationMessage(
          'Workflows are started by asking a specialist in chat. Try: "@roger start a code review"'
        );
      }
    )
  );

  // Note: openSetupWizard is registered by the wizard module

  // Open prompt in editor command
  disposables.push(
    vscode.commands.registerCommand(
      'bcCodeIntelligence.openPromptInEditor',
      async (promptName: string) => {
        // Try to open the prompt file from the MCP submodule
        const promptsPath = vscode.Uri.joinPath(
          vscode.Uri.file(context.extensionPath),
          'bc-code-intelligence-mcp',
          'embedded-knowledge',
          'prompts',
          `${promptName}.md`
        );

        try {
          const doc = await vscode.workspace.openTextDocument(promptsPath);
          await vscode.window.showTextDocument(doc);
        } catch {
          vscode.window.showWarningMessage(`Prompt file not found: ${promptName}`);
        }
      }
    )
  );

  // Refresh layer command
  disposables.push(
    vscode.commands.registerCommand(
      'bcCodeIntelligence.refreshLayer',
      async (layerType: string) => {
        vscode.window.showInformationMessage(`Refreshing layer: ${layerType}`);
        // TODO: Call MCP to refresh layer via reload_layers tool
      }
    )
  );

  // Ask specialist about code command - enhanced with specialist selection
  disposables.push(
    vscode.commands.registerCommand(
      'bcCodeIntelligence.askSpecialistAboutCode',
      async (
        uri?: vscode.Uri,
        range?: vscode.Range,
        specialistId?: string
      ) => {
        let codeContext: string;

        if (uri && range) {
          // Called from CodeLens with specific location
          const document = await vscode.workspace.openTextDocument(uri);
          // Get a bit more context around the matched line
          const startLine = Math.max(0, range.start.line - 2);
          const endLine = Math.min(document.lineCount - 1, range.start.line + 10);
          codeContext = document.getText(
            new vscode.Range(startLine, 0, endLine, document.lineAt(endLine).text.length)
          );
        } else {
          // Called from command palette or context menu
          const editor = vscode.window.activeTextEditor;
          if (!editor) {
            vscode.window.showWarningMessage('No active editor');
            return;
          }

          const selection = editor.selection;
          codeContext = editor.document.getText(selection);

          if (!codeContext) {
            vscode.window.showWarningMessage('No code selected');
            return;
          }
        }

        // Open chat with the selected code as context
        const query = specialistId
          ? `@${specialistId} Please analyze this code:\n\n\`\`\`\n${codeContext}\n\`\`\``
          : `Please analyze this code:\n\n\`\`\`\n${codeContext}\n\`\`\``;

        await vscode.commands.executeCommand('workbench.action.chat.open', {
          query,
        });
      }
    )
  );

  return vscode.Disposable.from(...disposables);
}
