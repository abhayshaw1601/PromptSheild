(function (root) {
  const PromptShield = root.PromptShield || (root.PromptShield = {});

  PromptShield.isSanitizing  = false;
  PromptShield.isSubmitting  = false;   // blocks keydown listener during auto-submit

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
  async function injectSanitizedText(inputEl, sanitizedText) {
    PromptShield.isSanitizing = true;

    inputEl.focus();
    moveCursorToEnd(inputEl);

    document.execCommand('selectAll', false, null);
    await wait(30);
    document.execCommand('insertText', false, sanitizedText);
    await wait(30);

    // Notify framework (React/Quill/ProseMirror) — isSanitizing is still true
    // so the interceptor's input listener ignores this synthetic event
    inputEl.dispatchEvent(new InputEvent('input', {
      inputType: 'insertText',
      data: sanitizedText,
      bubbles: true, cancelable: true, composed: true
    }));

    moveCursorToEnd(inputEl);
    await wait(150);

    PromptShield.isSanitizing = false;
  }

  // ─── GEMINI SUBMIT ───────────────────────────────────────────────────────────
  function findGeminiSendButton() {
    const matIcon =
      document.querySelector('mat-icon[fonticon="send"]') ||
      document.querySelector('mat-icon[data-mat-icon-name="send"]');
    if (matIcon) {
      const btn = matIcon.closest('button');
      if (btn) return btn;
    }
    for (const sel of [
      'button[aria-label="Send message"]',
      'button[aria-label="Send prompt"]',
      'button[data-mat-icon-name="send"]',
      'button.send-button',
      'button.mdc-icon-button[aria-label*="send" i]'
    ]) {
      const btn = document.querySelector(sel);
      if (btn) return btn;
    }
    for (const btn of document.querySelectorAll('button')) {
      if ((btn.getAttribute('aria-label') || '').toLowerCase().includes('send')) return btn;
    }
    return null;
  }

  function isGeminiButtonReady(btn) {
    if (!btn) return false;
    if (btn.disabled) return false;
    if (btn.getAttribute('aria-disabled') === 'true') return false;
    return true;
  }

  async function autoSubmitGemini() {
    const inputEl =
      document.querySelector(PromptShield.GEMINI_INPUT_SELECTOR) ||
      document.querySelector(PromptShield.GEMINI_INPUT_SELECTOR_FALLBACK);

    let btn = findGeminiSendButton();
    if (isGeminiButtonReady(btn)) { btn.click(); return; }

    const result = await new Promise((resolve) => {
      let done = false;
      function attempt() {
        if (done) return;
        const b = findGeminiSendButton();
        if (!isGeminiButtonReady(b)) return;
        done = true; btnObs.disconnect(); bodyObs.disconnect(); clearTimeout(timer);
        b.click(); resolve('click');
      }
      const btnObs = new MutationObserver(attempt);
      if (btn) btnObs.observe(btn, { attributes: true, attributeFilter: ['aria-disabled','disabled'] });
      const bodyObs = new MutationObserver(attempt);
      bodyObs.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['aria-disabled','disabled'] });
      const timer = setTimeout(() => {
        if (done) return;
        done = true; btnObs.disconnect(); bodyObs.disconnect(); resolve('timeout');
      }, 3000);
    });

    if (result === 'timeout' && inputEl) {
      // Set isSubmitting so the keydown listener doesn't re-intercept
      PromptShield.isSubmitting = true;
      for (const type of ['keydown', 'keypress', 'keyup']) {
        inputEl.dispatchEvent(new KeyboardEvent(type, {
          key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
          charCode: type === 'keypress' ? 13 : 0,
          bubbles: true, cancelable: true, composed: true
        }));
        await wait(20);
      }
      PromptShield.isSubmitting = false;
    }
  }

  // ─── CLAUDE / CHATGPT SUBMIT ─────────────────────────────────────────────────
  function findReactSendBtn() {
    // Claude's send button — orange circle arrow in the screenshot
    return (
      document.querySelector('button[aria-label="Send Message"]') ||
      document.querySelector('button[aria-label="Send message"]') ||
      document.querySelector('button[data-testid="send-button"]') ||
      document.querySelector('button[aria-label="Send"]') ||
      // broad: any enabled button whose aria-label contains "send"
      (() => {
        for (const btn of document.querySelectorAll('button')) {
          const label = (btn.getAttribute('aria-label') || '').toLowerCase();
          if (label.includes('send') && !btn.disabled) return btn;
        }
        return null;
      })()
    );
  }

  async function autoSubmitReact(platform) {
    // Check immediately
    let btn = findReactSendBtn();
    if (btn && !btn.disabled) { btn.click(); return; }

    // Watch for the button to become enabled via MutationObserver (no polling loop)
    const inputEl = platform === 'claude'
      ? (document.querySelector('div[contenteditable="true"].ProseMirror') ||
         document.querySelector('div[contenteditable="true"][data-placeholder]'))
      : document.querySelector('#prompt-textarea');

    const result = await new Promise((resolve) => {
      let done = false;
      function attempt() {
        if (done) return;
        const b = findReactSendBtn();
        if (!b || b.disabled) return;
        done = true; obs.disconnect(); clearTimeout(timer);
        b.click(); resolve('click');
      }
      const obs = new MutationObserver(attempt);
      obs.observe(document.body, {
        subtree: true, attributes: true,
        attributeFilter: ['disabled', 'aria-disabled']
      });
      const timer = setTimeout(() => {
        if (done) return;
        done = true; obs.disconnect(); resolve('timeout');
      }, 2000);
    });

    if (result === 'timeout' && inputEl) {
      // Guard against re-interception loop
      PromptShield.isSubmitting = true;
      inputEl.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
        bubbles: true, cancelable: true, composed: true
      }));
      await wait(50);
      inputEl.dispatchEvent(new KeyboardEvent('keyup', {
        key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
        bubbles: true, composed: true
      }));
      PromptShield.isSubmitting = false;
    }
  }

  async function autoSubmit(platform) {
    if (platform === 'gemini') return autoSubmitGemini();
    return autoSubmitReact(platform);
  }

  PromptShield.injectSanitizedText = injectSanitizedText;
  PromptShield.autoSubmit          = autoSubmit;
})(globalThis);
