import * as vscode from "vscode";
import * as path from "path";

export interface SidebarViolation {
  readonly line: number;
  readonly message: string;
  readonly severity: string;
  readonly code: string;
}

export class PromptShieldWebviewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private _activeUri?: string;
  private _violations: SidebarViolation[] = [];
  private _status: "ready" | "scanning" | "safe" | "issues" = "ready";
  private _ignoredCount: number = 0;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case "scanActiveFile":
          await vscode.commands.executeCommand("workbench.action.files.save");
          break;
        case "jumpToLine":
          await this._jumpToLine(message.line);
          break;
        case "fixViolation":
          await this._fixViolation(message.line, message.code);
          break;
        case "ignoreViolation":
          this._ignoredCount += 1;
          // Filter out the ignored violation from local state
          this._violations = this._violations.filter((v) => v.line !== message.line);
          if (this._violations.length === 0) {
            this._status = "safe";
          }
          this._updateWebviewState();
          break;
      }
    });

    // Synchronize initial state
    this._updateWebviewState();
  }

  public updateViolations(uri: string, violations: SidebarViolation[]): void {
    this._activeUri = uri;
    this._violations = [...violations];
    this._status = violations.length > 0 ? "issues" : "safe";
    this._updateWebviewState();
  }

  public clearViolations(): void {
    this._activeUri = undefined;
    this._violations = [];
    this._status = "ready";
    this._updateWebviewState();
  }

  private _updateWebviewState(): void {
    if (!this._view) {
      return;
    }

    const fileName = this._activeUri ? path.basename(vscode.Uri.parse(this._activeUri).fsPath) : "";

    this._view.webview.postMessage({
      type: "state",
      status: this._status,
      uri: this._activeUri,
      fileName,
      violations: this._violations,
      ignoredCount: this._ignoredCount
    });
  }

  private async _jumpToLine(line: number): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !this._activeUri || editor.document.uri.toString() !== this._activeUri) {
      return;
    }

    const lineIndex = Math.max(0, line - 1);
    const textLine = editor.document.lineAt(lineIndex);
    const range = textLine.range;

    editor.selection = new vscode.Selection(range.start, range.end);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
  }

  private async _fixViolation(line: number, code: string): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !this._activeUri || editor.document.uri.toString() !== this._activeUri) {
      return;
    }

    const lineIndex = Math.max(0, line - 1);
    const textLine = editor.document.lineAt(lineIndex);
    let targetRange = textLine.range;

    // Expand range for restricted GPL blocks to ensure AST replacement works perfectly
    if (code === "restricted-gpl-similarity") {
      targetRange = this._expandToCodeBlockRange(editor.document, lineIndex);
    }

    this._status = "scanning";
    this._updateWebviewState();

    try {
      if (code === "restricted-gpl-similarity" || this._isSecretCode(code)) {
        await vscode.commands.executeCommand("promptshield.autoFixWithLocalAi", editor.document.uri, targetRange);
      } else {
        await vscode.commands.executeCommand("promptshield.replaceSecretWithEnv", editor.document.uri, targetRange, code);
      }
    } finally {
      // Re-trigger diagnostic fetch to sync webview list
      const diagnostics = vscode.languages.getDiagnostics(editor.document.uri);
      const promptShieldDiagnostics = diagnostics.filter((d) => d.source === "PromptShield");
      
      this._violations = promptShieldDiagnostics.map((d) => ({
        line: d.range.start.line + 1,
        message: d.message,
        severity: this._getSeverityString(d.severity),
        code: String(d.code ?? "")
      }));

      this._status = this._violations.length > 0 ? "issues" : "safe";
      this._updateWebviewState();
    }
  }

  private _isSecretCode(code: string): boolean {
    const secretCodes = new Set([
      "openai-api-key",
      "google-api-key",
      "aws-access-key-id",
      "bearer-token",
      "jwt-token",
      "private-key-material",
      "database-connection-string",
      "generic-secret-assignment"
    ]);
    return secretCodes.has(code);
  }

  private _getSeverityString(severity: vscode.DiagnosticSeverity): string {
    switch (severity) {
      case vscode.DiagnosticSeverity.Error: return "CRITICAL";
      case vscode.DiagnosticSeverity.Warning: return "HIGH";
      case vscode.DiagnosticSeverity.Information: return "MEDIUM";
      case vscode.DiagnosticSeverity.Hint: return "LOW";
      default: return "HIGH";
    }
  }

  private _expandToCodeBlockRange(document: vscode.TextDocument, lineIndex: number): vscode.Range {
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
      for (const char of text) {
        if (char === "{") {
          braceDepth += 1;
          sawOpeningBrace = true;
        } else if (char === "}") {
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

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const cspSource = webview.cspSource;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src ${cspSource} 'unsafe-inline';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-dark: #09090b;
      --bg-card: rgba(20, 20, 25, 0.6);
      --border-card: rgba(255, 255, 255, 0.05);
      --text-main: #f4f4f5;
      --text-muted: #a1a1aa;
      --primary: #6366f1;
      --primary-hover: #4f46e5;
      --emerald: #10b981;
      --emerald-dark: #047857;
      --amber: #f59e0b;
      --rose: #f43f5e;
      --transition-fast: 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: 'Outfit', -apple-system, BlinkMacSystemFont, sans-serif;
      background-color: var(--bg-dark);
      color: var(--text-main);
      padding: 16px;
      font-size: 13px;
      line-height: 1.5;
      overflow-y: auto;
      height: 100vh;
    }

    /* Custom Scrollbar */
    ::-webkit-scrollbar {
      width: 6px;
    }
    ::-webkit-scrollbar-track {
      background: rgba(0, 0, 0, 0.1);
    }
    ::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.1);
      border-radius: 3px;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: rgba(255, 255, 255, 0.2);
    }

    /* Title Block */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }

    .title {
      font-size: 15px;
      font-weight: 600;
      letter-spacing: -0.3px;
      color: var(--text-main);
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .title-shield {
      color: var(--primary);
    }

    /* Action bar */
    .action-bar {
      display: grid;
      grid-template-columns: 1fr;
      gap: 8px;
      margin-bottom: 16px;
    }

    .action-row {
      display: flex;
      gap: 8px;
    }

    .btn {
      flex: 1;
      background: var(--bg-card);
      border: 1px solid var(--border-card);
      border-radius: 8px;
      color: var(--text-main);
      padding: 8px 12px;
      font-family: inherit;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      transition: all var(--transition-fast);
      backdrop-filter: blur(8px);
    }

    .btn:hover {
      background: rgba(255, 255, 255, 0.08);
      border-color: rgba(255, 255, 255, 0.15);
      transform: translateY(-1px);
    }

    .btn:active {
      transform: translateY(0);
    }

    .btn-primary {
      background: var(--vscode-button-background, #007acc);
      color: var(--vscode-button-foreground, #ffffff);
      border: none;
      box-shadow: 0 2px 6px rgba(0, 122, 204, 0.25);
    }

    .btn-primary:hover {
      background: var(--vscode-button-hoverBackground, #0062a3);
      box-shadow: 0 4px 10px rgba(0, 122, 204, 0.4);
    }

    .btn-small {
      flex: 0 0 auto;
      padding: 8px;
      border-radius: 8px;
    }

    .btn-fix-top {
      background: var(--vscode-button-prominentBackground, #107c41);
      color: var(--vscode-button-prominentForeground, #ffffff);
      border: none;
      box-shadow: 0 2px 6px rgba(16, 124, 65, 0.25);
    }

    .btn-fix-top:hover {
      background: var(--vscode-button-prominentHoverBackground, #0e6234);
      box-shadow: 0 4px 10px rgba(16, 124, 65, 0.4);
    }

    /* States & Containers */
    .state-container {
      display: none;
      flex-direction: column;
      align-items: center;
      text-align: center;
      padding: 40px 16px;
      background: var(--bg-card);
      border: 1px solid var(--border-card);
      border-radius: 12px;
      backdrop-filter: blur(10px);
    }

    .state-container.active {
      display: flex;
    }

    .state-icon {
      font-size: 32px;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 64px;
      height: 64px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid var(--border-card);
      color: var(--text-muted);
    }

    .state-icon.secure {
      color: var(--emerald);
      background: rgba(16, 185, 129, 0.05);
      border-color: rgba(16, 185, 129, 0.2);
      animation: pulse-emerald 2s infinite;
    }

    @keyframes pulse-emerald {
      0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.2); }
      70% { box-shadow: 0 0 0 10px rgba(16, 185, 129, 0); }
      100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
    }

    .state-title {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 6px;
      color: var(--text-main);
    }

    .state-desc {
      font-size: 12px;
      color: var(--text-muted);
      max-width: 200px;
      line-height: 1.4;
    }

    /* Active File Info */
    .file-badge {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid var(--border-card);
      padding: 6px 10px;
      border-radius: 6px;
      margin-bottom: 16px;
      color: var(--text-muted);
    }

    .file-badge-active {
      font-weight: 500;
      color: var(--text-main);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* Issues Cards */
    .violations-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .card {
      background: var(--bg-card);
      border: 1px solid var(--border-card);
      border-radius: 12px;
      padding: 12px;
      backdrop-filter: blur(12px);
      transition: all var(--transition-fast);
      position: relative;
      overflow: hidden;
    }

    .card:hover {
      background: rgba(255, 255, 255, 0.05);
      border-color: rgba(255, 255, 255, 0.1);
      transform: translateY(-2px);
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4);
    }

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 8px;
      gap: 8px;
    }

    .card-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      align-items: center;
    }

    .badge {
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.3px;
      padding: 2px 6px;
      border-radius: 4px;
      text-transform: uppercase;
    }

    .badge-critical {
      background: rgba(244, 63, 94, 0.1);
      border: 1px solid rgba(244, 63, 94, 0.2);
      color: var(--rose);
    }

    .badge-high {
      background: rgba(244, 63, 94, 0.1);
      border: 1px solid rgba(244, 63, 94, 0.2);
      color: var(--rose);
    }

    .badge-medium {
      background: rgba(245, 158, 11, 0.1);
      border: 1px solid rgba(245, 158, 11, 0.2);
      color: var(--amber);
    }

    .badge-low {
      background: rgba(99, 102, 241, 0.1);
      border: 1px solid rgba(99, 102, 241, 0.2);
      color: var(--primary);
    }

    .line-tag {
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--border-card);
      color: var(--text-main);
      padding: 1px 5px;
      border-radius: 4px;
      cursor: pointer;
      font-weight: 500;
      transition: all var(--transition-fast);
    }

    .line-tag:hover {
      background: var(--primary);
      border-color: var(--primary);
      color: #fff;
    }

    .card-actions {
      display: flex;
      gap: 4px;
    }

    .card-btn {
      background: transparent;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      padding: 4px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all var(--transition-fast);
    }

    .card-btn:hover {
      background: rgba(255, 255, 255, 0.08);
      color: var(--text-main);
    }

    .card-btn-fix:hover {
      background: rgba(16, 185, 129, 0.1);
      color: var(--emerald);
    }

    .card-body {
      font-size: 12px;
      color: var(--text-muted);
      line-height: 1.4;
      margin-bottom: 10px;
    }

    .card-code-type {
      font-family: 'JetBrains Mono', monospace;
      font-size: 9px;
      color: rgba(255, 255, 255, 0.25);
      letter-spacing: 0.2px;
    }

    /* Footer Info */
    .footer {
      margin-top: 24px;
      padding-top: 12px;
      border-top: 1px solid var(--border-card);
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      color: var(--text-muted);
    }

    .footer-item {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    /* Scanning Radar Sweep */
    .scanning-sweep {
      width: 100%;
      height: 2px;
      background: linear-gradient(90deg, transparent, var(--primary), transparent);
      animation: sweep 1.5s infinite linear;
      position: absolute;
      top: 0;
      left: 0;
      display: none;
    }

    .scanning .scanning-sweep {
      display: block;
    }

    @keyframes sweep {
      0% { transform: translateY(0); }
      100% { transform: translateY(120px); }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="title">
      <svg class="title-shield" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
      SecureCoder: Find and Fix
    </div>
    <button class="card-btn" id="btn-clear-session" title="Clear ignore count">
      <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
      </svg>
    </button>
  </div>

  <div class="action-bar">
    <div class="action-row">
      <button class="btn btn-primary" id="btn-scan" title="Scan active editor file">
        <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>
        </svg>
        Scan File/Folder...
      </button>
    </div>
    <div class="action-row">
      <button class="btn" id="badge-ignore-total" style="flex: 1;" disabled>
        <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858-.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18"/>
        </svg>
        Ignore (0)
      </button>
      <button class="btn btn-fix-top" id="btn-fix-all" style="flex: 1.2;" title="Remediate all issues using Local AI">
        <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L18 14l-6.857 2.286L9 23l-2.286-6.857L0 14l6.857-2.286L9 5z"/>
        </svg>
        Fix (0)
      </button>
    </div>
  </div>

  <div class="file-badge" id="active-file-indicator" style="display: none;">
    <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
      <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
    </svg>
    File: <span class="file-badge-active" id="active-file-name">index.ts</span>
  </div>

  <!-- State Containers -->
  <div class="state-container active" id="state-ready">
    <div class="state-icon">
      <svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
      </svg>
    </div>
    <div class="state-title">Ready to Scan</div>
    <div class="state-desc">Open any file to start an automatic scan, or use the Scan button above to inspect your workspace.</div>
  </div>

  <div class="state-container" id="state-scanning">
    <div class="state-icon">
      <svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="animation: spin 1s infinite linear;">
        <style>
          @keyframes spin { 100% { transform: rotate(360deg); } }
        </style>
        <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 6H16"/>
      </svg>
    </div>
    <div class="state-title">Scanning...</div>
    <div class="state-desc">Analyzing code structure and verifying signatures with edge intelligence.</div>
  </div>

  <div class="state-container" id="state-safe">
    <div class="state-icon secure">
      <svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
      </svg>
    </div>
    <div class="state-title">Pristine & Secure</div>
    <div class="state-desc">No compliance issues or secret leaks detected in this file. Outstanding!</div>
  </div>

  <!-- Violations List -->
  <div class="violations-list" id="violations-container" style="display: none;"></div>

  <div class="footer">
    <div class="footer-item">
      <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
      </svg>
      Scope: Active File
    </div>
    <div class="footer-item" id="footer-ignored-badge">
      Ignored: 0
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    const stateReady = document.getElementById('state-ready');
    const stateScanning = document.getElementById('state-scanning');
    const stateSafe = document.getElementById('state-safe');
    const fileIndicator = document.getElementById('active-file-indicator');
    const fileNameText = document.getElementById('active-file-name');
    const violationsContainer = document.getElementById('violations-container');
    const badgeIgnoreTotal = document.getElementById('badge-ignore-total');
    const btnFixAll = document.getElementById('btn-fix-all');
    const footerIgnoredBadge = document.getElementById('footer-ignored-badge');

    // Action Handlers
    document.getElementById('btn-scan').addEventListener('click', () => {
      vscode.postMessage({ command: 'scanActiveFile' });
    });

    document.getElementById('btn-clear-session').addEventListener('click', () => {
      // Clear ignoring counts or reset view
      vscode.postMessage({ command: 'scanActiveFile' });
    });

    btnFixAll.addEventListener('click', () => {
      // Locate first violation and fix it
      const cards = violationsContainer.querySelectorAll('.card');
      if (cards.length > 0) {
        const line = parseInt(cards[0].dataset.line, 10);
        const code = cards[0].dataset.code;
        vscode.postMessage({ command: 'fixViolation', line, code });
      }
    });

    window.addEventListener('message', event => {
      const message = event.data;
      if (message.type === 'state') {
        renderState(message);
      }
    });

    function renderState(state) {
      // Update ignoring badge
      badgeIgnoreTotal.innerHTML = \`<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858-.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18"/>
      </svg> Ignore (\${state.ignoredCount})\`;
      
      footerIgnoredBadge.innerText = \`Ignored: \${state.ignoredCount}\`;

      // Hide all states
      stateReady.classList.remove('active');
      stateScanning.classList.remove('active');
      stateSafe.classList.remove('active');
      violationsContainer.style.display = 'none';
      fileIndicator.style.display = 'none';

      btnFixAll.innerHTML = \`<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L18 14l-6.857 2.286L9 23l-2.286-6.857L0 14l6.857-2.286L9 5z"/>
      </svg> Fix (\${state.violations.length})\`;

      if (state.status === 'ready' || !state.uri) {
        stateReady.classList.add('active');
        return;
      }

      fileIndicator.style.display = 'flex';
      fileNameText.innerText = state.fileName;

      if (state.status === 'scanning') {
        stateScanning.classList.add('active');
      } else if (state.status === 'safe') {
        stateSafe.classList.add('active');
      } else if (state.status === 'issues') {
        violationsContainer.style.display = 'flex';
        renderViolations(state.violations);
      }
    }

    function renderViolations(violations) {
      violationsContainer.innerHTML = '';
      
      violations.forEach(v => {
        const card = document.createElement('div');
        card.className = 'card';
        card.dataset.line = v.line;
        card.dataset.code = v.code;
        
        // Pulse animation block
        const pulseBar = document.createElement('div');
        pulseBar.className = 'scanning-sweep';
        card.appendChild(pulseBar);

        const cardHeader = document.createElement('div');
        cardHeader.className = 'card-header';

        const cardMeta = document.createElement('div');
        cardMeta.className = 'card-meta';

        const badge = document.createElement('span');
        const sevClass = v.severity.toLowerCase();
        badge.className = \`badge badge-\${sevClass}\`;
        badge.innerText = v.severity;

        const lineTag = document.createElement('span');
        lineTag.className = 'line-tag';
        lineTag.innerText = \`Line \${v.line}\`;
        lineTag.addEventListener('click', () => {
          vscode.postMessage({ command: 'jumpToLine', line: v.line });
        });

        cardMeta.appendChild(badge);
        cardMeta.appendChild(lineTag);

        const cardActions = document.createElement('div');
        cardActions.className = 'card-actions';

        const btnIgnore = document.createElement('button');
        btnIgnore.className = 'card-btn';
        btnIgnore.title = 'Ignore issue';
        btnIgnore.innerHTML = \`<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858-.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18"/>
        </svg>\`;
        btnIgnore.addEventListener('click', () => {
          card.classList.add('scanning'); // Trigger visual transition
          setTimeout(() => {
            vscode.postMessage({ command: 'ignoreViolation', line: v.line });
          }, 200);
        });

        const btnFix = document.createElement('button');
        btnFix.className = 'card-btn card-btn-fix';
        btnFix.title = 'Auto-Fix with Local AI';
        btnFix.innerHTML = \`<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L18 14l-6.857 2.286L9 23l-2.286-6.857L0 14l6.857-2.286L9 5z"/>
        </svg>\`;
        btnFix.addEventListener('click', () => {
          card.classList.add('scanning');
          vscode.postMessage({ command: 'fixViolation', line: v.line, code: v.code });
        });

        cardActions.appendChild(btnIgnore);
        cardActions.appendChild(btnFix);

        cardHeader.appendChild(cardMeta);
        cardHeader.appendChild(cardActions);

        const cardBody = document.createElement('div');
        cardBody.className = 'card-body';
        cardBody.innerText = v.message;

        const cardCode = document.createElement('div');
        cardCode.className = 'card-code-type';
        cardCode.innerText = \`Code: \${v.code}\`;

        card.appendChild(cardHeader);
        card.appendChild(cardBody);
        card.appendChild(cardCode);

        violationsContainer.appendChild(card);
      });
    }
  </script>
</body>
</html>`;
  }
}
