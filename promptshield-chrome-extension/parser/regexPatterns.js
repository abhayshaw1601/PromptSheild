(function (root) {
  const PromptShield = root.PromptShield || (root.PromptShield = {});

  const PATTERNS = {
    // ── API / Secrets ──────────────────────────────────────────────────────────
    API_KEY: [
      /sk-[a-zA-Z0-9]{32,}/g,
      /AIza[0-9A-Za-z\-_]{35}/g,
      /AKIA[0-9A-Z]{16}/g,
      /(?:aws_secret|secret_key)\s*=\s*\S+/gi,
      /ghp_[a-zA-Z0-9]{36}/g,
      /(?:api[_-]?key|token|secret)\s*[:=]\s*['"]?[\w\-]{8,}['"]?/gi
    ],

    // ── PII ────────────────────────────────────────────────────────────────────
    EMAIL:    /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,
    PHONE:    /(?:\+?\d{1,3}[\s\-]?)?\(?\d{3}\)?[\s\-]?\d{3}[\s\-]?\d{4}/g,
    IP_ADDRESS: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    IPV6:     /\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b/g,

    // SSN — with and without dashes
    SSN: [
      /\b\d{3}-\d{2}-\d{4}\b/g,
      /\b(?!000|666|9\d{2})\d{3}(?!00)\d{2}(?!0000)\d{4}\b/g
    ],

    // Date of birth — common formats
    DOB: [
      /\b(?:0?[1-9]|1[0-2])\/(?:0?[1-9]|[12]\d|3[01])\/(?:19|20)\d{2}\b/g,  // MM/DD/YYYY
      /\b(?:19|20)\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])\b/g,       // YYYY-MM-DD
      /\b(?:0?[1-9]|[12]\d|3[01])[.\-](?:0?[1-9]|1[0-2])[.\-](?:19|20)\d{2}\b/g // DD-MM-YYYY
    ],

    // Passport numbers (US + generic international)
    PASSPORT: /\b[A-Z]{1,2}[0-9]{6,9}\b/g,

    // Driver's license — US generic pattern
    DRIVERS_LICENSE: /\b[A-Z]{1,2}\d{5,8}\b/g,

    // ── Credentials ────────────────────────────────────────────────────────────
    PASSWORD:      /(?:password|passwd|pwd)\s*[:=]\s*['"]?\S+['"]?/gi,
    DB_CONNECTION: /(?:mongodb|postgresql|mysql|redis|mssql|oracle):\/\/[^\s]+/gi,

    // ── Financial ──────────────────────────────────────────────────────────────
    CREDIT_CARD: /\b(?:\d[ -]?){13,16}\b/g,

    // Bank account number (8–17 digits, standalone)
    BANK_ACCOUNT: /\b\d{8,17}\b/g,

    // ABA routing number (exactly 9 digits starting with 0-3)
    ROUTING_NUMBER: /\b[0-3]\d{8}\b/g,

    // IBAN — up to 34 alphanumeric chars after 2-letter country code
    IBAN: /\b[A-Z]{2}\d{2}[A-Z0-9]{4,30}\b/g,

    // SWIFT / BIC code
    SWIFT: /\b[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?\b/g,

    // US Employer Identification Number (EIN)  XX-XXXXXXX
    EIN: /\b\d{2}-\d{7}\b/g,

    // ── PHI (HIPAA) ────────────────────────────────────────────────────────────
    // Medical Record Number — MRN followed by digits
    MRN: /\b(?:MRN|mrn|medical[_\s]?record)[:\s#]*\d{5,12}\b/gi,

    // National Provider Identifier (NPI) — exactly 10 digits
    NPI: /\b\d{10}\b/g,

    // Health insurance member / policy ID
    INSURANCE_ID: /\b(?:member|policy|insurance|subscriber)[_\s]?(?:id|no|number|#)[:\s]*[A-Z0-9\-]{6,20}\b/gi,

    // ICD-10 diagnosis codes  e.g. A00.0, Z23, M54.5
    ICD10: /\b[A-TV-Z][0-9][0-9A-Z](?:\.[0-9A-Z]{1,4})?\b/g,

    // Drug / medication names followed by dosage
    MEDICATION: /\b(?:prescribed?|taking|medication|drug|dose)[:\s]+[A-Za-z][A-Za-z\s]{2,30}\d*\s*(?:mg|mcg|ml|units?)\b/gi,

    // Lab values with units  e.g. "glucose 126 mg/dL", "HbA1c 7.2%"
    LAB_VALUE: /\b(?:glucose|HbA1c|cholesterol|creatinine|hemoglobin|platelet|WBC|RBC|TSH|PSA|INR|eGFR)\s+\d+(?:\.\d+)?\s*(?:%|mg\/dL|mmol\/L|g\/dL|U\/L|mIU\/L|ng\/mL)?\b/gi
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
