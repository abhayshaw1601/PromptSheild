/**
 * ============================================================
 *  CleanScribe — Core Scanning Module (Simulated NPM Package)
 *  File: cleanScribeCore.js
 *
 *  In production this module would be:
 *    const cleanScribe = require('cleanscribe-core');
 *
 *  This stub precisely mirrors the real OmniShield/licenseMatcher
 *  API surface so the VS Code extension layer is 100% decoupled
 *  from internal implementation details.
 *
 *  Exported API contract:
 *    scanDocument(code, language, options?)              → ScanResult  (sync)
 *    generateRefactorPrompt(violations, lang, code)     → string       (sync fallback)
 *    generateRefactorPromptWithAI(violations, lang, code, options?) → Promise<string> (AI-powered)
 *    SEVERITY                                           → enum object
 * ============================================================
 */

'use strict';

// Node built-in HTTP — same zero-dependency approach as ai-scanner.js
const http = require('node:http');
const acorn = require('acorn');

// ─────────────────────────────────────────────────────────────
//  SEVERITY ENUM
//  Mirrors the risk-score bands used in riskService.js:
//    CRITICAL  → copyleft + injection combined (score > 70)
//    HIGH      → copyleft only (score 50-70)
//    MEDIUM    → PII / API key leak (score 25-50)
//    INFO      → textual license header detected only
// ─────────────────────────────────────────────────────────────

const SEVERITY = Object.freeze({
  CRITICAL: 'CRITICAL',
  HIGH:     'HIGH',
  MEDIUM:   'MEDIUM',
  INFO:     'INFO',
  CLEAN:    'CLEAN',
});

// ─────────────────────────────────────────────────────────────
//  TEXTUAL LICENSE HEADER PATTERNS
//  Mirrors checkTextualLicensing() in licenseMatcher.js exactly.
// ─────────────────────────────────────────────────────────────

const TEXTUAL_LICENSE_PATTERNS = [
  { pattern: /GNU\s+General\s+Public\s+License/i,               license: 'GPL',               severity: SEVERITY.HIGH },
  { pattern: /GNU\s+Affero\s+General\s+Public\s+License/i,      license: 'AGPL-3.0',          severity: SEVERITY.CRITICAL },
  { pattern: /GNU\s+Lesser\s+General\s+Public\s+License/i,      license: 'LGPL',              severity: SEVERITY.HIGH },
  { pattern: /SPDX-License-Identifier:\s*(GPL|AGPL|LGPL)/i,     license: 'GPL/AGPL/LGPL (SPDX)', severity: SEVERITY.CRITICAL },
  { pattern: /This\s+program\s+is\s+free\s+software.*redistribute/i, license: 'GPL (Boilerplate)', severity: SEVERITY.CRITICAL },
  { pattern: /Licensed\s+under\s+the\s+GPL/i,                   license: 'GPL',               severity: SEVERITY.HIGH },
];

// ─────────────────────────────────────────────────────────────
//  PII / SECRET PATTERNS
//  Mirrors the MASTER_REGEX categories in omnishield-core-sdk.
// ─────────────────────────────────────────────────────────────

const PII_PATTERNS = [
  { pattern: /sk-(?:proj-)?[A-Za-z0-9]{20,60}/g,          label: 'OpenAI API Key',    severity: SEVERITY.CRITICAL },
  { pattern: /AIzaSy[A-Za-z0-9_-]{33}/g,                   label: 'Google API Key',    severity: SEVERITY.CRITICAL },
  { pattern: /sk-ant-api\d{2}-[A-Za-z0-9]{40,60}/g,        label: 'Anthropic API Key', severity: SEVERITY.CRITICAL },
  { pattern: /gsk_[A-Za-z0-9_]{30,}/g,                     label: 'Groq API Key',      severity: SEVERITY.CRITICAL },
  { pattern: /AKIA[0-9A-Z]{16}/g,                           label: 'AWS Access Key',    severity: SEVERITY.CRITICAL },
  { pattern: /hf_[A-Za-z0-9]{20,}/g,                       label: 'HuggingFace Token', severity: SEVERITY.HIGH },
  { pattern: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, label: 'Email Address', severity: SEVERITY.MEDIUM },
  { pattern: /\b\d{3}-\d{2}-\d{4}\b/g,                     label: 'SSN',               severity: SEVERITY.CRITICAL },
];

// ─────────────────────────────────────────────────────────────
//  PROMPT INJECTION PATTERNS
//  Mirrors promptInjectionService.js detection list.
// ─────────────────────────────────────────────────────────────

const INJECTION_PATTERNS = [
  /ignore\s+(?:previous|all)\s+instructions/i,
  /bypass\s+(?:security|filter|restriction)/i,
  /reveal\s+(?:system|your)\s+prompt/i,
  /you\s+are\s+(?:now\s+)?(?:DAN|jailbroken)/i,
  /developer\s+mode\s+enabled/i,
  /you\s+are\s+no\s+longer\s+bound/i,
  /pretend\s+you\s+have\s+no\s+restrictions/i,
  /act\s+as\s+an?\s+unfiltered/i,
];

// ─────────────────────────────────────────────────────────────
//  INTERNAL HELPERS
// ─────────────────────────────────────────────────────────────

/**
 * Finds all line numbers (0-indexed) where `pattern` matches within `code`.
 * Returns an array of { lineIndex, matchText, charStart, charEnd }.
 *
 * @param {string}   code
 * @param {RegExp}   pattern   Must be a /g flagged regex
 * @returns {Array<{lineIndex:number, matchText:string, charStart:number, charEnd:number}>}
 */
function findMatchLocations(code, pattern) {
  const lines  = code.split('\n');
  const hits   = [];
  // Build cumulative line offsets once (O(n) pre-pass)
  const offsets = [];
  let cursor = 0;
  for (const line of lines) {
    offsets.push(cursor);
    cursor += line.length + 1; // +1 for \n
  }

  // CRITICAL: Always force the 'g' flag. A non-global regex inside
  // while (regex.exec(code)) never advances lastIndex → infinite loop → OOM.
  // We also reset lastIndex explicitly as a belt-and-suspenders guard.
  const flags = pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g';
  const regex = new RegExp(pattern.source, flags);
  regex.lastIndex = 0;
  let m;
  while ((m = regex.exec(code)) !== null) {
    const charStart = m.index;
    const charEnd   = m.index + m[0].length;
    // Binary-search for the correct line
    let lo = 0, hi = offsets.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (offsets[mid] <= charStart) lo = mid;
      else hi = mid - 1;
    }
    hits.push({ lineIndex: lo, matchText: m[0], charStart, charEnd });
  }
  return hits;
}

/**
 * Determines the worst severity across a list of violation objects.
 *
 * @param {Array<{severity:string}>} violations
 * @returns {string}
 */
function worstSeverity(violations) {
  const rank = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, INFO: 1, CLEAN: 0 };
  let best = SEVERITY.CLEAN;
  for (const v of violations) {
    if ((rank[v.severity] ?? 0) > (rank[best] ?? 0)) best = v.severity;
  }
  return best;
}

// ─────────────────────────────────────────────────────────────
//  AST STRUCTURAL LICENSE MATCHING ENGINE
//  Direct port from the backend signature matcher system.
// ─────────────────────────────────────────────────────────────

const COPYLEFT_SIGNATURES = [
  {
    name: 'GPLv3 Boilerplate Block',
    license: 'GPL-3.0',
    bigramSignature: [
      'KEYWORD_IMPORT__IDENTIFIER',
      'IDENTIFIER__KEYWORD_DEF',
      'KEYWORD_DEF__PAREN_START',
      'PAREN_START__PAREN_END',
      'PAREN_END__BLOCK_START',
      'BLOCK_START__KEYWORD_TRY',
      'KEYWORD_TRY__BLOCK_START',
      'BLOCK_START__KEYWORD_RETURN',
      'KEYWORD_RETURN__IDENTIFIER',
      'IDENTIFIER__BLOCK_END',
      'BLOCK_END__KEYWORD_CATCH',
      'KEYWORD_CATCH__PAREN_START',
      'PAREN_START__IDENTIFIER',
      'IDENTIFIER__PAREN_END',
      'PAREN_END__BLOCK_START',
      'BLOCK_START__KEYWORD_THROW',
      'KEYWORD_THROW__IDENTIFIER',
      'IDENTIFIER__BLOCK_END',
      'BLOCK_END__BLOCK_END'
    ]
  },
  {
    name: 'GPL Linux Scheduler Sequence',
    license: 'GPL-2.0',
    bigramSignature: [
      'KEYWORD_DEF__IDENTIFIER',
      'IDENTIFIER__PAREN_START',
      'PAREN_START__PAREN_END',
      'PAREN_END__BLOCK_START',
      'BLOCK_START__KEYWORD_VAR',
      'KEYWORD_VAR__IDENTIFIER',
      'IDENTIFIER__OPERATOR_ASSIGN',
      'OPERATOR_ASSIGN__IDENTIFIER',
      'IDENTIFIER__KEYWORD_WHILE',
      'KEYWORD_WHILE__PAREN_START',
      'PAREN_START__IDENTIFIER',
      'IDENTIFIER__OPERATOR_COMPARE',
      'OPERATOR_COMPARE__IDENTIFIER',
      'IDENTIFIER__PAREN_END',
      'PAREN_END__BLOCK_START',
      'BLOCK_START__KEYWORD_IF',
      'KEYWORD_IF__PAREN_START',
      'PAREN_START__IDENTIFIER',
      'IDENTIFIER__OPERATOR_LOGIC',
      'OPERATOR_LOGIC__IDENTIFIER',
      'IDENTIFIER__PAREN_END',
      'PAREN_END__BLOCK_START',
      'BLOCK_START__KEYWORD_RETURN',
      'KEYWORD_RETURN__IDENTIFIER',
      'IDENTIFIER__BLOCK_END',
      'BLOCK_END__BLOCK_END'
    ]
  }
];

function tokenizeGeneric(code) {
  if (!code || typeof code !== 'string') return [];
  let clean = code;
  clean = clean.replace(/\/\*[\s\S]*?\*\//g, '');
  clean = clean.replace(/'''[\s\S]*?'''/g, '');
  clean = clean.replace(/"""[\s\S]*?"""/g, '');
  clean = clean.replace(/\/\/.*/g, '');
  clean = clean.replace(/#.*/g, '');
  clean = clean.replace(/(["'])(?:(?=(\\?))\2.)*?\1/g, 'TOKEN_STRING');
  clean = clean.replace(/&&/g, ' OPERATOR_LOGIC ');
  clean = clean.replace(/\|\|/g, ' OPERATOR_LOGIC ');
  clean = clean.replace(/\b\d+\b/g, ' IDENTIFIER ');

  const keywordMap = {
    'if': 'KEYWORD_IF', 'else': 'KEYWORD_ELSE', 'elif': 'KEYWORD_ELSE',
    'for': 'KEYWORD_FOR', 'while': 'KEYWORD_WHILE', 'return': 'KEYWORD_RETURN',
    'def': 'KEYWORD_DEF', 'func': 'KEYWORD_DEF', 'function': 'KEYWORD_DEF',
    'class': 'KEYWORD_CLASS', 'import': 'KEYWORD_IMPORT', 'include': 'KEYWORD_IMPORT',
    'require': 'KEYWORD_IMPORT', 'try': 'KEYWORD_TRY', 'catch': 'KEYWORD_CATCH',
    'except': 'KEYWORD_CATCH', 'throw': 'KEYWORD_THROW', 'const': 'KEYWORD_VAR',
    'let': 'KEYWORD_VAR', 'var': 'KEYWORD_VAR'
  };

  const words = clean.split(/(\s+|\b|[{}()\[\]+\-*/=<>!&|;,])/g);
  const tokens = [];

  words.forEach(word => {
    const trimmed = word.trim();
    if (!trimmed) return;
    if (keywordMap[trimmed]) {
      tokens.push(keywordMap[trimmed]);
      return;
    }
    switch (trimmed) {
      case '{': tokens.push('BLOCK_START'); break;
      case '}': tokens.push('BLOCK_END'); break;
      case '(': tokens.push('PAREN_START'); break;
      case ')': tokens.push('PAREN_END'); break;
      case '[': tokens.push('BRACKET_START'); break;
      case ']': tokens.push('BRACKET_END'); break;
      case '+': case '-': case '*': case '/': tokens.push('OPERATOR_MATH'); break;
      case '=': case '==': case '===': tokens.push('OPERATOR_ASSIGN'); break;
      case '<': case '>': case '<=': case '>=': case '!=': tokens.push('OPERATOR_COMPARE'); break;
      case '&&': case '||': case '!': case 'OPERATOR_LOGIC': tokens.push('OPERATOR_LOGIC'); break;
      case ';': tokens.push('SEMICOLON'); break;
      default:
        if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmed)) {
          if (trimmed !== 'TOKEN_STRING') tokens.push('IDENTIFIER');
          else tokens.push('STRING');
        }
    }
  });
  return tokens;
}

function getBigrams(tokens) {
  const bigrams = new Set();
  if (!tokens || tokens.length < 2) return bigrams;
  for (let i = 0; i < tokens.length - 1; i++) {
    bigrams.add(`${tokens[i]}__${tokens[i + 1]}`);
  }
  return bigrams;
}

function calculateJaccardSimilarity(setA, setB) {
  if (setA.size === 0 && setB.size === 0) return 1.0;
  if (setA.size === 0 || setB.size === 0) return 0.0;
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return intersection.size / union.size;
}

function segmentFunctions(code) {
  const functions = [];
  try {
    const ast = acorn.parse(code, {
      ecmaVersion: 'latest',
      sourceType: 'module'
    });
    
    function traverse(node) {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'FunctionDeclaration') {
        const start = node.start;
        const end = node.end;
        const name = node.id ? node.id.name : 'anonymous';
        const fnCode = code.substring(start, end);
        const startLine = code.substring(0, start).split('\n').length - 1;
        functions.push({ name, code: fnCode, lineIndex: startLine });
      }
      for (const key in node) {
        if (Object.prototype.hasOwnProperty.call(node, key)) {
          const val = node[key];
          if (Array.isArray(val)) {
            val.forEach(child => traverse(child));
          } else if (val && typeof val === 'object') {
            traverse(val);
          }
        }
      }
    }
    traverse(ast);
  } catch (err) {
    // Graceful fallback for files with syntax errors or non-JS
  }
  return functions;
}

// ─────────────────────────────────────────────────────────────
//  PUBLIC API
// ─────────────────────────────────────────────────────────────

/**
 * scanDocument(code, language, options?)
 * ──────────────────────────────────────
 * Master entry point called by the VS Code extension on every save event.
 * Runs three sequential detection passes:
 *   Pass 1 — Textual license headers  (regex on comments)
 *   Pass 2 — API key / PII secrets    (MASTER_REGEX-equivalent single-pass)
 *   Pass 3 — Prompt injection strings (keyword heuristics)
 *
 * Returns a unified ScanResult that the extension UI layer consumes directly.
 *
 * @param {string} code      - Full source text of the saved document
 * @param {string} language  - VS Code languageId (e.g. 'javascript', 'python')
 * @param {object} [options]
 * @param {number} [options.licenseThreshold=0.75] - Jaccard similarity floor
 * @returns {ScanResult}
 *
 * @typedef {Object} ScanResult
 * @property {boolean}     clean          - True if no violations found
 * @property {string}      severity       - Worst severity across all violations
 * @property {Violation[]} violations     - Ordered list of detected issues
 * @property {string}      refactorPrompt - Ready-to-paste LLM correction prompt
 * @property {number}      scanDurationMs - Wall-clock scan time
 *
 * @typedef {Object} Violation
 * @property {string}  type       - 'LICENSE' | 'SECRET' | 'INJECTION'
 * @property {string}  severity   - SEVERITY value
 * @property {string}  label      - Human-readable violation name
 * @property {string}  license    - License identifier (LICENSE type only)
 * @property {string}  method     - 'textual_header' | 'pattern_match'
 * @property {number}  lineIndex  - 0-indexed line number of first match
 * @property {number[]} lines     - All 0-indexed line numbers affected
 * @property {string}  matchText  - The exact matched string
 * @property {string}  message    - Full diagnostic message for Problems panel
 */
function scanDocument(code, language = 'javascript', options = {}) {
  const t0         = Date.now();
  const violations = [];
  const lines      = code.split('\n');

  // ── Pass 1: Textual License Header Detection ───────────────
  // Force 'g' flag — without it exec() loops forever on the same index.
  for (const { pattern, license, severity } of TEXTUAL_LICENSE_PATTERNS) {
    const flags  = pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g';
    const cloned = new RegExp(pattern.source, flags);
    cloned.lastIndex = 0;
    let m;
    while ((m = cloned.exec(code)) !== null) {
      // Find line index for this character offset
      let charCount = 0, lineIndex = 0;
      for (let i = 0; i < lines.length; i++) {
        charCount += lines[i].length + 1;
        if (charCount > m.index) { lineIndex = i; break; }
      }
      violations.push({
        type:      'LICENSE',
        severity,
        label:     `Copyleft License Detected (${license})`,
        license,
        method:    'textual_header',
        lineIndex,
        lines:     [lineIndex],
        matchText: m[0],
        message:   `[CleanScribe] 🚨 Copyleft header "${license}" detected. Distributing this code may trigger viral licensing obligations.`,
      });
    }
  }

  // ── Pass 2: PII / Secret Key Detection ────────────────────
  for (const { pattern, label, severity } of PII_PATTERNS) {
    const hits = findMatchLocations(code, pattern);
    for (const hit of hits) {
      violations.push({
        type:      'SECRET',
        severity,
        label,
        license:   null,
        method:    'pattern_match',
        lineIndex: hit.lineIndex,
        lines:     [hit.lineIndex],
        matchText: hit.matchText,
        message:   `[CleanScribe] 🔑 ${label} detected on line ${hit.lineIndex + 1}. Remove credentials from source files — use environment variables instead.`,
      });
    }
  }

  // ── Pass 3: Prompt Injection Detection ────────────────────
  for (const pattern of INJECTION_PATTERNS) {
    const hits = findMatchLocations(code, new RegExp(pattern.source, 'gi'));
    for (const hit of hits) {
      violations.push({
        type:      'INJECTION',
        severity:  SEVERITY.HIGH,
        label:     'Prompt Injection Attempt',
        license:   null,
        method:    'pattern_match',
        lineIndex: hit.lineIndex,
        lines:     [hit.lineIndex],
        matchText: hit.matchText,
        message:   `[CleanScribe] ⚠️ Prompt injection pattern "${hit.matchText}" found on line ${hit.lineIndex + 1}.`,
      });
    }
  }

  // ── Pass 4: AST Structural Copyleft Matcher ────────────────
  const isJS = ['javascript', 'typescript', 'javascriptreact', 'typescriptreact'].includes(language);
  let blocksToScan = [];
  
  if (isJS) {
    const segmented = segmentFunctions(code);
    if (segmented.length > 0) {
      blocksToScan = segmented;
    }
  }
  
  // Fall back to scanning the entire file as a single block if no functions are found (or non-JS)
  if (blocksToScan.length === 0) {
    blocksToScan.push({ name: 'full_file', code: code, lineIndex: 0 });
  }

  const threshold = options.licenseThreshold ?? 0.75;
  for (const block of blocksToScan) {
    const tokens = tokenizeGeneric(block.code);
    if (tokens.length >= 5) {
      const inputBigrams = getBigrams(tokens);
      let bestMatch = null;
      let maxSimilarity = 0.0;
      
      for (const signature of COPYLEFT_SIGNATURES) {
        const signatureBigrams = new Set(signature.bigramSignature);
        const score = calculateJaccardSimilarity(inputBigrams, signatureBigrams);
        if (score > maxSimilarity) {
          maxSimilarity = score;
          bestMatch = {
            license: signature.license,
            name: signature.name,
            similarity: parseFloat(score.toFixed(3))
          };
        }
      }
      
      if (bestMatch && maxSimilarity >= threshold) {
        violations.push({
          type:      'LICENSE',
          severity:  bestMatch.license === 'AGPL-3.0' || bestMatch.license === 'GPL-3.0' ? SEVERITY.CRITICAL : SEVERITY.HIGH,
          label:     `Copyleft AST Structural Match (${bestMatch.license})`,
          license:   bestMatch.license,
          method:    'ast_structure',
          lineIndex: block.lineIndex,
          lines:     [block.lineIndex],
          matchText: block.name === 'full_file' ? 'GPL logic' : `function ${block.name}()`,
          message:   `[CleanScribe] 🚨 AST Structural match against "${bestMatch.name}" detected in function "${block.name}" (${(maxSimilarity * 100).toFixed(1)}% >= ${(threshold * 100).toFixed(0)}%). Distributing this code may trigger viral licensing obligations.`,
        });
      }
    }
  }

  // ── Aggregate Result ───────────────────────────────────────
  const severity      = worstSeverity(violations);
  const refactorPrompt = violations.length ? generateRefactorPrompt(violations, language, code) : '';

  return {
    clean:         violations.length === 0,
    severity,
    violations,
    refactorPrompt,
    scanDurationMs: Date.now() - t0,
  };
}

// ─────────────────────────────────────────────────────────────
//  HELPER — ENV VAR NAME INFERENCE
//  Derives a sensible process.env.VARIABLE_NAME from a violation
//  label + the matched secret text so the generated prompt shows
//  a concrete BEFORE → AFTER diff on the exact line.
// ─────────────────────────────────────────────────────────────

/**
 * _inferEnvVarName(label, matchText)
 * ────────────────────────────────────
 * Maps a violation label (e.g. 'OpenAI API Key') to a conventional
 * env-var name (e.g. 'OPENAI_API_KEY'). Falls back to a generic name
 * derived from the label if no specific match is found.
 *
 * @param {string} label
 * @param {string} matchText
 * @returns {string} UPPER_SNAKE_CASE env var name
 */
function _inferEnvVarName(label, matchText) {
  const MAP = {
    'OpenAI API Key':    'OPENAI_API_KEY',
    'Google API Key':    'GOOGLE_API_KEY',
    'Anthropic API Key': 'ANTHROPIC_API_KEY',
    'Groq API Key':      'GROQ_API_KEY',
    'AWS Access Key':    'AWS_ACCESS_KEY_ID',
    'HuggingFace Token': 'HUGGINGFACE_TOKEN',
    'Email Address':     'CONTACT_EMAIL',
    'SSN':               'USER_SSN',
  };
  if (MAP[label]) return MAP[label];
  // Generic fallback: "My Cool Token" → MY_COOL_TOKEN
  return label.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
}

/**
 * generateRefactorPrompt(violations, language, code)
 * ───────────────────────────────────────────────────
 * Builds a structured, copy-paste-ready LLM prompt optimised for
 * GitHub Copilot Chat, ChatGPT, Claude, and Gemini.
 *
 * KEY DESIGN CHANGE vs the previous version:
 *   Old: vague "please fix X" → Copilot asks clarifying questions, loops.
 *   New: action-first BEFORE/AFTER diff per violation line + hard constraint
 *        "do not ask questions" → Copilot produces the fix on the first try.
 *
 * Structure:
 *   ## Task          — one-sentence imperative with violation count
 *   ## Hard Constraints — bullet list that prevents Copilot from stalling
 *   ## Violations    — one ACTION block per violation with BEFORE/AFTER
 *   ## .env.example  — auto-generated stub (only if secrets found)
 *   ## Full file     — the complete source for Copilot to correct
 *   ## Output format — explicit instruction to return a single code block
 *
 * @param {Violation[]} violations
 * @param {string}      language
 * @param {string}      [rawCode]
 * @returns {string}
 */
function generateRefactorPrompt(violations, language = 'javascript', rawCode = '') {
  const licenseViolations   = violations.filter(v => v.type === 'LICENSE');
  const secretViolations    = violations.filter(v => v.type === 'SECRET');
  const injectionViolations = violations.filter(v => v.type === 'INJECTION');
  const codeLines           = rawCode ? rawCode.split('\n') : [];

  // ── Section 1: Concrete per-violation ACTION blocks ───────────
  // Each ACTION block shows the exact line BEFORE and AFTER the fix
  // so the LLM can apply it without ambiguity. No vague instructions.
  const actionItems = [];

  for (const v of secretViolations) {
    const originalLine = (codeLines[v.lineIndex] ?? v.matchText).trim();
    const envVarName   = _inferEnvVarName(v.label, v.matchText);
    const fixedLine    = originalLine.replace(v.matchText, `process.env.${envVarName}`);
    actionItems.push(
      `ACTION [SECRET — Line ${v.lineIndex + 1}]: ${v.label}\n` +
      `  BEFORE: ${originalLine}\n` +
      `  AFTER:  ${fixedLine}  // FIXED: moved to env var\n` +
      `  WHY:    Hard-coded credentials are exposed in git history and logs.\n` +
      `          Add "${envVarName}=" to .env.example (empty value, safe to commit).`
    );
  }

  for (const v of licenseViolations) {
    const originalLine = (codeLines[v.lineIndex] ?? v.matchText).trim();
    actionItems.push(
      `ACTION [LICENSE — Line ${v.lineIndex + 1}]: ${v.license} copyleft marker\n` +
      `  FOUND:  ${originalLine}\n` +
      `  FIX:    DELETE this line and its entire surrounding comment block.\n` +
      `  AFTER:  Replace the file header comment with exactly:\n` +
      `          // SPDX-License-Identifier: MIT\n` +
      `          // Copyright (C) ${new Date().getFullYear()} <YourName>  // FIXED: switched to MIT`
    );
  }

  for (const v of injectionViolations) {
    const originalLine = (codeLines[v.lineIndex] ?? v.matchText).trim();
    actionItems.push(
      `ACTION [INJECTION — Line ${v.lineIndex + 1}]: Prompt injection phrase\n` +
      `  FOUND:  ${originalLine}\n` +
      `  FIX:    Remove this string and add an input validation guard before any\n` +
      `          LLM call:\n` +
      `          if (/ignore.*instructions|bypass.*security/i.test(userInput)) {\n` +
      `            throw new Error('Rejected: unsafe input');  // FIXED: injection guard\n` +
      `          }`
    );
  }

  // ── Section 2: .env.example block ─────────────────────────────
  let envBlock = '';
  if (secretViolations.length) {
    const envLines = [...new Set(
      secretViolations.map(v => `${_inferEnvVarName(v.label, v.matchText)}=`)
    )];
    envBlock =
      `\n## .env.example (commit this — never commit .env with real values)\n` +
      '```\n' + envLines.join('\n') + '\n```\n';
  }

  // ── Section 3: Full source block for Copilot to correct ───────
  const fullCode = rawCode
    ? `\n## Full file to correct (${language})\n` +
      '```' + language + '\n' +
      rawCode.slice(0, 2500) +
      (rawCode.length > 2500 ? '\n// ... (truncated — apply same fixes throughout)' : '') +
      '\n```\n'
    : '';

  // ── Assemble ───────────────────────────────────────────────────
  return `## Task
Fix ${violations.length} compliance violation(s) in this ${language} file detected by CleanScribe.
Do NOT ask clarifying questions. Apply every fix listed below and return the corrected complete file now.

## Hard Constraints
- Return ONLY a single \`\`\`${language} code block containing the full corrected file.
- Every line you change must end with a comment: // FIXED: <one-line reason>
- Do NOT use any GPL / AGPL / LGPL licensed library or code snippet.
- Do NOT keep any license header that is not MIT or Apache-2.0.
- Preserve all function names, exports, and public API signatures exactly as-is.
- Do NOT truncate or omit any part of the original file.

## Violations & Exact Fixes Required
${actionItems.join('\n\n')}
${envBlock}${fullCode}
## Output Format
Return the complete corrected ${language} file in one \`\`\`${language} block. Nothing else.`;
}

// ─────────────────────────────────────────────────────────────
//  AI-POWERED PROMPT GENERATION  (Qwen via Ollama)
//
//  Instead of returning a hardcoded string-template prompt,
//  this function sends the violation summary + violating code
//  to the same local Qwen model that runs the second-engine
//  scanner, and asks it to write a smarter, context-aware
//  remediation prompt tailored to the specific code at hand.
//
//  Graceful degradation:
//    Ollama online  → Qwen-generated prompt (context-aware)
//    Ollama offline → falls back to generateRefactorPrompt() (sync)
//    Qwen timeout   → falls back to generateRefactorPrompt() (sync)
//    Empty response → falls back to generateRefactorPrompt() (sync)
// ─────────────────────────────────────────────────────────────

// ── Private: Ollama availability check (mirrors ai-scanner.js) ──
/**
 * _ollamaIsAvailable(host, port)
 * ────────────────────────────────
 * Pings Ollama's /api/tags endpoint with a 2-second TCP timeout.
 * Returns true only if the HTTP status is exactly 200.
 *
 * @param {string} host
 * @param {number} port
 * @returns {Promise<boolean>}
 */
function _ollamaIsAvailable(host = 'localhost', port = 11434) {
  return new Promise((resolve) => {
    const req = http.request(
      { host, port, path: '/api/tags', method: 'GET' },
      (res) => resolve(res.statusCode === 200)
    );
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => { req.destroy(); resolve(false); });
    req.end();
  });
}

// ── Private: raw Ollama /api/generate call (mirrors ai-scanner.js) ──
/**
 * _ollamaGenerate(prompt, options)
 * ──────────────────────────────────
 * HTTP POST to Ollama's /api/generate endpoint with stream=false.
 * num_predict=1024 gives Qwen enough budget to write a complete
 * multi-section refactor prompt without being cut off.
 *
 * @param {string} prompt
 * @param {object} options
 * @param {string} [options.model='qwen2.5:1.5b']
 * @param {string} [options.host='localhost']
 * @param {number} [options.port=11434]
 * @param {number} [options.timeout=20000]
 * @param {number} [options.temperature=0.3]  — slightly higher than scanner
 *   (0.1) so Qwen writes natural prose rather than terse JSON)
 * @returns {Promise<string>} raw response text from the model
 */
function _ollamaGenerate(prompt, options = {}) {
  const model       = options.model       ?? 'qwen2.5:1.5b';
  const host        = options.host        ?? 'localhost';
  const port        = options.port        ?? 11434;
  const timeout     = options.timeout     ?? 20000;
  const temperature = options.temperature ?? 0.3;

  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model,
      prompt,
      stream: false,
      options: {
        temperature,
        num_predict: 1024,   // enough for a full remediation prompt
        stop: ['---END---'], // sentinel so Qwen knows when to stop
      },
    });

    const req = http.request(
      {
        host,
        port,
        path:    '/api/generate',
        method:  'POST',
        headers: {
          'Content-Type':   'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data).response ?? '');
          } catch {
            reject(new Error('[CleanScribe] Failed to parse Ollama response'));
          }
        });
      }
    );

    req.on('error', reject);
    req.setTimeout(timeout, () => {
      req.destroy();
      reject(new Error(`[CleanScribe] Ollama timed out after ${timeout}ms`));
    });

    req.write(body);
    req.end();
  });
}

/**
 * generateRefactorPromptWithAI(violations, language, rawCode, options?)
 * ───────────────────────────────────────────────────────────────────────
 * AI-powered prompt generation using the local Qwen model.
 *
 * HOW IT WORKS:
 *   1. Builds a structured "meta-prompt" that describes the violations
 *      and the violating code to Qwen.
 *   2. Asks Qwen to write the best possible remediation prompt a
 *      developer could paste into ChatGPT / Claude / Copilot Chat.
 *   3. Qwen understands the code context and generates tailored advice —
 *      not just template strings.
 *   4. Falls back to generateRefactorPrompt() if Ollama is offline.
 *
 * WHY THIS IS BETTER THAN HARDCODED:
 *   Hardcoded: always says "delete the GPL header" regardless of context.
 *   Qwen:      reads the actual code, understands what the function does,
 *              and writes instructions specific to that codebase.
 *
 * @param {Violation[]} violations
 * @param {string}      language
 * @param {string}      [rawCode='']        — full source of the file
 * @param {object}      [options={}]
 * @param {string}      [options.model]     — override Ollama model
 * @param {string}      [options.host]      — override Ollama host
 * @param {number}      [options.port]      — override Ollama port
 * @param {number}      [options.timeout]   — override request timeout (ms)
 * @returns {Promise<{ prompt: string, source: 'ai'|'fallback', model: string }>}
 */
async function generateRefactorPromptWithAI(violations, language = 'javascript', rawCode = '', options = {}) {
  // ── Step 0: Check Ollama is reachable ──────────────────────
  const host = options.host ?? 'localhost';
  const port = options.port ?? 11434;
  const model = options.model ?? 'qwen2.5:1.5b';

  const available = await _ollamaIsAvailable(host, port);
  if (!available) {
    return {
      prompt: generateRefactorPrompt(violations, language, rawCode),
      source: 'fallback',
      model:  'none (Ollama offline)',
    };
  }

  // ── Step 1: Build the structured meta-prompt for Qwen ──────
  //  We give Qwen:
  //    • A clear role and output format
  //    • A concise violation manifest (type, severity, line, matched text)
  //    • The actual source code (first 1500 chars so it fits in context)
  //  And tell it to write a remediation prompt for a downstream LLM.
  const violationManifest = violations.map((v, i) =>
    `${i + 1}. [${v.type}] [${v.severity}] ${v.label}\n` +
    `   Line ${v.lineIndex + 1}: \`${v.matchText.slice(0, 80)}\``
  ).join('\n');

  const codeSnippet = rawCode
    ? `\n\nSOURCE CODE (${language}):\n\`\`\`${language}\n${rawCode.slice(0, 1500)}${rawCode.length > 1500 ? '\n// ...' : ''}\n\`\`\``
    : '';

  const typeSet    = [...new Set(violations.map(v => v.type))];
  const hasSecret  = typeSet.includes('SECRET');
  const hasLicense = typeSet.includes('LICENSE');
  const hasInject  = typeSet.includes('INJECTION');

  const metaPrompt =
`You are CleanScribe, an expert code compliance AI.

A developer has code with the following violations detected by static analysis:

${violationManifest}${codeSnippet}

Your task: Write a precise, actionable remediation prompt that this developer can paste directly into GitHub Copilot Chat or ChatGPT to get their code fixed in one response.

The prompt you write MUST:
- Open with "## Task" and state the exact number of violations and the programming language.
- Include a "## Hard Constraints" section with bullet rules (no clarifying questions, return full file, mark fixed lines with // FIXED:).
- Include one "ACTION" block per violation showing the EXACT line BEFORE and AFTER the fix.${hasSecret ? '\n- Include a "## .env.example" section with the correct env variable names (empty values).' : ''}${hasLicense ? '\n- Specify which exact lines/blocks to DELETE and what MIT header to use as replacement.' : ''}${hasInject ? '\n- Show the exact input validation guard code to add.' : ''}
- End with "## Output Format" telling the AI to return the complete corrected file in one code block.

Write ONLY the remediation prompt itself. Do not explain what you are doing. Do not add preamble. Start directly with "## Task".

---END---`;

  // ── Step 2: Call Qwen ──────────────────────────────────────
  let qwenResponse = '';
  try {
    qwenResponse = await _ollamaGenerate(metaPrompt, {
      model,
      host,
      port,
      timeout:     options.timeout ?? 20000,
      temperature: options.temperature ?? 0.3,
    });
  } catch (err) {
    // Timeout or connection drop — fall back silently
    return {
      prompt: generateRefactorPrompt(violations, language, rawCode),
      source: 'fallback',
      model:  `${model} (error: ${err.message})`,
    };
  }

  // ── Step 3: Validate Qwen's output ────────────────────────
  // If Qwen returns something too short or clearly malformed,
  // fall back to the reliable hardcoded version.
  const cleaned = qwenResponse.trim();
  if (!cleaned || cleaned.length < 100 || !cleaned.includes('## Task')) {
    return {
      prompt: generateRefactorPrompt(violations, language, rawCode),
      source: 'fallback',
      model:  `${model} (empty/malformed response)`,
    };
  }

  return {
    prompt: cleaned,
    source: 'ai',
    model,
  };
}

// ─────────────────────────────────────────────────────────────
//  MODULE EXPORTS
// ─────────────────────────────────────────────────────────────

module.exports = {
  scanDocument,
  generateRefactorPrompt,
  generateRefactorPromptWithAI,
  SEVERITY,
};
