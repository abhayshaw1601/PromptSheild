(function (root) {
  const PromptShield = root.PromptShield || (root.PromptShield = {});

  function getSelector(platform) {
    if (platform === 'gemini') return PromptShield.GEMINI_INPUT_SELECTOR;
    return PromptShield.CHATGPT_INPUT_SELECTOR;
  }

  function attachIfReady(platform) {
    const inputEl = document.querySelector(getSelector(platform));
    if (inputEl && !inputEl.dataset.psAttached) {
      inputEl.dataset.psAttached = 'true';
      PromptShield.attachInterceptor(inputEl, platform);
    }
  }

  function startObserver(platform) {
    attachIfReady(platform);

    const observer = new MutationObserver(() => {
      attachIfReady(platform);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  PromptShield.startObserver = startObserver;
})(globalThis);
