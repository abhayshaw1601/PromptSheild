(function (root) {
  const PromptShield = root.PromptShield || (root.PromptShield = {});

  const COMMON_FIRST_NAMES = [
    'James', 'Mary', 'John', 'Patricia', 'Robert', 'Jennifer', 'Michael', 'Linda', 'William', 'Elizabeth',
    'David', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica', 'Thomas', 'Sarah', 'Christopher', 'Karen',
    'Charles', 'Nancy', 'Daniel', 'Lisa', 'Matthew', 'Betty', 'Anthony', 'Margaret', 'Mark', 'Sandra',
    'Donald', 'Ashley', 'Steven', 'Kimberly', 'Paul', 'Emily', 'Andrew', 'Donna', 'Joshua', 'Michelle',
    'Kenneth', 'Dorothy', 'Kevin', 'Carol', 'Brian', 'Amanda', 'George', 'Melissa', 'Timothy', 'Deborah',
    'Ronald', 'Stephanie', 'Edward', 'Rebecca', 'Jason', 'Sharon', 'Jeffrey', 'Laura', 'Ryan', 'Cynthia',
    'Jacob', 'Kathleen', 'Gary', 'Amy', 'Nicholas', 'Shirley', 'Eric', 'Angela', 'Jonathan', 'Helen',
    'Stephen', 'Anna', 'Larry', 'Brenda', 'Justin', 'Pamela', 'Scott', 'Nicole', 'Brandon', 'Emma',
    'Benjamin', 'Samantha', 'Samuel', 'Katherine', 'Gregory', 'Christine', 'Frank', 'Debra', 'Alexander', 'Rachel',
    'Raymond', 'Catherine', 'Patrick', 'Carolyn', 'Jack', 'Janet', 'Dennis', 'Ruth', 'Jerry', 'Maria'
  ];

  const NAME_SET = new Set(COMMON_FIRST_NAMES.map((name) => name.toLowerCase()));
  const WORD_PATTERN = /\b[A-Za-z][A-Za-z'-]*\b/g;

  function isInsideEmailOrDomain(text, index, value) {
    const before = text.slice(Math.max(0, index - 2), index);
    const after = text.slice(index + value.length, index + value.length + 2);
    const localWindow = text.slice(Math.max(0, index - 40), index + value.length + 40);
    return /[@.]/.test(before + after) || /\S+@\S+\.\S+/.test(localWindow);
  }

  function scanForNames(text) {
    if (!text) return [];

    const matches = [];
    let match = WORD_PATTERN.exec(text);
    while (match) {
      if (
        NAME_SET.has(match[0].toLowerCase()) &&
        !isInsideEmailOrDomain(text, match.index, match[0])
      ) {
        matches.push({ type: 'NAME', value: match[0], index: match.index });
      }
      match = WORD_PATTERN.exec(text);
    }

    WORD_PATTERN.lastIndex = 0;
    return matches;
  }

  PromptShield.COMMON_FIRST_NAMES = COMMON_FIRST_NAMES;
  PromptShield.scanForNames = scanForNames;
})(globalThis);
