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

  PromptShield.injectSanitizedText = injectSanitizedText;
})(globalThis);
