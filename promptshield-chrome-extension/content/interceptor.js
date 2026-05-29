(function (root) {
  const PromptShield = root.PromptShield || (root.PromptShield = {});
  let debounceTimer = null;
  PromptShield.lastSanitizedText = '';

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

  function clearDebounceTimer() {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }

  function hasLocalSensitiveData(text) {
    if (text === PromptShield.lastSanitizedText) return false;

    const placeholderValues = new Set([
      // existing
      '[API-KEY-REDACTED]', 'user@redacted.com', 'XXX-XX-XXXX',
      '+X-XXX-XXX-XXXX', '[PASSWORD-REDACTED]', '[NAME-REDACTED]',
      '[DB-URL-REDACTED]', '0.0.0.0', 'XXXX-XXXX-XXXX-XXXX',
      '[SECRET-REDACTED]', '[REDACTED]',
      // new
      '::redacted', '[DOB-REDACTED]', '[PASSPORT-REDACTED]', '[DL-REDACTED]',
      '[ACCOUNT-REDACTED]', '[ROUTING-REDACTED]', '[IBAN-REDACTED]',
      '[SWIFT-REDACTED]', '[EIN-REDACTED]', '[MRN-REDACTED]',
      '[NPI-REDACTED]', '[INSURANCE-ID-REDACTED]', '[DIAGNOSIS-REDACTED]',
      '[MEDICATION-REDACTED]', '[LAB-VALUE-REDACTED]'
    ]);
    const entities = [
      ...PromptShield.scanWithRegex(text),
      ...PromptShield.scanForNames(text),
      ...PromptShield.scanCodeTokens(text)
    ];

    return entities.some((entity) => !placeholderValues.has(entity.value));
  }

  async function runPipeline(inputEl, platform, options = {}) {
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
    PromptShield.lastSanitizedText = response.text.trim();

    PromptShield.showToast(
      options.autoSubmit
        ? '\uD83D\uDEE1\uFE0F PromptShield: ' + response.fieldCount + ' field(s) masked \u00B7 sending...'
        : '\uD83D\uDEE1\uFE0F PromptShield: ' + response.fieldCount + ' field(s) masked',
      'success'
    );

    if (options.autoSubmit) {
      if (platform === 'gemini') {
        // Gemini needs MAIN world execution to bypass Angular's isTrusted check
        await sendChromeMessage({ type: 'TRIGGER_SUBMIT' });
      } else {
        // Claude / ChatGPT use React with native disabled — direct autoSubmit works
        await PromptShield.autoSubmit(platform);
      }
    }

    return response;
  }

  function schedulePipeline(inputEl, platform, delayMs) {
    if (PromptShield.isSanitizing) return;
    clearDebounceTimer();
    debounceTimer = setTimeout(() => {
      // autoSubmit: true — after 800ms pause, mask AND auto-send
      runPipeline(inputEl, platform, { autoSubmit: true });
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

  PromptShield.sendChromeMessage = sendChromeMessage;
  PromptShield.clearDebounceTimer = clearDebounceTimer;
  PromptShield.hasLocalSensitiveData = hasLocalSensitiveData;
  PromptShield.runPipeline = runPipeline;
  PromptShield.attachInterceptor = attachInterceptor;
})(globalThis);
