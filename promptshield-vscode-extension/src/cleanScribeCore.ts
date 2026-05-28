import { Parser, type Node } from "acorn";

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
 * A mock Bloom filter backed by a Set for deterministic prototype behavior.
 */
export class MockBloomFilter {
  private readonly restrictedHashes: Set<number>;

  /**
   * Creates a mock Bloom filter with the provided restricted integer hashes.
   *
   * @param hashes Pre-computed 32-bit FNV-1a hashes for restricted code bigrams.
   */
  public constructor(hashes: readonly number[]) {
    this.restrictedHashes = new Set<number>(hashes);
  }

  /**
   * Checks whether a hash is present in the prototype restricted-code set.
   *
   * @param hash The 32-bit integer hash to test.
   * @returns True when the hash is present in the restricted set.
   */
  public has(hash: number): boolean {
    return this.restrictedHashes.has(hash);
  }

  /**
   * Returns a copy of all restricted hashes in the prototype filter.
   *
   * @returns A Set containing the restricted hashes.
   */
  public values(): Set<number> {
    return new Set<number>(this.restrictedHashes);
  }
}

const restrictedGplHashes: readonly number[] = [
  4097420755,
  1641195545,
  1491177707,
  1749585002
];

const restrictedGplFilter = new MockBloomFilter(restrictedGplHashes);

const licenseSimilarityThreshold = 0.75;
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
  }
];

const copyleftStructuralSignatures: readonly (readonly string[])[] = [
  [
    "KEYWORD_IMPORT",
    "IDENTIFIER",
    "KEYWORD_DEF",
    "PAREN_START",
    "PAREN_END",
    "BLOCK_START",
    "KEYWORD_TRY",
    "BLOCK_START",
    "KEYWORD_RETURN",
    "IDENTIFIER",
    "BLOCK_END",
    "KEYWORD_CATCH",
    "PAREN_START",
    "IDENTIFIER",
    "PAREN_END",
    "BLOCK_START",
    "KEYWORD_THROW",
    "IDENTIFIER",
    "BLOCK_END",
    "BLOCK_END"
  ],
  [
    "KEYWORD_DEF",
    "IDENTIFIER",
    "PAREN_START",
    "PAREN_END",
    "BLOCK_START",
    "KEYWORD_VAR",
    "IDENTIFIER",
    "OPERATOR_ASSIGN",
    "IDENTIFIER",
    "KEYWORD_WHILE",
    "PAREN_START",
    "IDENTIFIER",
    "OPERATOR_COMPARE",
    "IDENTIFIER",
    "PAREN_END",
    "BLOCK_START",
    "KEYWORD_IF",
    "PAREN_START",
    "IDENTIFIER",
    "OPERATOR_LOGIC",
    "IDENTIFIER",
    "PAREN_END",
    "BLOCK_START",
    "KEYWORD_RETURN",
    "IDENTIFIER",
    "BLOCK_END",
    "BLOCK_END"
  ]
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
function scanLicenseViolations(code: string): ScanViolation[] {
  const licenseNoticeViolation = scanCopyleftLicenseNotice(code);

  if (licenseNoticeViolation !== undefined) {
    return [licenseNoticeViolation];
  }

  const tokens = parseAstTokens(code);
  const bigrams = extractBigrams(tokens);
  const documentHashes = bigrams.map((bigram) => fnv1a32(bigram.value));
  const restrictedHashes = restrictedGplFilter.values();
  const similarityResult = calculateBestRestrictedSimilarity(documentHashes, restrictedHashes);

  if (similarityResult.score >= licenseSimilarityThreshold) {
    return [
      {
        line: findFirstMatchedLine(bigrams, restrictedHashes, similarityResult.startIndex),
        violationType: "restricted-gpl-similarity",
        severity: severityFromSimilarity(similarityResult.score)
      }
    ];
  }

  return scanGenericCopyleftStructuralViolation(code);
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
 * Runs a generic token-signature fallback for restricted copyleft structural patterns.
 *
 * @param code The source code to scan.
 * @returns A restricted similarity violation when the fallback signature matches.
 */
function scanGenericCopyleftStructuralViolation(code: string): ScanViolation[] {
  const tokens = tokenizeGenericStructure(code);

  if (tokens.length < 5) {
    return [];
  }

  const inputBigrams = extractGenericBigrams(tokens);
  let bestSimilarity = 0;

  for (const signature of copyleftStructuralSignatures) {
    const signatureBigrams = extractGenericBigrams(signature);
    const similarity = calculateStringJaccardSimilarity(inputBigrams, signatureBigrams);

    if (similarity > bestSimilarity) {
      bestSimilarity = similarity;
    }
  }

  if (bestSimilarity < licenseSimilarityThreshold) {
    return [];
  }

  return [
    {
      line: findFirstGenericStructuralLine(code),
      violationType: "restricted-gpl-similarity",
      severity: severityFromSimilarity(bestSimilarity)
    }
  ];
}

/**
 * Calculates the Jaccard similarity between two integer hash sets.
 *
 * @param left The first hash set.
 * @param right The second hash set.
 * @returns The Jaccard index from 0 to 1.
 */
export function calculateJaccardSimilarity(left: ReadonlySet<number>, right: ReadonlySet<number>): number {
  if (left.size === 0 && right.size === 0) {
    return 1;
  }

  let intersectionSize = 0;

  for (const value of left) {
    if (right.has(value)) {
      intersectionSize += 1;
    }
  }

  const unionSize = new Set<number>([...left, ...right]).size;
  return unionSize === 0 ? 0 : intersectionSize / unionSize;
}

/**
 * Calculates the Jaccard similarity between two string token sets.
 *
 * @param left The first token set.
 * @param right The second token set.
 * @returns The Jaccard index from 0 to 1.
 */
function calculateStringJaccardSimilarity(left: ReadonlySet<string>, right: ReadonlySet<string>): number {
  if (left.size === 0 && right.size === 0) {
    return 1;
  }

  let intersectionSize = 0;

  for (const value of left) {
    if (right.has(value)) {
      intersectionSize += 1;
    }
  }

  const unionSize = new Set<string>([...left, ...right]).size;
  return unionSize === 0 ? 0 : intersectionSize / unionSize;
}

/**
 * Extracts generic structural bigrams from a token sequence.
 *
 * @param tokens Ordered generic structural tokens.
 * @returns Adjacent token-pair signatures.
 */
function extractGenericBigrams(tokens: readonly string[]): Set<string> {
  const bigrams = new Set<string>();

  for (let index = 0; index < tokens.length - 1; index += 1) {
    bigrams.add(`${tokens[index]}__${tokens[index + 1]}`);
  }

  return bigrams;
}

/**
 * Tokenizes source into language-agnostic structural markers for fallback matching.
 *
 * @param code The source code to tokenize.
 * @returns A normalized token sequence.
 */
function tokenizeGenericStructure(code: string): string[] {
  const cleanedCode = code
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/'''[\s\S]*?'''/g, "")
    .replace(/"""[\s\S]*?"""/g, "")
    .replace(/\/\/.*/g, "")
    .replace(/#.*/g, "")
    .replace(/(["'])(?:(?=(\\?))\2.)*?\1/g, "TOKEN_STRING")
    .replace(/&&|\|\|/g, " OPERATOR_LOGIC ")
    .replace(/\b\d+\b/g, " IDENTIFIER ");

  const pieces = cleanedCode.split(/(\s+|\b|[{}()[\]+\-*/=<>!&|;,])/g);
  const tokens: string[] = [];

  for (const piece of pieces) {
    const token = mapGenericStructuralToken(piece.trim());

    if (token !== undefined) {
      tokens.push(token);
    }
  }

  return tokens;
}

/**
 * Maps source text fragments into generic structural tokens.
 *
 * @param value The source fragment to classify.
 * @returns A normalized structural token, or undefined for ignored fragments.
 */
function mapGenericStructuralToken(value: string): string | undefined {
  if (value.length === 0) {
    return undefined;
  }

  switch (value) {
    case "if":
      return "KEYWORD_IF";
    case "else":
    case "elif":
      return "KEYWORD_ELSE";
    case "for":
      return "KEYWORD_FOR";
    case "while":
      return "KEYWORD_WHILE";
    case "return":
      return "KEYWORD_RETURN";
    case "def":
    case "func":
    case "function":
      return "KEYWORD_DEF";
    case "class":
      return "KEYWORD_CLASS";
    case "import":
    case "include":
    case "require":
      return "KEYWORD_IMPORT";
    case "try":
      return "KEYWORD_TRY";
    case "catch":
    case "except":
      return "KEYWORD_CATCH";
    case "throw":
      return "KEYWORD_THROW";
    case "const":
    case "let":
    case "var":
      return "KEYWORD_VAR";
    case "{":
      return "BLOCK_START";
    case "}":
      return "BLOCK_END";
    case "(":
      return "PAREN_START";
    case ")":
      return "PAREN_END";
    case "[":
      return "BRACKET_START";
    case "]":
      return "BRACKET_END";
    case "+":
    case "-":
    case "*":
    case "/":
      return "OPERATOR_MATH";
    case "=":
    case "==":
    case "===":
      return "OPERATOR_ASSIGN";
    case "<":
    case ">":
    case "<=":
    case ">=":
    case "!=":
    case "!==":
      return "OPERATOR_COMPARE";
    case "&&":
    case "||":
    case "!":
    case "OPERATOR_LOGIC":
      return "OPERATOR_LOGIC";
    case ";":
      return "SEMICOLON";
    case "TOKEN_STRING":
      return "STRING";
    default:
      return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value) ? "IDENTIFIER" : undefined;
  }
}

/**
 * Finds a useful display line for a generic structural license match.
 *
 * @param code The source code that matched a generic signature.
 * @returns One-based line number for the diagnostic.
 */
function findFirstGenericStructuralLine(code: string): number {
  const lines = code.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    if (/\b(?:function|def|func|while|try)\b/.test(lines[index])) {
      return index + 1;
    }
  }

  return 1;
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
 * Finds the first source line associated with a bigram that matches the restricted set.
 *
 * @param bigrams The ordered document bigrams.
 * @param restrictedHashes The restricted hash set.
 * @returns The first matching line, or line 1 when no specific match can be located.
 */
function findFirstMatchedLine(
  bigrams: readonly AstBigram[],
  restrictedHashes: ReadonlySet<number>,
  startIndex: number
): number {
  for (let index = startIndex; index < bigrams.length; index += 1) {
    const bigram = bigrams[index];

    if (restrictedHashes.has(fnv1a32(bigram.value))) {
      return bigram.line;
    }
  }

  return 1;
}

/**
 * Maps a similarity score to a scanner severity.
 *
 * @param similarity The Jaccard similarity score.
 * @returns A severity level.
 */
function severityFromSimilarity(similarity: number): ViolationSeverity {
  if (similarity >= licenseSimilarityThreshold) {
    return "critical";
  }

  if (similarity >= 0.6) {
    return "high";
  }

  return "medium";
}

/**
 * Finds the highest Jaccard similarity between document bigram hashes and restricted hashes.
 *
 * @param documentHashes Ordered hashes extracted from document bigrams.
 * @param restrictedHashes The restricted hash set.
 * @returns The best similarity score and the starting bigram index for that score.
 */
function calculateBestRestrictedSimilarity(
  documentHashes: readonly number[],
  restrictedHashes: ReadonlySet<number>
): { readonly score: number; readonly startIndex: number } {
  if (documentHashes.length === 0 || restrictedHashes.size === 0) {
    return { score: 0, startIndex: 0 };
  }

  const windowSize = restrictedHashes.size;

  if (documentHashes.length <= windowSize) {
    return {
      score: calculateJaccardSimilarity(new Set<number>(documentHashes), restrictedHashes),
      startIndex: 0
    };
  }

  let bestScore = 0;
  let bestStartIndex = 0;

  for (let startIndex = 0; startIndex <= documentHashes.length - windowSize; startIndex += 1) {
    const windowHashes = new Set<number>(documentHashes.slice(startIndex, startIndex + windowSize));
    const score = calculateJaccardSimilarity(windowHashes, restrictedHashes);

    if (score > bestScore) {
      bestScore = score;
      bestStartIndex = startIndex;
    }

    if (bestScore === 1) {
      break;
    }
  }

  return { score: bestScore, startIndex: bestStartIndex };
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
