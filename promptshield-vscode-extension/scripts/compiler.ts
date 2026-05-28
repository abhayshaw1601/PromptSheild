/**
 * PromptShield Bloom Filter Compiler
 *
 * Accepts raw source code from any of the five supported languages (JavaScript,
 * TypeScript, Python, Go, Java), normalizes it into language-agnostic structural
 * tokens, generates adjacent bigrams, hashes them with FNV-1a 32-bit, and inserts
 * the hashes into a fixed-size binary Bloom filter buffer.
 *
 * The compiled output is a single binary file (default 1 MB) that can be loaded
 * by the VS Code extension for ultra-fast, offline, privacy-preserving license
 * compliance checks.
 *
 * This module has zero external dependencies beyond Node built-ins.
 */

import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Bloom Filter Core
// ---------------------------------------------------------------------------

/**
 * A production binary Bloom filter backed by a Node Buffer.
 *
 * Each bit in the buffer represents a potential hash slot. For a given hash value,
 * multiple bit positions are computed using offset seeding to reduce false positives.
 */
export class BloomFilterCompiler {
  private readonly buffer: Buffer;
  private readonly numBits: number;
  private readonly numHashes: number;
  private insertedCount: number;

  /**
   * Creates a new Bloom filter compiler with the specified buffer size.
   *
   * @param sizeBytes Size of the Bloom filter in bytes (default 1 MB = 1,048,576 bytes).
   * @param numHashes Number of independent hash functions to simulate (default 3).
   */
  public constructor(sizeBytes: number = 1048576, numHashes: number = 3) {
    this.buffer = Buffer.alloc(sizeBytes, 0);
    this.numBits = sizeBytes * 8;
    this.numHashes = numHashes;
    this.insertedCount = 0;
  }

  /**
   * Inserts a single 32-bit hash value into the Bloom filter.
   *
   * @param hash The unsigned 32-bit FNV-1a hash to insert.
   */
  public insert(hash: number): void {
    for (let i = 0; i < this.numHashes; i += 1) {
      const combinedHash = (hash + Math.imul(i, 0x5bd1e995)) >>> 0;
      const bitIndex = combinedHash % this.numBits;
      const byteIndex = Math.floor(bitIndex / 8);
      const bitOffset = bitIndex % 8;

      this.buffer[byteIndex] = this.buffer[byteIndex] | (1 << bitOffset);
    }

    this.insertedCount += 1;
  }

  /**
   * Tests whether a hash value is probably present in the Bloom filter.
   *
   * @param hash The unsigned 32-bit FNV-1a hash to test.
   * @returns True if all corresponding bits are set (probable match), false otherwise (definite non-match).
   */
  public test(hash: number): boolean {
    for (let i = 0; i < this.numHashes; i += 1) {
      const combinedHash = (hash + Math.imul(i, 0x5bd1e995)) >>> 0;
      const bitIndex = combinedHash % this.numBits;
      const byteIndex = Math.floor(bitIndex / 8);
      const bitOffset = bitIndex % 8;

      if ((this.buffer[byteIndex] & (1 << bitOffset)) === 0) {
        return false;
      }
    }

    return true;
  }

  /**
   * Returns the number of hashes inserted into the filter.
   */
  public get count(): number {
    return this.insertedCount;
  }

  /**
   * Returns the raw binary buffer backing the Bloom filter.
   */
  public getBuffer(): Buffer {
    return this.buffer;
  }

  /**
   * Calculates the current saturation of the Bloom filter (percentage of bits set to 1).
   */
  public getSaturation(): number {
    let bitsSet = 0;

    for (let i = 0; i < this.buffer.length; i += 1) {
      let byte = this.buffer[i];
      while (byte > 0) {
        bitsSet += byte & 1;
        byte >>= 1;
      }
    }

    return bitsSet / this.numBits;
  }

  /**
   * Writes the compiled Bloom filter to a binary file on disk.
   *
   * @param filePath Absolute or relative path for the output .bin file.
   */
  public writeToFile(filePath: string): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(filePath, this.buffer);
    console.log(`[compiler] Bloom filter written: ${filePath}`);
    console.log(`[compiler] Size: ${this.buffer.length} bytes (${this.numBits} bits)`);
    console.log(`[compiler] Hashes inserted: ${this.insertedCount}`);
    console.log(`[compiler] Saturation: ${(this.getSaturation() * 100).toFixed(2)}%`);
  }

  /**
   * Loads an existing Bloom filter from a binary file on disk.
   *
   * @param filePath Path to the .bin file.
   * @param numHashes Number of hash functions used when the filter was compiled.
   * @returns A BloomFilterCompiler instance loaded with the file data.
   */
  public static loadFromFile(filePath: string, numHashes: number = 3): BloomFilterCompiler {
    const data = fs.readFileSync(filePath);
    const compiler = new BloomFilterCompiler(data.length, numHashes);
    data.copy(compiler.buffer);

    return compiler;
  }

  /**
   * Accepts raw source code, tokenizes it into structural bigrams, and inserts
   * all resulting hashes into the Bloom filter.
   *
   * @param code The raw source code content.
   * @param language The programming language identifier (javascript, typescript, python, go, java).
   */
  public addSourceFile(code: string, language: string): void {
    const tokens = tokenizeStructure(code, language);

    if (tokens.length < 4) {
      return;
    }

    const trigrams = buildTrigrams(tokens);

    for (const trigram of trigrams) {
      const hash = fnv1a32(trigram);
      this.insert(hash);
    }
  }
}

// ---------------------------------------------------------------------------
// FNV-1a 32-bit Hashing
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Unified Multi-Language Structural Tokenizer
// ---------------------------------------------------------------------------

/**
 * Tokenizes source code into a language-agnostic structural token stream.
 *
 * This is a unified pseudo-parser that uses lexical analysis (not a full AST)
 * to extract control flow and structural patterns from any supported language.
 * Variable names, string literals, and comments are stripped and normalized
 * to prevent evasion through renaming.
 *
 * @param code The raw source code.
 * @param language The programming language identifier.
 * @returns An ordered array of normalized structural token strings.
 */
export function tokenizeStructure(code: string, language: string): string[] {
  const cleaned = stripCommentsAndStrings(code, language);
  const pieces = splitIntoLexemes(cleaned);
  const tokens: string[] = [];

  for (const piece of pieces) {
    const token = classifyToken(piece, language);
    if (token !== undefined) {
      tokens.push(token);
    }
  }

  return tokens;
}

/**
 * Strips comments, string literals, and template literals from source code.
 *
 * @param code The raw source code.
 * @param language The programming language.
 * @returns Cleaned source with comments and strings replaced by whitespace.
 */
function stripCommentsAndStrings(code: string, language: string): string {
  let cleaned = code;

  // Remove block comments (C-style for JS/TS/Go/Java, triple-quote for Python)
  cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, " ");

  if (language === "python") {
    cleaned = cleaned.replace(/'''[\s\S]*?'''/g, " ");
    cleaned = cleaned.replace(/"""[\s\S]*?"""/g, " ");
    // Python single-line comments
    cleaned = cleaned.replace(/#.*/g, " ");
  } else {
    // Single-line comments for JS/TS/Go/Java
    cleaned = cleaned.replace(/\/\/.*/g, " ");
  }

  // Remove string literals (single, double, backtick)
  cleaned = cleaned.replace(/`(?:[^`\\]|\\.)*`/g, " STR ");
  cleaned = cleaned.replace(/"(?:[^"\\]|\\.)*"/g, " STR ");
  cleaned = cleaned.replace(/'(?:[^'\\]|\\.)*'/g, " STR ");

  // Replace numeric literals with a generic token
  cleaned = cleaned.replace(/\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/g, " NUM ");

  return cleaned;
}

/**
 * Splits cleaned source code into lexeme fragments for token classification.
 *
 * @param code The cleaned source code.
 * @returns An array of non-empty string fragments.
 */
function splitIntoLexemes(code: string): string[] {
  return code
    .split(/(\s+|\b|[{}()\[\]+\-*/=<>!&|;,:?.@#~^%])/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Classifies a source code lexeme into a normalized structural token.
 *
 * The classifier maps language-specific keywords into unified, language-agnostic
 * structural categories. User-defined identifiers are all mapped to a single
 * generic IDENT token to prevent evasion through renaming.
 *
 * @param lexeme The source fragment to classify.
 * @param language The programming language for context-specific keyword mapping.
 * @returns A normalized structural token string, or undefined for ignored fragments.
 */
function classifyToken(lexeme: string, _language: string): string | undefined {
  if (lexeme.length === 0) {
    return undefined;
  }

  // Unified keyword mapping across all five languages
  switch (lexeme) {
    // Function definitions
    case "function":
    case "def":
    case "func":
      return "FN_DEF";

    // Class definitions
    case "class":
    case "struct":
    case "interface":
      return "CLASS_DEF";

    // Conditionals
    case "if":
      return "IF";
    case "else":
    case "elif":
      return "ELSE";
    case "switch":
    case "match":
      return "SWITCH";
    case "case":
      return "CASE";

    // Loops
    case "for":
      return "FOR";
    case "while":
      return "WHILE";
    case "do":
      return "DO";
    case "range":
      return "RANGE";
    case "in":
      return "IN";

    // Error handling
    case "try":
      return "TRY";
    case "catch":
    case "except":
      return "CATCH";
    case "finally":
      return "FINALLY";
    case "throw":
    case "raise":
      return "THROW";

    // Returns and yields
    case "return":
      return "RETURN";
    case "yield":
      return "YIELD";
    case "async":
      return "ASYNC";
    case "await":
      return "AWAIT";

    // Variable declarations
    case "const":
    case "let":
    case "var":
    case "val":
      return "VAR_DECL";

    // Imports
    case "import":
    case "require":
    case "from":
    case "include":
      return "IMPORT";
    case "export":
    case "package":
    case "module":
      return "EXPORT";

    // Type system
    case "new":
      return "NEW";
    case "this":
    case "self":
      return "SELF";
    case "extends":
    case "implements":
      return "INHERITS";
    case "abstract":
      return "ABSTRACT";
    case "static":
      return "STATIC";
    case "public":
    case "private":
    case "protected":
      return "ACCESS_MOD";

    // Boolean and null
    case "true":
    case "false":
    case "True":
    case "False":
      return "BOOL";
    case "null":
    case "nil":
    case "None":
    case "undefined":
      return "NULL";

    // Delimiters
    case "{":
      return "BLOCK_OPEN";
    case "}":
      return "BLOCK_CLOSE";
    case "(":
      return "PAREN_OPEN";
    case ")":
      return "PAREN_CLOSE";
    case "[":
      return "BRACKET_OPEN";
    case "]":
      return "BRACKET_CLOSE";

    // Operators
    case "=":
    case ":=":
      return "ASSIGN";
    case "==":
    case "===":
    case "!=":
    case "!==":
    case "<":
    case ">":
    case "<=":
    case ">=":
      return "COMPARE";
    case "+":
    case "-":
    case "*":
    case "/":
    case "%":
    case "**":
      return "MATH";
    case "&&":
    case "||":
    case "!":
    case "and":
    case "or":
    case "not":
      return "LOGIC";

    // Miscellaneous
    case ";":
      return "SEMI";
    case ",":
      return "COMMA";
    case ".":
      return "DOT";
    case "=>":
    case "->":
      return "ARROW";
    case ":":
      return "COLON";

    // String/number placeholders we inserted earlier
    case "STR":
      return "LIT_STR";
    case "NUM":
      return "LIT_NUM";

    // Language-specific keywords that should be captured
    case "defer":
    case "go":
    case "chan":
    case "select":
      return "GO_KEYWORD";
    case "lambda":
      return "LAMBDA";
    case "with":
      return "WITH";
    case "as":
      return "AS";
    case "is":
      return "IS";
    case "instanceof":
    case "typeof":
      return "TYPE_CHECK";
    case "break":
      return "BREAK";
    case "continue":
      return "CONTINUE";
    case "default":
      return "DEFAULT";

    default:
      // Map all user-defined identifiers to a single generic token
      if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(lexeme)) {
        return "IDENT";
      }
      return undefined;
  }
}

// ---------------------------------------------------------------------------
// Trigram Generation
// ---------------------------------------------------------------------------

/**
 * Builds adjacent structural trigrams from an ordered token stream.
 *
 * @param tokens Ordered structural tokens.
 * @returns Adjacent token triplet strings in the format "A_B_C".
 */
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

function buildTrigrams(tokens: readonly string[]): string[] {
  const trigrams: string[] = [];

  for (let i = 0; i < tokens.length - 2; i += 1) {
    const t1 = tokens[i];
    const t2 = tokens[i + 1];
    const t3 = tokens[i + 2];
    if (!(BOILERPLATE_TOKENS.has(t1) && BOILERPLATE_TOKENS.has(t2) && BOILERPLATE_TOKENS.has(t3))) {
      trigrams.push(`${t1}_${t2}_${t3}`);
    }
  }

  return trigrams;
}

// ---------------------------------------------------------------------------
// CLI: Standalone Compilation from Local Files
// ---------------------------------------------------------------------------

/**
 * Compiles all source files from a local directory into a Bloom filter.
 *
 * @param sourceDir Path to the directory containing source files to fingerprint.
 * @param outputPath Path for the output .bin file.
 * @param sizeBytes Bloom filter size in bytes.
 * @param numHashes Number of hash functions.
 */
export function compileFromDirectory(
  sourceDir: string,
  outputPath: string,
  sizeBytes: number = 1048576,
  numHashes: number = 3
): BloomFilterCompiler {
  const compiler = new BloomFilterCompiler(sizeBytes, numHashes);
  const files = collectSourceFiles(sourceDir);

  console.log(`[compiler] Compiling ${files.length} source files from ${sourceDir}`);

  for (const filePath of files) {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const ext = path.extname(filePath).toLowerCase();
      let language = "javascript";

      switch (ext) {
        case ".py":
          language = "python";
          break;
        case ".go":
          language = "go";
          break;
        case ".java":
          language = "java";
          break;
        case ".ts":
        case ".tsx":
          language = "typescript";
          break;
        default:
          language = "javascript";
          break;
      }

      compiler.addSourceFile(content, language);
      console.log(`[compiler] Processed: ${filePath} (${language})`);
    } catch (error) {
      console.error(`[compiler] Error processing ${filePath}: ${String(error)}`);
    }
  }

  compiler.writeToFile(outputPath);
  return compiler;
}

/**
 * Recursively collects all supported source files from a directory.
 *
 * @param dir The directory to scan.
 * @returns An array of absolute file paths.
 */
function collectSourceFiles(dir: string): string[] {
  const results: string[] = [];

  if (!fs.existsSync(dir)) {
    return results;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      const dirName = entry.name.toLowerCase();
      if (!["node_modules", ".git", "dist", "build", "__pycache__", "vendor"].includes(dirName)) {
        results.push(...collectSourceFiles(fullPath));
      }
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if ([".js", ".jsx", ".ts", ".tsx", ".py", ".go", ".java"].includes(ext)) {
        results.push(fullPath);
      }
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// CLI Entry Point
// ---------------------------------------------------------------------------

if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.log("Usage: npx ts-node scripts/compiler.ts <source-directory> [output-path]");
    console.log("  source-directory: Path containing GPL/copyleft source files to fingerprint");
    console.log("  output-path:     Where to write filter.bin (default: resources/filter.bin)");
    process.exit(1);
  }

  const sourceDir = path.resolve(args[0]);
  const outputPath = args[1]
    ? path.resolve(args[1])
    : path.resolve(__dirname, "..", "resources", "filter.bin");

  compileFromDirectory(sourceDir, outputPath);
}
