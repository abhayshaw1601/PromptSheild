/**
 * PromptShield GitHub GPL Scraper
 *
 * Crawls the GitHub Search API for repositories licensed under copyleft licenses,
 * downloads source files concurrently, and parses them.
 * Offers standard rate-limit retries and concurrent Promise workers.
 */

import * as https from "https";
import * as path from "path";
import { BloomFilterCompiler } from "./compiler";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const GITHUB_API_BASE = "https://api.github.com";
const COPYLEFT_LICENSES = ["gpl-2.0", "gpl-3.0", "agpl-3.0"];

const SUPPORTED_EXTENSIONS: readonly string[] = [
  ".js", ".jsx", ".ts", ".tsx",
  ".py",
  ".go",
  ".java"
];

const IGNORED_PATH_SEGMENTS: readonly string[] = [
  "node_modules", "vendor", "dist", "build", "out",
  "__pycache__", ".git", ".github", ".vscode",
  "test", "tests", "spec", "specs", "__tests__",
  "fixtures", "examples", "docs", "doc",
  "migrations", "generated"
];

const IGNORED_FILE_PATTERNS: readonly RegExp[] = [
  /\.min\.[jt]sx?$/,
  /\.test\.[jt]sx?$/,
  /\.spec\.[jt]sx?$/,
  /_test\.go$/,
  /test_.*\.py$/,
  /Test\.java$/,
  /\.d\.ts$/,
  /package\.json$/,
  /tsconfig.*\.json$/,
  /webpack.*\.js$/,
  /rollup.*\.js$/,
  /babel.*\.js$/,
  /jest.*\.[jt]s$/,
  /\.config\.[jt]s$/,
  /setup\.[jt]s$/
];

const MAX_FILE_SIZE_BYTES = 512 * 1024;
const MIN_FILE_SIZE_BYTES = 100;
const REQUEST_DELAY_MS = 800;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GitHubSearchResult {
  readonly items: readonly GitHubRepository[];
  readonly total_count: number;
}

export interface GitHubRepository {
  readonly full_name: string;
  readonly default_branch: string;
  readonly stargazers_count: number;
  readonly size: number;
  readonly language: string | null;
}

export interface GitHubTreeEntry {
  readonly path: string;
  readonly type: string;
  readonly size?: number;
  readonly sha: string;
  readonly url: string;
}

export interface GitHubTreeResponse {
  readonly tree: readonly GitHubTreeEntry[];
  readonly truncated: boolean;
}

export interface ScraperOptions {
  readonly githubToken: string;
  readonly outputPath: string;
  readonly maxReposPerLicense: number;
  readonly maxFilesPerRepo: number;
  readonly bloomSizeBytes: number;
  readonly bloomHashCount: number;
}

export interface ScraperStats {
  repositoriesScanned: number;
  filesProcessed: number;
  filesSkipped: number;
  errors: number;
  totalBytesProcessed: number;
}

// ---------------------------------------------------------------------------
// HTTP Utilities & Concurrency Helpers
// ---------------------------------------------------------------------------

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs tasks in a concurrent worker pool.
 */
async function pool<T>(tasks: (() => Promise<T>)[], concurrency: number): Promise<T[]> {
  const results: T[] = [];
  let index = 0;

  async function worker(): Promise<void> {
    while (index < tasks.length) {
      const curIndex = index;
      index += 1;
      const task = tasks[curIndex];
      const res = await task();
      results[curIndex] = res;
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * Retries an asynchronous task with exponential backoff.
 */
async function fetchWithRetry<T>(fn: () => Promise<T>, retries = 3, delayMs = 1500): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (retries <= 0) {
      throw err;
    }
    console.warn(`[scraper] Request failed: ${String(err)}. Retrying in ${delayMs}ms...`);
    await delay(delayMs);
    return fetchWithRetry(fn, retries - 1, delayMs * 2);
  }
}

function httpsGetJson<T>(url: string, token: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const options: https.RequestOptions = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: "GET",
      headers: {
        "User-Agent": "PromptShield-Scraper/1.0",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(token.length > 0 ? { "Authorization": `Bearer ${token}` } : {})
      }
    };

    const req = https.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf-8");
        if (res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(body) as T);
          } catch (parseError) {
            reject(new Error(`JSON parse error for ${url}: ${String(parseError)}`));
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode ?? "unknown"} for ${url}: ${body.slice(0, 300)}`));
        }
      });
      res.on("error", reject);
    });

    req.on("error", reject);
    req.setTimeout(30000, () => req.destroy(new Error(`Request timeout for ${url}`)));
    req.end();
  });
}

function httpsGetRawText(url: string, token: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const options: https.RequestOptions = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: "GET",
      headers: {
        "User-Agent": "PromptShield-Scraper/1.0",
        "Accept": "application/vnd.github.v3.raw",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(token.length > 0 ? { "Authorization": `Bearer ${token}` } : {})
      }
    };

    const req = https.request(options, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) {
        const redirectUrl = res.headers.location;
        if (redirectUrl !== undefined) {
          httpsGetRawText(redirectUrl, "").then(resolve).catch(reject);
          return;
        }
      }

      const chunks: Buffer[] = [];
      let totalBytes = 0;

      res.on("data", (chunk: Buffer) => {
        totalBytes += chunk.length;
        if (totalBytes > MAX_FILE_SIZE_BYTES) {
          res.destroy();
          reject(new Error(`File exceeds ${MAX_FILE_SIZE_BYTES} byte limit`));
          return;
        }
        chunks.push(chunk);
      });

      res.on("end", () => {
        if (res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 300) {
          resolve(Buffer.concat(chunks).toString("utf-8"));
        } else {
          reject(new Error(`HTTP ${res.statusCode ?? "unknown"} fetching raw content`));
        }
      });

      res.on("error", reject);
    });

    req.on("error", reject);
    req.setTimeout(30000, () => req.destroy(new Error("Request timeout fetching raw content")));
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Filtering Logic
// ---------------------------------------------------------------------------

function isSupportedSourceFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.includes(ext)) {
    return false;
  }

  const normalizedPath = filePath.replace(/\\/g, "/").toLowerCase();
  for (const segment of IGNORED_PATH_SEGMENTS) {
    if (normalizedPath.includes(`/${segment}/`) || normalizedPath.startsWith(`${segment}/`)) {
      return false;
    }
  }

  const basename = path.basename(filePath);
  for (const pattern of IGNORED_FILE_PATTERNS) {
    if (pattern.test(basename)) {
      return false;
    }
  }

  return true;
}

function getLanguageFromPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".js":
    case ".jsx":
      return "javascript";
    case ".ts":
    case ".tsx":
      return "typescript";
    case ".py":
      return "python";
    case ".go":
      return "go";
    case ".java":
      return "java";
    default:
      return "unknown";
  }
}

// ---------------------------------------------------------------------------
// Core Ingestor Functions
// ---------------------------------------------------------------------------

export async function searchGplRepositories(
  license: string,
  token: string,
  maxRepos: number
): Promise<GitHubRepository[]> {
  const repositories: GitHubRepository[] = [];
  const perPage = Math.min(maxRepos, 30);
  const maxPages = Math.ceil(maxRepos / perPage);

  for (let page = 1; page <= maxPages; page += 1) {
    const remaining = maxRepos - repositories.length;
    if (remaining <= 0) break;

    const query = encodeURIComponent(`license:${license} stars:>100`);
    const url = `${GITHUB_API_BASE}/search/repositories?q=${query}&sort=stars&order=desc&per_page=${Math.min(perPage, remaining)}&page=${page}`;

    console.log(`[scraper] Searching repositories: license=${license}, page=${page}`);
    try {
      const result = await fetchWithRetry(() => httpsGetJson<GitHubSearchResult>(url, token));
      repositories.push(...result.items);
      console.log(`[scraper] Found ${result.items.length} repositories`);
    } catch (error) {
      console.error(`[scraper] Search error for license=${license}, page=${page}: ${String(error)}`);
      break;
    }

    await delay(REQUEST_DELAY_MS);
  }

  return repositories;
}

export async function getRepositoryTree(
  repoFullName: string,
  branch: string,
  token: string
): Promise<GitHubTreeEntry[]> {
  const url = `${GITHUB_API_BASE}/repos/${repoFullName}/git/trees/${branch}?recursive=1`;

  try {
    const result = await fetchWithRetry(() => httpsGetJson<GitHubTreeResponse>(url, token));
    return result.tree.filter((entry) =>
      entry.type === "blob" &&
      isSupportedSourceFile(entry.path) &&
      (entry.size === undefined || (entry.size >= MIN_FILE_SIZE_BYTES && entry.size <= MAX_FILE_SIZE_BYTES))
    ) as GitHubTreeEntry[];
  } catch (error) {
    console.error(`[scraper] Tree fetch error for ${repoFullName}: ${String(error)}`);
    return [];
  }
}

export async function downloadAndCompileFile(
  repoFullName: string,
  filePath: string,
  branch: string,
  token: string,
  compiler: BloomFilterCompiler,
  stats: ScraperStats
): Promise<void> {
  const rawUrl = `https://raw.githubusercontent.com/${repoFullName}/${branch}/${filePath}`;
  const language = getLanguageFromPath(filePath);

  try {
    const content = await fetchWithRetry(() => httpsGetRawText(rawUrl, token));
    if (content.length < MIN_FILE_SIZE_BYTES) {
      stats.filesSkipped += 1;
      return;
    }

    compiler.addSourceFile(content, language);
    stats.filesProcessed += 1;
    stats.totalBytesProcessed += content.length;
  } catch (error) {
    stats.errors += 1;
    console.error(`[scraper] Download error: ${repoFullName}/${filePath}: ${String(error)}`);
  }
}

// ---------------------------------------------------------------------------
// Shared compilation pipeline trigger
// ---------------------------------------------------------------------------

export async function scrapeAndCompileGithubSource(
  options: ScraperOptions,
  compiler: BloomFilterCompiler,
  stats: ScraperStats
): Promise<void> {
  console.log(`[scraper] Executing GitHub pipeline scan: maxReposPerLicense=${options.maxReposPerLicense}`);

  for (const license of COPYLEFT_LICENSES) {
    console.log(`\n[scraper] === Crawling GitHub under license: ${license} ===`);
    const repositories = await searchGplRepositories(license, options.githubToken, options.maxReposPerLicense);

    for (const repo of repositories) {
      console.log(`[scraper] Ingesting repository tree: ${repo.full_name}`);
      stats.repositoriesScanned += 1;

      const treeEntries = await getRepositoryTree(repo.full_name, repo.default_branch, options.githubToken);
      console.log(`[scraper] Eligible file count: ${treeEntries.length}`);

      const filesToProcess = treeEntries.slice(0, options.maxFilesPerRepo);
      
      // Perform parallel downloads in batches of 4 workers
      const tasks = filesToProcess.map((entry) => () =>
        downloadAndCompileFile(
          repo.full_name,
          entry.path,
          repo.default_branch,
          options.githubToken,
          compiler,
          stats
        )
      );

      await pool(tasks, 4);
      console.log(`[scraper] Completed repository ${repo.full_name}: ${stats.filesProcessed} files processed so far`);
      await delay(REQUEST_DELAY_MS);
    }
  }
}

// ---------------------------------------------------------------------------
// Legacy CLI entry point
// ---------------------------------------------------------------------------

export async function runScraper(options: ScraperOptions): Promise<ScraperStats> {
  const stats: ScraperStats = {
    repositoriesScanned: 0,
    filesProcessed: 0,
    filesSkipped: 0,
    errors: 0,
    totalBytesProcessed: 0
  };

  const compiler = new BloomFilterCompiler(options.bloomSizeBytes, options.bloomHashCount);
  await scrapeAndCompileGithubSource(options, compiler, stats);
  compiler.writeToFile(options.outputPath);

  return stats;
}

function parseArgs(): ScraperOptions {
  const args = process.argv.slice(2);
  let token = process.env.GITHUB_TOKEN ?? "";
  let output = path.resolve(__dirname, "..", "resources", "filter.bin");
  let maxRepos = 10;

  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--token" && args[i + 1] !== undefined) {
      token = args[i + 1];
      i += 1;
    } else if (args[i] === "--output" && args[i + 1] !== undefined) {
      output = path.resolve(args[i + 1]);
      i += 1;
    } else if (args[i] === "--max-repos" && args[i + 1] !== undefined) {
      maxRepos = parseInt(args[i + 1], 10);
      i += 1;
    }
  }

  return {
    githubToken: token,
    outputPath: output,
    maxReposPerLicense: maxRepos,
    maxFilesPerRepo: 50,
    bloomSizeBytes: 1048576,
    bloomHashCount: 3
  };
}

if (require.main === module) {
  const options = parseArgs();
  runScraper(options)
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("[scraper] Fatal error:", error);
      process.exit(1);
    });
}
