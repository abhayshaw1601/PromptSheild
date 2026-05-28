(function (root) {
  const PromptShield = root.PromptShield || (root.PromptShield = {});

  function getChatGPTInput() {
    return (
      document.querySelector('#prompt-textarea') ||
      document.querySelector('div[contenteditable="true"][data-id="root"]') ||
      document.querySelector('div[contenteditable="true"][tabindex="0"]') ||
      document.querySelector('div[contenteditable="true"]') ||
      null
    );
  }

  function getInputElement(platform) {
    if (platform === 'gemini') {
      return document.querySelector(PromptShield.GEMINI_INPUT_SELECTOR);
    }

    return getChatGPTInput();
  }

  function attachIfReady(platform) {
    const inputEl = getInputElement(platform);
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
      subtree: true,
      attributes: false
    });
  }

  PromptShield.getChatGPTInput = getChatGPTInput;
  PromptShield.getInputElement = getInputElement;
  PromptShield.startObserver = startObserver;
})(globalThis);
