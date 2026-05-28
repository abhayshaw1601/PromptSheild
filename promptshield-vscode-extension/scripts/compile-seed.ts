/**
 * PromptShield Seed Compiler
 *
 * Compiles the seed source files in resources/seed-sources/ into the initial
 * filter.bin that ships with the VS Code extension.
 *
 * Usage:
 *   npx ts-node scripts/compile-seed.ts
 */

import * as path from "path";
import { compileFromDirectory } from "./compiler";

const seedDir = path.resolve(__dirname, "..", "resources", "seed-sources");
const outputPath = path.resolve(__dirname, "..", "resources", "filter.bin");

console.log("[compile-seed] Compiling seed sources into initial filter.bin");
console.log(`[compile-seed] Seed directory: ${seedDir}`);
console.log(`[compile-seed] Output path: ${outputPath}`);

const compiler = compileFromDirectory(seedDir, outputPath, 1048576, 3);

console.log(`[compile-seed] Done. Inserted ${compiler.count} hashes.`);
console.log(`[compile-seed] Saturation: ${(compiler.getSaturation() * 100).toFixed(4)}%`);
