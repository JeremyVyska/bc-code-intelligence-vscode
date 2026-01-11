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
        specialistId: s.specialist_id,
      }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a specialist...',
        matchOnDescription: true,
        matchOnDetail: true,
      });

      if (selected) {
        // Open chat with the selected specialist's mode
        await vscode.commands.executeCommand(
          'workbench.action.chat.open',
          { mode: `bc-code-intelligence.${selected.specialistId}` }
        );
      }
    })
  );

  // Activate specialist command (from tree view)
  disposables.push(
    vscode.commands.registerCommand(
      'bcCodeIntelligence.activateSpecialist',
      async (specialistId: string) => {
        await vscode.commands.executeCommand(
          'workbench.action.chat.open',
          { mode: `bc-code-intelligence.${specialistId}` }
        );
      }
    )
  );

  // Select prompt command
  disposables.push(
    vscode.commands.registerCommand(
      'bcCodeIntelligence.selectPrompt',
      async (promptName?: string) => {
        if (!promptName) {
          // Show quick pick for prompts
          const prompts = [
            { label: 'Code Optimization', value: 'code_optimization' },
            { label: 'Architecture Review', value: 'architecture_review' },
            { label: 'Security Audit', value: 'security_audit' },
            { label: 'Performance Review', value: 'perf_review' },
            { label: 'Integration Design', value: 'integration_design' },
            { label: 'Upgrade Planning', value: 'upgrade_planning' },
            { label: 'Testing Strategy', value: 'testing_strategy' },
            { label: 'Developer Onboarding', value: 'dev_onboarding' },
            { label: 'App Takeover', value: 'app_takeover' },
            { label: 'Specification Analysis', value: 'spec_analysis' },
            { label: 'Bug Investigation', value: 'bug_investigation' },
            { label: 'Monolith to Modules', value: 'monolith_to_modules' },
            { label: 'Data Flow Tracing', value: 'data_flow_tracing' },
            { label: 'Full Review', value: 'full_review' },
          ];

          const selected = await vscode.window.showQuickPick(prompts, {
            placeHolder: 'Select a workflow prompt...',
          });

          if (selected) {
            promptName = selected.value;
          }
        }

        if (promptName) {
          // Insert prompt into chat or start workflow
          vscode.window.showInformationMessage(
            `Starting workflow: ${promptName}`
          );
          // TODO: Integrate with MCP to start the workflow
        }
      }
    )
  );

  // Open setup wizard command
  disposables.push(
    vscode.commands.registerCommand('bcCodeIntelligence.openSetupWizard', async () => {
      await vscode.commands.executeCommand(
        'workbench.action.openSettings',
        'bcCodeIntelligence.layers'
      );
    })
  );

  // Workflow action command
  disposables.push(
    vscode.commands.registerCommand('bcCodeIntelligence.workflowAction', async () => {
      const actions = [
        { label: 'Start New Workflow', value: 'start' },
        { label: 'View Active Workflows', value: 'view' },
        { label: 'Get Workflow Help', value: 'help' },
      ];

      const selected = await vscode.window.showQuickPick(actions, {
        placeHolder: 'Select workflow action...',
      });

      if (selected) {
        switch (selected.value) {
          case 'start':
            await vscode.commands.executeCommand('bcCodeIntelligence.selectPrompt');
            break;
          case 'view':
            vscode.window.showInformationMessage('No active workflows');
            break;
          case 'help':
            vscode.window.showInformationMessage(
              'Use the Prompts panel to start a workflow, or ask a specialist for help.'
            );
            break;
        }
      }
    })
  );

  // Open prompt in editor command
  disposables.push(
    vscode.commands.registerCommand(
      'bcCodeIntelligence.openPromptInEditor',
      async (promptName: string) => {
        // TODO: Open the prompt file from the MCP submodule
        vscode.window.showInformationMessage(`Opening prompt: ${promptName}`);
      }
    )
  );

  // Refresh layer command
  disposables.push(
    vscode.commands.registerCommand(
      'bcCodeIntelligence.refreshLayer',
      async (layerType: string) => {
        vscode.window.showInformationMessage(`Refreshing layer: ${layerType}`);
        // TODO: Call MCP to refresh layer
      }
    )
  );

  // Ask specialist about code command
  disposables.push(
    vscode.commands.registerCommand('bcCodeIntelligence.askSpecialistAboutCode', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('No active editor');
        return;
      }

      const selection = editor.selection;
      const selectedText = editor.document.getText(selection);

      if (!selectedText) {
        vscode.window.showWarningMessage('No code selected');
        return;
      }

      // Open chat with the selected code as context
      await vscode.commands.executeCommand('workbench.action.chat.open', {
        query: `Please analyze this code:\n\n\`\`\`\n${selectedText}\n\`\`\``,
      });
    })
  );

  return vscode.Disposable.from(...disposables);
}
