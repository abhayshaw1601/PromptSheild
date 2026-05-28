(function (root) {
  const PromptShield = root.PromptShield || (root.PromptShield = {});
  let debounceTimer = null;

  function sendChromeMessage(payload) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(payload, (response) => {
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }
        resolve(response);
      });
    });
  }

  function formatToastMessage(response) {
    return (
      '\uD83D\uDEE1\uFE0F PromptShield: ' +
      response.fieldCount +
      ' field(s) masked via ' +
      (response.ollamaUsed ? 'local AI' : 'regex')
    );
  }

  function clearDebounceTimer() {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }

  async function runPipeline(inputEl, platform) {
    if (PromptShield.isSanitizing) return null;
    if (!inputEl || !document.contains(inputEl)) return null;

    const rawText = inputEl.innerText.trim();
    if (!rawText || rawText.length < 4) return null;

    const response = await sendChromeMessage({
      type: 'SANITIZE_PROMPT',
      text: rawText,
      platform
    });

    if (!response || !response.sanitized) return response || null;

    await PromptShield.injectSanitizedText(inputEl, response.text);
    PromptShield.showToast(formatToastMessage(response), response.ollamaUsed ? 'success' : 'warning');
    return response;
  }

  function schedulePipeline(inputEl, platform, delayMs) {
    if (PromptShield.isSanitizing) return;
    clearDebounceTimer();
    debounceTimer = setTimeout(() => {
      runPipeline(inputEl, platform);
    }, delayMs);
  }

  function attachInterceptor(inputEl, platform) {
    inputEl.addEventListener('input', (event) => {
      const isPasteInput = typeof event.inputType === 'string' && event.inputType.includes('Paste');
      schedulePipeline(
        inputEl,
        platform,
        isPasteInput ? PromptShield.PASTE_DEBOUNCE_MS : PromptShield.DEBOUNCE_MS
      );
    });

    inputEl.addEventListener('paste', () => {
      schedulePipeline(inputEl, platform, PromptShield.PASTE_DEBOUNCE_MS);
    });
  }

  function getSendButton() {
    return (
      document.querySelector('button[aria-label="Send message"]') ||
      document.querySelector('[data-testid="send-button"]') ||
      document.querySelector('button[aria-label="Send prompt"]') ||
      null
    );
  }

  function clickSendButton() {
    const sendBtn = getSendButton();
    if (sendBtn && !sendBtn.disabled) {
      sendBtn.click();
    }
  }

  PromptShield.sendChromeMessage = sendChromeMessage;
  PromptShield.clearDebounceTimer = clearDebounceTimer;
  PromptShield.runPipeline = runPipeline;
  PromptShield.clickSendButton = clickSendButton;
  PromptShield.attachInterceptor = attachInterceptor;
})(globalThis);
