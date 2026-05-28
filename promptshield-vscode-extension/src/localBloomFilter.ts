/**
 * PromptShield Local Bloom Filter
 *
 * A read-only binary Bloom filter for ultra-fast, offline, privacy-preserving
 * hash membership testing. This module is designed to run inside the VS Code
 * extension host with zero external dependencies.
 *
 * The filter reads a pre-compiled .bin file into a Node Buffer and performs
 * bitwise membership checks in microsecond-level time.
 */

import * as fs from "fs";

/**
 * A read-only binary Bloom filter backed by a Node Buffer.
 *
 * This class loads a pre-compiled filter.bin file and provides fast
 * probabilistic membership testing for structural code hashes.
 *
 * False positives are possible (a non-GPL file may occasionally match),
 * but false negatives are impossible (a GPL file will always be detected).
 */
export class LocalBloomFilter {
  private filterBuffer: Buffer;
  private readonly numBits: number;
  private readonly numHashes: number;

  /**
   * Creates a new LocalBloomFilter from a binary buffer.
   *
   * @param buffer The raw binary buffer containing the Bloom filter data.
   * @param numHashes Number of hash functions used during compilation (must match).
   */
  public constructor(buffer: Buffer, numHashes: number = 3) {
    this.filterBuffer = buffer;
    this.numBits = buffer.length * 8;
    this.numHashes = numHashes;
  }

  /**
   * Loads a Bloom filter from a binary file on disk.
   *
   * @param filePath Absolute path to the .bin file.
   * @param numHashes Number of hash functions used during compilation.
   * @returns A LocalBloomFilter ready for membership testing.
   */
  public static fromFile(filePath: string, numHashes: number = 3): LocalBloomFilter {
    const buffer = fs.readFileSync(filePath);
    return new LocalBloomFilter(buffer, numHashes);
  }

  /**
   * Replaces the internal buffer with new data (hot-reload on weekly sync).
   *
   * @param buffer The new binary buffer from the updated filter file.
   */
  public reload(buffer: Buffer): void {
    this.filterBuffer = buffer;
  }

  /**
   * Tests whether a 32-bit FNV-1a hash is probably present in the filter.
   *
   * Uses the same seeded offset scheme as the compiler to compute multiple
   * bit indices from a single hash value.
   *
   * @param hash The unsigned 32-bit integer hash to test.
   * @returns True if all corresponding bits are set (probable match), false if definitely absent.
   */
  public test(hash: number): boolean {
    for (let i = 0; i < this.numHashes; i += 1) {
      const combinedHash = (hash + Math.imul(i, 0x5bd1e995)) >>> 0;
      const bitIndex = combinedHash % this.numBits;
      const byteIndex = Math.floor(bitIndex / 8);
      const bitOffset = bitIndex % 8;

      if ((this.filterBuffer[byteIndex] & (1 << bitOffset)) === 0) {
        return false;
      }
    }

    return true;
  }

  /**
   * Tests multiple hashes and returns the count of probable matches.
   *
   * @param hashes An array of unsigned 32-bit hashes to test.
   * @returns The number of hashes that matched the filter.
   */
  public countMatches(hashes: readonly number[]): number {
    let matches = 0;

    for (const hash of hashes) {
      if (this.test(hash)) {
        matches += 1;
      }
    }

    return matches;
  }

  /**
   * Returns the size of the underlying buffer in bytes.
   */
  public get sizeBytes(): number {
    return this.filterBuffer.length;
  }

  /**
   * Returns the total number of bits in the filter.
   */
  public get totalBits(): number {
    return this.numBits;
  }

  /**
   * Checks if the filter has been loaded with data (non-empty buffer).
   */
  public get isLoaded(): boolean {
    return this.filterBuffer.length > 0;
  }
}
