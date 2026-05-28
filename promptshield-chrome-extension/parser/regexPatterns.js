(function (root) {
  const PromptShield = root.PromptShield || (root.PromptShield = {});

  const PATTERNS = {
    API_KEY: [
      /sk-[a-zA-Z0-9]{32,}/g,
      /AIza[0-9A-Za-z\-_]{35}/g,
      /AKIA[0-9A-Z]{16}/g,
      /(?:aws_secret|secret_key)\s*=\s*\S+/gi,
      /ghp_[a-zA-Z0-9]{36}/g,
      /(?:api[_-]?key|token|secret)\s*[:=]\s*['"]?[\w\-]{8,}['"]?/gi
    ],
    EMAIL: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,
    SSN: /\b\d{3}-\d{2}-\d{4}\b/g,
    PHONE: /(?:\+?\d{1,3}[\s\-]?)?\(?\d{3}\)?[\s\-]?\d{3}[\s\-]?\d{4}/g,
    PASSWORD: /(?:password|passwd|pwd)\s*[:=]\s*['"]?\S+['"]?/gi,
    DB_CONNECTION: /(?:mongodb|postgresql|mysql|redis):\/\/[^\s]+/gi,
    IP_ADDRESS: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    CREDIT_CARD: /\b(?:\d[ -]?){13,16}\b/g
  };

  function scanWithRegex(text) {
    if (!text) return [];

    const matches = [];
    Object.keys(PATTERNS).forEach((type) => {
      const patternGroup = Array.isArray(PATTERNS[type]) ? PATTERNS[type] : [PATTERNS[type]];

      patternGroup.forEach((pattern) => {
        pattern.lastIndex = 0;
        let match = pattern.exec(text);
        while (match) {
          matches.push({ type, value: match[0], index: match.index });
          match = pattern.exec(text);
        }
      });
    });

    return matches;
  }

  PromptShield.PATTERNS = PATTERNS;
  PromptShield.scanWithRegex = scanWithRegex;
})(globalThis);
