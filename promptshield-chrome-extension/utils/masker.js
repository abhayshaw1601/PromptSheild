(function (root) {
  const PromptShield = root.PromptShield || (root.PromptShield = {});

  const PLACEHOLDERS = {
    // PII
    API_KEY:         '[API-KEY-REDACTED]',
    EMAIL:           'user@redacted.com',
    SSN:             'XXX-XX-XXXX',
    PHONE:           '+X-XXX-XXX-XXXX',
    IP_ADDRESS:      '0.0.0.0',
    IPV6:            '::redacted',
    DOB:             '[DOB-REDACTED]',
    PASSPORT:        '[PASSPORT-REDACTED]',
    DRIVERS_LICENSE: '[DL-REDACTED]',

    // Credentials
    PASSWORD:        '[PASSWORD-REDACTED]',
    DB_CONNECTION:   '[DB-URL-REDACTED]',
    NAME:            '[NAME-REDACTED]',
    CODE_SECRET:     '[SECRET-REDACTED]',

    // Financial
    CREDIT_CARD:     'XXXX-XXXX-XXXX-XXXX',
    BANK_ACCOUNT:    '[ACCOUNT-REDACTED]',
    ROUTING_NUMBER:  '[ROUTING-REDACTED]',
    IBAN:            '[IBAN-REDACTED]',
    SWIFT:           '[SWIFT-REDACTED]',
    EIN:             '[EIN-REDACTED]',

    // PHI
    MRN:             '[MRN-REDACTED]',
    NPI:             '[NPI-REDACTED]',
    INSURANCE_ID:    '[INSURANCE-ID-REDACTED]',
    ICD10:           '[DIAGNOSIS-REDACTED]',
    MEDICATION:      '[MEDICATION-REDACTED]',
    LAB_VALUE:       '[LAB-VALUE-REDACTED]'
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

  PromptShield.PLACEHOLDERS = PLACEHOLDERS;
  PromptShield.maskLocally = maskLocally;
})(globalThis);
