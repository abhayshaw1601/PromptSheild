/**
 * PromptShield NPM Copyleft Package Downloader
 *
 * Queries the NPM registry search API for packages matching copyleft licenses,
 * downloads their latest version tarballs, and extracts their source files using
 * Windows native bsdtar utility.
 */

import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import { execSync } from "child_process";

const APPROVED_LICENSES = ["gpl", "agpl", "lgpl", "mpl", "epl"];
const SUPPORTED_EXTENSIONS = [".js", ".jsx", ".ts", ".tsx", ".py", ".go", ".java"];

interface NpmSearchResponse {
  readonly objects: readonly {
    readonly package: {
      readonly name: string;
      readonly version: string;
      readonly description?: string;
      readonly links: {
        readonly npm: string;
      };
    };
  }[];
}

interface NpmPackageResponse {
  readonly "dist-tags": {
    readonly latest: string;
  };
  readonly versions: {
    readonly [version: string]: {
      readonly dist: {
        readonly tarball: string;
      };
    };
  };
}

/**
 * Downloads a binary or text file from a URL.
 */
function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    https.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 307) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          file.close();
          fs.unlinkSync(destPath);
          downloadFile(redirectUrl, destPath).then(resolve).catch(reject);
          return;
        }
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download ${url}: HTTP ${response.statusCode ?? "unknown"}`));
        return;
      }

      response.pipe(file);
      file.on("finish", () => {
        file.close();
        resolve();
      });
    }).on("error", (err) => {
      fs.unlinkSync(destPath);
      reject(err);
    });
  });
}

/**
 * Performs a JSON GET request from a URL.
 */
function getJson<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    https.get(
      url,
      {
        headers: { "User-Agent": "PromptShield-Compiler/1.0" }
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf-8");
          if (res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(body) as T);
            } catch (err) {
              reject(err);
            }
          } else {
            reject(new Error(`HTTP ${res.statusCode ?? "unknown"} for ${url}`));
          }
        });
      }
    ).on("error", reject);
  });
}

/**
 * Recursively scans a directory for eligible source files.
 */
function scanSourceFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) {
    return results;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const dirName = entry.name.toLowerCase();
      if (!["node_modules", ".git", "dist", "build", "test", "tests", "docs"].includes(dirName)) {
        results.push(...scanSourceFiles(fullPath));
      }
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (SUPPORTED_EXTENSIONS.includes(ext) && !entry.name.includes(".test.") && !entry.name.includes(".spec.")) {
        results.push(fullPath);
      }
    }
  }

  return results;
}

/**
 * Main module runner.
 * Downloads and extracts the top copyleft packages from the NPM Registry.
 *
 * @param cacheDir Local cache directory to write temporary archives.
 * @param limit Number of packages to pull per license type.
 * @returns Map of extracted source files and their language classification.
 */
export async function downloadNpmCopyleftPackages(
  cacheDir: string,
  limit: number = 10
): Promise<{ filePath: string; language: string }[]> {
  const npmCache = path.join(cacheDir, "npm");
  if (!fs.existsSync(npmCache)) {
    fs.mkdirSync(npmCache, { recursive: true });
  }

  const discoveredFiles: { filePath: string; language: string }[] = [];
  console.log(`[npm-downloader] Starting search for copyleft packages...`);

  for (const license of APPROVED_LICENSES) {
    try {
      const searchUrl = `https://registry.npmjs.org/-/v1/search?text=license:${license}&size=${limit}`;
      console.log(`[npm-downloader] Querying NPM registry: license:${license}`);
      const searchResult = await getJson<NpmSearchResponse>(searchUrl);

      for (const obj of searchResult.objects) {
        const pkgName = obj.package.name;
        // Escape package names (especially scoped ones like @angular/core)
        const safePkgName = pkgName.replace(/[@/]/g, "_");
        const pkgDetailsUrl = `https://registry.npmjs.org/${pkgName}`;

        console.log(`[npm-downloader] Fetching version details for: ${pkgName}`);
        try {
          const details = await getJson<NpmPackageResponse>(pkgDetailsUrl);
          const latestVersion = details["dist-tags"].latest;
          const tarballUrl = details.versions[latestVersion].dist.tarball;

          const archivePath = path.join(npmCache, `${safePkgName}-${latestVersion}.tgz`);
          const extractPath = path.join(npmCache, `${safePkgName}-extracted`);

          if (!fs.existsSync(extractPath)) {
            fs.mkdirSync(extractPath, { recursive: true });
          }

          console.log(`[npm-downloader] Downloading: ${tarballUrl}`);
          await downloadFile(tarballUrl, archivePath);

          console.log(`[npm-downloader] Unpacking archive into: ${extractPath}`);
          try {
            // bsdtar supports in-place extraction to C
            execSync(`tar -xzf "${archivePath}" -C "${extractPath}"`, { stdio: "ignore" });
          } catch (tarErr) {
            console.error(`[npm-downloader] Tar extraction failed for ${pkgName}: ${String(tarErr)}`);
            continue;
          }

          // Clean up archive
          if (fs.existsSync(archivePath)) {
            fs.unlinkSync(archivePath);
          }

          const files = scanSourceFiles(extractPath);
          console.log(`[npm-downloader] Discovered ${files.length} functional files in ${pkgName}`);

          for (const file of files) {
            const ext = path.extname(file).toLowerCase();
            let language = "javascript";
            if ([".ts", ".tsx"].includes(ext)) language = "typescript";
            else if (ext === ".py") language = "python";
            else if (ext === ".go") language = "go";
            else if (ext === ".java") language = "java";

            discoveredFiles.push({
              filePath: file,
              language
            });
          }
        } catch (pkgErr) {
          console.error(`[npm-downloader] Skipping package ${pkgName}: ${String(pkgErr)}`);
        }
      }
    } catch (err) {
      console.error(`[npm-downloader] Failed registry search for ${license}: ${String(err)}`);
    }
  }

  return discoveredFiles;
}
