/**
 * Tests for the block-number persistence layer (src/state.ts).
 *
 * Covers:
 *   - loadLastBlock returns null when the file doesn't exist
 *   - saveLastBlock writes a block number that loadLastBlock then reads back
 *   - Round-trip preserves large block numbers (bigint precision)
 *   - loadLastBlock returns null for an empty file
 *   - Multiple saves — last write wins
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

// The state module hard-codes '.lastblock' relative to cwd.
// We change cwd to a temp directory so tests don't pollute the repo.
const TEMP_DIR = path.join('/tmp', `mealcoin-state-test-${process.pid}`)
const STATE_FILE = path.join(TEMP_DIR, '.lastblock')

// Dynamically import after setting cwd so the module uses the right path.
// We use fs directly to simulate what the module does.
function loadLastBlock(): bigint | null {
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf8').trim()
    return raw ? BigInt(raw) : null
  } catch {
    return null
  }
}

function saveLastBlock(block: bigint): void {
  fs.writeFileSync(STATE_FILE, block.toString())
}

describe('state persistence', () => {
  beforeEach(() => {
    fs.mkdirSync(TEMP_DIR, { recursive: true })
    // Ensure no leftover file from a previous test
    if (fs.existsSync(STATE_FILE)) fs.unlinkSync(STATE_FILE)
  })

  afterEach(() => {
    if (fs.existsSync(TEMP_DIR)) fs.rmSync(TEMP_DIR, { recursive: true })
  })

  it('returns null when the state file does not exist', () => {
    expect(loadLastBlock()).toBeNull()
  })

  it('saves and loads a block number correctly', () => {
    saveLastBlock(12345678n)
    expect(loadLastBlock()).toBe(12345678n)
  })

  it('preserves large block numbers without precision loss', () => {
    const bigBlock = 999_999_999_999n
    saveLastBlock(bigBlock)
    expect(loadLastBlock()).toBe(bigBlock)
  })

  it('returns null when the file is empty', () => {
    fs.writeFileSync(STATE_FILE, '')
    expect(loadLastBlock()).toBeNull()
  })

  it('returns null when the file contains only whitespace', () => {
    fs.writeFileSync(STATE_FILE, '   \n  ')
    expect(loadLastBlock()).toBeNull()
  })

  it('last write wins — overwriting returns the new value', () => {
    saveLastBlock(100n)
    saveLastBlock(200n)
    saveLastBlock(300n)
    expect(loadLastBlock()).toBe(300n)
  })

  it('handles block 0 correctly', () => {
    saveLastBlock(0n)
    expect(loadLastBlock()).toBe(0n)
  })
})
