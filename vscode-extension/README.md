# CleanScribe — AI Compliance Sensor VS Code Extension

**CleanScribe** acts as a real-time compliance sensor inside your developer IDE, preventing you from committing code that triggers copyleft violations or exposes credentials to external repositories.

## 🚀 Key Features

* 📄 **AST Structural Copyleft Matcher:** Performs in-process abstract syntax tree (AST) function-level segmentation and Jaccard similarity comparison against standard copyleft templates (GPL v2/v3, AGPL). Catches licensed code even if copyright headers are omitted and variable names are refactored!
* 📄 **Textual License Check:** Scans comments for explicit license notices (GPL, AGPL, LGPL) and SPDX identifiers.
* 🔑 **Credential & Secrets Leak Guard:** Flags hard-coded secrets (OpenAI, AWS, Anthropic, Google API keys) and PII before they are saved to disk.
* ⚠️ **Prompt Injection Filter:** Detects LLM-jailbreak and injection strings inside your file buffers.
* 🛡️ **Interactive AI Refactoring QuickFix:** Hover over any underlined violation and click **Request AI Fix** (or press `Ctrl+Shift+F9`) to ask a local Qwen model (via Ollama) to draft the exact action-first refactoring prompt with zero-friction fallbacks.
* 📊 **Problems Panel & Wavy Underlines:** Fully integrates as a native diagnostic linter, feeding violations into VS Code's Problems tab and highlighting risk ranges.
* 🛡️ **Status Bar Compliance Badge:** Displays a quick indicator (`🛡️ Clean ✓` / `🚨 CRITICAL (3)`) in the bottom-right status bar.

---

## ⚙️ Configuration Settings

Customize CleanScribe directly from the VS Code Settings UI under **Preferences > Settings > CleanScribe**:

| Setting | Type | Default | Description |
|---|---|---|---|
| `cleanScribe.enabled` | `boolean` | `true` | Enable or disable CleanScribe scanning on save. |
| `cleanScribe.licenseThreshold` | `number` | `0.75` | Jaccard similarity threshold for AST copyleft checks. |
| `cleanScribe.scanOnOpen` | `boolean` | `true` | Automatically scan active files when first opening them. |
| `cleanScribe.ollamaModel` | `string` | `"qwen2.5:1.5b"` | Local Ollama model tag used for generating fix prompts. |
| `cleanScribe.ollamaHost` | `string` | `"localhost"` | Hostname of your local Ollama server. |
| `cleanScribe.ollamaPort` | `number` | `11434` | Port of your local Ollama server. |
| `cleanScribe.ollamaTimeout` | `number` | `20000` | Ollama connection timeout in milliseconds. |

---

## ⌨️ Keyboard Shortcuts

| Command | Keybinding (Win) | Keybinding (Mac) | Description |
|---|---|---|---|
| **Request AI Refactor Fix** | `Ctrl + Shift + F9` | `Cmd + Shift + F9` | Generates the LLM refactor prompt for the active file. |
| **Clear All Diagnostics** | `Ctrl + Shift + F10` | `Cmd + Shift + F10` | Manually flushes and clears all highlights/problems. |

---

## 🧪 Testing and Development

To run the standalone unit tests covering all scanners, edge cases, and Jaccard similarity bounds:

```bash
cd vscode-extension
npm run test
# Output: 71/71 tests passing ✅
```

To run local marketplace packaging checks:
```bash
npm run package
# Generates: cleanscribe-vscode-1.0.0.vsix
```
