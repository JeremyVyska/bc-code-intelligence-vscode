import * as vscode from "vscode";
import type {
  ExtensionConfig,
  LayerConfig,
  AuthMethod,
  CacheStrategy,
  LogLevel,
} from "../types/index.js";

const CONFIG_SECTION = "bcCodeIntelligence";

/**
 * Cached extension context for building paths
 */
let extensionContext: vscode.ExtensionContext | null = null;

/**
 * Initialize the config bridge with extension context
 * Must be called during extension activation
 */
export function initConfigBridge(context: vscode.ExtensionContext): void {
  extensionContext = context;
}

/**
 * Reads VSCode extension settings and provides a typed configuration object
 * @param scope - The resource scope for the configuration. Pass `null` to get effective values without a specific resource.
 */
export function getExtensionConfig(
  scope: vscode.ConfigurationScope | null = null,
): ExtensionConfig {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION, scope);

  return {
    layers: {
      company: {
        enabled: config.get<boolean>("layers.company.enabled", false),
        url: config.get<string>("layers.company.url"),
        branch: config.get<string>("layers.company.branch", "main"),
        auth: config.get<AuthMethod>("layers.company.auth", "none"),
        tokenEnvVar: config.get<string>(
          "layers.company.tokenEnvVar",
          "GITHUB_TOKEN",
        ),
      },
      team: {
        enabled: config.get<boolean>("layers.team.enabled", false),
        url: config.get<string>("layers.team.url"),
        branch: config.get<string>("layers.team.branch", "main"),
        auth: config.get<AuthMethod>("layers.team.auth", "none"),
      },
      project: {
        enabled: config.get<boolean>("layers.project.enabled", true),
        path: config.get<string>(
          "layers.project.path",
          "./bc-code-intel-overrides",
        ),
      },
    },
    codeLens: {
      enabled: config.get<boolean>("codeLens.enabled", true),
      maxPerFile: config.get<number>("codeLens.maxPerFile", 20),
    },
    cache: {
      strategy: config.get<CacheStrategy>("cache.strategy", "moderate"),
      maxSizeMb: config.get<number>("cache.maxSizeMb", 100),
    },
    developer: {
      enableDiagnosticTools: config.get<boolean>(
        "developer.enableDiagnosticTools",
        false,
      ),
      logLevel: config.get<LogLevel>("developer.logLevel", "info"),
    },
  };
}

/**
 * Converts extension config to environment variables for MCP server
 */
export function configToMcpEnv(
  config: ExtensionConfig,
): Record<string, string> {
  const env: Record<string, string> = {};

  // Layer configuration - use BC_CODE_INTEL prefix to match MCP expectations
  if (config.layers.company.enabled && config.layers.company.url) {
    env["BC_CODE_INTEL_COMPANY_KNOWLEDGE_URL"] = config.layers.company.url;
    env["BC_CODE_INTEL_COMPANY_KNOWLEDGE_BRANCH"] =
      config.layers.company.branch || "main";

    // Handle authentication - read actual token from environment if needed
    if (
      config.layers.company.auth === "token" &&
      config.layers.company.tokenEnvVar
    ) {
      const tokenValue = process.env[config.layers.company.tokenEnvVar];
      if (tokenValue) {
        env["BC_CODE_INTEL_COMPANY_KNOWLEDGE_TOKEN"] = tokenValue;
      }
    } else if (config.layers.company.auth === "azure-cli") {
      env["BC_CODE_INTEL_COMPANY_KNOWLEDGE_AUTH_TYPE"] = "az_cli";
    } else if (config.layers.company.auth === "github-cli") {
      env["BC_CODE_INTEL_COMPANY_KNOWLEDGE_AUTH_TYPE"] = "gh_cli";
    } else if (config.layers.company.auth === "ssh") {
      env["BC_CODE_INTEL_COMPANY_KNOWLEDGE_AUTH_TYPE"] = "ssh";
    }
  }

  if (config.layers.team.enabled && config.layers.team.url) {
    env["BC_CODE_INTEL_TEAM_KNOWLEDGE_URL"] = config.layers.team.url;
    env["BC_CODE_INTEL_TEAM_KNOWLEDGE_BRANCH"] =
      config.layers.team.branch || "main";

    // Handle team layer authentication
    if (config.layers.team.auth === "token") {
      // For team layer, try common token env vars
      const tokenValue =
        process.env["GITHUB_TOKEN"] || process.env["GIT_TOKEN"];
      if (tokenValue) {
        env["BC_CODE_INTEL_TEAM_KNOWLEDGE_TOKEN"] = tokenValue;
      }
    } else if (config.layers.team.auth === "azure-cli") {
      env["BC_CODE_INTEL_TEAM_KNOWLEDGE_AUTH_TYPE"] = "az_cli";
    } else if (config.layers.team.auth === "github-cli") {
      env["BC_CODE_INTEL_TEAM_KNOWLEDGE_AUTH_TYPE"] = "gh_cli";
    } else if (config.layers.team.auth === "ssh") {
      env["BC_CODE_INTEL_TEAM_KNOWLEDGE_AUTH_TYPE"] = "ssh";
    }
  }

  if (config.layers.project.enabled && config.layers.project.path) {
    env["BC_CODE_INTEL_PROJECT_OVERRIDES_PATH"] = config.layers.project.path;
  }

  // Cache configuration
  env["BC_CODE_INTEL_CACHE_STRATEGY"] = config.cache.strategy;
  if (config.cache.strategy !== "none") {
    env["BC_CODE_INTEL_CACHE_TTL_GIT"] = "10m";
    env["BC_CODE_INTEL_CACHE_TTL_LOCAL"] = "immediate";
  }

  // Developer options
  if (config.developer.enableDiagnosticTools) {
    env["BC_CODE_INTEL_ENABLE_DIAGNOSTICS"] = "true";
  }
  env["BC_CODE_INTEL_LOG_LEVEL"] = config.developer.logLevel;

  return env;
}

/**
 * Creates a configuration change listener
 */
export function onConfigurationChange(
  callback: (config: ExtensionConfig) => void,
): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration(CONFIG_SECTION)) {
      callback(getExtensionConfig());
    }
  });
}
