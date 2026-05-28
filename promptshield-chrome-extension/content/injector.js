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

    // Wipe DOM directly — execCommand('delete') is unreliable on Gemini's contenteditable
    inputEl.innerHTML = '';
    inputEl.textContent = '';

    // Tell React the field was cleared
    inputEl.dispatchEvent(new InputEvent('input', {
      inputType: 'deleteContentBackward',
      bubbles: true,
      cancelable: true,
      composed: true
    }));

    await wait(50);

    // Insert sanitized text and sync React state
    document.execCommand('insertText', false, sanitizedText);
    dispatchReactSyncEvents(inputEl, sanitizedText);
    moveCursorToEnd(inputEl);

    await wait(100);
    PromptShield.isSanitizing = false;
  }

  function findSendButton() {
    return (
      document.querySelector('button[aria-label="Send message"]') ||
      document.querySelector('button[aria-label="Send prompt"]') ||
      document.querySelector('[data-testid="send-button"]') ||
      document.querySelector('button[aria-label="Submit message"]')
    );
  }

  function getSubmitInput(platform) {
    if (platform === 'gemini') {
      return document.querySelector(PromptShield.GEMINI_INPUT_SELECTOR);
    }
    return PromptShield.getChatGPTInput ? PromptShield.getChatGPTInput() : null;
  }

  async function autoSubmit(platform) {
    // Check immediately — button is often already enabled right after inject
    let sendBtn = findSendButton();
    if (sendBtn && !sendBtn.disabled) {
      sendBtn.click();
      return 'button';
    }

    const inputEl = getSubmitInput(platform);
    if (inputEl) {
      // Re-fire React sync with the actual current text so Gemini enables the button
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
    }

    // Poll up to 1 s (10 × 100 ms) for the button to become enabled
    for (let i = 0; i < 10; i++) {
      await wait(100);
      sendBtn = findSendButton();
      if (sendBtn && !sendBtn.disabled) {
        sendBtn.click();
        return 'button-retry';
      }
    }

    // Last resort: simulate Enter directly on the input
    if (inputEl) {
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

    return 'failed';
  }

  PromptShield.injectSanitizedText = injectSanitizedText;
  PromptShield.autoSubmit = autoSubmit;
})(globalThis);
