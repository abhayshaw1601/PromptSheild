import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { PROMPTSHIELD_DIAGNOSTIC_SOURCE, PROMPTSHIELD_RESTRICTED_GPL_CODE } from "./promptShieldDiagnostics";
import type { PromptShieldLogger } from "./promptShieldLogger";

const COPY_REMEDIATION_PROMPT_COMMAND = "promptshield.copyCorporateRemediationPrompt";
const AUTO_FIX_WITH_LOCAL_AI_COMMAND = "promptshield.autoFixWithLocalAi";
const REPLACE_SECRET_WITH_ENV_COMMAND = "promptshield.replaceSecretWithEnv";
const OLLAMA_GENERATE_URL = "http://127.0.0.1:11434/api/generate";
const OLLAMA_MODELS: readonly string[] = [
  "deepseek-r1:7b",
  "qwen3.5:9b",
  "gemma3:4b",
  "qwen2.5-coder:1.5b",
  "gemma3:1b"
];
const MAX_OLLAMA_RESPONSE_BYTES = 2 * 1024 * 1024;

const CORPORATE_REMEDIATION_PROMPT = `Corporate remediation instruction:
Rewrite the flagged code so it remains functionally equivalent while being structurally distinct from restricted GPL source material.
Do not preserve copied control-flow structure, identifier naming patterns, comments, formatting, or expression ordering.
Return only raw replacement code. Do not use markdown fences, headings, prose, or before/after explanations.`;

interface OllamaGenerateResponse {
  readonly response?: string;
  readonly done?: boolean;
  readonly error?: string;
}

interface OllamaGeneratePayload {
  readonly model: string;
  readonly prompt: string;
  readonly stream: false;
}

const SECRET_DIAGNOSTIC_CODES = new Set<string>([
  "openai-api-key",
  "google-api-key",
  "aws-access-key-id",
  "bearer-token",
  "jwt-token",
  "private-key-material",
  "database-connection-string",
  "generic-secret-assignment"
]);

export class PromptShieldCodeActionProvider implements vscode.CodeActionProvider {
  public static readonly providedCodeActionKinds: readonly vscode.CodeActionKind[] = [
    vscode.CodeActionKind.QuickFix
  ];

  public constructor(private readonly logger: PromptShieldLogger) {}

  public provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range,
    context: vscode.CodeActionContext
  ): vscode.CodeAction[] {
    this.logger.info("CodeActionProvider invoked.", {
      uri: document.uri.toString(),
      languageId: document.languageId,
      diagnosticCount: context.diagnostics.length,
      rangeStartLine: range.start.line,
      rangeStartCharacter: range.start.character
    });

    const promptShieldDiagnostics = context.diagnostics.filter(isPromptShieldDiagnostic);

    if (promptShieldDiagnostics.length === 0) {
      this.logger.info("No PromptShield diagnostics found for quick fix request.", {
        uri: document.uri.toString()
      });
      return [];
    }

    const diagnosticRange = promptShieldDiagnostics[0].range.intersection(range) ?? promptShieldDiagnostics[0].range;
    this.logger.info("PromptShield quick fixes created.", {
      uri: document.uri.toString(),
      promptShieldDiagnosticCount: promptShieldDiagnostics.length,
      rangeStartLine: diagnosticRange.start.line,
      rangeStartCharacter: diagnosticRange.start.character,
      rangeEndLine: diagnosticRange.end.line,
      rangeEndCharacter: diagnosticRange.end.character
    });

    const firstDiagnostic = promptShieldDiagnostics[0];
    const actions = [createCopyPromptAction(promptShieldDiagnostics)];

    if (isRestrictedGplDiagnostic(firstDiagnostic)) {
      actions.push(createAutoFixAction(document.uri, diagnosticRange, promptShieldDiagnostics));
    } else if (isSecretDiagnostic(firstDiagnostic)) {
      actions.push(createSecretReplacementAction(document.uri, diagnosticRange, firstDiagnostic));
      actions.push(createAutoFixAction(document.uri, diagnosticRange, promptShieldDiagnostics));
    }

    return actions;
  }
}

export function registerPromptShieldCodeActions(context: vscode.ExtensionContext, logger: PromptShieldLogger): void {
  logger.info("Registering PromptShield CodeActionProvider.", {
      languages: ["javascript", "javascriptreact", "typescript", "typescriptreact"],
    commands: [COPY_REMEDIATION_PROMPT_COMMAND, AUTO_FIX_WITH_LOCAL_AI_COMMAND, REPLACE_SECRET_WITH_ENV_COMMAND]
  });

  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      [
        { language: "javascript", scheme: "file" },
        { language: "javascriptreact", scheme: "file" },
        { language: "typescript", scheme: "file" },
        { language: "typescriptreact", scheme: "file" }
      ],
      new PromptShieldCodeActionProvider(logger),
      {
        providedCodeActionKinds: PromptShieldCodeActionProvider.providedCodeActionKinds
      }
    ),
    vscode.commands.registerCommand(COPY_REMEDIATION_PROMPT_COMMAND, async () => {
      logger.info("Copy remediation prompt command started.");
      await vscode.env.clipboard.writeText(CORPORATE_REMEDIATION_PROMPT);
      logger.info("Copy remediation prompt command finished.", {
        promptCharacterCount: CORPORATE_REMEDIATION_PROMPT.length
      });
    }),
    vscode.commands.registerCommand(AUTO_FIX_WITH_LOCAL_AI_COMMAND, async (uri: vscode.Uri, range: vscode.Range) => {
      await autoFixWithLocalAi(uri, range, logger);
    }),
    vscode.commands.registerCommand(REPLACE_SECRET_WITH_ENV_COMMAND, async (uri: vscode.Uri, range: vscode.Range, diagnosticCode: string) => {
      await replaceSecretWithEnv(uri, range, diagnosticCode, logger);
    })
  );
}

function createCopyPromptAction(diagnostics: readonly vscode.Diagnostic[]): vscode.CodeAction {
  const action = new vscode.CodeAction("Copy Corporate Remediation Prompt", vscode.CodeActionKind.QuickFix);
  action.diagnostics = [...diagnostics];
  action.isPreferred = false;
  action.command = {
    title: "Copy Corporate Remediation Prompt",
    command: COPY_REMEDIATION_PROMPT_COMMAND
  };

  return action;
}

function createAutoFixAction(
  uri: vscode.Uri,
  range: vscode.Range,
  diagnostics: readonly vscode.Diagnostic[]
): vscode.CodeAction {
  const action = new vscode.CodeAction("Auto-Fix with Local AI", vscode.CodeActionKind.QuickFix);
  action.diagnostics = [...diagnostics];
  action.isPreferred = true;
  action.command = {
    title: "Auto-Fix with Local AI",
    command: AUTO_FIX_WITH_LOCAL_AI_COMMAND,
    arguments: [uri, range]
  };

  return action;
}

function createSecretReplacementAction(
  uri: vscode.Uri,
  range: vscode.Range,
  diagnostic: vscode.Diagnostic
): vscode.CodeAction {
  const action = new vscode.CodeAction("Replace Secret with Environment Variable", vscode.CodeActionKind.QuickFix);
  action.diagnostics = [diagnostic];
  action.isPreferred = true;
  action.command = {
    title: "Replace Secret with Environment Variable",
    command: REPLACE_SECRET_WITH_ENV_COMMAND,
    arguments: [uri, range, String(diagnostic.code ?? "generic-secret-assignment")]
  };

  return action;
}

async function replaceSecretWithEnv(
  uri: vscode.Uri,
  range: vscode.Range,
  diagnosticCode: string,
  logger: PromptShieldLogger
): Promise<void> {
  const startedAt = Date.now();

  try {
    logger.info("Secret replacement command started.", {
      uri: uri.toString(),
      diagnosticCode,
      rangeStartLine: range.start.line,
      rangeStartCharacter: range.start.character,
      rangeEndLine: range.end.line,
      rangeEndCharacter: range.end.character
    });

    const document = await vscode.workspace.openTextDocument(uri);
    const flaggedCode = document.getText(range);
    const replacement = createSecretEnvReplacement(flaggedCode, diagnosticCode);

    const secretValue = extractSecretValue(flaggedCode);
    if (secretValue) {
      const envName = envNameForDiagnosticCode(diagnosticCode);
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (workspaceFolders && workspaceFolders.length > 0) {
        const rootPath = workspaceFolders[0].uri.fsPath;
        const envPath = path.join(rootPath, ".env");
        const envExamplePath = path.join(rootPath, ".env.example");

        await appendOrUpdateEnvFile(envPath, envName, secretValue, logger);
        await appendOrUpdateEnvFile(envExamplePath, envName, `your_${envName.toLowerCase()}_here`, logger);
      }
    }

    const edit = new vscode.WorkspaceEdit();
    edit.replace(uri, range, replacement);
    const didApply = await vscode.workspace.applyEdit(edit);
    logger.info("Secret replacement workspace edit attempted.", {
      uri: uri.toString(),
      didApply,
      durationMs: Date.now() - startedAt
    });

    if (!didApply) {
      throw new Error("VS Code rejected the workspace edit.");
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown secret replacement error.";
    logger.error("Secret replacement command failed.", error, {
      uri: uri.toString(),
      durationMs: Date.now() - startedAt
    });
    await vscode.window.showErrorMessage(`PromptShield could not replace the secret with an environment variable. ${detail}`);
  }
}

export function createSecretEnvReplacement(flaggedCode: string, diagnosticCode: string): string {
  const envName = envNameForDiagnosticCode(diagnosticCode);
  const envExpression = `process.env.${envName}`;
  const assignmentMatch = /^(\s*(?:const|let|var)\s+[\w$]+\s*=\s*)(["'`])[\s\S]*\2(\s*;?\s*)$/.exec(flaggedCode);

  if (assignmentMatch !== null) {
    return `${assignmentMatch[1]}${envExpression}${assignmentMatch[3]}`;
  }

  const propertyMatch = /^(\s*[\w$.-]+\s*[:=]\s*)(["'`])[\s\S]*\2(\s*,?\s*)$/.exec(flaggedCode);

  if (propertyMatch !== null) {
    return `${propertyMatch[1]}${envExpression}${propertyMatch[3]}`;
  }

  return envExpression;
}

function envNameForDiagnosticCode(diagnosticCode: string): string {
  switch (diagnosticCode) {
    case "openai-api-key":
      return "OPENAI_API_KEY";
    case "google-api-key":
      return "GOOGLE_API_KEY";
    case "aws-access-key-id":
      return "AWS_ACCESS_KEY_ID";
    case "bearer-token":
      return "API_BEARER_TOKEN";
    case "jwt-token":
      return "JWT_TOKEN";
    case "database-connection-string":
      return "DATABASE_URL";
    case "private-key-material":
      return "PRIVATE_KEY";
    default:
      return "PROMPTSHIELD_SECRET";
  }
}

async function autoFixWithLocalAi(uri: vscode.Uri, range: vscode.Range, logger: PromptShieldLogger): Promise<void> {
  const startedAt = Date.now();

  try {
    logger.info("Auto-fix command started.", {
      uri: uri.toString(),
      rangeStartLine: range.start.line,
      rangeStartCharacter: range.start.character,
      rangeEndLine: range.end.line,
      rangeEndCharacter: range.end.character
    });

    const document = await vscode.workspace.openTextDocument(uri);
    const flaggedCode = document.getText(range);
    const diagnostics = vscode.languages.getDiagnostics(uri);
    const matchingDiagnostic = diagnostics.find((diagnostic) => diagnostic.source === PROMPTSHIELD_DIAGNOSTIC_SOURCE && diagnostic.range.intersection(range) !== undefined);
    const diagnosticCode = String(matchingDiagnostic?.code ?? "");
    logger.info("Flagged code extracted for remediation.", {
      uri: uri.toString(),
      diagnosticCode,
      flaggedCharacterCount: flaggedCode.length,
      flaggedLineCount: flaggedCode.split(/\r?\n/).length
    });

    if (isSecretDiagnosticCode(diagnosticCode)) {
      const secretValue = extractSecretValue(flaggedCode);
      if (secretValue) {
        const envName = envNameForDiagnosticCode(diagnosticCode);
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
          const rootPath = workspaceFolders[0].uri.fsPath;
          const envPath = path.join(rootPath, ".env");
          const envExamplePath = path.join(rootPath, ".env.example");

          await appendOrUpdateEnvFile(envPath, envName, secretValue, logger);
          await appendOrUpdateEnvFile(envExamplePath, envName, `your_${envName.toLowerCase()}_here`, logger);
        }
      }
    }

    const prompt = buildRemediationPrompt(flaggedCode, diagnosticCode);
    const generatedCode = await requestOllamaCompletion(prompt, OLLAMA_MODELS, logger);
    const replacement = sanitizeGeneratedReplacement(generatedCode, flaggedCode);
    logger.info("Local AI remediation response received.", {
      uri: uri.toString(),
      generatedCharacterCount: generatedCode.length,
      replacementCharacterCount: replacement.length
    });

    if (replacement.length === 0) {
      throw new Error("The local model returned an empty remediation.");
    }

    const edit = new vscode.WorkspaceEdit();
    edit.replace(uri, range, replacement);
    const didApply = await vscode.workspace.applyEdit(edit);
    logger.info("Workspace edit attempted.", {
      uri: uri.toString(),
      didApply,
      durationMs: Date.now() - startedAt
    });

    if (!didApply) {
      throw new Error("VS Code rejected the workspace edit.");
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown local AI error.";
    logger.error("Auto-fix command failed.", error, {
      uri: uri.toString(),
      durationMs: Date.now() - startedAt
    });
    await vscode.window.showErrorMessage(
      `PromptShield could not connect to local Ollama or complete the remediation. Start your local Ollama server and ensure qwen2.5-coder:1.5b or gemma3:1b is available. ${detail}`
    );
  }
}

function buildRemediationPrompt(flaggedCode: string, diagnosticCode: string): string {
  if (isSecretDiagnosticCode(diagnosticCode)) {
    const redactedCode = redactSecretsForPrompt(flaggedCode);
    const envName = envNameForDiagnosticCode(diagnosticCode);

    return `You are PromptShield running on a local edge-security gateway.
Rewrite the flagged code to remove the hardcoded secret and read it from an environment variable instead.
Use process.env.${envName}.
Return only raw replacement code.
Do not include markdown fences.
Do not include explanatory prose.
The original secret value has been redacted and must not be reconstructed.

Flagged code:
${redactedCode}`;
  }

  return `You are PromptShield running on a local edge-security gateway.
Rewrite the flagged code block to be structurally distinct from restricted GPL source material while preserving intended behavior.
Return only raw replacement code.
Do not include markdown fences.
Do not include explanatory prose.
Do not include phrases like "Here is", "This code", "The class", or "flagged code".
Do not append the original flagged code after the rewrite.

To be structurally distinct, you MUST perform significant AST transformations:
1. If recursion is used, rewrite it as iterative loops (using stack/queue structures where applicable) or vice versa.
2. Reverse branching checks (e.g., rewrite "if (r === null)" as "if (r)" with swapped else branches).
3. Combine or split helper functions, and rearrange expression ordering.

Flagged code:
${flaggedCode}`;
}

export function redactSecretsForPrompt(flaggedCode: string): string {
  return flaggedCode
    .replace(/\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g, "REDACTED_OPENAI_API_KEY")
    .replace(/\bAIza[0-9A-Za-z_-]{35}\b/g, "REDACTED_GOOGLE_API_KEY")
    .replace(/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, "REDACTED_AWS_ACCESS_KEY_ID")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{20,}\b/g, "Bearer REDACTED_TOKEN")
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "REDACTED_JWT_TOKEN")
    .replace(/\b(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis):\/\/[^\s"'`<>]+/gi, "REDACTED_DATABASE_URL")
    .replace(/(["'`])([^"'`\s]{12,})\1/g, (match: string, quote: string, value: string) => {
      if (value.startsWith("REDACTED_")) {
        return match;
      }

      return `${quote}REDACTED_SECRET${quote}`;
    });
}

export function sanitizeGeneratedReplacement(generatedCode: string, flaggedCode: string): string {
  const fencedCode = extractFirstFencedCodeBlock(generatedCode);
  const candidate = (fencedCode ?? generatedCode).trim();
  const withoutOriginalTail = removeOriginalFlaggedCodeTail(candidate, flaggedCode);
  const lines = withoutOriginalTail.split(/\r?\n/);
  const codeLines = trimNonCodeEdges(lines);

  return codeLines.join("\n").trim();
}

function extractFirstFencedCodeBlock(value: string): string | undefined {
  const match = /```(?:[A-Za-z0-9_-]+)?\s*\r?\n([\s\S]*?)```/.exec(value);
  return match?.[1];
}

function removeOriginalFlaggedCodeTail(value: string, flaggedCode: string): string {
  const flaggedLines = flaggedCode
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (flaggedLines.length === 0) {
    return value;
  }

  const firstFlaggedLine = flaggedLines[0];
  const candidateLines = value.split(/\r?\n/);
  const repeatedOriginalIndex = candidateLines.findIndex((line, index) => {
    if (index === 0) {
      return false;
    }

    return line.trim() === firstFlaggedLine;
  });

  if (repeatedOriginalIndex === -1) {
    return value;
  }

  return candidateLines.slice(0, repeatedOriginalIndex).join("\n");
}

function trimNonCodeEdges(lines: readonly string[]): string[] {
  let startIndex = 0;
  let endIndex = lines.length;

  while (startIndex < endIndex && !looksLikeCodeLine(lines[startIndex])) {
    startIndex += 1;
  }

  while (endIndex > startIndex && !looksLikeCodeLine(lines[endIndex - 1])) {
    endIndex -= 1;
  }

  return lines.slice(startIndex, endIndex);
}

function looksLikeCodeLine(line: string): boolean {
  const trimmed = line.trim();

  if (trimmed.length === 0) {
    return true;
  }

  return /^(?:import|export|class|function|async|const|let|var|if|for|while|switch|try|catch|return|throw|interface|type|enum|def|func|package|public|private|protected|void|static|final|struct|\}\}?|\{?|\)?|\]?|\w+\s*[:=()]|\/\/|\/\*|#|@)/.test(trimmed);
}

async function requestOllamaCompletion(
  prompt: string,
  fallbackModels: readonly string[],
  logger: PromptShieldLogger
): Promise<string> {
  let targetModels = [...fallbackModels];
  try {
    const discovered = await fetchLocalOllamaModels(logger);
    if (discovered.length > 0) {
      targetModels = sortOllamaModels(discovered);
      logger.info("Dynamically discovered local Ollama models sorted.", {
        models: targetModels
      });
    }
  } catch (error) {
    logger.warn("Failed to dynamically fetch local Ollama models. Using fallback list.", {
      error: error instanceof Error ? error.message : String(error)
    });
  }

  const errors: string[] = [];

  for (const model of targetModels) {
    try {
      logger.info("Trying Ollama model.", {
        model,
        promptCharacterCount: prompt.length
      });
      return await requestOllamaModelCompletion(prompt, model, logger);
    } catch (error) {
      logger.warn("Ollama model attempt failed.", {
        model,
        error: error instanceof Error ? error.message : String(error)
      });
      errors.push(`${model}: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  throw new Error(errors.join(" "));
}

function requestOllamaModelCompletion(
  prompt: string,
  model: string,
  logger: PromptShieldLogger
): Promise<string> {
  const payload: OllamaGeneratePayload = {
    model,
    prompt,
    stream: false
  };

  const requestBody = JSON.stringify(payload);

  return new Promise<string>((resolve, reject) => {
    const startedAt = Date.now();
    logger.info("Ollama HTTP request started.", {
      url: OLLAMA_GENERATE_URL,
      model,
      requestBytes: Buffer.byteLength(requestBody)
    });

    const request = http.request(
      OLLAMA_GENERATE_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(requestBody).toString()
        },
        timeout: 120000
      },
      (response) => {
        const chunks: Buffer[] = [];
        let receivedBytes = 0;
        logger.info("Ollama HTTP response started.", {
          model,
          statusCode: response.statusCode,
          statusMessage: response.statusMessage
        });

        response.on("data", (chunk: Buffer) => {
          receivedBytes += chunk.byteLength;

          if (receivedBytes > MAX_OLLAMA_RESPONSE_BYTES) {
            logger.error("Ollama response exceeded maximum size.", undefined, {
              model,
              receivedBytes,
              maxBytes: MAX_OLLAMA_RESPONSE_BYTES
            });
            request.destroy(new Error("Ollama response exceeded the maximum allowed size."));
            return;
          }

          chunks.push(chunk);
        });

        response.on("end", () => {
          const responseBody = Buffer.concat(chunks).toString("utf8");

          if (response.statusCode === undefined || response.statusCode < 200 || response.statusCode >= 300) {
            logger.warn("Ollama HTTP response failed.", {
              model,
              statusCode: response.statusCode,
              receivedBytes,
              durationMs: Date.now() - startedAt,
              responseMessage: getOllamaErrorMessage(responseBody)
            });
            reject(new Error(`Ollama returned HTTP status ${response.statusCode ?? "unknown"}: ${getOllamaErrorMessage(responseBody)}`));
            return;
          }

          try {
            const parsed = JSON.parse(responseBody) as OllamaGenerateResponse;

            if (typeof parsed.error === "string" && parsed.error.length > 0) {
              logger.warn("Ollama returned model error.", {
                model,
                error: parsed.error,
                receivedBytes,
                durationMs: Date.now() - startedAt
              });
              reject(new Error(parsed.error));
              return;
            }

            if (typeof parsed.response !== "string") {
              logger.warn("Ollama returned invalid payload.", {
                model,
                receivedBytes,
                durationMs: Date.now() - startedAt
              });
              reject(new Error("Ollama returned an invalid response payload."));
              return;
            }

            logger.info("Ollama HTTP request finished.", {
              model,
              receivedBytes,
              responseCharacterCount: parsed.response.length,
              durationMs: Date.now() - startedAt
            });
            resolve(parsed.response);
          } catch (error) {
            logger.error("Failed to parse Ollama response.", error, {
              model,
              receivedBytes,
              durationMs: Date.now() - startedAt
            });
            reject(error instanceof Error ? error : new Error("Failed to parse Ollama response."));
          }
        });
      }
    );

    request.on("timeout", () => {
      logger.warn("Ollama request timed out.", {
        model,
        durationMs: Date.now() - startedAt
      });
      request.destroy(new Error("Ollama request timed out."));
    });

    request.on("error", (error: Error) => {
      logger.error("Ollama request error.", error, {
        model,
        durationMs: Date.now() - startedAt
      });
      reject(error);
    });

    request.write(requestBody);
    request.end();
  });
}

function isPromptShieldDiagnostic(diagnostic: vscode.Diagnostic): boolean {
  return diagnostic.source === PROMPTSHIELD_DIAGNOSTIC_SOURCE;
}

function isRestrictedGplDiagnostic(diagnostic: vscode.Diagnostic): boolean {
  return diagnostic.code === PROMPTSHIELD_RESTRICTED_GPL_CODE;
}

function isSecretDiagnostic(diagnostic: vscode.Diagnostic): boolean {
  return isSecretDiagnosticCode(String(diagnostic.code ?? ""));
}

function isSecretDiagnosticCode(diagnosticCode: string): boolean {
  return SECRET_DIAGNOSTIC_CODES.has(diagnosticCode);
}

function getOllamaErrorMessage(responseBody: string): string {
  if (responseBody.trim().length === 0) {
    return "empty response body";
  }

  try {
    const parsed = JSON.parse(responseBody) as OllamaGenerateResponse;

    if (typeof parsed.error === "string" && parsed.error.length > 0) {
      return parsed.error;
    }
  } catch {
    return responseBody;
  }

  return responseBody;
}

function fetchLocalOllamaModels(logger: PromptShieldLogger): Promise<string[]> {
  return new Promise<string[]>((resolve, reject) => {
    logger.info("Fetching local Ollama models dynamically from api/tags.");
    const request = http.request(
      "http://127.0.0.1:11434/api/tags",
      {
        method: "GET",
        timeout: 5000
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          if (response.statusCode === 200) {
            try {
              const parsed = JSON.parse(body) as { models?: { name: string }[] };
              if (Array.isArray(parsed.models)) {
                const names = parsed.models.map((m) => m.name);
                resolve(names);
                return;
              }
            } catch (err) {
              reject(err);
              return;
            }
          }
          reject(new Error(`Ollama tags returned status ${response.statusCode}`));
        });
      }
    );

    request.on("timeout", () => {
      request.destroy(new Error("Ollama tags request timed out."));
    });

    request.on("error", (err) => {
      reject(err);
    });

    request.end();
  });
}

function sortOllamaModels(models: string[]): string[] {
  const score = (name: string): number => {
    const lower = name.toLowerCase();
    let val = 0;
    if (lower.includes("deepseek-r1") || lower.includes("r1")) {
      val += 100;
    }
    if (lower.includes("coder") || lower.includes("code")) {
      val += 50;
    }
    const match = /:?(\d+(?:\.\d+)?)[bm]/i.exec(lower);
    if (match !== null) {
      const num = parseFloat(match[1]);
      val += num;
    }
    return val;
  };

  return [...models].sort((a, b) => score(b) - score(a));
}

export function extractSecretValue(flaggedCode: string): string | undefined {
  const match = /["'`]([^"'`\s]{8,})["'`]/.exec(flaggedCode);
  return match ? match[1] : undefined;
}

async function appendOrUpdateEnvFile(
  filePath: string,
  envName: string,
  value: string,
  logger: PromptShieldLogger
): Promise<void> {
  try {
    let content = "";
    if (fs.existsSync(filePath)) {
      content = fs.readFileSync(filePath, "utf8");
    }

    const lineRegex = new RegExp(`^(\\s*${envName}\\s*=).*$`, "m");
    if (lineRegex.test(content)) {
      content = content.replace(lineRegex, `$1"${value}"`);
      logger.info(`Updated existing key in ${path.basename(filePath)}`, { envName });
    } else {
      const separator = content.endsWith("\n") || content.length === 0 ? "" : "\n";
      content = `${content}${separator}${envName}="${value}"\n`;
      logger.info(`Appended new key to ${path.basename(filePath)}`, { envName });
    }

    fs.writeFileSync(filePath, content, "utf8");
  } catch (error) {
    logger.error(`Failed to update env file: ${filePath}`, error);
  }
}
