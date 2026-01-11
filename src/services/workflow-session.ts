import * as vscode from 'vscode';

/**
 * Workflow phase definition
 */
export interface WorkflowPhase {
  id: string;
  name: string;
  description: string;
  checklist: string[];
  nextPhaseTrigger?: string;
}

/**
 * Workflow session state
 */
export interface WorkflowSession {
  id: string;
  workflowType: string;
  workflowName: string;
  startedAt: Date;
  currentPhaseIndex: number;
  phases: WorkflowPhase[];
  context: Record<string, unknown>;
  status: 'active' | 'paused' | 'completed' | 'abandoned';
  specialistId: string;
  phaseResults: Record<string, string>;
}

/**
 * Workflow types with their phase definitions
 */
const WORKFLOW_DEFINITIONS: Record<string, { name: string; phases: WorkflowPhase[] }> = {
  code_optimization: {
    name: 'Code Optimization',
    phases: [
      {
        id: 'analysis',
        name: 'Analysis',
        description: 'Analyze code for performance bottlenecks',
        checklist: ['Identify hot paths', 'Check SQL queries', 'Review loops'],
        nextPhaseTrigger: 'Analysis complete',
      },
      {
        id: 'recommendations',
        name: 'Recommendations',
        description: 'Generate optimization recommendations',
        checklist: ['Prioritize by impact', 'Consider trade-offs'],
        nextPhaseTrigger: 'Recommendations approved',
      },
      {
        id: 'implementation',
        name: 'Implementation',
        description: 'Apply optimizations',
        checklist: ['Apply changes', 'Test performance', 'Document changes'],
      },
    ],
  },
  architecture_review: {
    name: 'Architecture Review',
    phases: [
      {
        id: 'discovery',
        name: 'Discovery',
        description: 'Understand current architecture',
        checklist: ['Map components', 'Identify dependencies', 'Document patterns'],
        nextPhaseTrigger: 'Architecture documented',
      },
      {
        id: 'assessment',
        name: 'Assessment',
        description: 'Evaluate architecture quality',
        checklist: ['Check scalability', 'Review maintainability', 'Assess extensibility'],
        nextPhaseTrigger: 'Assessment complete',
      },
      {
        id: 'recommendations',
        name: 'Recommendations',
        description: 'Provide improvement suggestions',
        checklist: ['Prioritize improvements', 'Create roadmap'],
      },
    ],
  },
  security_audit: {
    name: 'Security Audit',
    phases: [
      {
        id: 'scan',
        name: 'Security Scan',
        description: 'Scan for security vulnerabilities',
        checklist: ['Check permissions', 'Review TableData access', 'Audit external calls'],
        nextPhaseTrigger: 'Scan complete',
      },
      {
        id: 'analysis',
        name: 'Vulnerability Analysis',
        description: 'Analyze identified vulnerabilities',
        checklist: ['Assess severity', 'Identify root causes'],
        nextPhaseTrigger: 'Analysis complete',
      },
      {
        id: 'remediation',
        name: 'Remediation Plan',
        description: 'Create remediation plan',
        checklist: ['Prioritize fixes', 'Define timelines', 'Assign owners'],
      },
    ],
  },
  testing_strategy: {
    name: 'Testing Strategy',
    phases: [
      {
        id: 'assessment',
        name: 'Coverage Assessment',
        description: 'Assess current test coverage',
        checklist: ['Map test coverage', 'Identify gaps'],
        nextPhaseTrigger: 'Assessment complete',
      },
      {
        id: 'planning',
        name: 'Test Planning',
        description: 'Plan testing approach',
        checklist: ['Define test types', 'Prioritize areas', 'Set targets'],
        nextPhaseTrigger: 'Plan approved',
      },
      {
        id: 'implementation',
        name: 'Implementation',
        description: 'Implement testing strategy',
        checklist: ['Write tests', 'Set up CI', 'Document approach'],
      },
    ],
  },
  bug_investigation: {
    name: 'Bug Investigation',
    phases: [
      {
        id: 'reproduce',
        name: 'Reproduce',
        description: 'Reproduce the bug',
        checklist: ['Gather steps', 'Identify conditions', 'Document behavior'],
        nextPhaseTrigger: 'Bug reproduced',
      },
      {
        id: 'diagnose',
        name: 'Diagnose',
        description: 'Find root cause',
        checklist: ['Add tracing', 'Analyze logs', 'Isolate cause'],
        nextPhaseTrigger: 'Root cause identified',
      },
      {
        id: 'fix',
        name: 'Fix',
        description: 'Implement and verify fix',
        checklist: ['Implement fix', 'Add tests', 'Verify resolution'],
      },
    ],
  },
};

/**
 * Manages workflow sessions for multi-phase prompts
 */
export class WorkflowSessionManager {
  private sessions: Map<string, WorkflowSession> = new Map();
  private activeSessionId: string | null = null;
  private onSessionChangeEmitter = new vscode.EventEmitter<WorkflowSession | null>();

  readonly onSessionChange = this.onSessionChangeEmitter.event;

  /**
   * Start a new workflow session
   */
  startWorkflow(workflowType: string, specialistId: string, context?: Record<string, unknown>): WorkflowSession {
    const definition = WORKFLOW_DEFINITIONS[workflowType];

    if (!definition) {
      throw new Error(`Unknown workflow type: ${workflowType}`);
    }

    const session: WorkflowSession = {
      id: `workflow-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      workflowType,
      workflowName: definition.name,
      startedAt: new Date(),
      currentPhaseIndex: 0,
      phases: definition.phases,
      context: context || {},
      status: 'active',
      specialistId,
      phaseResults: {},
    };

    this.sessions.set(session.id, session);
    this.activeSessionId = session.id;
    this.onSessionChangeEmitter.fire(session);

    return session;
  }

  /**
   * Get the active workflow session
   */
  getActiveSession(): WorkflowSession | null {
    if (!this.activeSessionId) return null;
    return this.sessions.get(this.activeSessionId) || null;
  }

  /**
   * Get a session by ID
   */
  getSession(sessionId: string): WorkflowSession | null {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Get current phase of active session
   */
  getCurrentPhase(): WorkflowPhase | null {
    const session = this.getActiveSession();
    if (!session) return null;
    return session.phases[session.currentPhaseIndex] || null;
  }

  /**
   * Advance to next phase
   */
  advancePhase(sessionId: string, phaseResults?: string): WorkflowSession | null {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== 'active') return null;

    // Store results for current phase
    if (phaseResults) {
      const currentPhase = session.phases[session.currentPhaseIndex];
      session.phaseResults[currentPhase.id] = phaseResults;
    }

    // Advance to next phase
    if (session.currentPhaseIndex < session.phases.length - 1) {
      session.currentPhaseIndex++;
    } else {
      // Completed all phases
      session.status = 'completed';
    }

    this.onSessionChangeEmitter.fire(session);
    return session;
  }

  /**
   * Abandon a workflow
   */
  abandonWorkflow(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = 'abandoned';
      if (this.activeSessionId === sessionId) {
        this.activeSessionId = null;
      }
      this.onSessionChangeEmitter.fire(null);
    }
  }

  /**
   * Get workflow progress as formatted string
   */
  getProgressSummary(sessionId: string): string {
    const session = this.sessions.get(sessionId);
    if (!session) return 'No active workflow';

    const current = session.currentPhaseIndex + 1;
    const total = session.phases.length;
    const phase = session.phases[session.currentPhaseIndex];

    return `**${session.workflowName}** - Phase ${current}/${total}: ${phase.name}\n\n${phase.description}`;
  }

  /**
   * Get available workflow types
   */
  static getAvailableWorkflows(): Array<{ id: string; name: string; phases: number }> {
    return Object.entries(WORKFLOW_DEFINITIONS).map(([id, def]) => ({
      id,
      name: def.name,
      phases: def.phases.length,
    }));
  }

  /**
   * Format current phase checklist as markdown
   */
  getPhaseChecklist(sessionId: string): string {
    const session = this.sessions.get(sessionId);
    if (!session) return '';

    const phase = session.phases[session.currentPhaseIndex];
    const lines = [`### ${phase.name} Checklist\n`];

    for (const item of phase.checklist) {
      lines.push(`- [ ] ${item}`);
    }

    if (phase.nextPhaseTrigger) {
      lines.push(`\n**Advance when:** ${phase.nextPhaseTrigger}`);
    }

    return lines.join('\n');
  }
}
