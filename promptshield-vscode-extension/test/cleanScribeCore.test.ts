import { fnv1a32, scanDocument } from "../src/cleanScribeCore";

describe("cleanScribeCore", () => {
  it("returns no violations for a clean code snippet", () => {
    const cleanCode = `
      const subtotal = 42;
      const tax = 8;
      const total = subtotal + tax;
      console.log(total);
    `;

    const violations = scanDocument(cleanCode);

    expect(violations).toHaveLength(0);
  });

  it("returns a violation for structurally plagiarized restricted logic", () => {
    const plagiarizedCode = `
      function calculateRestrictedValue() {
        return licenseSeed;
      }
    `;

    const violations = scanDocument(plagiarizedCode);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toEqual({
      line: 2,
      violationType: "restricted-gpl-similarity",
      severity: "critical"
    });
  });

  it("returns a violation when restricted logic is embedded in a larger file", () => {
    const largerFile = `
      const auditEvents = [];

      function createSession(userId) {
        return {
          id: userId,
          createdAt: new Date().toISOString()
        };
      }

      function normalizeEmail(email) {
        return String(email || "").trim().toLowerCase();
      }

      function calculateRestrictedValue() {
        return licenseSeed;
      }

      function summarizeEvents(events) {
        return events.length;
      }
    `;

    const violations = scanDocument(largerFile);

    expect(violations).toHaveLength(1);
    expect(violations[0]?.violationType).toBe("restricted-gpl-similarity");
    expect(violations[0]?.severity).toBe("critical");
  });

  it("returns a violation for explicit GPL-family license notices", () => {
    const gplNoticeCode = `
      /*
       * SPDX-License-Identifier: GPL-3.0-or-later
       */
      export const featureFlag = true;
    `;

    const violations = scanDocument(gplNoticeCode);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toEqual({
      line: 3,
      violationType: "copyleft-license-notice",
      severity: "critical"
    });
  });

  it("returns a violation for generic copyleft structural signatures", () => {
    const schedulerLikeCode = `
      function scheduleTask() {
        var task = pop();
        while (task > 0) {
          if (task && nextTask) {
            return task;
          }
        }
      }
    `;

    const violations = scanDocument(schedulerLikeCode);

    expect(violations).toHaveLength(1);
    expect(violations[0]?.violationType).toBe("restricted-gpl-similarity");
    expect(violations[0]?.severity).toBe("critical");
  });

  it("returns regex findings before license-similarity findings", () => {
    const codeWithSecretAndRestrictedLogic = `
      const apiKey = "sk-1234567890abcdefghijklmnop";

      function calculateRestrictedValue() {
        return licenseSeed;
      }
    `;

    const violations = scanDocument(codeWithSecretAndRestrictedLogic);

    expect(violations.map((violation) => violation.violationType)).toEqual([
      "openai-api-key",
      "generic-secret-assignment",
      "restricted-gpl-similarity"
    ]);
  });

  it("returns a stable FNV-1a 32-bit hash for the same string", () => {
    const input = "Program_FunctionDeclaration";
    const firstHash = fnv1a32(input);
    const secondHash = fnv1a32(input);

    expect(firstHash).toBe(secondHash);
    expect(firstHash).toBe(1836718064);
  });
});
