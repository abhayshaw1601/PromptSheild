import * as vscode from "vscode";

export interface PromptShieldLogger {
  readonly info: (message: string, details?: Readonly<Record<string, unknown>>) => void;
  readonly warn: (message: string, details?: Readonly<Record<string, unknown>>) => void;
  readonly error: (message: string, error?: unknown, details?: Readonly<Record<string, unknown>>) => void;
  readonly show: () => void;
}

export function createPromptShieldLogger(outputChannel: vscode.OutputChannel): PromptShieldLogger {
  return {
    info: (message, details) => {
      outputChannel.appendLine(formatLogLine("INFO", message, details));
    },
    warn: (message, details) => {
      outputChannel.appendLine(formatLogLine("WARN", message, details));
    },
    error: (message, error, details) => {
      outputChannel.appendLine(formatLogLine("ERROR", message, details));
      outputChannel.appendLine(formatError(error));
    },
    show: () => {
      outputChannel.show(true);
    }
  };
}

function formatLogLine(level: string, message: string, details?: Readonly<Record<string, unknown>>): string {
  const timestamp = new Date().toISOString();
  const suffix = details === undefined ? "" : ` ${JSON.stringify(details)}`;

  return `[${timestamp}] [PromptShield] [${level}] ${message}${suffix}`;
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return `[${new Date().toISOString()}] [PromptShield] [ERROR] ${error.stack ?? error.message}`;
  }

  return `[${new Date().toISOString()}] [PromptShield] [ERROR] ${String(error)}`;
}
