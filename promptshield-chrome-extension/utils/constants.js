(function (root) {
  const PromptShield = root.PromptShield || (root.PromptShield = {});

  // Gemini uses a Quill editor — .ql-editor is the contenteditable div
  // It also has role="textbox" so both selectors work; prefer the Quill one
  PromptShield.GEMINI_INPUT_SELECTOR = '.ql-editor, div[role="textbox"][aria-multiline="true"]';
  PromptShield.DEBOUNCE_MS = 800;
  PromptShield.PASTE_DEBOUNCE_MS = 300;
  PromptShield.OLLAMA_TIMEOUT_MS = 5000;
  PromptShield.OLLAMA_URL = 'http://localhost:11434/api/generate';
  PromptShield.OLLAMA_MODEL = 'phi3';
  PromptShield.TOAST_DURATION_MS = 3000;
})(globalThis);
