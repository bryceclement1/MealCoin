/**
 * Input validation helpers used by the Next.js API routes.
 *
 * These are pure functions with no side effects — they return a boolean or a
 * pre-built NextResponse. All business rule limits (max swipes, max price) are
 * enforced both here and in the smart contracts, so the API and on-chain state
 * stay consistent.
 */

import { NextResponse } from 'next/server'

const WALLET_REGEX = /^0x[a-fA-F0-9]{40}$/

/** Return true if the string is a valid checksummed or lowercase Ethereum address. */
export function validateWalletAddress(address: string): boolean {
  return WALLET_REGEX.test(address)
}

/** Return true if the email ends with @davidson.edu (case-insensitive). */
export function validateDavidsonEmail(email: string): boolean {
  return typeof email === 'string' && email.toLowerCase().endsWith('@davidson.edu')
}

/**
 * Return true if count is a whole number between 1 and 6.
 * Mirrors the MAX_SWIPES_PER_OFFER constraint enforced in the Marketplace contract.
 */
export function validateSwipeCount(count: number): boolean {
  return Number.isInteger(count) && count >= 1 && count <= 6
}

/**
 * Return true if price is a positive number no greater than $12.
 * Mirrors the MAX_PRICE_PER_SWIPE constraint enforced in the Marketplace contract.
 */
export function validatePrice(price: number): boolean {
  return price > 0 && price <= 12
}

/**
 * Build a standardized 400 JSON response for validation failures.
 * Optionally includes the `field` name so the frontend can highlight the
 * specific input that failed.
 */
export function validationError(message: string, field?: string): NextResponse {
  const body: { error: string; field?: string } = { error: message }
  if (field !== undefined) body.field = field
  return NextResponse.json(body, { status: 400 })
}
