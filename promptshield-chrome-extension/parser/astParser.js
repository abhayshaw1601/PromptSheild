(function (root) {
  const PromptShield = root.PromptShield || (root.PromptShield = {});

  const TOKEN_PATTERN = /[^\s=:'"`\r\n]+/g;
  const PREFIX_PATTERN = /^(sk-|AIza|AKIA|ghp_)/;
  const MIXED_CASE_NUMBER_PATTERN = /(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{17,}/;
  const CODE_SYMBOL_PATTERN = /[{}();]|=>|\b(?:def|function|class)\b/;

  function hasAssignmentContext(text, index) {
    const context = text.slice(Math.max(0, index - 4), index);
    return /[:=]\s*$/.test(context);
  }

  function scanCodeTokens(text) {
    if (!text) return [];

    const matches = [];
    let match = TOKEN_PATTERN.exec(text);
    while (match) {
      const value = match[0];
      const index = match.index;
      const looksSecret =
        (value.length > 16 && MIXED_CASE_NUMBER_PATTERN.test(value)) ||
        PREFIX_PATTERN.test(value) ||
        (value.length > 16 && hasAssignmentContext(text, index));

      if (looksSecret) {
        matches.push({ type: 'CODE_SECRET', value, index });
      }

      match = TOKEN_PATTERN.exec(text);
    }

    TOKEN_PATTERN.lastIndex = 0;
    return matches;
  }

  function scanForSourceCode(text) {
    const hasMultipleLines = /\r?\n/.test(text || '');
    const hasCodeMarkers = CODE_SYMBOL_PATTERN.test(text || '');
    let language = 'unknown';

    if (/\b(?:function|const|let|var|class)\b|=>/.test(text || '')) {
      language = 'js';
    } else if (/\b(?:def|import|from|class)\b/.test(text || '')) {
      language = 'py';
    }

    return { hasCode: Boolean(hasMultipleLines && hasCodeMarkers), language };
  }

  PromptShield.scanCodeTokens = scanCodeTokens;
  PromptShield.scanForSourceCode = scanForSourceCode;
})(globalThis);
