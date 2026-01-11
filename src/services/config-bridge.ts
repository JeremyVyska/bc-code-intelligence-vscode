import * as vscode from 'vscode';
import type { ExtensionConfig, LayerConfig, AuthMethod, CacheStrategy, LogLevel } from '../types/index.js';

const CONFIG_SECTION = 'bcCodeIntelligence';

/**
 * Reads VSCode extension settings and provides a typed configuration object
 */
export function getExtensionConfig(scope?: vscode.ConfigurationScope): ExtensionConfig {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION, scope);

  return {
    layers: {
      company: {
        enabled: config.get<boolean>('layers.company.enabled', false),
        url: config.get<string>('layers.company.url'),
        branch: config.get<string>('layers.company.branch', 'main'),
        auth: config.get<AuthMethod>('layers.company.auth', 'none'),
        tokenEnvVar: config.get<string>('layers.company.tokenEnvVar', 'GITHUB_TOKEN'),
      },
      team: {
        enabled: config.get<boolean>('layers.team.enabled', false),
        url: config.get<string>('layers.team.url'),
        branch: config.get<string>('layers.team.branch', 'main'),
        auth: config.get<AuthMethod>('layers.team.auth', 'none'),
      },
      project: {
        enabled: config.get<boolean>('layers.project.enabled', true),
        path: config.get<string>('layers.project.path', './bc-code-intel-overrides'),
      },
    },
    codeLens: {
      enabled: config.get<boolean>('codeLens.enabled', true),
      maxPerFile: config.get<number>('codeLens.maxPerFile', 20),
    },
    cache: {
      strategy: config.get<CacheStrategy>('cache.strategy', 'moderate'),
      maxSizeMb: config.get<number>('cache.maxSizeMb', 100),
    },
    developer: {
      enableDiagnosticTools: config.get<boolean>('developer.enableDiagnosticTools', false),
      logLevel: config.get<LogLevel>('developer.logLevel', 'info'),
    },
  };
}

/**
 * Converts extension config to environment variables for MCP server
 */
export function configToMcpEnv(config: ExtensionConfig): Record<string, string> {
  const env: Record<string, string> = {};

  // Layer configuration
  if (config.layers.company.enabled && config.layers.company.url) {
    env['BC_INTEL_COMPANY_LAYER_URL'] = config.layers.company.url;
    env['BC_INTEL_COMPANY_LAYER_BRANCH'] = config.layers.company.branch || 'main';
    env['BC_INTEL_COMPANY_LAYER_AUTH'] = config.layers.company.auth || 'none';
  }

  if (config.layers.team.enabled && config.layers.team.url) {
    env['BC_INTEL_TEAM_LAYER_URL'] = config.layers.team.url;
    env['BC_INTEL_TEAM_LAYER_BRANCH'] = config.layers.team.branch || 'main';
    env['BC_INTEL_TEAM_LAYER_AUTH'] = config.layers.team.auth || 'none';
  }

  if (config.layers.project.enabled && config.layers.project.path) {
    env['BC_INTEL_PROJECT_LAYER_PATH'] = config.layers.project.path;
  }

  // Cache configuration
  env['BC_INTEL_CACHE_STRATEGY'] = config.cache.strategy;
  env['BC_INTEL_CACHE_MAX_SIZE_MB'] = String(config.cache.maxSizeMb);

  // Developer options
  if (config.developer.enableDiagnosticTools) {
    env['BC_INTEL_ENABLE_DIAGNOSTIC_TOOLS'] = 'true';
  }
  env['BC_INTEL_LOG_LEVEL'] = config.developer.logLevel;

  return env;
}

/**
 * Creates a configuration change listener
 */
export function onConfigurationChange(
  callback: (config: ExtensionConfig) => void
): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration(CONFIG_SECTION)) {
      callback(getExtensionConfig());
    }
  });
}
