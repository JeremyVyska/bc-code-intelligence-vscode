import * as vscode from 'vscode';
import type { SpecialistLoaderService } from '../services/specialist-loader.js';
import type { SpecialistDefinition } from '../types/index.js';

const PARTICIPANT_PREFIX = 'bc-code-intelligence.';
const MAX_TOOL_ITERATIONS = 10;
const TOOL_PREFIX = 'bc-code-intelligence_';

/**
 * Creates and registers chat participants for all specialists
 */
export function registerChatParticipant(
  context: vscode.ExtensionContext,
  specialistLoader: SpecialistLoaderService,
  outputChannel: vscode.OutputChannel
): vscode.Disposable {
  const disposables: vscode.Disposable[] = [];

  // Get all specialists and register a participant for each
  const specialists = specialistLoader.getAll();
  outputChannel.appendLine(`[ChatParticipant] getAll() returned ${specialists.length} specialists`);

  if (specialists.length === 0) {
    outputChannel.appendLine(`[ChatParticipant] WARNING: No specialists loaded - chat participants will not be available`);
    return vscode.Disposable.from(...disposables);
  }

  for (const specialist of specialists) {
    const participantId = `${PARTICIPANT_PREFIX}${specialist.specialist_id}`;
    outputChannel.appendLine(`[ChatParticipant] Registering participant: ${participantId}`);

    try {
      const participant = vscode.chat.createChatParticipant(
        participantId,
        (request, chatContext, stream, token) =>
          handleChatRequest(request, chatContext, stream, token, specialist, specialistLoader, outputChannel)
      );

      participant.iconPath = vscode.Uri.joinPath(context.extensionUri, 'resources', 'bc-icon.svg');

      disposables.push(participant);
      outputChannel.appendLine(`[ChatParticipant] ✓ @${specialist.specialist_id} registered successfully`);
    } catch (error) {
      outputChannel.appendLine(`[ChatParticipant] ✗ Failed to register @${specialist.specialist_id}: ${error}`);
    }
  }

  outputChannel.appendLine(`[ChatParticipant] Total registered: ${disposables.length} specialist chat participants`);

  return vscode.Disposable.from(...disposables);
}

/**
 * Builds system prompt for a specialist
 */
function buildSystemPrompt(specialist: SpecialistDefinition): string {
  return `You are ${specialist.title}.

${specialist.systemPrompt}

## Your Persona
- Personality: ${specialist.persona.personality.join(', ')}
- Communication style: ${specialist.persona.communication_style}
- Start conversations with: "${specialist.persona.greeting}"

## Your Expertise
Primary: ${specialist.expertise.primary.join(', ')}
Secondary: ${specialist.expertise.secondary.join(', ')}

## When Users Should Consult You
${specialist.when_to_use.map(use => `- ${use}`).join('\n')}

## Collaboration
When a question falls outside your expertise, suggest consulting:
${specialist.collaboration.natural_handoffs.map(id => `- @${id}`).join('\n')}

## Available Tools
You have access to BC Code Intelligence MCP tools. Use them to:
- Search the knowledge base (find_bc_knowledge)
- Get detailed topic content (get_bc_topic)
- Analyze AL code (analyze_al_code)
- Start and manage workflows (start_bc_workflow, advance_workflow, get_workflow_help)
- Consult other specialists (ask_bc_expert)
- List available specialists (list_specialists)

Always use tools when they can provide better answers than your training data alone.
`;
}

/**
 * Gets available BC Code Intelligence tools
 */
function getBCIntelTools(): vscode.LanguageModelToolInformation[] {
  const allTools = vscode.lm.tools;
  return allTools.filter(tool => tool.name.startsWith(TOOL_PREFIX));
}

/**
 * Handles incoming chat requests for a specific specialist
 */
async function handleChatRequest(
  request: vscode.ChatRequest,
  chatContext: vscode.ChatContext,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
  specialist: SpecialistDefinition,
  specialistLoader: SpecialistLoaderService,
  outputChannel: vscode.OutputChannel
): Promise<void> {
  outputChannel.appendLine(`[@${specialist.specialist_id}] User query: ${request.prompt}`);
  outputChannel.appendLine(`[@${specialist.specialist_id}] Active specialist: ${specialist.title}`);

  // Build conversation messages with system prompt
  const messages: vscode.LanguageModelChatMessage[] = [
    vscode.LanguageModelChatMessage.User(buildSystemPrompt(specialist)),
  ];

  // Add conversation history (last 10 exchanges)
  const recentHistory = chatContext.history.slice(-10);
  for (const turn of recentHistory) {
    if (turn instanceof vscode.ChatRequestTurn) {
      messages.push(vscode.LanguageModelChatMessage.User(turn.prompt));
    } else if (turn instanceof vscode.ChatResponseTurn) {
      const responseText = turn.response
        .map((part) => {
          if (part instanceof vscode.ChatResponseMarkdownPart) {
            return part.value.value;
          }
          return '';
        })
        .join('\n');

      if (responseText) {
        messages.push(vscode.LanguageModelChatMessage.Assistant(responseText));
      }
    }
  }

  // Add current request
  messages.push(vscode.LanguageModelChatMessage.User(request.prompt));

  try {
    // Get available models - try copilot vendor first, then any available model
    let models = await vscode.lm.selectChatModels({
      vendor: 'copilot',
    });

    // If no copilot models, try to get any available model
    if (models.length === 0) {
      outputChannel.appendLine(`[@${specialist.specialist_id}] No copilot models found, trying all available models`);
      models = await vscode.lm.selectChatModels({});
    }

    if (models.length === 0) {
      outputChannel.appendLine(`[@${specialist.specialist_id}] ERROR: No language models available`);
      stream.markdown('⚠️ No language model available. Please ensure GitHub Copilot is enabled and you are signed in.');
      return;
    }

    // Log available models for debugging
    outputChannel.appendLine(`[@${specialist.specialist_id}] Available models: ${models.map(m => `${m.name} (${m.family})`).join(', ')}`);

    // Prefer Claude Sonnet 4.5, then GPT-4 family, then any Claude, then first available
    const model =
      models.find(m => m.name.toLowerCase().includes('claude') && m.name.includes('sonnet')) ||
      models.find(m => m.family.includes('gpt-4o')) ||
      models.find(m => m.family.includes('gpt-4')) ||
      models.find(m => m.name.toLowerCase().includes('claude')) ||
      models[0];
    outputChannel.appendLine(`[@${specialist.specialist_id}] Using model: ${model.name}`);

    // Get available BC Code Intelligence tools
    const bcTools = getBCIntelTools();
    outputChannel.appendLine(`[@${specialist.specialist_id}] BC tools found: ${bcTools.length}`);

    if (bcTools.length > 0) {
      outputChannel.appendLine(`[@${specialist.specialist_id}] Tool names: ${bcTools.map(t => t.name).join(', ')}`);
    }

    // Map tools to format expected by model
    const availableTools = bcTools.map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));

    // Tool-calling loop
    let currentResponse = await model.sendRequest(messages, {
      justification: `BC Code Intelligence specialist ${specialist.title} is assisting with Business Central development`,
      tools: availableTools,
      toolMode: vscode.LanguageModelChatToolMode.Auto,
    }, token);

    let iteration = 0;

    while (iteration < MAX_TOOL_ITERATIONS && !token.isCancellationRequested) {
      iteration++;
      let hasToolCalls = false;
      const toolCalls: vscode.LanguageModelToolCallPart[] = [];

      // Process response stream
      for await (const fragment of currentResponse.stream) {
        if (fragment instanceof vscode.LanguageModelTextPart) {
          stream.markdown(fragment.value);
        } else if (fragment instanceof vscode.LanguageModelToolCallPart) {
          hasToolCalls = true;
          toolCalls.push(fragment);
        }
      }

      // If no tool calls, we're done
      if (!hasToolCalls) {
        break;
      }

      // Execute tool calls
      const assistantToolCalls: vscode.LanguageModelToolCallPart[] = [];
      const toolResultParts: vscode.LanguageModelToolResultPart[] = [];

      for (const toolCall of toolCalls) {
        outputChannel.appendLine(`[@${specialist.specialist_id}] Tool call: ${toolCall.name} (callId: ${toolCall.callId})`);
        stream.progress(`Using tool: ${toolCall.name}...`);

        try {
          const toolResult = await vscode.lm.invokeTool(
            toolCall.name,
            {
              toolInvocationToken: request.toolInvocationToken,
              input: toolCall.input,
            },
            token
          );

          outputChannel.appendLine(`[@${specialist.specialist_id}] Tool result received (${toolResult.content.length} parts)`);

          assistantToolCalls.push(toolCall);
          toolResultParts.push(new vscode.LanguageModelToolResultPart(
            toolCall.callId,
            toolResult.content
          ));
        } catch (toolError: unknown) {
          const errorMessage = toolError instanceof Error ? toolError.message : String(toolError);
          outputChannel.appendLine(`[@${specialist.specialist_id}] Tool error: ${errorMessage}`);
          stream.markdown(`\n\n⚠️ Tool ${toolCall.name} failed: ${errorMessage}\n\n`);

          // Still provide a response for this tool call
          assistantToolCalls.push(toolCall);
          toolResultParts.push(new vscode.LanguageModelToolResultPart(
            toolCall.callId,
            [new vscode.LanguageModelTextPart(`Tool ${toolCall.name} failed: ${errorMessage}`)]
          ));
        }
      }

      // Add tool calls and results to conversation
      if (assistantToolCalls.length > 0) {
        messages.push(vscode.LanguageModelChatMessage.Assistant(assistantToolCalls));
        messages.push(vscode.LanguageModelChatMessage.User(toolResultParts));
      }

      // Get next response
      currentResponse = await model.sendRequest(messages, {
        justification: `BC Code Intelligence processing tool results`,
        tools: availableTools,
        toolMode: vscode.LanguageModelChatToolMode.Auto,
      }, token);
    }

    if (iteration >= MAX_TOOL_ITERATIONS) {
      outputChannel.appendLine(`[@${specialist.specialist_id}] Warning: Reached max tool iterations`);
      stream.markdown('\n\n_Note: Reached maximum tool calling iterations._');
    }

    outputChannel.appendLine(`[@${specialist.specialist_id}] Response complete (${iteration} iterations)`);

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    outputChannel.appendLine(`[@${specialist.specialist_id}] Error: ${errorMessage}`);

    if (error instanceof vscode.LanguageModelError) {
      stream.markdown(`⚠️ Language model error: ${errorMessage}`);
    } else {
      stream.markdown(`⚠️ An error occurred: ${errorMessage}`);
    }
  }
}
