import * as vscode from "vscode";
import { scanDocument } from "./cleanScribeCore";
import { PROMPTSHIELD_DIAGNOSTIC_SOURCE, PROMPTSHIELD_RESTRICTED_GPL_CODE } from "./promptShieldDiagnostics";
import { registerPromptShieldCodeActions } from "./promptShieldCodeActions";

export function activate(context: vscode.ExtensionContext): void {
  const outputChannel = vscode.window.createOutputChannel("PromptShield");
  const diagnosticCollection = vscode.languages.createDiagnosticCollection(PROMPTSHIELD_DIAGNOSTIC_SOURCE);
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);

  outputChannel.appendLine("PromptShield extension activated.");

  statusBarItem.text = "Safe";
  statusBarItem.show();

  registerPromptShieldCodeActions(context);

  const onSaveDisposable = vscode.workspace.onDidSaveTextDocument(async (document) => {
    try {
      diagnosticCollection.delete(document.uri);

      statusBarItem.text = "Scanning...";

      const code = document.getText();
      const violations = scanDocument(code);

      if (violations.length === 0) {
        statusBarItem.text = "Safe";
        return;
      }

      statusBarItem.text = "Issues Detected";

      const diagnostics = violations.map(violation => {
        const lineIndex = Math.max(0, violation.line - 1);

        let range: vscode.Range;
        if (lineIndex < document.lineCount) {
          range = document.lineAt(lineIndex).range;
        } else {
          range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0));
        }

        const message = `PromptShield Violation: ${violation.violationType}`;
        const diagnostic = new vscode.Diagnostic(range, message, mapViolationSeverity(violation.severity));
        diagnostic.source = PROMPTSHIELD_DIAGNOSTIC_SOURCE;
        diagnostic.code = PROMPTSHIELD_RESTRICTED_GPL_CODE;

        return diagnostic;
      });

      diagnosticCollection.set(document.uri, diagnostics);
    } catch (error) {
      outputChannel.appendLine(`Error scanning document: ${error}`);
      statusBarItem.text = "Safe";
    }
  });

  context.subscriptions.push(
    outputChannel,
    diagnosticCollection,
    statusBarItem,
    onSaveDisposable
  );
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
