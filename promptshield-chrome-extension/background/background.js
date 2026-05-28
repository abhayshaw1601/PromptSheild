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
      // Run inside the page's MAIN world so Angular's own methods are accessible.
      // isTrusted is irrelevant here — we call Angular's handler directly.
      try {
        await chrome.scripting.executeScript({
          target: { tabId: sender.tab.id },
          world: 'MAIN',
          func: () => {
            // Strategy 1: find the send button and invoke its Angular click handler
            // via __ngContext__ (Angular 14+ Ivy)
            function findSendBtn() {
              const matIcon =
                document.querySelector('mat-icon[fonticon="send"]') ||
                document.querySelector('mat-icon[data-mat-icon-name="send"]');
              if (matIcon) {
                const btn = matIcon.closest('button');
                if (btn) return btn;
              }
              for (const btn of document.querySelectorAll('button')) {
                const label = (btn.getAttribute('aria-label') || '').toLowerCase();
                if (label.includes('send')) return btn;
              }
              return null;
            }

            function getAngularComponent(el) {
              if (!el) return null;
              // Angular Ivy stores component context on __ngContext__
              const ctx = el.__ngContext__;
              if (!ctx) return null;
              // ctx is an array; the component instance is at index 8
              return Array.isArray(ctx) ? ctx[8] : ctx;
            }

            const btn = findSendBtn();
            console.log('[PS-MAIN] btn:', !!btn, 'aria-disabled:', btn && btn.getAttribute('aria-disabled'));

            if (!btn) return;

            // Try Angular component method first
            const comp = getAngularComponent(btn);
            if (comp) {
              const submitFn = comp.sendMessage || comp.submit || comp.onSend || comp.handleSend;
              if (typeof submitFn === 'function') {
                console.log('[PS-MAIN] calling Angular component method');
                submitFn.call(comp);
                return;
              }
            }

            // Walk up the DOM looking for a component with a submit method
            let el = btn.parentElement;
            for (let i = 0; i < 10 && el; i++, el = el.parentElement) {
              const c = getAngularComponent(el);
              if (c) {
                const fn = c.sendMessage || c.submit || c.onSend || c.handleSend || c.onSubmit;
                if (typeof fn === 'function') {
                  console.log('[PS-MAIN] calling parent Angular component method at depth', i);
                  fn.call(c);
                  return;
                }
              }
            }

            // Strategy 2: dispatch a PointerEvent (more trusted-like than MouseEvent)
            // then a click — inside MAIN world this sometimes works
            console.log('[PS-MAIN] falling back to pointer+click sequence');
            const rect = btn.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;

            btn.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, clientX: cx, clientY: cy }));
            btn.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true, clientX: cx, clientY: cy }));
            btn.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: cx, clientY: cy }));
            btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: cx, clientY: cy, button: 0 }));
            btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: cx, clientY: cy, button: 0 }));
            btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: cx, clientY: cy, button: 0 }));
            btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: cx, clientY: cy, button: 0 }));
            btn.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: cx, clientY: cy, button: 0 }));
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
