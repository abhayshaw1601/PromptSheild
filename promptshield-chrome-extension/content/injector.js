(function (root) {
  const PromptShield = root.PromptShield || (root.PromptShield = {});

  PromptShield.isSanitizing = false;

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function moveCursorToEnd(inputEl) {
    try {
      const range = document.createRange();
      const sel = window.getSelection();
      range.selectNodeContents(inputEl);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (e) { /* ignore */ }
  }

  // ─── TEXT INJECTION ──────────────────────────────────────────────────────────
  // Strategy: select-all then execCommand insertText in one shot.
  // This keeps the cursor inside the element so execCommand works,
  // and fires a real InputEvent that Angular's (input) binding picks up.
  async function injectSanitizedText(inputEl, sanitizedText) {
    PromptShield.isSanitizing = true;

    inputEl.focus();
    moveCursorToEnd(inputEl);

    // Select everything currently in the box
    document.execCommand('selectAll', false, null);
    await wait(30);

    // Replace selection with sanitized text — this fires a real InputEvent
    // that Angular's change detection actually responds to
    document.execCommand('insertText', false, sanitizedText);
    await wait(30);

    // Belt-and-suspenders: also fire an InputEvent so Angular's (input) handler runs
    inputEl.dispatchEvent(new InputEvent('input', {
      inputType: 'insertText',
      data: sanitizedText,
      bubbles: true,
      cancelable: true,
      composed: true
    }));

    moveCursorToEnd(inputEl);
    await wait(80);

    PromptShield.isSanitizing = false;
  }

  // ─── SEND BUTTON FINDER ──────────────────────────────────────────────────────
  function findGeminiSendButton() {
    // Try known selectors first
    const candidates = [
      document.querySelector('button[aria-label="Send message"]'),
      document.querySelector('button[aria-label="Send prompt"]'),
      document.querySelector('button[data-mat-icon-name="send"]'),
      document.querySelector('.send-button'),
      document.querySelector('button.mdc-icon-button[aria-label*="send" i]'),
    ];
    for (const btn of candidates) {
      if (btn) return btn;
    }

    // mat-icon fallback
    const matIcon = document.querySelector('mat-icon[fonticon="send"]');
    if (matIcon) {
      const btn = matIcon.closest('button');
      if (btn) return btn;
    }

    // Broad scan — any button whose aria-label mentions "send"
    for (const btn of document.querySelectorAll('button')) {
      if ((btn.getAttribute('aria-label') || '').toLowerCase().includes('send')) return btn;
    }

    return null;
  }

  // Angular uses aria-disabled="true" — NOT the native disabled property
  function isButtonReady(btn) {
    if (!btn) return false;
    if (btn.getAttribute('aria-disabled') === 'true') return false;
    if (btn.disabled) return false;
    return true;
  }

  // ─── AUTO SUBMIT ─────────────────────────────────────────────────────────────
  // Approach: observe the send button's aria-disabled attribute.
  // The moment Angular removes it (= text recognised, button enabled), click.
  // Fallback: if button never becomes ready in 3s, simulate Enter.
  async function autoSubmitGemini() {
    const inputEl = document.querySelector(PromptShield.GEMINI_INPUT_SELECTOR);
    console.log('[PS] autoSubmitGemini — inputEl:', !!inputEl);

    // Check immediately — sometimes the button is already ready
    let btn = findGeminiSendButton();
    console.log('[PS] btn found:', !!btn, '| aria-disabled:', btn && btn.getAttribute('aria-disabled'));

    if (isButtonReady(btn)) {
      console.log('[PS] submit: immediate click');
      btn.click();
      return;
    }

    // Set up MutationObserver BEFORE firing any events,
    // so we don't miss the attribute flip
    const clickResult = await new Promise((resolve) => {
      let resolved = false;

      function tryClick(label) {
        if (resolved) return;
        const b = findGeminiSendButton();
        if (!isButtonReady(b)) return;
        resolved = true;
        cleanup();
        console.log('[PS] submit:', label);
        b.click();
        resolve(label);
      }

      // Watch the button's own aria-disabled
      const btnObserver = btn ? new MutationObserver(() => tryClick('btn-observer')) : null;
      if (btn && btnObserver) {
        btnObserver.observe(btn, { attributes: true, attributeFilter: ['aria-disabled', 'disabled'] });
      }

      // Also watch the whole toolbar area for DOM changes
      // (Gemini sometimes replaces the button element entirely)
      const bodyObserver = new MutationObserver(() => tryClick('body-observer'));
      bodyObserver.observe(document.body, {
        subtree: true,
        attributes: true,
        attributeFilter: ['aria-disabled', 'disabled']
      });

      function cleanup() {
        if (btnObserver) btnObserver.disconnect();
        bodyObserver.disconnect();
        clearTimeout(timer);
      }

      const timer = setTimeout(() => {
        if (resolved) return;
        resolved = true;
        cleanup();
        console.log('[PS] submit: timeout — using Enter fallback');
        resolve('timeout');
      }, 3000);
    });

    if (clickResult === 'timeout' && inputEl) {
      // isSanitizing is false and text is already clean,
      // so the keydown interceptor will see no sensitive data and skip
      console.log('[PS] submit: dispatching Enter sequence');
      for (const type of ['keydown', 'keypress', 'keyup']) {
        inputEl.dispatchEvent(new KeyboardEvent(type, {
          key: 'Enter', code: 'Enter',
          keyCode: 13, which: 13,
          charCode: type === 'keypress' ? 13 : 0,
          bubbles: true, cancelable: true, composed: true
        }));
        await wait(20);
      }
    }
  }

  async function autoSubmit(platform) {
    if (platform === 'gemini') {
      return autoSubmitGemini();
    }
    // ChatGPT — React, native disabled
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
