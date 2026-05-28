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
 * A compliance violation detected by the core scanner.
 */
export interface ScanViolation {
  readonly line: number;
  readonly violationType: "restricted-gpl-similarity";
  readonly severity: ViolationSeverity;
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
  1836718064,
  4097420755,
  1641195545,
  1491177707,
  1749585002
];

const restrictedGplFilter = new MockBloomFilter(restrictedGplHashes);

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
  const tokens = parseAstTokens(code);
  const bigrams = extractBigrams(tokens);
  const documentHashes = bigrams.map((bigram) => fnv1a32(bigram.value));
  const restrictedHashes = restrictedGplFilter.values();
  const similarityResult = calculateBestRestrictedSimilarity(documentHashes, restrictedHashes);

  if (similarityResult.score < 0.75) {
    return [];
  }

  return [
    {
      line: findFirstMatchedLine(bigrams, restrictedHashes, similarityResult.startIndex),
      violationType: "restricted-gpl-similarity",
      severity: severityFromSimilarity(similarityResult.score)
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
  if (similarity >= 0.95) {
    return "critical";
  }

  if (similarity >= 0.85) {
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
