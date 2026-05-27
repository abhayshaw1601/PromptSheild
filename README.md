# PromptShield AI - Enterprise LLM Data Firewall & Compliance Gateway

**PromptShield** is an enterprise-grade security layer that prevents sensitive data (PII, API keys, corporate secrets) from leaking to external LLM providers while actively auditing AI-generated code for copyleft license violations (GPL v2/v3, AGPL).

Works seamlessly with **ChatGPT**, **Google Gemini**, **Claude**, **DeepSeek**, and other AI chat platforms.

---

## 🏗️ System Architecture

PromptShield operates as a three-tier stack:

```mermaid
graph TD
    subgraph UI & Admin Portals
        UI["User Input (ChatGPT / Gemini / Claude)"]
        VS["VS Code Editor (JS, TS, Python files)"]
        Dash["Admin Dashboard (Next.js)<br/>• Compliance stats dashboard<br/>• Real-time audit logger views"]
    end

    subgraph PromptShield Clients
        Ext["PromptShield Chrome Extension (MV3)<br/>• DOM MutationObserver<br/>• Popup Dashboard HUD"]
        VSCode["CleanScribe VS Code Extension<br/>• Real-Time Lints & Problems<br/>• Status Bar Compliance Indicators"]
    end

    subgraph Compliance & Obfuscation Gateway
        Backend["AI Firewall Backend (Express)<br/>• /api/proxy/mask<br/>• /api/proxy/unmask<br/>• /api/proxy/chat<br/>• Audit logger"]
        LocalEngine["CleanScribe Scanner (cleanScribeCore)<br/>• In-process AST Matcher<br/>• PII & Secret Parsers"]
    end

    subgraph Security Engines & Storage
        SDK["OmniShield Core SDK<br/>• PII Redaction rules<br/>• AST Code Normalizer<br/>• License Jaccard Matcher"]
        Mongo[("MongoDB Database<br/>• Persistent Audit Logs<br/>• Active Session Token Maps")]
        Ollama["Local Ollama Server<br/>• Qwen2.5:1.5b Compliance Refactoring"]
    end

    UI -->|Intercepts Prompts| Ext
    VS -->|Listens to Save Event| VSCode

    Ext -->|HTTP API - localhost:5000| Backend
    VSCode -->|In-Process Scan| LocalEngine

    Backend -->|Audits Outbound / Inbound| SDK
    Backend -->|Persists Security Context| Mongo
    Backend -->|Dynamic Masking| Ollama
    
    VSCode -->|Generates Fix Prompts| Ollama
    LocalEngine -->|Modular Port of| SDK

    Dash -->|Queries Metrics & Logs| Backend
    Dash -->|Reads Session Context| Mongo

    style Ext fill:#0275d8,stroke:#fff,stroke-width:2px,color:#fff
    style VSCode fill:#5cb85c,stroke:#fff,stroke-width:2px,color:#fff
    style Backend fill:#f0ad4e,stroke:#fff,stroke-width:2px,color:#fff
    style SDK fill:#d9534f,stroke:#fff,stroke-width:2px,color:#fff
    style Mongo fill:#5bc0de,stroke:#fff,stroke-width:2px,color:#fff
    style Ollama fill:#6f42c1,stroke:#fff,stroke-width:2px,color:#fff
    style Dash fill:#777,stroke:#fff,stroke-width:2px,color:#fff
```

### Component Overview

| Component | Location | Purpose | Tech Stack |
|-----------|----------|---------|-----------|
| **Chrome Extension** | `promptshield-chrome-extension/` | Intercept & unmask in real-time | Manifest V3, DOM APIs |
| **Backend Gateway** | `ai-firewall-backend/` | Masking, unmasking, audit logs | Express, MongoDB, Mongoose |
| **Core SDK** | `sdk_module/omnishield-core-sdk/` | PII detection, AST parsing, license scanning | Node.js, zero-dependencies |
| **Frontend Dashboard** | `app/` | Admin UI (Next.js) | Next.js 16, React 19, Tailwind |
| **VS Code Extension** | `vscode-extension/` | Real-time in-IDE compliance sensor & AI refactoring tool | VS Code Extension APIs, Acorn AST |

---

## 🔄 Data Flow

### Outbound Flow: Masking Sensitive Data

1. **User types a prompt** with sensitive info (e.g., `API_KEY=sk-proj-abc123` or `email@company.com`)
2. **Extension intercepts** the contenteditable element (Quill, ProseMirror)
3. **POST to `/api/proxy/mask`** with raw prompt text
4. **Backend scans** using Omnishield SDK:
   - Detects API keys, emails, SSNs, IP addresses, URLs
   - Detects proprietary project names via local LLM (Ollama)
   - Detects prompt injection patterns
5. **Generates tokens** (e.g., `[omni-gcp-sk123]`, `[omni-email-456]`)
6. **Stores mapping** in MongoDB (tied to session ID)
7. **Returns masked prompt** to extension
8. **Extension swaps text** in the DOM and sends to LLM

### Inbound Flow: Unmasking & Compliance Audit

1. **LLM streams response** back through backend proxy
2. **Backend AST parser** scans code blocks for:
   - GPL v2/v3 / AGPL copyleft signatures (75%+ threshold)
   - Malicious patterns
3. **If violations found**:
   - Log audit record to MongoDB
   - Prepend compliance warning banner
4. **Extension receives response**:
   - MutationObserver scans for placeholders
   - Requests unmasking via background worker
   - Dynamically restores original values in DOM
5. **User sees unmasked response** with compliance warnings (if any)

---

## 💻 CleanScribe VS Code Extension (Feature 2) — Detailed Working

**CleanScribe** acts as a real-time compliance sensor inside the developer's IDE (Feature 2), working completely in-process to flag licensing risks, leaked API keys, and prompt injections.

### 🔄 CleanScribe Lifecycle & Scan Pipeline

```mermaid
sequenceDiagram
    autonumber
    actor Dev as Developer (IDE)
    participant VS as extension.js (UI Layer)
    participant Engine as cleanScribeCore.js (Core Scanner)
    participant Qwen as Ollama (Local AI Server)

    Dev->>VS: Saves supported file (Ctrl+S)
    activate VS
    VS->>VS: Extract raw code & languageId
    VS->>Engine: scanDocument(rawCode, languageId)
    activate Engine
    Engine->>Engine: Pass 1: Regex scan for explicit license comments
    Engine->>Engine: Pass 2: Regex scan for PII & leaked API keys
    Engine->>Engine: Pass 3: Heuristic scan for prompt injections
    Engine->>Engine: Pass 4: Acorn AST parser splits JS/TS into sub-blocks
    Engine->>Engine: Pass 4b: Jaccard similarity comparison against GPL signature DB
    Engine-->>VS: Returns unified ScanResult { clean, violations[], refactorPrompt }
    deactivate Engine

    alt File is completely clean
        VS->>VS: Clear all outlines & markers
        VS->>Dev: Show green "🛡️ Clean ✓" in status bar
    else Violations detected
        VS->>VS: Apply jagged outlines (red/amber) over ranges
        VS->>VS: Populate Problems Tab with Diagnostics
        VS->>VS: Update Status Bar ("🚨 CRITICAL (3)" or "⚠️ 2 issues")
        VS->>Dev: Highlight violations & show rich Markdown tooltips
    end
    deactivate VS

    Dev->>VS: Hover & click "Request AI Fix" (Ctrl+Shift+F9)
    activate VS
    VS->>VS: Fresh document scan & status spinner on
    VS->>Engine: generateRefactorPromptWithAI(violations, code)
    activate Engine
    Engine->>Qwen: HTTP POST /api/generate (Check Ollama status)
    alt Ollama is online & Qwen is ready
        Qwen-->>Engine: Returns custom, context-aware prompt block
    else Ollama offline / Qwen times out
        Engine->>Engine: Fallback to high-quality action-first hardcoded prompt
    end
    Engine-->>VS: Returns prompt content
    deactivate Engine
    VS->>VS: Log prompt to "CleanScribe" Output Channel
    VS->>Dev: Display copy-to-clipboard notification toast
    deactivate VS
```

### 🔍 In-IDE Protection Features

#### 1. Real-Time Diagnostics & Visual Highlighting
* **Wavy Underlines:** Critical violations (copyleft headers, AST Jaccard matches, leaked API keys) are marked with a jagged red border (`border-bottom: 2px wavy #FF2D55`) and red gutter icons. Information/Warning alerts (such as email exposures) get amber underlines.
* **Gutter & Overview Ruler Markers:** Identifies exact violation offsets visually at a glance.
* **Problems Panel Integration:** Maps all violations directly into VS Code’s Problems window as compiler-grade diagnostics (complete with risk severity and SPDX external documentation hyperlinks).

#### 2. AST-Guided Scope Segmentation (Dilution Immunity)
To prevent clean surrounding code from "diluting" the compliance similarity index inside larger, real-world codebases:
* The extension isolates every **`FunctionDeclaration`** node in-process using the **`acorn`** AST parser.
* It computes sliding-window bigrams and Jaccard similarity matrices *individually per function*.
* Even a small 8-line GPL snippet copied deep inside a 500-line database pool file is audited with **100% precision**.

#### 3. Zero-Friction AI Remediation Pipeline
* Fully supports local LLMs (`qwen2.5:1.5b` pulled via Ollama) to synthesize context-aware, single-shot refactoring prompts.
* Graceful, synchronous fallback to structured string templates if Ollama is unreachable.
* **Clipboard Automation:** One-click copying of the generated refactor prompt directly from the VS Code notification toast.

---

## 🚀 Quick Start

### Prerequisites
- **Node.js** v18+ ([download](https://nodejs.org))
- **MongoDB** (local or cloud):
  - Local: `mongod` running on `mongodb://localhost:27017`
  - Cloud: MongoDB Atlas connection string in `.env`
- **Google Chrome** browser (for extension testing)

### 1️⃣ Backend Setup

```bash
# Navigate to backend
cd ai-firewall-backend

# Create .env file
cat > .env << EOF
PORT=5000
MONGO_URI=mongodb://localhost:27017/promptshield
GROQ_API_KEY=your_groq_key_here
OPENAI_API_KEY=your_openai_key_here
NODE_ENV=development
EOF

# Install dependencies
npm install

# Start server
npm run dev
# Server runs on http://localhost:5000
```

### 2️⃣ Chrome Extension Setup

1. Open `chrome://extensions` in Google Chrome
2. Enable **Developer mode** (toggle in top-right)
3. Click **Load unpacked**
4. Select `promptshield-chrome-extension/` folder
5. Click the extension icon in the toolbar

### 3️⃣ Test It Out

Open a prompt in **ChatGPT** or **Gemini**:

```
My API key is sk-proj-1234567890abcdef and my email is dev@mycompany.com
```

Click the **PromptShield** extension button. The text should be masked with placeholders before sending to the LLM.

---

## 📋 Testing Prompts (Console)

Run these in the browser console (`F12`) while the extension is active:

```javascript
// Test 1: Check gateway health
chrome.runtime.sendMessage({ action: 'checkHealth' }, (res) => {
  console.log('Gateway Status:', res);
});

// Test 2: Mask a sensitive prompt
const testPrompt = "API Key: AIzaSyB... Email: admin@internal.com";
chrome.runtime.sendMessage(
  { action: 'maskPrompt', data: testPrompt },
  (res) => console.log('Masked:', res)
);

// Test 3: Update stats in UI
chrome.storage.local.set({
  stats: {
    keysBlocked: 10,
    emailsShielded: 25,
    piiProtected: 15,
    complianceWarnings: 3
  }
});
```

---

## 📁 Project Structure

```
promptsheild/
├── README.md                              # This file
├── CONTEXT.md                             # Full technical reference
├── AGENTS.md                              # AI coding agent rules
├── CLAUDE.md                              # Claude-specific instructions
├── package.json                           # Root workspace
├── tsconfig.json                          # TypeScript config
│
├── app/                                   # Next.js admin dashboard
│   ├── layout.tsx                         # Root layout
│   ├── page.tsx                           # Home page
│   └── globals.css                        # Global styles
│
├── components/
│   └── ui/                                # Reusable components
│       └── button.tsx
│
├── lib/
│   └── utils.ts                           # Helper functions
│
├── promptshield-chrome-extension/         # MV3 Chrome Extension
│   ├── manifest.json                      # Extension config
│   ├── background.js                      # Service worker
│   ├── content.js                         # DOM injection
│   ├── popup.html                         # Dashboard UI
│   ├── popup.css                          # Styling
│   └── popup.js                           # Popup logic
│
├── ai-firewall-backend/                   # Express Gateway (Port 5000)
│   ├── server.js                          # Entry point
│   ├── package.json                       # Dependencies
│   │
│   ├── config/
│   │   └── db.js                          # MongoDB connection
│   │
│   ├── models/
│   │   └── AuditLog.js                    # Mongoose schema
│   │
│   ├── controllers/
│   │   └── proxyController.js             # Route handlers
│   │
│   ├── routes/
│   │   └── proxyRoutes.js                 # API routes
│   │
│   ├── middleware/
│   │   └── logger.js                      # Request logging
│   │
│   ├── services/
│   │   ├── maskingService.js              # Token masking
│   │   ├── openaiService.js               # LLM integration
│   │   ├── promptInjectionService.js      # Injection detection
│   │   ├── riskService.js                 # Risk scoring
│   │   └── codeAnalysis/
│   │       ├── astParser.js               # JS/TS AST parsing
│   │       ├── licenseMatcher.js          # License detection
│   │       └── textExtractor.js           # Code extraction
│   │
│   └── test/
│       └── code-analysis.test.js          # Test suite
│
└── sdk_module/
│   └── omnishield-core-sdk/               # Standalone SDK
│       ├── index.js                       # Public API
│       ├── ai-scanner.js                  # LLM-based scanner
│       ├── test-sdk.js                    # Integration tests
│       └── test-edge-cases.js             # Stress tests
│
└── vscode-extension/                      # CleanScribe VS Code Extension
    ├── extension.js                       # VS Code Extension entry point
    ├── cleanScribeCore.js                 # In-process AST & Jaccard match engine
    ├── package.json                       # Extension configurations
    └── test/
        ├── runTests.js                    # Standalone extension test suite
        └── fixtures/                      # Copyleft / secret compliance test fixtures
```

---

## 🔐 Security Features

### Outbound Protection
- ✅ **API Key Detection**: AWS, GCP, OpenAI, Hugging Face, etc.
- ✅ **PII Redaction**: SSNs, emails, phone numbers, credit cards
- ✅ **Proprietary Data**: Project names, financial figures (via local LLM)
- ✅ **Prompt Injection Detection**: Filters bypass attempts before masking
- ✅ **URL & IP Filtering**: Blocks internal IPs and corporate URLs

### Inbound Protection
- ✅ **Copyleft License Detection**: GPL v2/v3, AGPL (75%+ structural similarity)
- ✅ **AST Parsing**: JavaScript/TypeScript code analysis (Acorn)
- ✅ **Audit Logging**: All mask/unmask events stored in MongoDB
- ✅ **Risk Scoring**: Severity-based compliance warnings

---

## 🛠️ API Endpoints

All endpoints are proxied through the Express gateway on `http://localhost:5000`.

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/proxy/mask` | POST | Mask sensitive data in prompts |
| `/api/proxy/unmask` | POST | Restore masked placeholders |
| `/api/proxy/chat` | POST | Proxy LLM chat with license scanning |
| `/api/audit/logs` | GET | Retrieve audit logs |

See [CONTEXT.md](CONTEXT.md) for full request/response schemas.

---

## 🧪 Running Tests

### Backend Code Analysis Tests
```bash
cd ai-firewall-backend
npm test
# Output: 10/10 tests passing ✅
```

### SDK Validation
```bash
cd sdk_module/omnishield-core-sdk
node test-sdk.js
node test-edge-cases.js
```

### CleanScribe VS Code Extension Tests
```bash
cd vscode-extension
npm run test
# Output: 71/71 tests passing ✅
```

---

## 📞 Support & Troubleshooting

### Extension Not Detecting Prompts?
1. Ensure backend is running: `npm run dev` in `ai-firewall-backend/`
2. Check `chrome://extensions` → PromptShield → "Errors" section
3. Verify MongoDB is running
4. Test with console script: `chrome.runtime.sendMessage({ action: 'checkHealth' }, console.log)`

### Backend Server Won't Start?
```bash
# Check if port 5000 is in use
netstat -ano | findstr :5000

# Verify MongoDB connection
mongo mongodb://localhost:27017/promptshield

# Check .env file exists with valid MONGO_URI
```

### License Detection Not Working?
- Verify AST parser (Acorn) is installed: `npm ls acorn`
- Check code blocks are properly isolated in `textExtractor.js`

---

## 📚 Documentation

- **[CONTEXT.md](CONTEXT.md)** - Complete technical reference, schemas, and API specs
- **[AGENTS.md](AGENTS.md)** - AI coding agent configuration
- **[CLAUDE.md](CLAUDE.md)** - Claude-specific instructions

---

## 📝 License

PromptShield is proprietary enterprise software. All rights reserved.
5. The PromptShield icon will appear on your toolbar. Verify the glassmorphic card HUD shows "SHIELD SECURED" (green pulsing indicator).

---

## Testing the Pipeline

### 1. Core SDK Test Suite (test-sdk.js)
The core security scanner has a robust standalone test suite covering lexical matching rules, validation boundaries, and regex parsing pipelines.
- **File Location**: sdk_module/omnishield-core-sdk/test-sdk.js
- **How to Run**:
  ```bash
  cd sdk_module/omnishield-core-sdk
  node test-sdk.js
  ```
- **Test Scopes**:
  - PII pattern identification (GCP credentials, AWS secrets, emails, IP structures, URLs).
  - Validation limits and character boundary thresholds.

### 2. Edge Case Testing (test-edge-cases.js)
To test boundaries, syntax tolerances, and stress boundaries inside the SDK:
- **File Location**: sdk_module/omnishield-core-sdk/test-edge-cases.js
- **How to Run**:
  ```bash
  cd sdk_module/omnishield-core-sdk
  node test-edge-cases.js
  ```

### 3. Backend Gateway AST and Copyleft Matchers (code-analysis.test.js)
To verify the Core SDK's AST analysis, multi-language tokenizers, and copyleft sliding-window similarity metrics:
- **File Location**: ai-firewall-backend/test/code-analysis.test.js
- **How to Run**:
  ```bash
  cd ai-firewall-backend
  node test/code-analysis.test.js
  ```
- **Test Scopes**:
  - Markdown text parsing and clean backtick extraction.
  - Acorn AST syntax node normalization.
  - Bigram calculations and Jaccard-distance similarity alignment.
  - Textual SPDX license comment detection.

### 4. Manual Mask/Unmask Verification
1. Open Google Gemini (gemini.google.com) or ChatGPT (chatgpt.com).
2. Type a test prompt:
   > "Draft an email to deal-lead@samsung-internal.com. Explain that we successfully registered the Gemini key AIzaSyB3nXkMpR9qToL5wVeF7Hy2JcD8sGu1Az4 and need them to verify."
3. Click the floating golden PromptShield icon in the bottom right corner of the input area.
4. Verify the text changes instantly to its tokenized form (omni-email-placeholder, omni-gcp-placeholder).
5. Submit the prompt. The returning streamed answers will automatically restore original values in your browser viewport, while remaining fully secure at the LLM level.
