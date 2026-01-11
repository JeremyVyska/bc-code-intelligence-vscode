/**
 * Configuration types for BC Code Intelligence extension
 */

export type AuthMethod = 'none' | 'token' | 'ssh' | 'azure-cli';
export type CacheStrategy = 'none' | 'minimal' | 'moderate' | 'aggressive';
export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

export interface LayerConfig {
  enabled: boolean;
  url?: string;
  branch?: string;
  auth?: AuthMethod;
  tokenEnvVar?: string;
  path?: string;
}

export interface ExtensionConfig {
  layers: {
    company: LayerConfig;
    team: LayerConfig;
    project: LayerConfig;
  };
  codeLens: {
    enabled: boolean;
    maxPerFile: number;
  };
  cache: {
    strategy: CacheStrategy;
    maxSizeMb: number;
  };
  developer: {
    enableDiagnosticTools: boolean;
    logLevel: LogLevel;
  };
}
