(function (root) {
  const PromptShield = root.PromptShield || (root.PromptShield = {});

  // TODO: swap for ONNX BERT-NER post-hackathon
  // import { scanWithModel } from './onnxRunner.js'

  function dedupeEntities(entities) {
    const seen = new Set();
    const acceptedRanges = [];

    return entities
      .slice()
      .sort((a, b) => a.index - b.index || b.value.length - a.value.length)
      .filter((entity) => {
        const key = `${entity.index}:${entity.value}`;
        if (seen.has(key)) return false;
        const start = entity.index;
        const end = entity.index + entity.value.length;
        const overlapsAccepted = acceptedRanges.some((range) => start < range.end && end > range.start);
        if (overlapsAccepted) return false;

        seen.add(key);
        acceptedRanges.push({ start, end });
        return true;
      });
  }

  async function scanPrompt(text) {
    const regexMatches = PromptShield.scanWithRegex(text);
    const nameMatches = PromptShield.scanForNames(text);
    const codeTokenMatches = PromptShield.scanCodeTokens(text);
    const codeResult = PromptShield.scanForSourceCode(text);
    const entities = dedupeEntities([...regexMatches, ...nameMatches, ...codeTokenMatches]);
    const detectedTypes = Array.from(new Set(entities.map((entity) => entity.type)));

    return {
      hasSensitiveData: entities.length > 0,
      entities,
      hasCode: codeResult.hasCode,
      detectedTypes
    };
  }

  PromptShield.scanPrompt = scanPrompt;
})(globalThis);
