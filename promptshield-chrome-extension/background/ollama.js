(function (root) {
  const PromptShield = root.PromptShield || (root.PromptShield = {});

  async function sanitizeWithOllama(text) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PromptShield.OLLAMA_TIMEOUT_MS);
    const prompt = `You are a data sanitizer for enterprise security.
Replace ALL sensitive information in the text below
with realistic-looking but completely fake data.
Rules:
- Real names -> random fake full names
- API keys -> same format but randomized characters
- Emails -> fake@fakecorp.com format
- SSNs -> 000-00-0000
- Passwords -> [REDACTED]
- Database URLs -> fake connection strings
- Keep all non-sensitive text EXACTLY the same
- Return ONLY the sanitized text, no explanation
Text: ${text}`;

    try {
      const response = await fetch(PromptShield.OLLAMA_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: PromptShield.OLLAMA_MODEL,
          prompt,
          stream: false
        }),
        signal: controller.signal
      });

      if (!response.ok) return null;

      const data = await response.json();
      return typeof data.response === 'string' && data.response.trim() ? data.response : null;
    } catch (error) {
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  PromptShield.sanitizeWithOllama = sanitizeWithOllama;
})(globalThis);
