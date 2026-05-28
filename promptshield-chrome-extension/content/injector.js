(function (root) {
  const PromptShield = root.PromptShield || (root.PromptShield = {});

  PromptShield.isSanitizing = false;

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function injectSanitizedText(inputEl, sanitizedText) {
    PromptShield.isSanitizing = true;
    inputEl.focus();
    document.execCommand('selectAll');
    document.execCommand('insertText', false, sanitizedText);
    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    inputEl.dispatchEvent(new Event('change', { bubbles: true }));
    await wait(100);
    PromptShield.isSanitizing = false;
  }

  async function autoSubmit(platform) {
    return new Promise((resolve) => {
      setTimeout(() => {
        const sendBtn =
          document.querySelector('button[aria-label="Send message"]') ||
          document.querySelector('button[aria-label="Send prompt"]') ||
          document.querySelector('[data-testid="send-button"]') ||
          document.querySelector('button[aria-label="Submit message"]');

        if (sendBtn && !sendBtn.disabled) {
          sendBtn.click();
          resolve('button');
          return;
        }

        const inputEl = PromptShield.getInputElement
          ? PromptShield.getInputElement(platform)
          : document.querySelector(PromptShield.GEMINI_INPUT_SELECTOR);

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
          resolve('keydown');
          return;
        }

        resolve('failed');
      }, 200);
    });
  }

  PromptShield.injectSanitizedText = injectSanitizedText;
  PromptShield.autoSubmit = autoSubmit;
})(globalThis);
