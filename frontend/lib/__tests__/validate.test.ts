import { describe, it, expect } from 'vitest'
import {
  validateWalletAddress,
  validateDavidsonEmail,
  validateSwipeCount,
  validatePrice,
  validationError,
} from '@/lib/validate'

// ─── validateWalletAddress ────────────────────────────────────────────────────

describe('validateWalletAddress', () => {
  it('accepts a valid lowercase 40-hex address', () => {
    expect(validateWalletAddress('0xabcdef1234567890abcdef1234567890abcdef12')).toBe(true)
  })

  it('accepts a valid uppercase 40-hex address', () => {
    expect(validateWalletAddress('0xABCDEF1234567890ABCDEF1234567890ABCDEF12')).toBe(true)
  })

  it('accepts a valid mixed-case address', () => {
    expect(validateWalletAddress('0xAbCdEf1234567890AbCdEf1234567890AbCdEf12')).toBe(true)
  })

  it('rejects an address that is too short', () => {
    expect(validateWalletAddress('0x1234')).toBe(false)
  })

  it('rejects an address that is too long', () => {
    expect(validateWalletAddress('0xabcdef1234567890abcdef1234567890abcdef1234')).toBe(false)
  })

  it('rejects an address missing the 0x prefix', () => {
    expect(validateWalletAddress('abcdef1234567890abcdef1234567890abcdef12')).toBe(false)
  })

  it('rejects an address with invalid hex characters', () => {
    expect(validateWalletAddress('0xGGGGGG1234567890abcdef1234567890abcdef12')).toBe(false)
  })

  it('rejects an empty string', () => {
    expect(validateWalletAddress('')).toBe(false)
  })

  it('rejects a plain string with no hex', () => {
    expect(validateWalletAddress('not-a-wallet')).toBe(false)
  })
})

// ─── validateDavidsonEmail ────────────────────────────────────────────────────

describe('validateDavidsonEmail', () => {
  it('accepts a valid @davidson.edu email', () => {
    expect(validateDavidsonEmail('jdoe@davidson.edu')).toBe(true)
  })

  it('accepts an uppercase @davidson.edu email (case-insensitive)', () => {
    expect(validateDavidsonEmail('JDOE@DAVIDSON.EDU')).toBe(true)
  })

  it('rejects a non-davidson email', () => {
    expect(validateDavidsonEmail('jdoe@gmail.com')).toBe(false)
  })

  it('rejects a domain that merely contains davidson.edu as a substring', () => {
    expect(validateDavidsonEmail('jdoe@notdavidson.edu')).toBe(false)
  })

  it('rejects an email with no @', () => {
    expect(validateDavidsonEmail('davidson.edu')).toBe(false)
  })

  it('rejects an empty string', () => {
    expect(validateDavidsonEmail('')).toBe(false)
  })
})

// ─── validateSwipeCount ───────────────────────────────────────────────────────

describe('validateSwipeCount', () => {
  it.each([1, 2, 3, 4, 5, 6])('accepts %i as valid', (n) => {
    expect(validateSwipeCount(n)).toBe(true)
  })

  it('rejects 0', () => {
    expect(validateSwipeCount(0)).toBe(false)
  })

  it('rejects 7', () => {
    expect(validateSwipeCount(7)).toBe(false)
  })

  it('rejects a negative number', () => {
    expect(validateSwipeCount(-1)).toBe(false)
  })

  it('rejects a non-integer (float)', () => {
    expect(validateSwipeCount(1.5)).toBe(false)
  })
})

// ─── validatePrice ────────────────────────────────────────────────────────────

describe('validatePrice', () => {
  it('accepts the minimum valid price of 1', () => {
    expect(validatePrice(1)).toBe(true)
  })

  it('accepts a mid-range price of $7.00 (7_000_000)', () => {
    expect(validatePrice(7_000_000)).toBe(true)
  })

  it('accepts the maximum price of $12.00 (12_000_000)', () => {
    expect(validatePrice(12_000_000)).toBe(true)
  })

  it('rejects 0', () => {
    expect(validatePrice(0)).toBe(false)
  })

  it('rejects a price one unit above the maximum (12_000_001)', () => {
    expect(validatePrice(12_000_001)).toBe(false)
  })

  it('rejects a negative price', () => {
    expect(validatePrice(-1)).toBe(false)
  })
})

// ─── validationError ─────────────────────────────────────────────────────────

describe('validationError', () => {
  it('returns a 400 response', () => {
    const res = validationError('Something went wrong')
    expect(res.status).toBe(400)
  })

  it('returns the error message in the response body', async () => {
    const res = validationError('Invalid wallet address')
    const body = await res.json()
    expect(body).toEqual({ error: 'Invalid wallet address' })
  })

  it('includes the field when provided', async () => {
    const res = validationError('Invalid wallet address', 'wallet_address')
    const body = await res.json()
    expect(body).toEqual({ error: 'Invalid wallet address', field: 'wallet_address' })
  })

  it('omits the field key when field is not provided', async () => {
    const res = validationError('Something went wrong')
    const body = await res.json()
    expect(body).not.toHaveProperty('field')
  })

  it('sets Content-Type to application/json', () => {
    const res = validationError('Error')
    expect(res.headers.get('content-type')).toContain('application/json')
  })
})
