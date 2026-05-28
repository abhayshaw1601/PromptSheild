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

  it("returns a stable FNV-1a 32-bit hash for the same string", () => {
    const input = "Program_FunctionDeclaration";
    const firstHash = fnv1a32(input);
    const secondHash = fnv1a32(input);

    expect(firstHash).toBe(secondHash);
    expect(firstHash).toBe(1836718064);
  });
});

