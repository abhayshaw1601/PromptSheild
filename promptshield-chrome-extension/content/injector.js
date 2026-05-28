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

  // ─── INJECTION ───────────────────────────────────────────────────────────────
  // Gemini uses Quill editor. Quill listens to real DOM mutations + InputEvents.
  // Strategy:
  //   1. Focus the editor
  //   2. Select all existing text (execCommand selectAll)
  //   3. Replace with sanitized text (execCommand insertText)
  //      — this fires a real InputEvent that Quill's internals pick up
  //   4. Fire an extra InputEvent for belt-and-suspenders
  async function injectSanitizedText(inputEl, sanitizedText) {
    PromptShield.isSanitizing = true;

    inputEl.focus();
    moveCursorToEnd(inputEl);

    // Select all and replace in one execCommand — keeps Quill's model in sync
    document.execCommand('selectAll', false, null);
    await wait(30);
    document.execCommand('insertText', false, sanitizedText);
    await wait(30);

    // Extra InputEvent so Angular/Quill change detection definitely fires
    inputEl.dispatchEvent(new InputEvent('input', {
      inputType: 'insertText',
      data: sanitizedText,
      bubbles: true,
      cancelable: true,
      composed: true
    }));

    moveCursorToEnd(inputEl);

    // Wait for Quill + Angular to process and enable the send button
    await wait(150);

    PromptShield.isSanitizing = false;
  }

  // ─── SEND BUTTON ─────────────────────────────────────────────────────────────
  // From DevTools: the send button contains a mat-icon with class "lumi-symbols"
  // and the button itself has aria-label containing "send" (case-insensitive).
  // When input is empty: aria-disabled="true" on the button.
  // When input has text: aria-disabled attribute is removed entirely.
  function findGeminiSendButton() {
    // Most reliable: mat-icon with send glyph → walk up to button
    const matIcon =
      document.querySelector('mat-icon[fonticon="send"]') ||
      document.querySelector('mat-icon[data-mat-icon-name="send"]');
    if (matIcon) {
      const btn = matIcon.closest('button');
      if (btn) return btn;
    }

    // Fallback: button with aria-label containing "send"
    const byLabel = [
      'button[aria-label="Send message"]',
      'button[aria-label="Send prompt"]',
      'button[data-mat-icon-name="send"]',
      'button.send-button',
      'button.mdc-icon-button[aria-label*="send" i]'
    ];
    for (const sel of byLabel) {
      const btn = document.querySelector(sel);
      if (btn) return btn;
    }

    // Broad scan
    for (const btn of document.querySelectorAll('button')) {
      const label = (btn.getAttribute('aria-label') || '').toLowerCase();
      if (label.includes('send')) return btn;
    }

    return null;
  }

  // Gemini: button is ready when aria-disabled is absent or not "true"
  function isButtonReady(btn) {
    if (!btn) return false;
    if (btn.disabled) return false;
    if (btn.getAttribute('aria-disabled') === 'true') return false;
    return true;
  }

  // ─── AUTO SUBMIT ─────────────────────────────────────────────────────────────
  // Watch aria-disabled on the send button via MutationObserver.
  // Click the instant it becomes ready. Fallback to Enter after 3s.
  async function autoSubmitGemini() {
    const inputEl = document.querySelector(PromptShield.GEMINI_INPUT_SELECTOR);
    console.log('[PS] autoSubmitGemini — inputEl:', !!inputEl);

    // Check immediately first
    let btn = findGeminiSendButton();
    console.log('[PS] btn:', !!btn, 'aria-disabled:', btn && btn.getAttribute('aria-disabled'));

    if (isButtonReady(btn)) {
      console.log('[PS] submit: immediate click');
      btn.click();
      return;
    }

    // Observe the button (and whole body as fallback) for aria-disabled removal
    const result = await new Promise((resolve) => {
      let done = false;

      function attempt(label) {
        if (done) return;
        const b = findGeminiSendButton();
        if (!isButtonReady(b)) return;
        done = true;
        btnObs.disconnect();
        bodyObs.disconnect();
        clearTimeout(timer);
        console.log('[PS] submit:', label);
        b.click();
        resolve(label);
      }

      // Watch the specific button element
      const btnObs = new MutationObserver(() => attempt('btn-observer'));
      if (btn) {
        btnObs.observe(btn, {
          attributes: true,
          attributeFilter: ['aria-disabled', 'disabled']
        });
      }

      // Watch body-level attribute changes (catches element replacement)
      const bodyObs = new MutationObserver(() => attempt('body-observer'));
      bodyObs.observe(document.body, {
        subtree: true,
        attributes: true,
        attributeFilter: ['aria-disabled', 'disabled']
      });

      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        btnObs.disconnect();
        bodyObs.disconnect();
        console.log('[PS] submit: 3s timeout');
        resolve('timeout');
      }, 3000);
    });

    if (result === 'timeout' && inputEl) {
      // Text is already clean — keydown interceptor will see no sensitive data
      // and skip, so no loop risk
      console.log('[PS] submit: Enter fallback');
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
    // ChatGPT — React, native disabled attribute
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
