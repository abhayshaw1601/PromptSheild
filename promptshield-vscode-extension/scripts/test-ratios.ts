import { LocalBloomFilter } from "../src/localBloomFilter";
import * as path from "path";

const filterPath = path.resolve(__dirname, "..", "resources", "filter.bin");
const filter = LocalBloomFilter.fromFile(filterPath);

function fnv1a32(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

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

function classifyBloomToken(lexeme: string): string | undefined {
  if (lexeme.length === 0) return undefined;
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
      if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(lexeme)) return "IDENT";
      return undefined;
  }
}



const snippets = [
  {
    name: "Fibonacci (Clean)",
    code: `
      export function fibonacci(n: number, memo: Record<number, number> = {}): number {
        if (n <= 1) return n;
        if (n in memo) return memo[n];
        memo[n] = fibonacci(n - 1, memo) + fibonacci(n - 2, memo);
        return memo[n];
      }
    `
  },
  {
    name: "QuickSort (Clean)",
    code: `
      function quickSort(arr) {
        if (arr.length <= 1) return arr;
        const pivot = arr[arr.length - 1];
        const left = [];
        const right = [];
        for (let i = 0; i < arr.length - 1; i++) {
          if (arr[i] < pivot) left.push(arr[i]);
          else right.push(arr[i]);
        }
        return [...quickSort(left), pivot, ...quickSort(right)];
      }
    `
  },
  {
    name: "Python Dijkstra (Plagiarism)",
    code: `
      def computePaths(self, originPoint):
          import heapq
          shortestPaths = {node: float('inf') for node in self.adjacency}
          shortestPaths[originPoint] = 0
          activeQueue = [(0, originPoint)]
          predecessors = {node: None for node in self.adjacency}
          while activeQueue:
              currentCost, currentItem = heapq.heappop(activeQueue)
              if currentCost > shortestPaths[currentItem]:
                  continue
              for vertexNeighbor, pathWeight in self.adjacency.get(currentItem, []):
                  newCost = currentCost + pathWeight
                  if newCost < shortestPaths[vertexNeighbor]:
                      shortestPaths[vertexNeighbor] = newCost
                      predecessors[vertexNeighbor] = currentItem
                      heapq.heappush(activeQueue, (newCost, vertexNeighbor))
          return shortestPaths, predecessors
    `
  },
  {
    name: "Go Linked List (Plagiarism)",
    code: `
      package customlist
      type Element struct {
          Val  int
          Next *Element
      }
      type Chain struct {
          Start *Element
          Count int
      }
      func (c *Chain) InvertList() {
          var previousElement *Element
          currentElement := c.Start
          for currentElement != nil {
              followingElement := currentElement.Next
              currentElement.Next = previousElement
              previousElement = currentElement
              currentElement = followingElement
          }
          c.Start = previousElement
      }
    `
  }
];

for (const s of snippets) {
  const tokens = tokenizeForBloomCheck(s.code);
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
  const windowSize = 16;

  let bestMatchRatio = 0;
  if (hashes.length >= windowSize) {
    for (let start = 0; start <= hashes.length - windowSize; start += 1) {
      const window = hashes.slice(start, start + windowSize);
      const matchCount = filter.countMatches(window);
      const ratio = matchCount / windowSize;
      if (ratio > bestMatchRatio) {
        bestMatchRatio = ratio;
      }
    }
  } else {
    const matchCount = filter.countMatches(hashes);
    bestMatchRatio = hashes.length > 0 ? matchCount / hashes.length : 0;
  }

  console.log(`Snippet: ${s.name}`);
  console.log(`  Tokens: ${tokens.length}, Trigrams: ${trigrams.length}`);
  console.log(`  Best Match Ratio: ${bestMatchRatio.toFixed(4)}`);
}
