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
