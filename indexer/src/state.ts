/**
 * Last-processed block persistence.
 *
 * The indexer writes the most recently indexed block number to a local file
 * (.lastblock) so it can resume from the correct position after a restart.
 * If the file doesn't exist (first run), the main loop starts from the current
 * chain tip instead.
 */

import * as fs from 'fs'

const STATE_FILE = '.lastblock'

/**
 * Read the last processed block number from disk.
 * Returns null if the file doesn't exist or cannot be parsed (e.g. first run).
 */
export function loadLastBlock(): bigint | null {
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf8').trim()
    return raw ? BigInt(raw) : null
  } catch {
    return null
  }
}

/**
 * Write the last processed block number to disk.
 * Called after each chunk is successfully indexed so progress is not lost
 * if the process restarts mid-catchup.
 */
export function saveLastBlock(block: bigint): void {
  fs.writeFileSync(STATE_FILE, block.toString())
}
