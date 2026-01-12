import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import type { SpecialistLoaderService } from '../services/specialist-loader.js';
import type { SpecialistDefinition } from '../types/index.js';

const PARTICIPANT_PREFIX = 'bc-code-intelligence.';
const MAX_TOOL_ITERATIONS = 10;
const TOOL_PREFIX = 'bc-code-intelligence_';

/** Cache for loaded bootloader instructions */
const bootloaderCache: Map<string, string> = new Map();

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
          handleChatRequest(request, chatContext, stream, token, specialist, context.extensionPath, outputChannel)
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
 * Loads bootloader instructions from an .agent.md file
 * Returns the markdown body (everything after the YAML frontmatter)
 */
function loadBootloaderInstructions(extensionPath: string, specialistId: string, logFn: (msg: string) => void): string | undefined {
  // Check cache first
  if (bootloaderCache.has(specialistId)) {
    return bootloaderCache.get(specialistId);
  }

  // Convert specialist_id to agent filename format (e.g., "sam-coder" -> "sam-coder.agent.md")
  // The files use title case in some cases, so we'll try multiple patterns
  const agentsDir = path.join(extensionPath, 'assets', 'agents');

  if (!fs.existsSync(agentsDir)) {
    logFn(`[Bootloader] Agents directory not found: ${agentsDir}`);
    return undefined;
  }

  // Find matching agent file (case-insensitive)
  const files = fs.readdirSync(agentsDir);
  const agentFile = files.find(f =>
    f.toLowerCase() === `${specialistId.toLowerCase()}.agent.md`
  );

  if (!agentFile) {
    logFn(`[Bootloader] No agent file found for: ${specialistId}`);
    return undefined;
  }

  const filePath = path.join(agentsDir, agentFile);

  try {
    const content = fs.readFileSync(filePath, 'utf-8');

    // Extract markdown body after YAML frontmatter
    const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/);
    if (!match) {
      logFn(`[Bootloader] Invalid frontmatter in: ${filePath}`);
      return undefined;
    }

    const bootloaderInstructions = match[1].trim();
    bootloaderCache.set(specialistId, bootloaderInstructions);
    logFn(`[Bootloader] Loaded instructions for: ${specialistId} (${bootloaderInstructions.length} chars)`);

    return bootloaderInstructions;
  } catch (error) {
    logFn(`[Bootloader] Error reading ${filePath}: ${error}`);
    return undefined;
  }
}

/**
 * Builds system prompt for a specialist, including bootloader instructions
 */
function buildSystemPrompt(
  specialist: SpecialistDefinition,
  extensionPath: string,
  logFn: (msg: string) => void
): string {
  // Load bootloader instructions from .agent.md file
  const bootloaderInstructions = loadBootloaderInstructions(extensionPath, specialist.specialist_id, logFn);

  // If we have bootloader instructions, use them as the primary prompt
  // The bootloader tells the agent to call MCP tools to load its full persona
  if (bootloaderInstructions) {
    return bootloaderInstructions;
  }

  // Fallback: build a basic prompt from specialist definition if no bootloader found
  logFn(`[Bootloader] Using fallback prompt for: ${specialist.specialist_id}`);
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
 * Gets available BC Code Intelligence tools (MCP tools)
 * MCP tools are registered with names like "bc-code-intelligence/tool_name"
 */
function getBCIntelTools(logFn: (msg: string) => void): vscode.LanguageModelToolInformation[] {
  const allTools = vscode.lm.tools;

  // Log all available tools for debugging
  logFn(`[Tools] All available tools (${allTools.length}): ${allTools.map(t => t.name).join(', ')}`);

  // MCP tools use "/" separator (e.g., "bc-code-intelligence/set_workspace_info")
  const mcpTools = allTools.filter(tool => tool.name.startsWith('bc-code-intelligence/'));

  // If MCP tools are available, prefer them (they're the real implementation)
  if (mcpTools.length > 0) {
    logFn(`[Tools] Using ${mcpTools.length} MCP tools: ${mcpTools.map(t => t.name).join(', ')}`);
    return mcpTools;
  }

  // Fallback to Language Model tool wrappers (use "_" prefix)
  const lmTools = allTools.filter(tool => tool.name.startsWith(TOOL_PREFIX));
  logFn(`[Tools] Using ${lmTools.length} LM tool wrappers: ${lmTools.map(t => t.name).join(', ')}`);
  return lmTools;
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
  extensionPath: string,
  outputChannel: vscode.OutputChannel
): Promise<void> {
  outputChannel.appendLine(`[@${specialist.specialist_id}] User query: ${request.prompt}`);
  outputChannel.appendLine(`[@${specialist.specialist_id}] Active specialist: ${specialist.title}`);

  // Build conversation messages with system prompt (includes bootloader instructions)
  const systemPrompt = buildSystemPrompt(specialist, extensionPath, (msg) => outputChannel.appendLine(msg));
  const messages: vscode.LanguageModelChatMessage[] = [
    vscode.LanguageModelChatMessage.User(systemPrompt),
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

    // Get available BC Code Intelligence tools (prefer MCP tools over LM wrappers)
    const bcTools = getBCIntelTools((msg) => outputChannel.appendLine(msg));
    outputChannel.appendLine(`[@${specialist.specialist_id}] BC tools found: ${bcTools.length}`);

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
