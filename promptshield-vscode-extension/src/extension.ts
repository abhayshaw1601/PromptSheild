import * as vscode from "vscode";
import { scanDocument } from "./cleanScribeCore";
import { PROMPTSHIELD_DIAGNOSTIC_SOURCE, PROMPTSHIELD_RESTRICTED_GPL_CODE } from "./promptShieldDiagnostics";
import { registerPromptShieldCodeActions } from "./promptShieldCodeActions";
import { createPromptShieldLogger } from "./promptShieldLogger";

export function activate(context: vscode.ExtensionContext): void {
  const outputChannel = vscode.window.createOutputChannel("PromptShield");
  const logger = createPromptShieldLogger(outputChannel);
  const diagnosticCollection = vscode.languages.createDiagnosticCollection(PROMPTSHIELD_DIAGNOSTIC_SOURCE);
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);

  logger.info("Extension activation started.", {
    extensionPath: context.extensionPath,
    extensionMode: vscode.ExtensionMode[context.extensionMode]
  });

  statusBarItem.text = "Safe";
  statusBarItem.show();
  logger.info("Status bar initialized.", { text: statusBarItem.text });

  registerPromptShieldCodeActions(context, logger);
  logger.info("Code actions registered.");

  const onSaveDisposable = vscode.workspace.onDidSaveTextDocument(async (document) => {
    const startedAt = Date.now();

    try {
      logger.info("Document save detected.", {
        uri: document.uri.toString(),
        languageId: document.languageId,
        lineCount: document.lineCount,
        characterCount: document.getText().length
      });

      diagnosticCollection.delete(document.uri);
      logger.info("Previous diagnostics cleared.", { uri: document.uri.toString() });

      statusBarItem.text = "Scanning...";
      logger.info("Status bar updated.", { text: statusBarItem.text });

      const code = document.getText();
      const violations = scanDocument(code);
      logger.info("Scan completed.", {
        uri: document.uri.toString(),
        durationMs: Date.now() - startedAt,
        violationCount: violations.length
      });

      if (violations.length === 0) {
        statusBarItem.text = "Safe";
        logger.info("No violations detected.", {
          uri: document.uri.toString(),
          statusBarText: statusBarItem.text
        });
        return;
      }

      statusBarItem.text = "Issues Detected";
      logger.warn("Violations detected.", {
        uri: document.uri.toString(),
        statusBarText: statusBarItem.text,
        violations
      });

      const diagnostics = violations.map(violation => {
        const lineIndex = Math.max(0, violation.line - 1);

        let range: vscode.Range;
        if (lineIndex < document.lineCount) {
          range = createDiagnosticRange(document, lineIndex, violation.violationType);
        } else {
          range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0));
        }

        const message = `PromptShield Violation: ${violation.violationType}`;
        const diagnostic = new vscode.Diagnostic(range, message, mapViolationSeverity(violation.severity));
        diagnostic.source = PROMPTSHIELD_DIAGNOSTIC_SOURCE;
        diagnostic.code = violation.violationType;

        logger.warn("Diagnostic created.", {
          uri: document.uri.toString(),
          line: violation.line,
          rangeStartLine: range.start.line,
          rangeStartCharacter: range.start.character,
          rangeEndLine: range.end.line,
          rangeEndCharacter: range.end.character,
          severity: violation.severity,
          violationType: violation.violationType
        });

        return diagnostic;
      });

      diagnosticCollection.set(document.uri, diagnostics);
      logger.info("Diagnostics applied.", {
        uri: document.uri.toString(),
        diagnosticCount: diagnostics.length
      });
    } catch (error) {
      logger.error("Document scan failed.", error, { uri: document.uri.toString() });
      statusBarItem.text = "Safe";
      logger.warn("Status bar reset after scan failure.", { text: statusBarItem.text });
    }
  });

  context.subscriptions.push(
    outputChannel,
    diagnosticCollection,
    statusBarItem,
    onSaveDisposable
  );

  logger.info("Extension activation finished.");
}

export function deactivate(): void {
  return undefined;
}

function mapViolationSeverity(severity: string): vscode.DiagnosticSeverity {
  switch (severity.toUpperCase()) {
    case "CRITICAL":
      return vscode.DiagnosticSeverity.Error;
    case "HIGH":
      return vscode.DiagnosticSeverity.Warning;
    case "MEDIUM":
      return vscode.DiagnosticSeverity.Information;
    case "LOW":
      return vscode.DiagnosticSeverity.Hint;
    default:
      return vscode.DiagnosticSeverity.Warning;
  }
}

function createDiagnosticRange(document: vscode.TextDocument, lineIndex: number, violationType: string): vscode.Range {
  if (violationType !== PROMPTSHIELD_RESTRICTED_GPL_CODE) {
    return document.lineAt(lineIndex).range;
  }

  return expandToCodeBlockRange(document, lineIndex);
}

function expandToCodeBlockRange(document: vscode.TextDocument, lineIndex: number): vscode.Range {
  let startLine = lineIndex;

  while (startLine > 0) {
    const text = document.lineAt(startLine).text;

    if (/^\s*(?:export\s+)?(?:async\s+)?function\b|^\s*(?:const|let|var)\s+\w+\s*=\s*(?:async\s*)?\([^)]*\)\s*=>|^\s*(?:class|if|while|for|switch|try)\b/.test(text)) {
      break;
    }

    startLine -= 1;
  }

  let endLine = lineIndex;
  let braceDepth = 0;
  let sawOpeningBrace = false;

  for (let currentLine = startLine; currentLine < document.lineCount; currentLine += 1) {
    const text = document.lineAt(currentLine).text;

    for (const character of text) {
      if (character === "{") {
        braceDepth += 1;
        sawOpeningBrace = true;
      } else if (character === "}") {
        braceDepth -= 1;
      }
    }

    endLine = currentLine;

    if (sawOpeningBrace && braceDepth <= 0) {
      break;
    }
  }

  return new vscode.Range(
    new vscode.Position(startLine, 0),
    document.lineAt(endLine).range.end
  );
}
