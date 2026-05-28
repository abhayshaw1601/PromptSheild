(function (root) {
  const PromptShield = root.PromptShield || (root.PromptShield = {});

  PromptShield.GEMINI_INPUT_SELECTOR = '.ql-editor, div[role="textbox"][aria-multiline="true"]';
  PromptShield.DEBOUNCE_MS = 600;
  PromptShield.PASTE_DEBOUNCE_MS = 200;
  PromptShield.OLLAMA_TIMEOUT_MS = 5000;
  PromptShield.OLLAMA_URL = 'http://localhost:11434/api/generate';
  PromptShield.OLLAMA_MODEL = 'phi3';
  PromptShield.TOAST_DURATION_MS = 3000;
})(globalThis);
