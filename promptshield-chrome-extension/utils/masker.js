(function (root) {
  const PromptShield = root.PromptShield || (root.PromptShield = {});

  const PLACEHOLDERS = {
    API_KEY: '[API-KEY-REDACTED]',
    EMAIL: 'user@redacted.com',
    SSN: 'XXX-XX-XXXX',
    PHONE: '+X-XXX-XXX-XXXX',
    PASSWORD: '[PASSWORD-REDACTED]',
    NAME: '[NAME-REDACTED]',
    DB_CONNECTION: '[DB-URL-REDACTED]',
    IP_ADDRESS: '0.0.0.0',
    CREDIT_CARD: 'XXXX-XXXX-XXXX-XXXX',
    CODE_SECRET: '[SECRET-REDACTED]'
  };

  function maskLocally(text, entities) {
    let sanitizedText = text;
    const mapping = {};

    entities
      .slice()
      .sort((a, b) => b.index - a.index)
      .forEach((entity) => {
        const placeholder = PLACEHOLDERS[entity.type] || '[REDACTED]';
        mapping[entity.value] = placeholder;
        sanitizedText =
          sanitizedText.slice(0, entity.index) +
          placeholder +
          sanitizedText.slice(entity.index + entity.value.length);
      });

    return { sanitizedText, mapping };
  }

  PromptShield.maskLocally = maskLocally;
})(globalThis);
