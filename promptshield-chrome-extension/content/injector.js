(function (root) {
  const PromptShield = root.PromptShield || (root.PromptShield = {});

  PromptShield.isSanitizing = false;

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function moveCursorToEnd(inputEl) {
    const range = document.createRange();
    const selection = window.getSelection();
    range.selectNodeContents(inputEl);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  // Exact event sequence Angular needs to update its internal model
  function triggerAngularUpdate(inputEl, text) {
    inputEl.dispatchEvent(new Event('focus', { bubbles: true }));
    inputEl.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'a', code: 'KeyA', keyCode: 65, which: 65,
      bubbles: true, cancelable: true, composed: true
    }));
    inputEl.dispatchEvent(new InputEvent('input', {
      inputType: 'insertText',
      data: text,
      bubbles: true, cancelable: true, composed: true
    }));
    inputEl.dispatchEvent(new KeyboardEvent('keyup', {
      key: 'a', code: 'KeyA', keyCode: 65, which: 65,
      bubbles: true, cancelable: true, composed: true
    }));
    inputEl.dispatchEvent(new Event('change', { bubbles: true }));
  }

  async function injectSanitizedText(inputEl, sanitizedText) {
    PromptShield.isSanitizing = true;

    inputEl.focus();
    inputEl.innerHTML = '';
    inputEl.textContent = '';

    inputEl.dispatchEvent(new InputEvent('input', {
      inputType: 'deleteContentBackward',
      bubbles: true, cancelable: true, composed: true
    }));

    await wait(50);

    document.execCommand('insertText', false, sanitizedText);
    triggerAngularUpdate(inputEl, sanitizedText);
    moveCursorToEnd(inputEl);

    await wait(100);
    PromptShield.isSanitizing = false;
  }

  function findGeminiSendButton() {
    const selectors = [
      'button[aria-label="Send message"]',
      'button[aria-label="Send prompt"]',
      'button[data-mat-icon-name="send"]',
      '.send-button',
      'button.mdc-icon-button[aria-label*="send" i]'
    ];
    for (const sel of selectors) {
      const btn = document.querySelector(sel);
      if (btn) return btn;
    }
    const matIcon = document.querySelector('mat-icon[fonticon="send"]');
    if (matIcon) return matIcon.closest('button');

    for (const btn of document.querySelectorAll('button')) {
      if ((btn.getAttribute('aria-label') || '').toLowerCase().includes('send')) return btn;
    }
    return null;
  }

  function isButtonReady(btn) {
    return btn && btn.getAttribute('aria-disabled') !== 'true';
  }

  // Watch the button's aria-disabled attribute and click the moment Angular enables it.
  // Resolves as soon as the click fires, or after timeoutMs if it never becomes ready.
  function waitForButtonAndClick(timeoutMs) {
    return new Promise((resolve) => {
      const btn = findGeminiSendButton();

      // Already ready — click immediately
      if (isButtonReady(btn)) {
        console.log('[PS] submit: button already ready, clicking now');
        btn.click();
        resolve('immediate');
        return;
      }

      if (!btn) {
        console.log('[PS] submit: no send button found');
        resolve('no-button');
        return;
      }

      console.log('[PS] submit: button aria-disabled, watching for change...');

      // Observe aria-disabled on the button itself
      const observer = new MutationObserver(() => {
        if (isButtonReady(btn)) {
          observer.disconnect();
          clearTimeout(timer);
          console.log('[PS] submit: aria-disabled removed, clicking');
          btn.click();
          resolve('observer-click');
        }
      });

      observer.observe(btn, { attributes: true, attributeFilter: ['aria-disabled'] });

      // Also watch the button's parent in case Gemini swaps the element entirely
      const parentObserver = new MutationObserver(() => {
        const freshBtn = findGeminiSendButton();
        if (isButtonReady(freshBtn)) {
          observer.disconnect();
          parentObserver.disconnect();
          clearTimeout(timer);
          console.log('[PS] submit: fresh button ready, clicking');
          freshBtn.click();
          resolve('parent-observer-click');
        }
      });

      if (btn.parentElement) {
        parentObserver.observe(btn.parentElement, { childList: true, subtree: true, attributes: true });
      }

      const timer = setTimeout(() => {
        observer.disconnect();
        parentObserver.disconnect();
        console.log('[PS] submit: timeout reached, trying Enter fallback');
        resolve('timeout');
      }, timeoutMs);
    });
  }

  async function autoSubmitGemini() {
    const inputEl = document.querySelector(PromptShield.GEMINI_INPUT_SELECTOR);
    console.log('[PS] autoSubmitGemini started, inputEl:', !!inputEl);

    // Fire Angular update so it recognises the injected text and enables the button
    if (inputEl) {
      triggerAngularUpdate(inputEl, inputEl.innerText || inputEl.textContent || '');
    }

    // Wait for the button to become ready (up to 3s), click the instant it does
    const result = await waitForButtonAndClick(3000);
    console.log('[PS] waitForButtonAndClick result:', result);

    if (result === 'timeout' && inputEl) {
      // Nuclear fallback — text is already clean so the keydown interceptor won't re-trigger
      ['keydown', 'keypress', 'keyup'].forEach((type) => {
        inputEl.dispatchEvent(new KeyboardEvent(type, {
          key: 'Enter', code: 'Enter',
          keyCode: 13, which: 13,
          charCode: type === 'keypress' ? 13 : 0,
          bubbles: true, cancelable: true, composed: true
        }));
      });
    }
  }

  async function autoSubmit(platform) {
    if (platform === 'gemini') {
      return autoSubmitGemini();
    }
    // ChatGPT — React uses native disabled
    await wait(200);
    const btn =
      document.querySelector('button[aria-label="Send message"]') ||
      document.querySelector('button[data-testid="send-button"]');
    if (btn && !btn.disabled) btn.click();
  }

  PromptShield.injectSanitizedText = injectSanitizedText;
  PromptShield.autoSubmit = autoSubmit;
  PromptShield.autoSubmitGemini = autoSubmitGemini;
})(globalThis);
