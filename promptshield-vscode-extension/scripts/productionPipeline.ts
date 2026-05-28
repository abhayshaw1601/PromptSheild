/**
 * PromptShield Production Copyleft Ingestion & Compile Pipeline
 *
 * Central orchestrator that combines three major copyleft sources:
 *   1. NPM Registry (Top packages licensed under copyleft tags)
 *   2. GitHub Search API (Active copyleft repositories)
 *   3. Software Heritage Archive (Historic reference systems)
 *
 * All discovered sources are processed through the AST compiler to build a
 * high-res, optimized binary Bloom filter file (default 10 MB).
 *
 * Usage:
 *   npx ts-node scripts/productionPipeline.ts [--token GITHUB_TOKEN] [--output resources/filter.bin] [--dry-run]
 */

import * as fs from "fs";
import * as path from "path";
import { rimraf } from "rimraf";
import { BloomFilterCompiler } from "./compiler";
import { downloadNpmCopyleftPackages } from "./npmDownloader";
import { downloadHeritageArchive } from "./heritageIndexer";
import { scrapeAndCompileGithubSource, ScraperStats } from "./scraper";

interface PipelineOptions {
  readonly githubToken: string;
  readonly outputPath: string;
  readonly dryRun: boolean;
  readonly bloomSizeBytes: number;
  readonly bloomHashCount: number;
}

/**
 * Ensures clean temporary directory setup.
 */
function setupCacheDir(dirPath: string): void {
  if (fs.existsSync(dirPath)) {
    rimraf.sync(dirPath);
  }
  fs.mkdirSync(dirPath, { recursive: true });
}

/**
 * Main pipeline orchestration function.
 */
async function runPipeline(options: PipelineOptions): Promise<void> {
  const startedAt = Date.now();
  const cacheDir = path.resolve(__dirname, "..", ".pipeline_cache");

  console.log(`[pipeline] Initializing PromptShield compliance pipeline...`);
  console.log(`[pipeline] Dry-run mode: ${options.dryRun ? "ENABLED" : "DISABLED"}`);
  console.log(`[pipeline] Target filter size: ${(options.bloomSizeBytes / 1024 / 1024).toFixed(1)} MB`);
  console.log(`[pipeline] Output path: ${options.outputPath}`);

  setupCacheDir(cacheDir);

  const compiler = new BloomFilterCompiler(options.bloomSizeBytes, options.bloomHashCount);
  const stats: ScraperStats = {
    repositoriesScanned: 0,
    filesProcessed: 0,
    filesSkipped: 0,
    errors: 0,
    totalBytesProcessed: 0
  };

  try {
    // -------------------------------------------------------------------------
    // Source 1: NPM Registry Copyleft Ingestion
    // -------------------------------------------------------------------------
    console.log(`\n[pipeline] --- Source 1: Ingesting NPM Copyleft Packages ---`);
    // In dry-run we pull 1 package per license category; in production we pull 15.
    const npmLimit = options.dryRun ? 1 : 15;
    const npmFiles = await downloadNpmCopyleftPackages(cacheDir, npmLimit);

    console.log(`[pipeline] Compiling ${npmFiles.length} files fetched from NPM...`);
    for (const file of npmFiles) {
      try {
        const content = fs.readFileSync(file.filePath, "utf-8");
        compiler.addSourceFile(content, file.language);
        stats.filesProcessed += 1;
        stats.totalBytesProcessed += content.length;
      } catch (err) {
        stats.errors += 1;
        console.error(`[pipeline] Compilation failed for NPM file ${file.filePath}: ${String(err)}`);
      }
    }

    // -------------------------------------------------------------------------
    // Source 2: Software Heritage & SPDX Copyleft Ingestion
    // -------------------------------------------------------------------------
    console.log(`\n[pipeline] --- Source 2: Ingesting Historic Heritage Archive ---`);
    const heritageFiles = await downloadHeritageArchive(cacheDir);

    console.log(`[pipeline] Compiling ${heritageFiles.length} files fetched from Heritage index...`);
    for (const file of heritageFiles) {
      try {
        const content = fs.readFileSync(file.filePath, "utf-8");
        compiler.addSourceFile(content, file.language);
        stats.filesProcessed += 1;
        stats.totalBytesProcessed += content.length;
      } catch (err) {
        stats.errors += 1;
        console.error(`[pipeline] Compilation failed for Heritage file ${file.filePath}: ${String(err)}`);
      }
    }

    // -------------------------------------------------------------------------
    // Source 3: GitHub Active GPL Ingestion
    // -------------------------------------------------------------------------
    console.log(`\n[pipeline] --- Source 3: Ingesting GitHub Active Repositories ---`);
    // In dry-run we crawl 1 repository per license type with at most 5 files; in production we do 20 repos with 50 files.
    const githubOptions = {
      githubToken: options.githubToken,
      outputPath: options.outputPath,
      maxReposPerLicense: options.dryRun ? 1 : 20,
      maxFilesPerRepo: options.dryRun ? 5 : 50,
      bloomSizeBytes: options.bloomSizeBytes,
      bloomHashCount: options.bloomHashCount
    };

    await scrapeAndCompileGithubSource(githubOptions, compiler, stats);

    // -------------------------------------------------------------------------
    // Write Output & Stats
    // -------------------------------------------------------------------------
    compiler.writeToFile(options.outputPath);

    console.log(`\n[pipeline] === Compilation Pipeline Complete ===`);
    console.log(`[pipeline] Total files compiled: ${stats.filesProcessed}`);
    console.log(`[pipeline] Scanning errors encountered: ${stats.errors}`);
    console.log(`[pipeline] Total data processed: ${(stats.totalBytesProcessed / 1024 / 1024).toFixed(2)} MB`);
    console.log(`[pipeline] Filter written to: ${options.outputPath}`);
    console.log(`[pipeline] Bloom filter saturation: ${(compiler.getSaturation() * 100).toFixed(4)}%`);
    console.log(`[pipeline] Total duration: [${((Date.now() - startedAt) / 1000).toFixed(1)} seconds]`);
  } finally {
    // -------------------------------------------------------------------------
    // In-depth clean up of temporary cache directory
    // -------------------------------------------------------------------------
    console.log(`\n[pipeline] Cleaning up pipeline cache at: ${cacheDir}`);
    try {
      rimraf.sync(cacheDir);
    } catch (cleanupErr) {
      console.error(`[pipeline] Failed to delete cache folder: ${String(cleanupErr)}`);
    }
  }
}

/**
 * Parses CLI Arguments
 */
function parseArgs(): PipelineOptions {
  const args = process.argv.slice(2);
  let token = process.env.GITHUB_TOKEN ?? "";
  let output = path.resolve(__dirname, "..", "resources", "filter.bin");
  let dryRun = false;

  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--token" && args[i + 1] !== undefined) {
      token = args[i + 1];
      i += 1;
    } else if (args[i] === "--output" && args[i + 1] !== undefined) {
      output = path.resolve(args[i + 1]);
      i += 1;
    } else if (args[i] === "--dry-run") {
      dryRun = true;
    }
  }

  // Dry-run uses a 1MB filter to remain extremely fast and lightweight
  // Production runs compile a highly dense 10MB filter (10,485,760 bytes)
  const bloomSizeBytes = dryRun ? 1048576 : 10485760;

  return {
    githubToken: token,
    outputPath: output,
    dryRun,
    bloomSizeBytes,
    bloomHashCount: 3
  };
}

if (require.main === module) {
  const options = parseArgs();
  runPipeline(options)
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("[pipeline] Fatal pipeline crash:", error);
      process.exit(1);
    });
}
