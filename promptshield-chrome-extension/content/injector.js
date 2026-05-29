(function (root) {
  const PromptShield = root.PromptShield || (root.PromptShield = {});

  // Two flags — both must be false before any pipeline step runs
  PromptShield.isSanitizing = false;  // true during text injection
  PromptShield.isSubmitting = false;  // true during auto-submit event dispatch

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

  // ─── INJECTION ───────────────────────────────────────────────────────────────
  // Does NOT dispatch any extra events — autoSubmit handles all event dispatching.
  // isSanitizing is cleared here; isSubmitting is set by autoSubmit immediately after.
  async function injectSanitizedText(inputEl, sanitizedText) {
    PromptShield.isSanitizing = true;

    inputEl.focus();
    document.execCommand('selectAll', false, null);
    document.execCommand('delete', false, null);
    await wait(50);
    document.execCommand('insertText', false, sanitizedText);

    moveCursorToEnd(inputEl);
    await wait(100);

    PromptShield.isSanitizing = false;
    // isSubmitting will be set by the caller (runPipeline) before autoSubmit fires
  }

  PromptShield.injectSanitizedText = injectSanitizedText;
})(globalThis);
