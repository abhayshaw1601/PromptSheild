(function (root) {
  const PromptShield = root.PromptShield || (root.PromptShield = {});
  let keydownAttached = false;

  function attachKeydownSafetyNet(platform) {
    if (keydownAttached) return;
    keydownAttached = true;

    document.addEventListener(
      'keydown',
      async (event) => {
        if (event.key !== 'Enter' || event.shiftKey) return;
        if (PromptShield.isSanitizing) return;

        const inputEl = PromptShield.getInputElement(platform);
        if (!inputEl || !document.contains(inputEl)) return;

        const rawText = inputEl.innerText.trim();
        if (!rawText || rawText.length < 4) return;

        event.preventDefault();
        event.stopImmediatePropagation();
        PromptShield.clearDebounceTimer();

        const response = await PromptShield.runPipeline(inputEl, platform);
        setTimeout(() => {
          PromptShield.clickSendButton();
        }, response && response.sanitized ? 150 : 0);
      },
      true
    );
  }

  const platform = window.location.hostname.includes('gemini') ? 'gemini' : 'chatgpt';
  PromptShield.showPageBadge();
  PromptShield.startObserver(platform);
  attachKeydownSafetyNet(platform);
  PromptShield.attachKeydownSafetyNet = attachKeydownSafetyNet;
})(globalThis);
