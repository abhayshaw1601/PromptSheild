(function (root) {
  const PromptShield = root.PromptShield || (root.PromptShield = {});
  let keydownAttached = false;
  let clickAttached = false;

  function isSendControl(target) {
    return Boolean(
      target &&
        target.closest &&
        target.closest([
          'button[aria-label="Send message"]',
          'button[aria-label="Send prompt"]',
          '[data-testid="send-button"]',
          'button[aria-label="Submit message"]',
          'button[data-mat-icon-name="send"]',
          '.send-button'
        ].join(', '))
    );
  }

  function shouldHandleSensitiveSubmit(inputEl) {
    if (!inputEl || !document.contains(inputEl)) return false;
    const rawText = inputEl.innerText.trim();
    if (!rawText || rawText.length < 4) return false;
    return PromptShield.hasLocalSensitiveData(rawText);
  }

  function attachKeydownSafetyNet(platform) {
    if (keydownAttached) return;
    keydownAttached = true;

    document.addEventListener(
      'keydown',
      async (event) => {
        if (event.key !== 'Enter' || event.shiftKey) return;
        if (PromptShield.isSanitizing) return;

        const inputEl = PromptShield.getInputElement(platform);
        if (!shouldHandleSensitiveSubmit(inputEl)) return;

        // Block the raw submit, sanitize, then trigger submit via MAIN world
        event.preventDefault();
        event.stopImmediatePropagation();
        PromptShield.clearDebounceTimer();
        await PromptShield.runPipeline(inputEl, platform, { autoSubmit: true });
      },
      true
    );
  }

  function attachClickSafetyNet(platform) {
    if (clickAttached) return;
    clickAttached = true;

    document.addEventListener(
      'click',
      async (event) => {
        if (!isSendControl(event.target)) return;
        if (PromptShield.isSanitizing) return;

        const inputEl = PromptShield.getInputElement(platform);
        if (!shouldHandleSensitiveSubmit(inputEl)) return;

        event.preventDefault();
        event.stopImmediatePropagation();
        PromptShield.clearDebounceTimer();
        await PromptShield.runPipeline(inputEl, platform, { autoSubmit: true });
      },
      true
    );
  }

  const platform = window.location.hostname.includes('gemini') ? 'gemini' : 'chatgpt';
  PromptShield.showPageBadge();
  PromptShield.startObserver(platform);
  attachKeydownSafetyNet(platform);
  attachClickSafetyNet(platform);
  PromptShield.attachKeydownSafetyNet = attachKeydownSafetyNet;
  PromptShield.attachClickSafetyNet = attachClickSafetyNet;
})(globalThis);
