import * as fs from 'fs'

const STATE_FILE = '.lastblock'

export function loadLastBlock(): bigint | null {
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf8').trim()
    return raw ? BigInt(raw) : null
  } catch {
    return null
  }
}

export function saveLastBlock(block: bigint): void {
  fs.writeFileSync(STATE_FILE, block.toString())
}
