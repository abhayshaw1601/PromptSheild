(function (root) {
  const PromptShield = root.PromptShield || (root.PromptShield = {});

  PromptShield.isSanitizing = false;

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function moveCursorToEnd(inputEl) {
    try {
      const range = document.createRange();
      const sel   = window.getSelection();
      range.selectNodeContents(inputEl);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (e) { /* ignore */ }
  }

  // ─── TEXT INJECTION ──────────────────────────────────────────────────────────
  // Works for Quill (Gemini), ProseMirror (Claude), and React textarea (ChatGPT).
  // execCommand fires a real browser InputEvent that all three frameworks respond to.
  async function injectSanitizedText(inputEl, sanitizedText) {
    PromptShield.isSanitizing = true;

    inputEl.focus();
    moveCursorToEnd(inputEl);

    document.execCommand('selectAll', false, null);
    await wait(30);
    document.execCommand('insertText', false, sanitizedText);
    await wait(30);

    // Belt-and-suspenders: explicit InputEvent while isSanitizing is still true
    // so the interceptor's input listener ignores it
    inputEl.dispatchEvent(new InputEvent('input', {
      inputType: 'insertText',
      data: sanitizedText,
      bubbles: true, cancelable: true, composed: true
    }));

    moveCursorToEnd(inputEl);
    await wait(150);

    PromptShield.isSanitizing = false;
  }

  PromptShield.injectSanitizedText = injectSanitizedText;
})(globalThis);
