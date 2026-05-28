import { Parser, type Node } from "acorn";
import { LocalBloomFilter } from "./localBloomFilter";
import * as path from "path";
import * as fs from "fs";

/**
 * A structural token extracted from an Acorn AST node.
 */
export interface AstStructuralToken {
  readonly nodeType: string;
  readonly name: string;
  readonly line: number;
}

/**
 * A pair of adjacent AST structural token names.
 */
export interface AstBigram {
  readonly left: string;
  readonly right: string;
  readonly value: string;
  readonly line: number;
}

/**
 * Severity values emitted by the PromptShield core scanner.
 */
export type ViolationSeverity = "low" | "medium" | "high" | "critical";

/**
 * Violation categories emitted by the PromptShield core scanner.
 */
export type ViolationType =
  | "restricted-gpl-similarity"
  | "copyleft-license-notice"
  | "openai-api-key"
  | "google-api-key"
  | "aws-access-key-id"
  | "bearer-token"
  | "jwt-token"
  | "private-key-material"
  | "database-connection-string"
  | "generic-secret-assignment"
  | "email-address"
  | "internal-url";

/**
 * A compliance violation detected by the core scanner.
 */
export interface ScanViolation {
  readonly line: number;
  readonly violationType: ViolationType;
  readonly severity: ViolationSeverity;
}

/**
 * A regex scanner rule for deterministic sensitive-data findings.
 */
interface RegexScannerRule {
  readonly violationType: ViolationType;
  readonly severity: ViolationSeverity;
  readonly pattern: RegExp;
}

/**
 * An Acorn-compatible node shape with optional ESTree fields used by traversal.
 */
interface TraversableAstNode extends Node {
  readonly type: string;
  readonly name?: string;
  readonly id?: TraversableAstNode | null;
  readonly key?: TraversableAstNode | null;
  readonly loc?: {
    readonly start: {
      readonly line: number;
      readonly column: number;
    };
    readonly end: {
      readonly line: number;
      readonly column: number;
    };
  } | null;
  readonly [key: string]: unknown;
}

/**
 * The active binary Bloom filter loaded from a compiled filter.bin file.
 * Initialized lazily on first scan or explicitly via initializeBloomFilter().
 */
let activeBloomFilter: LocalBloomFilter | null = null;
let bloomFilterPath: string = "";

/**
 * Initializes the binary Bloom filter from a compiled .bin file.
 *
 * @param filterPath Absolute path to the filter.bin file.
 */
export function initializeBloomFilter(filterPath: string): void {
  if (fs.existsSync(filterPath)) {
    activeBloomFilter = LocalBloomFilter.fromFile(filterPath);
    bloomFilterPath = filterPath;
  }
}

/**
 * Reloads the Bloom filter from disk (used after weekly sync updates).
 *
 * @param filterPath Absolute path to the updated filter.bin file.
 */
export function reloadBloomFilter(filterPath: string): void {
  if (fs.existsSync(filterPath)) {
    const buffer = fs.readFileSync(filterPath);
    if (activeBloomFilter !== null) {
      activeBloomFilter.reload(buffer);
    } else {
      activeBloomFilter = new LocalBloomFilter(buffer);
    }
    bloomFilterPath = filterPath;
  }
}

/**
 * Returns the path to the currently loaded Bloom filter file.
 */
export function getBloomFilterPath(): string {
  return bloomFilterPath;
}

/**
 * Attempts to auto-discover and load the default bundled filter.bin.
 * Searches relative to the module location for resources/filter.bin.
 */
function ensureBloomFilterLoaded(): void {
  if (activeBloomFilter !== null) {
    return;
  }

  const candidates = [
    path.resolve(__dirname, "..", "resources", "filter.bin"),
    path.resolve(__dirname, "resources", "filter.bin"),
    path.resolve(__dirname, "..", "..", "resources", "filter.bin")
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      initializeBloomFilter(candidate);
      return;
    }
  }
}

const maxRegexViolations = 100;

const regexScannerRules: readonly RegexScannerRule[] = [
  {
    violationType: "private-key-material",
    severity: "critical",
    pattern: /-----BEGIN\s+(?:RSA|DSA|EC|OPENSSH|PGP)?\s*PRIVATE KEY-----/g
  },
  {
    violationType: "openai-api-key",
    severity: "critical",
    pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g
  },
  {
    violationType: "google-api-key",
    severity: "critical",
    pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g
  },
  {
    violationType: "aws-access-key-id",
    severity: "critical",
    pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g
  },
  {
    violationType: "bearer-token",
    severity: "high",
    pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}\b/g
  },
  {
    violationType: "jwt-token",
    severity: "high",
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g
  },
  {
    violationType: "database-connection-string",
    severity: "high",
    pattern: /\b(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis):\/\/[^\s"'`<>]+/gi
  },
  {
    violationType: "generic-secret-assignment",
    severity: "medium",
    pattern: /\b(?:api[_-]?key|secret|token|password|passwd|pwd|client[_-]?secret)\b\s*[:=]\s*["'`][^"'`\s]{12,}["'`]/gi
  },
  {
    violationType: "internal-url",
    severity: "medium",
    pattern: /\bhttps?:\/\/(?:localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|[A-Za-z0-9.-]+\.internal)(?::\d{1,5})?(?:\/[^\s"'`]*)?/gi
  },
  {
    violationType: "email-address",
    severity: "low",
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g
  }
];

const copyleftLicenseNoticeRules: readonly RegexScannerRule[] = [
  {
    violationType: "copyleft-license-notice",
    severity: "critical",
    pattern: /GNU\s+General\s+Public\s+License/gi
  },
  {
    violationType: "copyleft-license-notice",
    severity: "critical",
    pattern: /GNU\s+Affero\s+General\s+Public\s+License/gi
  },
  {
    violationType: "copyleft-license-notice",
    severity: "high",
    pattern: /GNU\s+Lesser\s+General\s+Public\s+License/gi
  },
  {
    violationType: "copyleft-license-notice",
    severity: "critical",
    pattern: /SPDX-License-Identifier:\s*(?:GPL|AGPL|LGPL)[^\s*]*/gi
  },
  {
    violationType: "copyleft-license-notice",
    severity: "critical",
    pattern: /This\s+program\s+is\s+free\s+software:\s+you\s+can\s+redistribute\s+it/gi
  },
  {
    violationType: "copyleft-license-notice",
    severity: "critical",
    pattern: /\b(?:GPL|AGPL|LGPL)(?:-v?[\d.]+)?\s+License\b/gi
  }
];



/**
 * Parses JavaScript or TypeScript-like source code with Acorn and extracts structural AST tokens.
 *
 * Acorn is a JavaScript parser, so TypeScript-only syntax is tolerated through a small
 * normalization pass that removes common type annotations before parsing. This keeps the
 * engine pure and lightweight while still producing stable structural tokens for prototype scans.
 *
 * @param code The source code to parse.
 * @returns Ordered structural AST tokens.
 */
export function parseAstTokens(code: string): AstStructuralToken[] {
  const normalizedCode = normalizeTypeScriptForAcorn(code);
  const rootNode = Parser.parse(normalizedCode, {
    ecmaVersion: "latest",
    sourceType: "module",
    locations: true,
    allowHashBang: true
  }) as unknown as TraversableAstNode;

  const tokens: AstStructuralToken[] = [];
  visitAstNode(rootNode, tokens);

  return tokens;
}

/**
 * Extracts adjacent structural token pairs from an ordered AST token stream.
 *
 * @param tokens Ordered structural tokens produced by parseAstTokens.
 * @returns Adjacent token bigrams.
 */
export function extractBigrams(tokens: readonly AstStructuralToken[]): AstBigram[] {
  const bigrams: AstBigram[] = [];

  for (let index = 0; index < tokens.length - 1; index += 1) {
    const leftToken = tokens[index];
    const rightToken = tokens[index + 1];
    const left = formatTokenName(leftToken);
    const right = formatTokenName(rightToken);

    bigrams.push({
      left,
      right,
      value: `${left}_${right}`,
      line: leftToken.nodeType === "Program" ? rightToken.line : leftToken.line
    });
  }

  return bigrams;
}

/**
 * Hashes a string using the 32-bit FNV-1a algorithm.
 *
 * @param value The string value to hash.
 * @returns An unsigned 32-bit integer hash.
 */
export function fnv1a32(value: string): number {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
}

/**
 * Scans source code for similarity against the prototype restricted GPL fingerprint set.
 *
 * The scanner parses source into structural tokens, extracts adjacent bigrams, hashes those
 * bigrams with FNV-1a, and compares the resulting hash set with the mock Bloom filter using
 * Jaccard similarity. A violation is emitted when the Jaccard index is at least 0.75.
 *
 * @param code The JavaScript or TypeScript source code to scan.
 * @returns Compliance violations detected for the document.
 */
export function scanDocument(code: string): ScanViolation[] {
  const regexViolations = scanRegexViolations(code);

  try {
    return [...regexViolations, ...scanLicenseViolations(code)];
  } catch {
    return regexViolations;
  }
}

/**
 * Scans source text for deterministic secret, credential, and sensitive-data patterns.
 *
 * @param code The source code to scan.
 * @returns Regex-based violations discovered before AST license analysis.
 */
export function scanRegexViolations(code: string): ScanViolation[] {
  const lineStarts = buildLineStartIndexes(code);
  const violations: ScanViolation[] = [];
  const seenFindings = new Set<string>();

  for (const rule of regexScannerRules) {
    rule.pattern.lastIndex = 0;

    for (const match of code.matchAll(rule.pattern)) {
      if (match.index === undefined) {
        continue;
      }

      const line = getLineNumberFromIndex(lineStarts, match.index);
      const findingKey = `${rule.violationType}:${line}:${match[0]}`;

      if (seenFindings.has(findingKey)) {
        continue;
      }

      seenFindings.add(findingKey);
      violations.push({
        line,
        violationType: rule.violationType,
        severity: rule.severity
      });

      if (violations.length >= maxRegexViolations) {
        return violations;
      }
    }
  }

  return violations;
}

/**
 * Builds a sorted index of character offsets where each source line starts.
 *
 * @param code The source text to index.
 * @returns Zero-based character offsets for line starts.
 */
function buildLineStartIndexes(code: string): number[] {
  const lineStarts = [0];

  for (let index = 0; index < code.length; index += 1) {
    if (code.charCodeAt(index) === 10) {
      lineStarts.push(index + 1);
    }
  }

  return lineStarts;
}

/**
 * Converts a zero-based character offset to a one-based line number.
 *
 * @param lineStarts Sorted character offsets produced by buildLineStartIndexes.
 * @param characterIndex Zero-based character offset of a finding.
 * @returns One-based source line number.
 */
function getLineNumberFromIndex(lineStarts: readonly number[], characterIndex: number): number {
  let low = 0;
  let high = lineStarts.length - 1;

  while (low <= high) {
    const midpoint = Math.floor((low + high) / 2);
    const lineStart = lineStarts[midpoint];
    const nextLineStart = lineStarts[midpoint + 1] ?? Number.POSITIVE_INFINITY;

    if (characterIndex >= lineStart && characterIndex < nextLineStart) {
      return midpoint + 1;
    }

    if (characterIndex < lineStart) {
      high = midpoint - 1;
    } else {
      low = midpoint + 1;
    }
  }

  return lineStarts.length;
}

/**
 * Scans source code for similarity against the prototype restricted GPL fingerprint set.
 *
 * @param code The JavaScript or TypeScript source code to scan.
 * @returns License-similarity violations detected for the document.
 */
/**
 * Scans source code for similarity against the binary Bloom filter of restricted licenses.
 *
 * @param code The JavaScript or TypeScript source code to scan.
 * @returns License-similarity violations detected for the document.
 */
function scanLicenseViolations(code: string): ScanViolation[] {
  const licenseNoticeViolation = scanCopyleftLicenseNotice(code);

  if (licenseNoticeViolation !== undefined) {
    return [licenseNoticeViolation];
  }

  // Attempt binary Bloom filter scan (production path)
  const bloomViolation = scanWithBloomFilter(code);
  if (bloomViolation !== undefined) {
    return [bloomViolation];
  }

  return [];
}

/**
 * Scans source code against the binary Bloom filter using multi-language
 * structural tokenization.
 *
 * @param code The source code to scan.
 * @returns A violation if the code structurally matches restricted signatures, or undefined.
 */
function scanWithBloomFilter(code: string): ScanViolation | undefined {
  ensureBloomFilterLoaded();

  if (activeBloomFilter === null || !activeBloomFilter.isLoaded) {
    return undefined;
  }

  // Use the unified multi-language tokenizer (same as the compiler)
  const tokens = tokenizeForBloomCheck(code);
  if (tokens.length < 50) {
    return undefined;
  }

  const BOILERPLATE_TOKENS = new Set<string>([
    "VAR_DECL",
    "ASSIGN",
    "DOT",
    "PAREN_OPEN",
    "PAREN_CLOSE",
    "BLOCK_OPEN",
    "BLOCK_CLOSE",
    "BRACKET_OPEN",
    "BRACKET_CLOSE",
    "SEMI",
    "COMMA",
    "COLON",
    "LIT_STR",
    "LIT_NUM",
    "IDENT"
  ]);

  // Build trigrams and hash them
  const trigrams: string[] = [];
  for (let i = 0; i < tokens.length - 2; i += 1) {
    const t1 = tokens[i];
    const t2 = tokens[i + 1];
    const t3 = tokens[i + 2];
    if (!(BOILERPLATE_TOKENS.has(t1) && BOILERPLATE_TOKENS.has(t2) && BOILERPLATE_TOKENS.has(t3))) {
      trigrams.push(`${t1}_${t2}_${t3}`);
    }
  }

  const hashes = trigrams.map((b) => fnv1a32(b));

  // Use a rolling window approach to find localized matches.
  // A window of 24 provides strong structural specificity.
  const windowSize = 24;
  const bloomMatchThreshold = 0.95;

  if (hashes.length < windowSize) {
    return undefined;
  }

  let bestMatchRatio = 0;
  let bestWindowStart = 0;

  for (let start = 0; start <= hashes.length - windowSize; start += 1) {
    const window = hashes.slice(start, start + windowSize);
    const matchCount = activeBloomFilter.countMatches(window);
    const ratio = matchCount / windowSize;

    if (ratio > bestMatchRatio) {
      bestMatchRatio = ratio;
      bestWindowStart = start;
    }

    if (bestMatchRatio >= 1.0) {
      break;
    }
  }

  if (bestMatchRatio >= bloomMatchThreshold) {
    const matchLine = findLineForTokenIndex(code, bestWindowStart);
    return {
      line: matchLine,
      violationType: "restricted-gpl-similarity",
      severity: severityFromSimilarity(bestMatchRatio)
    };
  }

  return undefined;
}

/**
 * Tokenizes source code into structural tokens for Bloom filter checking.
 * This mirrors the compiler's tokenization logic so hashes match.
 *
 * @param code The source code to tokenize.
 * @returns Ordered structural token strings.
 */
function tokenizeForBloomCheck(code: string): string[] {
  let cleaned = code;
  cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, " ");
  cleaned = cleaned.replace(/'''[\s\S]*?'''/g, " ");
  cleaned = cleaned.replace(/"""[\s\S]*?"""/g, " ");
  cleaned = cleaned.replace(/\/\/.*/g, " ");
  cleaned = cleaned.replace(/#.*/g, " ");
  cleaned = cleaned.replace(/`(?:[^`\\]|\\.)*`/g, " STR ");
  cleaned = cleaned.replace(/"(?:[^"\\]|\\.)*"/g, " STR ");
  cleaned = cleaned.replace(/'(?:[^'\\]|\\.)*'/g, " STR ");
  cleaned = cleaned.replace(/\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/g, " NUM ");

  const pieces = cleaned
    .split(/(\s+|\b|[{}()\[\]+\-*/=<>!&|;,:?.@#~^%])/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const tokens: string[] = [];
  for (const piece of pieces) {
    const token = classifyBloomToken(piece);
    if (token !== undefined) {
      tokens.push(token);
    }
  }

  return tokens;
}

/**
 * Classifies a lexeme into a structural token using the same scheme as the compiler.
 * Must produce identical tokens for identical code so hashes match the filter.
 *
 * @param lexeme The source fragment to classify.
 * @returns A structural token or undefined.
 */
function classifyBloomToken(lexeme: string): string | undefined {
  if (lexeme.length === 0) {
    return undefined;
  }

  switch (lexeme) {
    case "function": case "def": case "func": return "FN_DEF";
    case "class": case "struct": case "interface": return "CLASS_DEF";
    case "if": return "IF";
    case "else": case "elif": return "ELSE";
    case "switch": case "match": return "SWITCH";
    case "case": return "CASE";
    case "for": return "FOR";
    case "while": return "WHILE";
    case "do": return "DO";
    case "range": return "RANGE";
    case "in": return "IN";
    case "try": return "TRY";
    case "catch": case "except": return "CATCH";
    case "finally": return "FINALLY";
    case "throw": case "raise": return "THROW";
    case "return": return "RETURN";
    case "yield": return "YIELD";
    case "async": return "ASYNC";
    case "await": return "AWAIT";
    case "const": case "let": case "var": case "val": return "VAR_DECL";
    case "import": case "require": case "from": case "include": return "IMPORT";
    case "export": case "package": case "module": return "EXPORT";
    case "new": return "NEW";
    case "this": case "self": return "SELF";
    case "extends": case "implements": return "INHERITS";
    case "abstract": return "ABSTRACT";
    case "static": return "STATIC";
    case "public": case "private": case "protected": return "ACCESS_MOD";
    case "true": case "false": case "True": case "False": return "BOOL";
    case "null": case "nil": case "None": case "undefined": return "NULL";
    case "{": return "BLOCK_OPEN";
    case "}": return "BLOCK_CLOSE";
    case "(": return "PAREN_OPEN";
    case ")": return "PAREN_CLOSE";
    case "[": return "BRACKET_OPEN";
    case "]": return "BRACKET_CLOSE";
    case "=": case ":=": return "ASSIGN";
    case "==": case "===": case "!=": case "!==": case "<": case ">": case "<=": case ">=": return "COMPARE";
    case "+": case "-": case "*": case "/": case "%": case "**": return "MATH";
    case "&&": case "||": case "!": case "and": case "or": case "not": return "LOGIC";
    case ";": return "SEMI";
    case ",": return "COMMA";
    case ".": return "DOT";
    case "=>": case "->": return "ARROW";
    case ":": return "COLON";
    case "STR": return "LIT_STR";
    case "NUM": return "LIT_NUM";
    case "defer": case "go": case "chan": case "select": return "GO_KEYWORD";
    case "lambda": return "LAMBDA";
    case "with": return "WITH";
    case "as": return "AS";
    case "is": return "IS";
    case "instanceof": case "typeof": return "TYPE_CHECK";
    case "break": return "BREAK";
    case "continue": return "CONTINUE";
    case "default": return "DEFAULT";
    default:
      if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(lexeme)) {
        return "IDENT";
      }
      return undefined;
  }
}

/**
 * Maps a token index back to a source line number for diagnostic reporting.
 *
 * @param code The original source code.
 * @param tokenIndex The index of the matched token window.
 * @returns A one-based line number.
 */
function findLineForTokenIndex(code: string, tokenIndex: number): number {
  const lines = code.split(/\r?\n/);
  let tokenCounter = 0;

  for (let lineNum = 0; lineNum < lines.length; lineNum += 1) {
    const lineTokens = lines[lineNum].split(/\s+|\b/).filter((s) => s.trim().length > 0);
    tokenCounter += lineTokens.length;

    if (tokenCounter > tokenIndex) {
      return lineNum + 1;
    }
  }

  return 1;
}

/**
 * Finds explicit copyleft license notices such as GPL/AGPL/LGPL headers.
 *
 * @param code The source text to scan.
 * @returns A license notice violation when a copyleft header is found.
 */
function scanCopyleftLicenseNotice(code: string): ScanViolation | undefined {
  const lineStarts = buildLineStartIndexes(code);

  for (const rule of copyleftLicenseNoticeRules) {
    rule.pattern.lastIndex = 0;

    const match = rule.pattern.exec(code);

    if (match?.index !== undefined) {
      return {
        line: getLineNumberFromIndex(lineStarts, match.index),
        violationType: rule.violationType,
        severity: rule.severity
      };
    }
  }

  return undefined;
}



/**
 * Walks an AST node and appends structural tokens in deterministic traversal order.
 *
 * @param node The AST node to visit.
 * @param tokens The mutable token collection receiving structural tokens.
 */
function visitAstNode(node: TraversableAstNode, tokens: AstStructuralToken[]): void {
  const stack: TraversableAstNode[] = [node];
  const visited = new WeakSet<object>();

  while (stack.length > 0) {
    const currentNode = stack.pop();

    if (currentNode === undefined || visited.has(currentNode)) {
      continue;
    }

    visited.add(currentNode);
    tokens.push({
      nodeType: currentNode.type,
      name: getNodeName(currentNode),
      line: currentNode.loc?.start.line ?? 1
    });

    const childNodes = collectChildNodes(currentNode);

    for (let index = childNodes.length - 1; index >= 0; index -= 1) {
      stack.push(childNodes[index]);
    }
  }
}

/**
 * Converts a structural token into the compact name used by bigram extraction.
 *
 * @param token The structural token to format.
 * @returns A compact token name.
 */
function formatTokenName(token: AstStructuralToken): string {
  return token.nodeType;
}

/**
 * Collects AST child nodes in the same property order used by Acorn objects.
 *
 * @param node The AST node whose children should be collected.
 * @returns Ordered child nodes for deterministic traversal.
 */
function collectChildNodes(node: TraversableAstNode): TraversableAstNode[] {
  const childNodes: TraversableAstNode[] = [];

  for (const key of Object.keys(node)) {
    if (isTraversalMetadataKey(key)) {
      continue;
    }

    const value = node[key];

    if (isTraversableAstNode(value)) {
      childNodes.push(value);
      continue;
    }

    if (Array.isArray(value)) {
      for (const child of value) {
        if (isTraversableAstNode(child)) {
          childNodes.push(child);
        }
      }
    }
  }

  return childNodes;
}

/**
 * Extracts the most useful stable display name from a node.
 *
 * @param node The AST node to inspect.
 * @returns A stable node name or an empty string.
 */
function getNodeName(node: TraversableAstNode): string {
  if (typeof node.name === "string") {
    return node.name;
  }

  if (isTraversableAstNode(node.id) && typeof node.id.name === "string") {
    return node.id.name;
  }

  if (isTraversableAstNode(node.key) && typeof node.key.name === "string") {
    return node.key.name;
  }

  return "";
}

/**
 * Determines whether a value is an AST node suitable for traversal.
 *
 * @param value The unknown value to test.
 * @returns True when the value looks like an ESTree-compatible node.
 */
function isTraversableAstNode(value: unknown): value is TraversableAstNode {
  return typeof value === "object" && value !== null && "type" in value && typeof (value as { type: unknown }).type === "string";
}

/**
 * Determines whether an AST key should be skipped during child traversal.
 *
 * @param key The node object key to test.
 * @returns True for metadata fields that do not contain child nodes.
 */
function isTraversalMetadataKey(key: string): boolean {
  return key === "type" || key === "start" || key === "end" || key === "loc" || key === "range";
}

/**
 * Maps a similarity score to a scanner severity.
 *
 * @param similarity The Jaccard similarity score.
 * @returns A severity level.
 */
function severityFromSimilarity(similarity: number): ViolationSeverity {
  if (similarity >= 0.95) {
    return "critical";
  }

  if (similarity >= 0.6) {
    return "high";
  }

  return "medium";
}

/**
 * Removes common TypeScript-only syntax that Acorn cannot parse natively.
 *
 * @param code The original source code.
 * @returns JavaScript-compatible source suitable for Acorn structural parsing.
 */
function normalizeTypeScriptForAcorn(code: string): string {
  return code
    .replace(/\binterface\s+\w+\s*(?:extends\s+[\w,\s]+)?\{[^}]*\}/g, "")
    .replace(/\btype\s+\w+\s*=\s*[^;]+;/g, "")
    .replace(/\bas\s+\w+(?:<[^>]+>)?/g, "")
    .replace(/:\s*[A-Za-z_$][\w$]*(?:<[^;=(){}[\]]+>)?(?=\s*[,)=;{])/g, "")
    .replace(/<[^>\n]+>(?=\s*\()/g, "");
}
