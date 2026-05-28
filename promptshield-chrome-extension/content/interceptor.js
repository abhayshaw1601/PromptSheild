(function (root) {
  const PromptShield = root.PromptShield || (root.PromptShield = {});

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

  function attachInterceptor(inputEl, platform) {
    let debounceTimer = null;

    async function runPipeline() {
      if (PromptShield.isSanitizing) return;
      const rawText = inputEl.innerText.trim();
      if (!rawText || rawText.length < 4) return;

      const response = await sendChromeMessage({
        type: 'SANITIZE_PROMPT',
        text: rawText,
        platform
      });

      if (!response || !response.sanitized) return;

      await PromptShield.injectSanitizedText(inputEl, response.text);

      if (response.ollamaUsed) {
        PromptShield.showToast(
          '🛡️ PromptShield: ' + response.fieldCount + ' field(s) masked'
        );
      } else {
        PromptShield.showToast(
          '🛡️ PromptShield: ' + response.fieldCount + ' field(s) masked',
          'warning'
        );
      }
    }

    inputEl.addEventListener('input', () => {
      if (PromptShield.isSanitizing) return;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(runPipeline, PromptShield.DEBOUNCE_MS);
    });
  }

  PromptShield.attachInterceptor = attachInterceptor;
})(globalThis);
