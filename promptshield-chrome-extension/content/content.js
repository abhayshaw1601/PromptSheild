(function () {
  const platform = window.location.hostname.includes('gemini') ? 'gemini' : 'chatgpt';
  PromptShield.startObserver(platform);
})();
