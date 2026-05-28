(function (root) {
  const PromptShield = root.PromptShield || (root.PromptShield = {});

  PromptShield.isSanitizing = false;

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function dispatchReactSyncEvents(inputEl, text) {
    inputEl.dispatchEvent(new Event('focus', { bubbles: true }));
    inputEl.dispatchEvent(
      new InputEvent('input', {
        inputType: 'insertText',
        data: text,
        bubbles: true,
        cancelable: true,
        composed: true
      })
    );
    inputEl.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function moveCursorToEnd(inputEl) {
    const range = document.createRange();
    const selection = window.getSelection();

    range.selectNodeContents(inputEl);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  async function injectSanitizedText(inputEl, sanitizedText) {
    PromptShield.isSanitizing = true;

    inputEl.focus();
    document.execCommand('selectAll', false, null);
    document.execCommand('delete', false, null);

    await wait(50);

    document.execCommand('insertText', false, sanitizedText);
    dispatchReactSyncEvents(inputEl, sanitizedText);
    moveCursorToEnd(inputEl);

    await wait(100);
    PromptShield.isSanitizing = false;
  }

  function findSendButton(includeSubmitMessage = true) {
    return (
      document.querySelector('button[aria-label="Send message"]') ||
      document.querySelector('button[aria-label="Send prompt"]') ||
      document.querySelector('[data-testid="send-button"]') ||
      (includeSubmitMessage ? document.querySelector('button[aria-label="Submit message"]') : null)
    );
  }

  function getSubmitInput(platform) {
    if (platform === 'gemini') {
      return document.querySelector(PromptShield.GEMINI_INPUT_SELECTOR);
    }

    return PromptShield.getChatGPTInput ? PromptShield.getChatGPTInput() : null;
  }

  async function autoSubmit(platform) {
    await wait(200);

    // First attempt — button may already be enabled
    const sendBtn = findSendButton(true);
    if (sendBtn && !sendBtn.disabled) {
      sendBtn.click();
      return 'button';
    }

    const inputEl = getSubmitInput(platform);
    if (!inputEl) return 'failed';

    // Re-fire the full React sync event chain with the current text,
    // so Gemini's internal state recognises the injected content
    const currentText = inputEl.innerText || inputEl.textContent || '';
    inputEl.dispatchEvent(new Event('focus', { bubbles: true }));
    inputEl.dispatchEvent(
      new InputEvent('input', {
        inputType: 'insertText',
        data: currentText,
        bubbles: true,
        cancelable: true,
        composed: true
      })
    );
    inputEl.dispatchEvent(new Event('change', { bubbles: true }));

    // Poll for up to 1 second (10 × 100 ms) for the button to become enabled
    for (let i = 0; i < 10; i++) {
      await wait(100);
      const retryBtn = findSendButton(true);
      if (retryBtn && !retryBtn.disabled) {
        retryBtn.click();
        return 'button-retry';
      }
    }

    // Last resort — simulate Enter on the input element
    inputEl.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true,
        composed: true
      })
    );

    await wait(50);

    inputEl.dispatchEvent(
      new KeyboardEvent('keyup', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true,
        composed: true
      })
    );

    return 'keydown';
  }

  PromptShield.injectSanitizedText = injectSanitizedText;
  PromptShield.autoSubmit = autoSubmit;
})(globalThis);
