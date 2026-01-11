import * as vscode from 'vscode';
import type { SpecialistLoaderService } from '../services/specialist-loader.js';
import type { SpecialistDefinition } from '../types/index.js';

const PARTICIPANT_ID = 'bc-code-intelligence';
const MAX_TOOL_ITERATIONS = 10;
const TOOL_PREFIX = 'bc-code-intelligence_';

/**
 * Creates and registers the BC Code Intelligence chat participant
 */
export function registerChatParticipant(
  context: vscode.ExtensionContext,
  specialistLoader: SpecialistLoaderService,
  outputChannel: vscode.OutputChannel
): vscode.Disposable {
  const participant = vscode.chat.createChatParticipant(
    PARTICIPANT_ID,
    (request, chatContext, stream, token) =>
      handleChatRequest(request, chatContext, stream, token, specialistLoader, outputChannel)
  );

  participant.iconPath = vscode.Uri.joinPath(context.extensionUri, 'resources', 'bc-icon.svg');

  outputChannel.appendLine(`Chat participant @${PARTICIPANT_ID} registered`);

  return participant;
}

/**
 * Gets the active specialist based on the chat mode
 */
function getActiveSpecialist(
  request: vscode.ChatRequest,
  specialistLoader: SpecialistLoaderService
): SpecialistDefinition | undefined {
  // TODO: Detect chat mode from request when VSCode API supports it
  // For now, default to sam-coder
  const specialists = specialistLoader.getAll();
  return specialistLoader.get('sam-coder') || specialists[0];
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
${specialist.collaboration.natural_handoffs.map(id => `- ${id}`).join('\n')}

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
 * Handles incoming chat requests
 */
async function handleChatRequest(
  request: vscode.ChatRequest,
  chatContext: vscode.ChatContext,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
  specialistLoader: SpecialistLoaderService,
  outputChannel: vscode.OutputChannel
): Promise<void> {
  outputChannel.appendLine(`[@${PARTICIPANT_ID}] User query: ${request.prompt}`);

  const specialist = getActiveSpecialist(request, specialistLoader);

  if (!specialist) {
    stream.markdown('⚠️ No specialist available. Please ensure the BC Code Intelligence extension is properly configured.');
    return;
  }

  outputChannel.appendLine(`[@${PARTICIPANT_ID}] Active specialist: ${specialist.title}`);

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
    // Get available models
    const models = await vscode.lm.selectChatModels({
      vendor: 'copilot',
      family: 'gpt-4',
    });

    if (models.length === 0) {
      stream.markdown('⚠️ No GitHub Copilot model available. Please ensure GitHub Copilot is enabled.');
      return;
    }

    const model = models[0];
    outputChannel.appendLine(`[@${PARTICIPANT_ID}] Using model: ${model.name}`);

    // Get available BC Code Intelligence tools
    const bcTools = getBCIntelTools();
    outputChannel.appendLine(`[@${PARTICIPANT_ID}] BC tools found: ${bcTools.length}`);

    if (bcTools.length > 0) {
      outputChannel.appendLine(`[@${PARTICIPANT_ID}] Tool names: ${bcTools.map(t => t.name).join(', ')}`);
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
        outputChannel.appendLine(`[@${PARTICIPANT_ID}] Tool call: ${toolCall.name} (callId: ${toolCall.callId})`);
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

          outputChannel.appendLine(`[@${PARTICIPANT_ID}] Tool result received (${toolResult.content.length} parts)`);

          assistantToolCalls.push(toolCall);
          toolResultParts.push(new vscode.LanguageModelToolResultPart(
            toolCall.callId,
            toolResult.content
          ));
        } catch (toolError: unknown) {
          const errorMessage = toolError instanceof Error ? toolError.message : String(toolError);
          outputChannel.appendLine(`[@${PARTICIPANT_ID}] Tool error: ${errorMessage}`);
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
      outputChannel.appendLine(`[@${PARTICIPANT_ID}] Warning: Reached max tool iterations`);
      stream.markdown('\n\n_Note: Reached maximum tool calling iterations._');
    }

    outputChannel.appendLine(`[@${PARTICIPANT_ID}] Response complete (${iteration} iterations)`);

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    outputChannel.appendLine(`[@${PARTICIPANT_ID}] Error: ${errorMessage}`);

    if (error instanceof vscode.LanguageModelError) {
      stream.markdown(`⚠️ Language model error: ${errorMessage}`);
    } else {
      stream.markdown(`⚠️ An error occurred: ${errorMessage}`);
    }
  }
}
