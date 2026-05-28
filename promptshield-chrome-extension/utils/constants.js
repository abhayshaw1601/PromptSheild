(function (root) {
  const PromptShield = root.PromptShield || (root.PromptShield = {});

  PromptShield.GEMINI_INPUT_SELECTOR = 'div[role="textbox"][aria-multiline="true"]';
  PromptShield.CHATGPT_INPUT_SELECTOR = 'div[id="prompt-textarea"]';
  PromptShield.DEBOUNCE_MS = 800;
  PromptShield.OLLAMA_TIMEOUT_MS = 5000;
  PromptShield.OLLAMA_URL = 'http://localhost:11434/api/generate';
  PromptShield.OLLAMA_MODEL = 'phi3';
  PromptShield.TOAST_DURATION_MS = 3000;
})(globalThis);
