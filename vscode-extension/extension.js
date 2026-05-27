/**
 * ============================================================
 *  CleanScribe VS Code Extension — Main Entry Point
 *  File: extension.js
 *
 *  Architecture:
 *    ┌─────────────────────────────────────────────────┐
 *    │  VS Code Extension Host Process                 │
 *    │                                                 │
 *    │  ┌──────────────┐    ┌────────────────────────┐ │
 *    │  │  extension.js │───▶│  cleanScribeCore.js    │ │
 *    │  │  (UI Layer)  │    │  (NPM package / logic) │ │
 *    │  └──────┬───────┘    └────────────────────────┘ │
 *    │         │                                        │
 *    │  ┌──────▼────────────────────────────────────┐  │
 *    │  │  VS Code API Surface                       │  │
 *    │  │  • createDiagnosticCollection (Problems)   │  │
 *    │  │  • createTextEditorDecorationType (UI)     │  │
 *    │  │  • registerCommand (QuickFix)              │  │
 *    │  │  • createOutputChannel (Prompt Output)     │  │
 *    │  └───────────────────────────────────────────┘  │
 *    └─────────────────────────────────────────────────┘
 *
 *  Separation of concerns:
 *    - This file owns ALL VS Code API interactions.
 *    - cleanScribeCore.js owns ALL scanning logic.
 *    - The two layers communicate only through the ScanResult shape.
 *
 *  Activation:
 *    See activationEvents in package.json — triggers when any
 *    JS / TS / Python file is opened in the workspace.
 * ============================================================
 */

'use strict';

const vscode      = require('vscode');
// ── Core scanning logic — isolated from all VS Code API calls ──
const cleanScribe = require('./cleanScribeCore');

// ─────────────────────────────────────────────────────────────
//  MODULE-LEVEL SINGLETONS
//  Declared here so activate() and deactivate() can share them
//  without closures or global objects.
// ─────────────────────────────────────────────────────────────

/** @type {vscode.DiagnosticCollection} */
let diagnosticCollection;

/** @type {vscode.TextEditorDecorationType} */
let criticalDecorationType;

/** @type {vscode.TextEditorDecorationType} */
let warningDecorationType;

/** @type {vscode.OutputChannel} */
let outputChannel;

/** @type {vscode.StatusBarItem} */
let statusBarItem;

// ─────────────────────────────────────────────────────────────
//  DECORATION TYPE FACTORY
//  Called once on activation. Pre-allocates decoration handles
//  so the hot-path scan loop only calls setDecorations() (cheap)
//  never createTextEditorDecorationType() (expensive CSS parsing).
// ─────────────────────────────────────────────────────────────

/**
 * buildDecorationTypes()
 * ────────────────────────
 * Creates two editor decoration handles:
 *
 *   criticalDecorationType — jagged red underline + gutter icon
 *     for CRITICAL / HIGH violations (copyleft, leaked secrets)
 *
 *   warningDecorationType  — amber wavy underline
 *     for MEDIUM / INFO violations (emails, textual notices)
 *
 * Using `borderStyle: 'none none wavy none'` with `borderColor`
 * produces the native squiggly underline effect, identical to
 * how VS Code itself renders TypeScript type errors.
 *
 * @returns {{ critical: vscode.TextEditorDecorationType, warning: vscode.TextEditorDecorationType }}
 */
function buildDecorationTypes() {
  const critical = vscode.window.createTextEditorDecorationType({
    // ── Jagged red underline (matches native error squiggles) ──
    textDecoration: 'none; border-bottom: 2px wavy #FF2D55;',

    // ── Subtle darkened background to draw attention ──
    backgroundColor: 'rgba(255, 45, 85, 0.12)',

    // ── Left border accent ──
    borderWidth: '0 0 0 3px',
    borderStyle: 'solid',
    borderColor: '#FF2D55',

    // ── Gutter icon (shows a ⚠ icon in the line number margin) ──
    gutterIconPath: vscode.Uri.parse(
      'data:image/svg+xml;utf8,' +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">' +
        '<circle cx="8" cy="8" r="7" fill="#FF2D55"/>' +
        '<text x="8" y="12" text-anchor="middle" font-size="10" fill="white" font-family="monospace">!</text>' +
        '</svg>'
      )
    ),
    gutterIconSize: 'contain',

    // ── Hover tooltip shown by VS Code on mouse-over ──
    overviewRulerColor: '#FF2D55',
    overviewRulerLane: vscode.OverviewRulerLane.Right,
  });

  const warning = vscode.window.createTextEditorDecorationType({
    textDecoration: 'none; border-bottom: 2px wavy #FFD60A;',
    backgroundColor: 'rgba(255, 214, 10, 0.08)',
    borderWidth: '0 0 0 3px',
    borderStyle: 'solid',
    borderColor: 'rgba(255, 214, 10, 0.6)',
    overviewRulerColor: '#FFD60A',
    overviewRulerLane: vscode.OverviewRulerLane.Right,
  });

  return { critical, warning };
}

// ─────────────────────────────────────────────────────────────
//  STATUS BAR ITEM FACTORY
// ─────────────────────────────────────────────────────────────

/**
 * buildStatusBarItem()
 * ─────────────────────
 * Creates a persistent status-bar item (bottom-right of VS Code)
 * that gives a one-glance compliance signal for the current file.
 *
 * States:
 *   🛡️ CleanScribe: CLEAN    (green)
 *   ⚠️  CleanScribe: 3 issues (yellow)
 *   🚨 CleanScribe: CRITICAL (red)
 *   ⟳  CleanScribe: Scanning (spinner)
 *
 * @returns {vscode.StatusBarItem}
 */
function buildStatusBarItem() {
  const item = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    // Priority — place just to the right of language selector
    90
  );
  item.command = 'cleanScribe.showOutputChannel';
  item.tooltip = 'CleanScribe: Click to view scan output';
  item.text    = '$(shield) CleanScribe';
  item.show();
  return item;
}

// ─────────────────────────────────────────────────────────────
//  STATUS BAR UPDATERS
// ─────────────────────────────────────────────────────────────

function setStatusScanning() {
  statusBarItem.text            = '$(sync~spin) CleanScribe: Scanning…';
  statusBarItem.backgroundColor = undefined;
  statusBarItem.color           = new vscode.ThemeColor('statusBar.foreground');
}

function setStatusClean() {
  statusBarItem.text            = '$(shield) CleanScribe: Clean ✓';
  statusBarItem.backgroundColor = undefined;
  statusBarItem.color           = new vscode.ThemeColor('testing.iconPassed');
}

function setStatusViolations(count, severity) {
  if (severity === cleanScribe.SEVERITY.CRITICAL) {
    statusBarItem.text            = `$(error) CleanScribe: CRITICAL (${count})`;
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
  } else {
    statusBarItem.text            = `$(warning) CleanScribe: ${count} issue${count > 1 ? 's' : ''}`;
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  }
  statusBarItem.color = undefined;
}

// ─────────────────────────────────────────────────────────────
//  VIOLATION → DIAGNOSTIC MAPPER
//  Maps the cleanScribeCore ScanResult into standard VS Code
//  Diagnostic objects so violations appear in the Problems panel
//  alongside compiler errors — indistinguishable from native lints.
// ─────────────────────────────────────────────────────────────

/**
 * violationToDiagnostic(violation, document)
 * ──────────────────────────────────────────
 * Converts a single Violation from cleanScribeCore into a
 * vscode.Diagnostic so it appears in the Problems panel.
 *
 * DiagnosticSeverity mapping:
 *   CRITICAL / HIGH   → Error    (red in Problems)
 *   MEDIUM            → Warning  (yellow in Problems)
 *   INFO              → Information (blue in Problems)
 *
 * @param {import('./cleanScribeCore').Violation} violation
 * @param {vscode.TextDocument} document
 * @returns {vscode.Diagnostic}
 */
function violationToDiagnostic(violation, document) {
  const lineIndex = Math.min(
    Math.max(0, violation.lineIndex),
    document.lineCount - 1
  );
  const line    = document.lineAt(lineIndex);
  const lineText = line.text;

  // Find the exact character range of the matched text within the line.
  // Fall back to the full line if the match text is no longer present
  // (e.g. the file was modified between scan and diagnostic application).
  let charStart = lineText.indexOf(violation.matchText);
  let charEnd;

  if (charStart !== -1) {
    charEnd = charStart + violation.matchText.length;
  } else {
    // Underline the first non-whitespace character → end of line
    charStart = line.firstNonWhitespaceCharacterIndex;
    charEnd   = lineText.length;
  }

  const range = new vscode.Range(
    new vscode.Position(lineIndex, charStart),
    new vscode.Position(lineIndex, charEnd)
  );

  // Severity mapping
  const severityMap = {
    [cleanScribe.SEVERITY.CRITICAL]: vscode.DiagnosticSeverity.Error,
    [cleanScribe.SEVERITY.HIGH]:     vscode.DiagnosticSeverity.Error,
    [cleanScribe.SEVERITY.MEDIUM]:   vscode.DiagnosticSeverity.Warning,
    [cleanScribe.SEVERITY.INFO]:     vscode.DiagnosticSeverity.Information,
  };
  const diagnosticSeverity = severityMap[violation.severity] ?? vscode.DiagnosticSeverity.Warning;

  const diagnostic = new vscode.Diagnostic(
    range,
    violation.message,
    diagnosticSeverity
  );

  // `source` appears as the prefix label in the Problems panel: "cleanScribe(LICENSE)"
  diagnostic.source = `cleanScribe(${violation.type})`;

  // `code` enables the "Quick Fix" lightbulb if a CodeActionProvider is registered
  diagnostic.code = {
    value:  violation.type,
    target: vscode.Uri.parse('https://spdx.org/licenses/'),
  };

  // Tags: mark secret leaks as "unnecessary" so VS Code dims them visually
  if (violation.type === 'SECRET') {
    diagnostic.tags = [vscode.DiagnosticTag.Unnecessary];
  }

  return diagnostic;
}

// ─────────────────────────────────────────────────────────────
//  DECORATION APPLIER
//  Splits violations into CRITICAL/HIGH vs MEDIUM/INFO buckets
//  and applies the correct TextEditorDecorationType to each line.
// ─────────────────────────────────────────────────────────────

/**
 * applyDecorations(editor, violations)
 * ──────────────────────────────────────
 * Translates ScanResult violations into vscode.DecorationOptions arrays
 * and applies them to the active editor.
 *
 * Each DecorationOptions entry gets a `hoverMessage` (MarkdownString)
 * that VS Code renders as a rich tooltip when the user hovers the line.
 *
 * @param {vscode.TextEditor}                      editor
 * @param {import('./cleanScribeCore').Violation[]} violations
 */
function applyDecorations(editor, violations) {
  /** @type {vscode.DecorationOptions[]} */
  const criticalRanges = [];
  /** @type {vscode.DecorationOptions[]} */
  const warningRanges  = [];

  for (const violation of violations) {
    const lineIndex = Math.min(
      Math.max(0, violation.lineIndex),
      editor.document.lineCount - 1
    );
    const lineText = editor.document.lineAt(lineIndex).text;
    let charStart  = lineText.indexOf(violation.matchText);
    let charEnd;

    if (charStart !== -1) {
      charEnd = charStart + violation.matchText.length;
    } else {
      charStart = editor.document.lineAt(lineIndex).firstNonWhitespaceCharacterIndex;
      charEnd   = lineText.length;
    }

    const range = new vscode.Range(
      new vscode.Position(lineIndex, charStart),
      new vscode.Position(lineIndex, charEnd)
    );

    // Rich markdown tooltip shown on hover
    const hoverMessage = new vscode.MarkdownString(
      `**🚨 CleanScribe** — \`${violation.label}\`\n\n` +
      `${violation.message}\n\n` +
      `> Severity: **${violation.severity}** | Type: \`${violation.type}\`\n\n` +
      `[Request AI Fix](command:cleanScribe.requestFix)`
    );
    hoverMessage.isTrusted          = true;  // allows command: links
    hoverMessage.supportThemeIcons  = true;

    const decorationOption = { range, hoverMessage };

    const isCritical = [
      cleanScribe.SEVERITY.CRITICAL,
      cleanScribe.SEVERITY.HIGH,
    ].includes(violation.severity);

    if (isCritical) {
      criticalRanges.push(decorationOption);
    } else {
      warningRanges.push(decorationOption);
    }
  }

  // Apply both layers — VS Code composites them correctly
  editor.setDecorations(criticalDecorationType, criticalRanges);
  editor.setDecorations(warningDecorationType,  warningRanges);
}

/**
 * clearDecorations(editor)
 * ─────────────────────────
 * Removes all CleanScribe decorations from the given editor.
 * Called when a subsequent scan comes back completely clean.
 *
 * @param {vscode.TextEditor} editor
 */
function clearDecorations(editor) {
  editor.setDecorations(criticalDecorationType, []);
  editor.setDecorations(warningDecorationType,  []);
}

// ─────────────────────────────────────────────────────────────
//  CORE SCAN ORCHESTRATOR
//  Called on every onDidSaveTextDocument event for supported files.
//  Runs synchronously on the VS Code extension host thread — the
//  cleanScribeCore scanning is fast enough (<5ms for typical files)
//  that blocking here is acceptable and avoids race conditions with
//  rapid save sequences.
// ─────────────────────────────────────────────────────────────

/**
 * runScan(document)
 * ──────────────────
 * Full scan pipeline for a single saved document:
 *   1. Extract raw text from the document buffer
 *   2. Call cleanScribeCore.scanDocument()
 *   3. Update editor decorations
 *   4. Populate the diagnostic collection (Problems panel)
 *   5. Update the status bar
 *   6. Log to output channel
 *   7. Show notification for CRITICAL violations
 *
 * @param {vscode.TextDocument} document
 */
async function runScan(document) {
  // Guard: only scan supported languages (defined in activationEvents)
  const SUPPORTED_LANGUAGES = new Set(['javascript', 'typescript', 'python', 'javascriptreact', 'typescriptreact']);
  if (!SUPPORTED_LANGUAGES.has(document.languageId)) return;

  // ── Step 1: Grab the active editor (may differ from the saved document) ──
  const editor = vscode.window.activeTextEditor;

  setStatusScanning();

  // ── Step 2: Extract the full text buffer of the saved document ──
  //    We use document.getText() — NOT editor.document.getText() — because
  //    in some edge cases the editor may show a different file. This ensures
  //    we always scan exactly what was written to disk.
  const rawCode = document.getText();

  if (!rawCode || rawCode.trim().length === 0) {
    diagnosticCollection.set(document.uri, []);
    if (editor && editor.document.uri.toString() === document.uri.toString()) {
      clearDecorations(editor);
    }
    setStatusClean();
    return;
  }

  // ── Step 3: Run the scan (synchronous in cleanScribeCore) ──
  let scanResult;
  try {
    scanResult = cleanScribe.scanDocument(rawCode, document.languageId);
  } catch (err) {
    outputChannel.appendLine(`[CleanScribe] ❌ Scan error: ${err.message}`);
    vscode.window.showErrorMessage(`CleanScribe scan failed: ${err.message}`);
    statusBarItem.text = '$(error) CleanScribe: Scan Error';
    return;
  }

  // ── Step 4: Log scan summary to the output channel ──
  const timestamp = new Date().toLocaleTimeString();
  outputChannel.appendLine(
    `\n[${timestamp}] Scanned: ${document.fileName}  ` +
    `(${document.languageId}, ${rawCode.split('\n').length} lines, ` +
    `${scanResult.scanDurationMs}ms)`
  );

  if (scanResult.clean) {
    outputChannel.appendLine('  ✅ No violations detected — file is clean.');
  } else {
    outputChannel.appendLine(`  🚨 ${scanResult.violations.length} violation(s) found — Severity: ${scanResult.severity}`);
    for (const v of scanResult.violations) {
      outputChannel.appendLine(`     • [${v.severity}] ${v.label} — Line ${v.lineIndex + 1}: ${v.matchText.slice(0, 60)}`);
    }
  }

  // ── Step 5: Apply or clear editor decorations ──
  if (editor && editor.document.uri.toString() === document.uri.toString()) {
    if (scanResult.clean) {
      clearDecorations(editor);
    } else {
      applyDecorations(editor, scanResult.violations);
    }
  }

  // ── Step 6: Populate the Problems panel ──
  if (scanResult.clean) {
    diagnosticCollection.set(document.uri, []);
  } else {
    const diagnostics = scanResult.violations.map(v =>
      violationToDiagnostic(v, document)
    );
    diagnosticCollection.set(document.uri, diagnostics);
  }

  // ── Step 7: Update the status bar ──
  if (scanResult.clean) {
    setStatusClean();
  } else {
    setStatusViolations(scanResult.violations.length, scanResult.severity);
  }

  // ── Step 8: Show a VS Code notification for CRITICAL violations ──
  //    Only fires for CRITICAL (not every save) to avoid alert fatigue.
  if (scanResult.severity === cleanScribe.SEVERITY.CRITICAL) {
    const licenseViolations = scanResult.violations.filter(v => v.type === 'LICENSE');
    const secretViolations  = scanResult.violations.filter(v => v.type === 'SECRET');

    let notifMessage = `🚨 CleanScribe: CRITICAL violation in ${document.fileName.split(/[/\\]/).pop()}`;
    if (licenseViolations.length) {
      const licenses = [...new Set(licenseViolations.map(v => v.license))].join(', ');
      notifMessage += ` — Copyleft license (${licenses}) detected`;
    }
    if (secretViolations.length) {
      notifMessage += ` — ${secretViolations.length} secret key(s) exposed`;
    }

    // Offer quick actions directly in the notification toast
    const action = await vscode.window.showErrorMessage(
      notifMessage,
      'Request AI Fix',
      'Open Problems',
      'Dismiss'
    );

    if (action === 'Request AI Fix') {
      // Trigger the command programmatically — same as user clicking the command
      vscode.commands.executeCommand('cleanScribe.requestFix');
    } else if (action === 'Open Problems') {
      vscode.commands.executeCommand('workbench.panel.markers.view.focus');
    }
  }
}

// ─────────────────────────────────────────────────────────────
//  AI REFACTOR QUICKFIX COMMAND HANDLER
//  Generates and displays the LLM correction prompt for the
//  current file's violations. Output goes to the dedicated
//  CleanScribe output channel so it can be copy-pasted easily.
// ─────────────────────────────────────────────────────────────

/**
 * handleRequestFix()
 * ───────────────────
 * Command handler for `cleanScribe.requestFix`.
 * Re-scans the current active document to get fresh violations,
 * then renders the AI correction prompt in the output channel
 * and shows a modal with a copy-to-clipboard action.
 */
async function handleRequestFix() {
  const editor = vscode.window.activeTextEditor;

  if (!editor) {
    vscode.window.showWarningMessage('CleanScribe: No active editor — open a file to request a fix.');
    return;
  }

  const document = editor.document;
  const rawCode  = document.getText();
  const language = document.languageId;

  // ── Step 1: Fresh synchronous scan (< 5ms) ──────────────────
  const scanResult = cleanScribe.scanDocument(rawCode, language);

  if (scanResult.clean) {
    vscode.window.showInformationMessage(
      '✅ CleanScribe: No violations detected — nothing to fix!'
    );
    return;
  }

  // ── Step 2: Show spinner — Qwen may take a few seconds ───────
  //    Update the status bar so the user knows something is happening
  //    while we wait for the local LLM response.
  statusBarItem.text            = '$(sync~spin) CleanScribe: Qwen generating fix…';
  statusBarItem.backgroundColor = undefined;
  statusBarItem.color           = new vscode.ThemeColor('statusBar.foreground');

  outputChannel.show(true);
  outputChannel.appendLine(
    `\n[${new Date().toLocaleTimeString()}] ✨ Requesting AI fix prompt for ` +
    `${scanResult.violations.length} violation(s)…`
  );
  outputChannel.appendLine('  Connecting to Ollama (qwen2.5:1.5b)…');

  // ── Step 3: Ask Qwen to write the optimal remediation prompt ──
  //    generateRefactorPromptWithAI() pings Ollama first and falls
  //    back to the hardcoded template if Ollama is unavailable.
  const { prompt, source, model } = await cleanScribe.generateRefactorPromptWithAI(
    scanResult.violations,
    language,
    rawCode,
    // Pass Ollama config — respects user settings if you add them to package.json
    {
      model:       vscode.workspace.getConfiguration('cleanScribe').get('ollamaModel',   'qwen2.5:1.5b'),
      host:        vscode.workspace.getConfiguration('cleanScribe').get('ollamaHost',    'localhost'),
      port:        vscode.workspace.getConfiguration('cleanScribe').get('ollamaPort',    11434),
      timeout:     vscode.workspace.getConfiguration('cleanScribe').get('ollamaTimeout', 20000),
      temperature: 0.3,
    }
  );

  // ── Step 4: Restore status bar ───────────────────────────────
  setStatusViolations(scanResult.violations.length, scanResult.severity);

  // ── Step 5: Print prompt to output channel ───────────────────
  //    Header shows whether Qwen generated it or fallback was used.
  const sourceLabel = source === 'ai'
    ? `✅ Generated by Qwen (${model})`
    : `⚠️  Fallback template used — ${model}`;

  outputChannel.appendLine(`  Source: ${sourceLabel}`);
  outputChannel.appendLine('');
  outputChannel.appendLine('═'.repeat(70));
  outputChannel.appendLine('  🛠️  CleanScribe — Remediation Prompt (paste into Copilot / ChatGPT)');
  outputChannel.appendLine('═'.repeat(70));
  outputChannel.appendLine(prompt);
  outputChannel.appendLine('═'.repeat(70));
  outputChannel.appendLine('');

  // ── Step 6: Notify user ──────────────────────────────────────
  const actionLabel = source === 'ai'
    ? `🤖 Qwen fix prompt ready for ${scanResult.violations.length} violation(s)`
    : `🛠️ Fix prompt ready (Ollama offline — template used)`;

  const action = await vscode.window.showInformationMessage(
    actionLabel,
    'Copy to Clipboard',
    'Open Output Channel'
  );

  if (action === 'Copy to Clipboard') {
    await vscode.env.clipboard.writeText(prompt);
    vscode.window.showInformationMessage('✅ CleanScribe: Prompt copied to clipboard!');
  } else if (action === 'Open Output Channel') {
    outputChannel.show();
  }
}

// ─────────────────────────────────────────────────────────────
//  EXTENSION LIFECYCLE
// ─────────────────────────────────────────────────────────────

/**
 * activate(context)
 * ──────────────────
 * Called ONCE when any activationEvent fires (see package.json).
 * All subscriptions are pushed to context.subscriptions so VS Code
 * automatically disposes them when the extension deactivates.
 *
 * Initialization order is intentional:
 *   1. Output channel    — available for early error logging
 *   2. Decoration types  — pre-allocated before any saves happen
 *   3. Diagnostic collection — populated on every scan
 *   4. Status bar        — visible immediately after activation
 *   5. Commands          — registered before any event listener fires
 *   6. Event listeners   — added last so all resources are ready
 *
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  // ── 1. Output Channel ──────────────────────────────────────
  outputChannel = vscode.window.createOutputChannel('CleanScribe');
  context.subscriptions.push(outputChannel);

  outputChannel.appendLine('CleanScribe: Extension activated.');
  outputChannel.appendLine(`  Version: ${context.extension?.packageJSON?.version ?? '1.0.0'}`);
  outputChannel.appendLine(`  Scanning: JavaScript, TypeScript, Python files on save.`);

  // ── 2. Decoration Types (pre-allocated) ───────────────────
  const decorations = buildDecorationTypes();
  criticalDecorationType = decorations.critical;
  warningDecorationType  = decorations.warning;
  context.subscriptions.push(criticalDecorationType, warningDecorationType);

  // ── 3. Diagnostic Collection ──────────────────────────────
  //    'cleanScribe' appears as the source label in the Problems panel.
  diagnosticCollection = vscode.languages.createDiagnosticCollection('cleanScribe');
  context.subscriptions.push(diagnosticCollection);

  // ── 4. Status Bar Item ────────────────────────────────────
  statusBarItem = buildStatusBarItem();
  context.subscriptions.push(statusBarItem);

  // ── 5. Command: cleanScribe.requestFix ────────────────────
  //    Registered before any listener so it is always available
  //    even if triggered via keyboard shortcut or command palette.
  const requestFixCommand = vscode.commands.registerCommand(
    'cleanScribe.requestFix',
    handleRequestFix
  );
  context.subscriptions.push(requestFixCommand);

  // ── 5b. Command: cleanScribe.showOutputChannel ────────────
  const showOutputCommand = vscode.commands.registerCommand(
    'cleanScribe.showOutputChannel',
    () => outputChannel.show()
  );
  context.subscriptions.push(showOutputCommand);

  // ── 5c. Command: cleanScribe.clearDiagnostics ─────────────
  //    Convenience command to flush all violations (e.g. false positives)
  const clearCommand = vscode.commands.registerCommand(
    'cleanScribe.clearDiagnostics',
    () => {
      diagnosticCollection.clear();
      const editor = vscode.window.activeTextEditor;
      if (editor) clearDecorations(editor);
      setStatusClean();
      outputChannel.appendLine('[CleanScribe] Diagnostics manually cleared.');
    }
  );
  context.subscriptions.push(clearCommand);

  // ── 6. Event: onDidSaveTextDocument ───────────────────────
  //    Primary trigger — fires after every file save.
  //    We call runScan but don't await it to avoid blocking the
  //    VS Code extension host. Errors are caught inside runScan.
  const onSaveListener = vscode.workspace.onDidSaveTextDocument(
    (document) => {
      // Non-blocking — fire and forget (errors handled inside runScan)
      runScan(document).catch(err => {
        outputChannel.appendLine(`[CleanScribe] ❌ Unhandled scan error: ${err.message}`);
      });
    }
  );
  context.subscriptions.push(onSaveListener);

  // ── 6b. Event: onDidChangeActiveTextEditor ─────────────────
  //    Re-applies decorations when the user switches to a file
  //    that was previously scanned (decorations are cleared on tab switch).
  const onEditorChangeListener = vscode.window.onDidChangeActiveTextEditor(
    async (editor) => {
      if (!editor) return;
      // Retrieve existing diagnostics for this document (already computed)
      const existingDiagnostics = diagnosticCollection.get(editor.document.uri);
      if (!existingDiagnostics || existingDiagnostics.length === 0) {
        clearDecorations(editor);
        setStatusClean();
        return;
      }
      // Re-run scan to re-apply decorations (fast, < 5ms)
      runScan(editor.document).catch(() => {});
    }
  );
  context.subscriptions.push(onEditorChangeListener);

  // ── Startup scan: scan the currently active file if any ───
  //    Surfaces violations in files that were already open when
  //    the extension activated (common in multi-root workspaces).
  if (vscode.window.activeTextEditor) {
    runScan(vscode.window.activeTextEditor.document).catch(() => {});
  }

  outputChannel.appendLine('CleanScribe: All listeners registered. Ready.\n');
}

/**
 * deactivate()
 * ─────────────
 * Called when the extension is unloaded (VS Code quit, workspace close,
 * or explicit extension disable). All disposables are already handled
 * by context.subscriptions above — this function only needs to handle
 * any non-disposable cleanup (e.g. clearing in-memory caches).
 */
function deactivate() {
  // All VS Code resources (channels, collections, decorations) are disposed
  // automatically via context.subscriptions.
  // No additional cleanup required for cleanScribeCore — it is stateless
  // at the module level (no singleton session store needed for file scanning).
  console.log('CleanScribe: Extension deactivated.');
}

// ─────────────────────────────────────────────────────────────
//  MODULE EXPORTS (VS Code Extension API contract)
// ─────────────────────────────────────────────────────────────

module.exports = { activate, deactivate };
