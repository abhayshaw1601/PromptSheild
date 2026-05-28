(function (root) {
  const PromptShield = root.PromptShield || (root.PromptShield = {});
  const AUDIT_KEY = 'ps_audit_logs';
  const MAX_LOGS = 500;

  function getStorage(keys) {
    return new Promise((resolve) => {
      chrome.storage.local.get(keys, (result) => {
        if (chrome.runtime.lastError) {
          resolve({});
          return;
        }
        resolve(result || {});
      });
    });
  }

  function setStorage(data) {
    return new Promise((resolve) => {
      chrome.storage.local.set(data, () => {
        resolve(!chrome.runtime.lastError);
      });
    });
  }

  function removeStorage(key) {
    return new Promise((resolve) => {
      chrome.storage.local.remove(key, () => {
        resolve(!chrome.runtime.lastError);
      });
    });
  }

  async function logEvent(data) {
    const result = await getStorage(AUDIT_KEY);
    const logs = Array.isArray(result[AUDIT_KEY]) ? result[AUDIT_KEY] : [];
    logs.push({
      id: Date.now(),
      timestamp: new Date().toISOString(),
      platform: data.platform,
      detectedTypes: data.detectedTypes,
      wasRedacted: data.wasRedacted,
      ollamaUsed: data.ollamaUsed,
      fieldCount: data.entities.length
    });

    const trimmedLogs = logs.length > MAX_LOGS ? logs.slice(logs.length - MAX_LOGS) : logs;
    await setStorage({ [AUDIT_KEY]: trimmedLogs });
  }

  async function getLogs() {
    const result = await getStorage(AUDIT_KEY);
    return Array.isArray(result[AUDIT_KEY]) ? result[AUDIT_KEY] : [];
  }

  async function clearLogs() {
    await removeStorage(AUDIT_KEY);
  }

  PromptShield.logEvent = logEvent;
  PromptShield.getLogs = getLogs;
  PromptShield.clearLogs = clearLogs;
})(globalThis);
