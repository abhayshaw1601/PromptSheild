import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import { scanDocument, initializeBloomFilter, reloadBloomFilter } from "./cleanScribeCore";
import { PROMPTSHIELD_DIAGNOSTIC_SOURCE, PROMPTSHIELD_RESTRICTED_GPL_CODE } from "./promptShieldDiagnostics";
import { registerPromptShieldCodeActions } from "./promptShieldCodeActions";
import { createPromptShieldLogger } from "./promptShieldLogger";
import type { PromptShieldLogger } from "./promptShieldLogger";

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

  // Initialize the binary Bloom filter from local storage or bundled default
  initializeBloomFilterFromStorage(context, logger);

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

  // Schedule weekly Bloom filter sync
  scheduleWeeklySync(context, logger);
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

// ---------------------------------------------------------------------------
// Bloom Filter Initialization
// ---------------------------------------------------------------------------

const BLOOM_FILTER_FILENAME = "filter.bin";
const SYNC_STATE_KEY = "promptshield.lastFilterSyncTimestamp";
const SYNC_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const FILTER_CDN_URL = "https://api.promptshield.io/rules/filter.bin";

function initializeBloomFilterFromStorage(context: vscode.ExtensionContext, logger: PromptShieldLogger): void {
  try {
    // Check globalStorageUri for a previously synced filter
    const globalStoragePath = context.globalStorageUri.fsPath;
    const syncedFilterPath = path.join(globalStoragePath, BLOOM_FILTER_FILENAME);

    if (fs.existsSync(syncedFilterPath)) {
      initializeBloomFilter(syncedFilterPath);
      logger.info("Bloom filter loaded from synced storage.", { path: syncedFilterPath });
      return;
    }

    // Fallback: load the bundled default filter from the extension directory
    const bundledFilterPath = path.join(context.extensionPath, "resources", BLOOM_FILTER_FILENAME);

    if (fs.existsSync(bundledFilterPath)) {
      initializeBloomFilter(bundledFilterPath);
      logger.info("Bloom filter loaded from bundled resources.", { path: bundledFilterPath });
      return;
    }

    logger.warn("No Bloom filter found. Structural license scanning will use fallback mode.");
  } catch (error) {
    logger.error("Failed to initialize Bloom filter.", error);
  }
}

// ---------------------------------------------------------------------------
// Weekly Background Sync
// ---------------------------------------------------------------------------

function scheduleWeeklySync(context: vscode.ExtensionContext, logger: PromptShieldLogger): void {
  const lastSync = context.globalState.get<number>(SYNC_STATE_KEY, 0);
  const now = Date.now();
  const elapsed = now - lastSync;

  if (elapsed < SYNC_INTERVAL_MS) {
    const remainingDays = ((SYNC_INTERVAL_MS - elapsed) / (24 * 60 * 60 * 1000)).toFixed(1);
    logger.info(`Bloom filter sync not due yet. Next sync in ${remainingDays} days.`);
    return;
  }

  logger.info("Weekly Bloom filter sync triggered.");
  downloadFilterUpdate(context, logger);
}

function downloadFilterUpdate(context: vscode.ExtensionContext, logger: PromptShieldLogger): void {
  try {
    const parsedUrl = new URL(FILTER_CDN_URL);

    const options: https.RequestOptions = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname,
      method: "GET",
      headers: {
        "User-Agent": "PromptShield-VSCode/1.0"
      }
    };

    const req = https.request(options, (res) => {
      if (res.statusCode !== 200) {
        logger.warn(`Bloom filter sync: HTTP ${res.statusCode ?? "unknown"} from CDN.`);
        return;
      }

      const chunks: Buffer[] = [];
      let totalBytes = 0;
      const maxBytes = 5 * 1024 * 1024;

      res.on("data", (chunk: Buffer) => {
        totalBytes += chunk.length;
        if (totalBytes > maxBytes) {
          res.destroy();
          logger.warn("Bloom filter sync: Response exceeded 5 MB limit. Aborting.");
          return;
        }
        chunks.push(chunk);
      });

      res.on("end", () => {
        try {
          const data = Buffer.concat(chunks);

          if (data.length < 1024) {
            logger.warn("Bloom filter sync: Downloaded file is too small. Skipping.");
            return;
          }

          const globalStoragePath = context.globalStorageUri.fsPath;
          if (!fs.existsSync(globalStoragePath)) {
            fs.mkdirSync(globalStoragePath, { recursive: true });
          }

          const filterPath = path.join(globalStoragePath, BLOOM_FILTER_FILENAME);
          fs.writeFileSync(filterPath, data);

          reloadBloomFilter(filterPath);
          context.globalState.update(SYNC_STATE_KEY, Date.now());

          logger.info("Bloom filter synced and hot-reloaded.", {
            path: filterPath,
            sizeBytes: data.length
          });
        } catch (writeError) {
          logger.error("Bloom filter sync: Failed to save updated filter.", writeError);
        }
      });

      res.on("error", (streamError) => {
        logger.error("Bloom filter sync: Stream error.", streamError);
      });
    });

    req.on("error", (reqError) => {
      logger.warn(`Bloom filter sync: Network error (CDN may be unreachable). Extension continues offline.`);
      logger.error("Bloom filter sync: Request error details.", reqError);
    });

    req.setTimeout(30000, () => {
      req.destroy();
      logger.warn("Bloom filter sync: Request timed out after 30 seconds.");
    });

    req.end();
  } catch (error) {
    logger.error("Bloom filter sync: Unexpected error.", error);
  }
}
