import * as http from "http";
import * as vscode from "vscode";
import { PROMPTSHIELD_DIAGNOSTIC_SOURCE, PROMPTSHIELD_RESTRICTED_GPL_CODE } from "./promptShieldDiagnostics";

const COPY_REMEDIATION_PROMPT_COMMAND = "promptshield.copyCorporateRemediationPrompt";
const AUTO_FIX_WITH_LOCAL_AI_COMMAND = "promptshield.autoFixWithLocalAi";
const OLLAMA_GENERATE_URL = "http://127.0.0.1:11434/api/generate";
const OLLAMA_MODELS: readonly string[] = ["qwen2.5-coder:1.5b", "gemma:3"];
const MAX_OLLAMA_RESPONSE_BYTES = 2 * 1024 * 1024;

const CORPORATE_REMEDIATION_PROMPT = `Corporate remediation instruction:
Rewrite the flagged code so it remains functionally equivalent while being structurally distinct from restricted GPL source material.
Do not preserve copied control-flow structure, identifier naming patterns, comments, formatting, or expression ordering.
Return only the remediated code block without markdown fences or explanatory text.`;

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

export class PromptShieldCodeActionProvider implements vscode.CodeActionProvider {
  public static readonly providedCodeActionKinds: readonly vscode.CodeActionKind[] = [
    vscode.CodeActionKind.QuickFix
  ];

  public provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range,
    context: vscode.CodeActionContext
  ): vscode.CodeAction[] {
    const promptShieldDiagnostics = context.diagnostics.filter(isPromptShieldDiagnostic);

    if (promptShieldDiagnostics.length === 0) {
      return [];
    }

    const diagnosticRange = promptShieldDiagnostics[0].range.intersection(range) ?? promptShieldDiagnostics[0].range;

    return [
      createCopyPromptAction(promptShieldDiagnostics),
      createAutoFixAction(document.uri, diagnosticRange, promptShieldDiagnostics)
    ];
  }
}

export function registerPromptShieldCodeActions(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      [
        { language: "javascript", scheme: "file" },
        { language: "typescript", scheme: "file" }
      ],
      new PromptShieldCodeActionProvider(),
      {
        providedCodeActionKinds: PromptShieldCodeActionProvider.providedCodeActionKinds
      }
    ),
    vscode.commands.registerCommand(COPY_REMEDIATION_PROMPT_COMMAND, async () => {
      await vscode.env.clipboard.writeText(CORPORATE_REMEDIATION_PROMPT);
    }),
    vscode.commands.registerCommand(AUTO_FIX_WITH_LOCAL_AI_COMMAND, async (uri: vscode.Uri, range: vscode.Range) => {
      await autoFixWithLocalAi(uri, range);
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

async function autoFixWithLocalAi(uri: vscode.Uri, range: vscode.Range): Promise<void> {
  try {
    const document = await vscode.workspace.openTextDocument(uri);
    const flaggedCode = document.getText(range);
    const prompt = buildRemediationPrompt(flaggedCode);
    const generatedCode = await requestOllamaCompletion(prompt, OLLAMA_MODELS);
    const replacement = generatedCode.trim();

    if (replacement.length === 0) {
      throw new Error("The local model returned an empty remediation.");
    }

    const edit = new vscode.WorkspaceEdit();
    edit.replace(uri, range, replacement);
    const didApply = await vscode.workspace.applyEdit(edit);

    if (!didApply) {
      throw new Error("VS Code rejected the workspace edit.");
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown local AI error.";
    await vscode.window.showErrorMessage(
      `PromptShield could not connect to local Ollama or complete the remediation. Start your local Ollama server and ensure qwen2.5-coder:1.5b or gemma:3 is available. ${detail}`
    );
  }
}

function buildRemediationPrompt(flaggedCode: string): string {
  return `You are PromptShield running on a local edge-security gateway.
Rewrite the flagged code block to be structurally distinct from restricted GPL source material while preserving intended behavior.
Change control flow, helper boundaries, identifier names, and expression structure where possible.
Return only the rewritten code. Do not include markdown fences, comments about the rewrite, or explanatory prose.

Flagged code:
${flaggedCode}`;
}

async function requestOllamaCompletion(prompt: string, models: readonly string[]): Promise<string> {
  const errors: string[] = [];

  for (const model of models) {
    try {
      return await requestOllamaModelCompletion(prompt, model);
    } catch (error) {
      errors.push(`${model}: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  throw new Error(errors.join(" "));
}

function requestOllamaModelCompletion(prompt: string, model: string): Promise<string> {
  const payload: OllamaGeneratePayload = {
    model,
    prompt,
    stream: false
  };

  const requestBody = JSON.stringify(payload);

  return new Promise<string>((resolve, reject) => {
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

        response.on("data", (chunk: Buffer) => {
          receivedBytes += chunk.byteLength;

          if (receivedBytes > MAX_OLLAMA_RESPONSE_BYTES) {
            request.destroy(new Error("Ollama response exceeded the maximum allowed size."));
            return;
          }

          chunks.push(chunk);
        });

        response.on("end", () => {
          const responseBody = Buffer.concat(chunks).toString("utf8");

          if (response.statusCode === undefined || response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(`Ollama returned HTTP status ${response.statusCode ?? "unknown"}.`));
            return;
          }

          try {
            const parsed = JSON.parse(responseBody) as OllamaGenerateResponse;

            if (typeof parsed.error === "string" && parsed.error.length > 0) {
              reject(new Error(parsed.error));
              return;
            }

            if (typeof parsed.response !== "string") {
              reject(new Error("Ollama returned an invalid response payload."));
              return;
            }

            resolve(parsed.response);
          } catch (error) {
            reject(error instanceof Error ? error : new Error("Failed to parse Ollama response."));
          }
        });
      }
    );

    request.on("timeout", () => {
      request.destroy(new Error("Ollama request timed out."));
    });

    request.on("error", (error: Error) => {
      reject(error);
    });

    request.write(requestBody);
    request.end();
  });
}

function isPromptShieldDiagnostic(diagnostic: vscode.Diagnostic): boolean {
  return diagnostic.source === PROMPTSHIELD_DIAGNOSTIC_SOURCE && diagnostic.code === PROMPTSHIELD_RESTRICTED_GPL_CODE;
}
