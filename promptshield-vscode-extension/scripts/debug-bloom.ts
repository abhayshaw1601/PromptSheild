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



const code = `
  export function fibonacci(n: number, memo: Record<number, number> = {}): number {
    if (n <= 1) return n;
    if (n in memo) return memo[n];
    memo[n] = fibonacci(n - 1, memo) + fibonacci(n - 2, memo);
    return memo[n];
  }
`;

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

const tokens = tokenizeForBloomCheck(code);
console.log("TOKENS:", tokens.join(" "));

const trigrams: string[] = [];
for (let i = 0; i < tokens.length - 2; i += 1) {
  const t1 = tokens[i];
  const t2 = tokens[i + 1];
  const t3 = tokens[i + 2];
  if (!(BOILERPLATE_TOKENS.has(t1) && BOILERPLATE_TOKENS.has(t2) && BOILERPLATE_TOKENS.has(t3))) {
    trigrams.push(`${t1}_${t2}_${t3}`);
  }
}

console.log("\nTRIGRAMS AND TESTS:");
for (const b of trigrams) {
  const hash = fnv1a32(b);
  const matched = filter.test(hash);
  console.log(`  ${b} => hash: ${hash} => ${matched ? "MATCH" : "NO_MATCH"}`);
}

