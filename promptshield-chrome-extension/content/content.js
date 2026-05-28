(function (root) {
  const PromptShield = root.PromptShield || (root.PromptShield = {});
  let keydownAttached = false;
  let clickAttached = false;

  // ─── STRATEGY ────────────────────────────────────────────────────────────────
  // Gemini ignores synthetic clicks and keyboard events (isTrusted: false).
  // The ONLY trusted events are ones the user actually fires.
  //
  // So we flip the model:
  //   • On typing pause (debounce) → sanitize silently in background, inject
  //     clean text into the box. User sees masked text. isSanitizing = false.
  //   • When user hits Enter (or clicks send) → text is already clean →
  //     we DON'T intercept → Gemini's own handler fires with the clean text ✅
  //
  // The keydown/click safety nets below are ONLY a last-resort fallback for
  // the case where the user submits before the debounce fires (very fast typist).
  // In that case we DO intercept, sanitize, inject, then wait for the user to
  // hit Enter again (we show a toast telling them to send).
  // ─────────────────────────────────────────────────────────────────────────────

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
        if (!shouldHandleSensitiveSubmit(inputEl)) {
          // Text is already clean — let Gemini's own handler fire ✅
          return;
        }

        // Text is NOT clean yet — block this submit, sanitize, then
        // tell user to hit Enter again (we can't fire a trusted event)
        event.preventDefault();
        event.stopImmediatePropagation();
        PromptShield.clearDebounceTimer();

        // Sanitize and inject — after this the box has clean text
        await PromptShield.runPipeline(inputEl, platform, { autoSubmit: false });

        // Tell user the text is clean and ready to send
        PromptShield.showToast('🛡️ Masked · press Enter to send', 'warning');
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
        if (!shouldHandleSensitiveSubmit(inputEl)) {
          // Already clean — let Gemini handle the click ✅
          return;
        }

        // Block this click, sanitize, user must click send again
        event.preventDefault();
        event.stopImmediatePropagation();
        PromptShield.clearDebounceTimer();

        await PromptShield.runPipeline(inputEl, platform, { autoSubmit: false });
        PromptShield.showToast('🛡️ Masked · click Send to continue', 'warning');
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
