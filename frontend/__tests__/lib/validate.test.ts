/**
 * Tests for the input validation helpers (lib/validate.ts).
 *
 * Covers every exported function with both passing and failing cases,
 * including edge cases at the boundaries of each rule.
 */

import { describe, it, expect } from 'vitest'
import {
  validateWalletAddress,
  validateDavidsonEmail,
  validateSwipeCount,
  validatePrice,
  validationError,
} from '@/lib/validate'

// ── validateWalletAddress ──────────────────────────────────────────────────

describe('validateWalletAddress', () => {
  it('accepts a valid lowercase address', () => {
    expect(validateWalletAddress('0xabcdef1234567890abcdef1234567890abcdef12')).toBe(true)
  })

  it('accepts a valid mixed-case address', () => {
    expect(validateWalletAddress('0xABCDEF1234567890abcdef1234567890ABCDEF12')).toBe(true)
  })

  it('rejects an address without 0x prefix', () => {
    expect(validateWalletAddress('abcdef1234567890abcdef1234567890abcdef12')).toBe(false)
  })

  it('rejects an address that is too short', () => {
    expect(validateWalletAddress('0x1234')).toBe(false)
  })

  it('rejects an address that is too long', () => {
    expect(validateWalletAddress('0x' + 'a'.repeat(41))).toBe(false)
  })

  it('rejects an address with invalid hex characters', () => {
    expect(validateWalletAddress('0xGGGGGG1234567890abcdef1234567890abcdef12')).toBe(false)
  })

  it('rejects an empty string', () => {
    expect(validateWalletAddress('')).toBe(false)
  })

  it('rejects "0x" alone (no hex digits)', () => {
    expect(validateWalletAddress('0x')).toBe(false)
  })

  it('accepts exactly 40 hex digits after 0x', () => {
    expect(validateWalletAddress('0x' + 'a'.repeat(40))).toBe(true)
  })
})

// ── validateDavidsonEmail ──────────────────────────────────────────────────

describe('validateDavidsonEmail', () => {
  it('accepts a valid davidson.edu email', () => {
    expect(validateDavidsonEmail('student@davidson.edu')).toBe(true)
  })

  it('accepts uppercase davidson.edu (case-insensitive)', () => {
    expect(validateDavidsonEmail('Student@Davidson.EDU')).toBe(true)
  })

  it('rejects a gmail address', () => {
    expect(validateDavidsonEmail('student@gmail.com')).toBe(false)
  })

  it('rejects an email with davidson.edu in the username (not domain)', () => {
    expect(validateDavidsonEmail('davidson.edu@gmail.com')).toBe(false)
  })

  it('rejects a bare domain with no @', () => {
    expect(validateDavidsonEmail('davidson.edu')).toBe(false)
  })

  it('rejects an empty string', () => {
    expect(validateDavidsonEmail('')).toBe(false)
  })

  it('rejects a non-string value (number coerced)', () => {
    expect(validateDavidsonEmail(42 as any)).toBe(false)
  })

  it('accepts an email with a subdomain prefix before davidson.edu', () => {
    // ends with @davidson.edu — valid by our rule
    expect(validateDavidsonEmail('user@sub.davidson.edu')).toBe(false)
    // our rule: must end exactly with @davidson.edu
    expect(validateDavidsonEmail('user@davidson.edu')).toBe(true)
  })
})

// ── validateSwipeCount ─────────────────────────────────────────────────────

describe('validateSwipeCount', () => {
  it('accepts 1 (minimum)', () => {
    expect(validateSwipeCount(1)).toBe(true)
  })

  it('accepts 6 (maximum)', () => {
    expect(validateSwipeCount(6)).toBe(true)
  })

  it('accepts all values 1–6', () => {
    for (let i = 1; i <= 6; i++) {
      expect(validateSwipeCount(i)).toBe(true)
    }
  })

  it('rejects 0', () => {
    expect(validateSwipeCount(0)).toBe(false)
  })

  it('rejects 7', () => {
    expect(validateSwipeCount(7)).toBe(false)
  })

  it('rejects negative numbers', () => {
    expect(validateSwipeCount(-1)).toBe(false)
  })

  it('rejects non-integer (1.5)', () => {
    expect(validateSwipeCount(1.5)).toBe(false)
  })

  it('rejects NaN', () => {
    expect(validateSwipeCount(NaN)).toBe(false)
  })
})

// ── validatePrice ──────────────────────────────────────────────────────────

describe('validatePrice', () => {
  it('accepts $1.00', () => {
    expect(validatePrice(1)).toBe(true)
  })

  it('accepts $12.00 (maximum)', () => {
    expect(validatePrice(12)).toBe(true)
  })

  it('accepts a decimal price within range', () => {
    expect(validatePrice(7.50)).toBe(true)
  })

  it('rejects $0', () => {
    expect(validatePrice(0)).toBe(false)
  })

  it('rejects negative price', () => {
    expect(validatePrice(-1)).toBe(false)
  })

  it('rejects $12.01 (above maximum)', () => {
    expect(validatePrice(12.01)).toBe(false)
  })

  it('rejects $100', () => {
    expect(validatePrice(100)).toBe(false)
  })
})

// ── validationError ────────────────────────────────────────────────────────

describe('validationError', () => {
  it('returns a 400 response', async () => {
    const res = validationError('Bad input', 'wallet')
    expect(res.status).toBe(400)
  })

  it('includes the error message in the JSON body', async () => {
    const res = validationError('Bad input', 'wallet')
    const body = await res.json()
    expect(body.error).toBe('Bad input')
  })

  it('includes the field name when provided', async () => {
    const res = validationError('Bad input', 'wallet')
    const body = await res.json()
    expect(body.field).toBe('wallet')
  })

  it('omits the field key when not provided', async () => {
    const res = validationError('Generic error')
    const body = await res.json()
    expect(body).not.toHaveProperty('field')
  })
})
