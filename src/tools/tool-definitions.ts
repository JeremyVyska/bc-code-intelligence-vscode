/**
 * Tool definitions for BC Code Intelligence MCP tools
 * These are registered as VSCode Language Model Tools
 */

export interface ToolDefinition {
  name: string;
  displayName: string;
  description: string;
  modelDescription: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
      default?: unknown;
    }>;
    required?: string[];
  };
  tags: string[];
}

export const coreTools: ToolDefinition[] = [
  {
    name: 'bc-code-intelligence_findKnowledge',
    displayName: 'Find BC Knowledge',
    description: 'Search BC development knowledge',
    modelDescription: 'Search the Business Central knowledge base for topics, specialists, workflows, and best practices. Use this to find relevant BC development guidance.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query for BC knowledge',
        },
        search_type: {
          type: 'string',
          description: 'Type of content to search',
          enum: ['topics', 'specialists', 'workflows', 'all'],
          default: 'all',
        },
        limit: {
          type: 'number',
          description: 'Maximum results to return',
          default: 10,
        },
      },
      required: ['query'],
    },
    tags: ['bc', 'business-central', 'knowledge', 'search'],
  },
  {
    name: 'bc-code-intelligence_getTopic',
    displayName: 'Get BC Topic',
    description: 'Get detailed BC topic content',
    modelDescription: 'Retrieve detailed content for a specific Business Central knowledge topic, including code samples and best practices.',
    inputSchema: {
      type: 'object',
      properties: {
        topic_id: {
          type: 'string',
          description: 'The topic ID to retrieve',
        },
        include_samples: {
          type: 'boolean',
          description: 'Include code samples in response',
          default: true,
        },
      },
      required: ['topic_id'],
    },
    tags: ['bc', 'business-central', 'knowledge', 'topic'],
  },
  {
    name: 'bc-code-intelligence_askExpert',
    displayName: 'Ask BC Expert',
    description: 'Get expert BC guidance from a specialist',
    modelDescription: 'Consult a BC specialist for expert guidance. Specialists include Sam Coder (development), Alex Architect (architecture), Dean Debug (debugging), Quinn Tester (testing), and more.',
    inputSchema: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description: 'Question for the specialist',
        },
        context: {
          type: 'string',
          description: 'Additional context about your situation',
        },
        preferred_specialist: {
          type: 'string',
          description: 'Preferred specialist ID (e.g., sam-coder, alex-architect)',
        },
        autonomous_mode: {
          type: 'boolean',
          description: 'Allow specialist to work autonomously',
          default: false,
        },
      },
      required: ['question'],
    },
    tags: ['bc', 'business-central', 'expert', 'specialist'],
  },
  {
    name: 'bc-code-intelligence_analyzeCode',
    displayName: 'Analyze AL Code',
    description: 'Analyze AL code for issues and improvements',
    modelDescription: 'Analyze AL (Business Central) code for performance issues, quality concerns, security vulnerabilities, or pattern compliance.',
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'AL code to analyze',
        },
        analysis_type: {
          type: 'string',
          description: 'Type of analysis to perform',
          enum: ['performance', 'quality', 'security', 'patterns', 'comprehensive'],
          default: 'comprehensive',
        },
        operation: {
          type: 'string',
          description: 'Specific operation context (e.g., "insert", "modify", "delete")',
        },
      },
      required: ['code'],
    },
    tags: ['bc', 'business-central', 'al', 'analysis', 'code-review'],
  },
  {
    name: 'bc-code-intelligence_startWorkflow',
    displayName: 'Start BC Workflow',
    description: 'Start a structured BC workflow',
    modelDescription: 'Start a multi-phase workflow for complex BC development tasks like architecture review, security audit, or upgrade planning.',
    inputSchema: {
      type: 'object',
      properties: {
        workflow_type: {
          type: 'string',
          description: 'Type of workflow to start',
          enum: [
            'code_optimization',
            'architecture_review',
            'security_audit',
            'perf_review',
            'integration_design',
            'upgrade_planning',
            'testing_strategy',
            'dev_onboarding',
            'app_takeover',
            'spec_analysis',
            'bug_investigation',
            'monolith_to_modules',
            'data_flow_tracing',
            'full_review',
          ],
        },
        context: {
          type: 'string',
          description: 'Context for the workflow',
        },
        execution_mode: {
          type: 'string',
          description: 'Execution mode',
          enum: ['guided', 'autonomous'],
          default: 'guided',
        },
      },
      required: ['workflow_type'],
    },
    tags: ['bc', 'business-central', 'workflow'],
  },
  {
    name: 'bc-code-intelligence_advanceWorkflow',
    displayName: 'Advance Workflow',
    description: 'Progress to the next workflow phase',
    modelDescription: 'Advance a running workflow to its next phase, providing results from the current phase.',
    inputSchema: {
      type: 'object',
      properties: {
        workflow_id: {
          type: 'string',
          description: 'ID of the workflow to advance',
        },
        phase_results: {
          type: 'string',
          description: 'Results from the current phase',
        },
        next_focus: {
          type: 'string',
          description: 'Specific focus for the next phase',
        },
      },
      required: ['workflow_id'],
    },
    tags: ['bc', 'business-central', 'workflow'],
  },
  {
    name: 'bc-code-intelligence_getWorkflowHelp',
    displayName: 'Get Workflow Help',
    description: 'Get help for current workflow phase',
    modelDescription: 'Get guidance, status, or next steps for a running workflow.',
    inputSchema: {
      type: 'object',
      properties: {
        workflow_id: {
          type: 'string',
          description: 'ID of the workflow',
        },
        help_type: {
          type: 'string',
          description: 'Type of help needed',
          enum: ['status', 'guidance', 'next-steps', 'methodology'],
          default: 'guidance',
        },
      },
      required: ['workflow_id'],
    },
    tags: ['bc', 'business-central', 'workflow', 'help'],
  },
  {
    name: 'bc-code-intelligence_listSpecialists',
    displayName: 'List Specialists',
    description: 'Browse available BC specialists',
    modelDescription: 'List available BC development specialists, optionally filtered by domain or expertise.',
    inputSchema: {
      type: 'object',
      properties: {
        domain: {
          type: 'string',
          description: 'Filter by domain (e.g., "development", "testing", "security")',
        },
        expertise: {
          type: 'string',
          description: 'Filter by expertise area',
        },
      },
    },
    tags: ['bc', 'business-central', 'specialists'],
  },
  {
    name: 'bc-code-intelligence_setWorkspaceInfo',
    displayName: 'Set Workspace Info',
    description: 'Configure workspace context',
    modelDescription: 'Set the workspace root and available MCP servers for context-aware assistance.',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_root: {
          type: 'string',
          description: 'Path to workspace root',
        },
        available_mcps: {
          type: 'string',
          description: 'JSON array of available MCP server names',
        },
      },
      required: ['workspace_root'],
    },
    tags: ['bc', 'business-central', 'workspace', 'config'],
  },
  {
    name: 'bc-code-intelligence_getWorkspaceInfo',
    displayName: 'Get Workspace Info',
    description: 'Get current workspace configuration',
    modelDescription: 'Retrieve the current workspace context and configuration.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    tags: ['bc', 'business-central', 'workspace'],
  },
];

export const diagnosticTools: ToolDefinition[] = [
  {
    name: 'bc-code-intelligence_diagnoseGitLayer',
    displayName: 'Diagnose Git Layer',
    description: 'Debug Git layer connection issues',
    modelDescription: 'Diagnose issues with Git-based knowledge layers.',
    inputSchema: {
      type: 'object',
      properties: {
        layer_name: {
          type: 'string',
          description: 'Name of the layer to diagnose',
        },
      },
      required: ['layer_name'],
    },
    tags: ['bc', 'diagnostic', 'git'],
  },
  {
    name: 'bc-code-intelligence_validateLayerConfig',
    displayName: 'Validate Layer Config',
    description: 'Validate layer configuration',
    modelDescription: 'Validate the configuration of knowledge layers.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    tags: ['bc', 'diagnostic', 'config'],
  },
  {
    name: 'bc-code-intelligence_testAzureDevOpsPat',
    displayName: 'Test Azure DevOps PAT',
    description: 'Test Azure DevOps PAT authentication',
    modelDescription: 'Test if an Azure DevOps Personal Access Token is valid.',
    inputSchema: {
      type: 'object',
      properties: {
        organization: {
          type: 'string',
          description: 'Azure DevOps organization name',
        },
      },
      required: ['organization'],
    },
    tags: ['bc', 'diagnostic', 'azure-devops', 'auth'],
  },
  {
    name: 'bc-code-intelligence_getLayerDiagnostics',
    displayName: 'Get Layer Diagnostics',
    description: 'Get layer loading diagnostics',
    modelDescription: 'Get detailed diagnostics about layer loading and status.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    tags: ['bc', 'diagnostic', 'layers'],
  },
  {
    name: 'bc-code-intelligence_diagnoseLocalLayer',
    displayName: 'Diagnose Local Layer',
    description: 'Debug local layer issues',
    modelDescription: 'Diagnose issues with local/project knowledge layers.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the local layer',
        },
      },
      required: ['path'],
    },
    tags: ['bc', 'diagnostic', 'local'],
  },
  {
    name: 'bc-code-intelligence_reloadLayers',
    displayName: 'Reload Layers',
    description: 'Force reload all layers',
    modelDescription: 'Force reload all knowledge layers from their sources.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    tags: ['bc', 'diagnostic', 'layers', 'reload'],
  },
];
