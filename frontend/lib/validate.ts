import { NextResponse } from 'next/server'

const WALLET_REGEX = /^0x[a-fA-F0-9]{40}$/

export function validateWalletAddress(address: string): boolean {
  return WALLET_REGEX.test(address)
}

export function validateDavidsonEmail(email: string): boolean {
  return typeof email === 'string' && email.toLowerCase().endsWith('@davidson.edu')
}

export function validateSwipeCount(count: number): boolean {
  return Number.isInteger(count) && count >= 1 && count <= 6
}

export function validatePrice(price: number): boolean {
  return price > 0 && price <= 12
}

export function validationError(message: string, field?: string): NextResponse {
  const body: { error: string; field?: string } = { error: message }
  if (field !== undefined) body.field = field
  return NextResponse.json(body, { status: 400 })
}
