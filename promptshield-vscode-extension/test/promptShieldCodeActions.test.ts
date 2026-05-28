jest.mock("vscode", () => ({
  CodeAction: jest.fn(),
  CodeActionKind: { QuickFix: "quickfix" },
  commands: { registerCommand: jest.fn() },
  env: { clipboard: { writeText: jest.fn() } },
  languages: {
    getDiagnostics: jest.fn(() => []),
    registerCodeActionsProvider: jest.fn()
  },
  workspace: {
    applyEdit: jest.fn(),
    openTextDocument: jest.fn()
  },
  window: { showErrorMessage: jest.fn() },
  WorkspaceEdit: jest.fn()
}), { virtual: true });

import { createSecretEnvReplacement, redactSecretsForPrompt, sanitizeGeneratedReplacement } from "../src/promptShieldCodeActions";

describe("promptShieldCodeActions", () => {
  it("keeps only the first fenced code block from a verbose local AI response", () => {
    const flaggedCode = `function scheduleTask() {
  var task = pop();
  while (task > 0) {
    if (task && nextTask) {
      return task;
    }
  }
}`;

    const generatedCode = `Here is a reformatted version of the flagged code block:

\`\`\`javascript
class TaskScheduler {
  constructor() {
    this.tasks = [];
  }

  addTask(task) {
    if (this.tasks.length > 10) throw new Error('Too many tasks in queue');
    this.tasks.push(task);
  }

  executeTasks() {
    for (const task of this.tasks) task();
  }
}
\`\`\`

This code maintains the same functionality as scheduleTask.
  var task = pop();
  while (task > 0) {
    if (task && nextTask) {
      return task;
    }
  }
}`;

    expect(sanitizeGeneratedReplacement(generatedCode, flaggedCode)).toBe(`class TaskScheduler {
  constructor() {
    this.tasks = [];
  }

  addTask(task) {
    if (this.tasks.length > 10) throw new Error('Too many tasks in queue');
    this.tasks.push(task);
  }

  executeTasks() {
    for (const task of this.tasks) task();
  }
}`);
  });

  it("replaces hardcoded API key assignments with environment variables", () => {
    expect(createSecretEnvReplacement("const apiKey = \"sk-1234567890abcdefghijklmnop\";", "openai-api-key"))
      .toBe("const apiKey = process.env.OPENAI_API_KEY;");
  });

  it("replaces standalone secret values with environment variables", () => {
    expect(createSecretEnvReplacement("\"sk-1234567890abcdefghijklmnop\"", "openai-api-key"))
      .toBe("process.env.OPENAI_API_KEY");
  });

  it("redacts hardcoded secrets before local AI prompting", () => {
    const flaggedCode = "const apiKey = \"sk-1234567890abcdefghijklmnop\";";

    expect(redactSecretsForPrompt(flaggedCode)).toBe("const apiKey = \"REDACTED_OPENAI_API_KEY\";");
  });
});
