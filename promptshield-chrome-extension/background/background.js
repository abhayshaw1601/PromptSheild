importScripts(
  '../utils/constants.js',
  '../parser/regexPatterns.js',
  '../parser/nerChecker.js',
  '../parser/astParser.js',
  '../parser/parser.js',
  '../utils/masker.js',
  'ollama.js',
  'audit.js'
);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (chrome.runtime.lastError) {
    sendResponse({ error: chrome.runtime.lastError.message });
    return false;
  }

  (async () => {
    if (!message || !message.type) {
      return { error: 'Invalid message' };
    }

    if (message.type === 'SANITIZE_PROMPT') {
      const scan = await PromptShield.scanPrompt(message.text || '');

      if (!scan.hasSensitiveData) {
        return { sanitized: false, text: message.text };
      }

      let sanitizedText = await PromptShield.sanitizeWithOllama(message.text);
      let ollamaUsed = true;

      if (sanitizedText === null) {
        const localResult = PromptShield.maskLocally(message.text, scan.entities);
        sanitizedText = localResult.sanitizedText;
        ollamaUsed = false;
      }

      await PromptShield.logEvent({
        platform: message.platform,
        detectedTypes: scan.detectedTypes,
        wasRedacted: true,
        ollamaUsed,
        entities: scan.entities
      });

      return {
        sanitized: true,
        text: sanitizedText,
        detectedTypes: scan.detectedTypes,
        ollamaUsed,
        fieldCount: scan.entities.length
      };
    }

    if (message.type === 'TRIGGER_SUBMIT') {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: sender.tab.id },
          world: 'MAIN',
          args: [message.platform || 'chatgpt'],
          func: (platform) => {

            // ── Helpers ──────────────────────────────────────────────────────
            function findBtn(selectors) {
              for (const sel of selectors) {
                const el = document.querySelector(sel);
                if (el) return el;
              }
              return null;
            }

            function clickBtn(btn) {
              if (!btn) return false;
              const rect = btn.getBoundingClientRect();
              const cx = rect.left + rect.width / 2;
              const cy = rect.top + rect.height / 2;
              // Full pointer sequence — most reliable in MAIN world
              for (const [type, extra] of [
                ['pointerover',  {}],
                ['pointerenter', {}],
                ['pointerdown',  { button: 0, buttons: 1 }],
                ['mousedown',    { button: 0, buttons: 1 }],
                ['pointerup',    { button: 0 }],
                ['mouseup',      { button: 0 }],
                ['click',        { button: 0 }],
              ]) {
                const Ctor = type.startsWith('pointer') ? PointerEvent : MouseEvent;
                btn.dispatchEvent(new Ctor(type, {
                  bubbles: true, cancelable: true, composed: true,
                  clientX: cx, clientY: cy, ...extra
                }));
              }
              return true;
            }

            // ── ChatGPT ──────────────────────────────────────────────────────
            if (platform === 'chatgpt') {
              const btn = findBtn([
                'button[data-testid="send-button"]',
                'button[aria-label="Send message"]',
                'button[aria-label="Send"]',
              ]);
              console.log('[PS-MAIN] chatgpt btn:', !!btn, 'disabled:', btn && btn.disabled);
              if (btn && !btn.disabled) { clickBtn(btn); return; }

              // React fallback: find the textarea and dispatch Enter
              const ta = document.querySelector('#prompt-textarea') ||
                         document.querySelector('textarea[data-id]');
              if (ta) {
                ta.dispatchEvent(new KeyboardEvent('keydown', {
                  key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
                  bubbles: true, cancelable: true, composed: true
                }));
              }
              return;
            }

            // ── Claude ───────────────────────────────────────────────────────
            if (platform === 'claude') {
              const btn = findBtn([
                'button[aria-label="Send Message"]',
                'button[aria-label="Send message"]',
                'button[data-testid="send-button"]',
              ]);
              console.log('[PS-MAIN] claude btn:', !!btn, 'disabled:', btn && btn.disabled);
              if (btn && !btn.disabled) { clickBtn(btn); return; }

              // ProseMirror fallback: find editor and dispatch Enter
              const editor = document.querySelector('.ProseMirror') ||
                             document.querySelector('div[contenteditable="true"][data-placeholder]');
              if (editor) {
                editor.dispatchEvent(new KeyboardEvent('keydown', {
                  key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
                  bubbles: true, cancelable: true, composed: true
                }));
              }
              return;
            }

            // ── Gemini (Angular) ─────────────────────────────────────────────
            function getAngularComp(el) {
              if (!el) return null;
              const ctx = el.__ngContext__;
              if (!ctx) return null;
              return Array.isArray(ctx) ? ctx[8] : ctx;
            }

            const geminiBtn = findBtn([
              'button[aria-label="Send message"]',
              'button[aria-label="Send prompt"]',
              'button[data-mat-icon-name="send"]',
            ]) || (() => {
              const icon = document.querySelector('mat-icon[fonticon="send"]') ||
                           document.querySelector('mat-icon[data-mat-icon-name="send"]');
              return icon ? icon.closest('button') : null;
            })();

            console.log('[PS-MAIN] gemini btn:', !!geminiBtn,
              'aria-disabled:', geminiBtn && geminiBtn.getAttribute('aria-disabled'));

            if (!geminiBtn) return;

            // Try Angular component method
            let el = geminiBtn;
            for (let i = 0; i < 12 && el; i++, el = el.parentElement) {
              const c = getAngularComp(el);
              if (c) {
                const fn = c.sendMessage || c.submit || c.onSend ||
                           c.handleSend || c.onSubmit || c.send;
                if (typeof fn === 'function') {
                  console.log('[PS-MAIN] angular method at depth', i);
                  fn.call(c);
                  return;
                }
              }
            }

            // Angular pointer sequence
            clickBtn(geminiBtn);
          }
        });
      } catch (e) {
        console.error('[PS] TRIGGER_SUBMIT failed:', e.message);
      }
      return { ok: true };
    }

    if (message.type === 'GET_LOGS') {
      return await PromptShield.getLogs();
    }

    if (message.type === 'CLEAR_LOGS') {
      await PromptShield.clearLogs();
      return { success: true };
    }

    return { error: 'Unknown message type' };
  })()
    .then((response) => sendResponse(response))
    .catch((error) => sendResponse({ error: error.message }));

  return true;
});
