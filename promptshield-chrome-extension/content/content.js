(function (root) {
  const PromptShield = root.PromptShield || (root.PromptShield = {});
  let clickAttached = false;

  // ── Workflow ──────────────────────────────────────────────────────────────────
  // 1. User types → 800ms pause → debounce fires → mask → TRIGGER_SUBMIT (MAIN world)
  // 2. User clicks send with unmasked text → intercept → mask → TRIGGER_SUBMIT
  //
  // We do NOT intercept Enter keydown anymore — that caused infinite loops because
  // the synthetic Enter we dispatched for submit re-triggered the listener.
  // The debounce in interceptor.js handles the "pause and auto-send" flow entirely.
  // ─────────────────────────────────────────────────────────────────────────────

  function isSendControl(target) {
    return Boolean(
      target &&
        target.closest &&
        target.closest([
          // ChatGPT
          'button[data-testid="send-button"]',
          'button[aria-label="Send message"]',
          // Claude
          'button[aria-label="Send Message"]',
          // Gemini
          'button[aria-label="Send prompt"]',
          'button[data-mat-icon-name="send"]',
          '.send-button',
        ].join(', '))
    );
  }

  function shouldHandleSensitiveSubmit(inputEl) {
    if (!inputEl || !document.contains(inputEl)) return false;
    const rawText = inputEl.innerText.trim();
    if (!rawText || rawText.length < 4) return false;
    return PromptShield.hasLocalSensitiveData(rawText);
  }

  // Click interceptor: catches manual send-button clicks when text isn't masked yet
  function attachClickSafetyNet(platform) {
    if (clickAttached) return;
    clickAttached = true;

    document.addEventListener('click', async (event) => {
      if (!isSendControl(event.target)) return;
      if (PromptShield.isSanitizing) return;

      const inputEl = PromptShield.getInputElement(platform);
      if (!shouldHandleSensitiveSubmit(inputEl)) return;

      // Block this click, mask, then auto-submit via MAIN world
      event.preventDefault();
      event.stopImmediatePropagation();
      PromptShield.clearDebounceTimer();
      await PromptShield.runPipeline(inputEl, platform, { autoSubmit: true });
    }, true);
  }

  const hostname = window.location.hostname;
  const platform = hostname.includes('gemini') ? 'gemini'
                 : hostname.includes('claude')  ? 'claude'
                 : 'chatgpt';

  PromptShield.showPageBadge();
  PromptShield.startObserver(platform);
  attachClickSafetyNet(platform);
})(globalThis);
