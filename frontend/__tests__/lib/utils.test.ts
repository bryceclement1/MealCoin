/**
 * Tests for the shared UI utility (lib/utils.ts).
 *
 * Covers:
 *   - cn() merges class names correctly
 *   - cn() resolves Tailwind conflicts (last class wins)
 *   - cn() handles conditional classes
 *   - cn() handles empty/falsy inputs without throwing
 */

import { describe, it, expect } from 'vitest'
import { cn } from '@/lib/utils'

describe('cn', () => {
  it('returns a single class unchanged', () => {
    expect(cn('px-4')).toBe('px-4')
  })

  it('joins multiple classes with a space', () => {
    expect(cn('px-4', 'py-2', 'text-sm')).toBe('px-4 py-2 text-sm')
  })

  it('resolves Tailwind conflicts — last padding wins', () => {
    // tailwind-merge keeps the last conflicting class
    expect(cn('px-4', 'px-2')).toBe('px-2')
  })

  it('resolves Tailwind conflicts — last text color wins', () => {
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500')
  })

  it('omits falsy conditional classes', () => {
    const isActive = false
    expect(cn('base-class', isActive && 'active-class')).toBe('base-class')
  })

  it('includes truthy conditional classes', () => {
    const isActive = true
    expect(cn('base-class', isActive && 'active-class')).toBe('base-class active-class')
  })

  it('handles undefined without throwing', () => {
    expect(() => cn('px-4', undefined as any)).not.toThrow()
  })

  it('handles an empty call without throwing', () => {
    expect(() => cn()).not.toThrow()
  })

  it('handles an array of class names', () => {
    expect(cn(['px-4', 'py-2'])).toBe('px-4 py-2')
  })

  it('handles an object of conditional classes', () => {
    expect(cn({ 'font-bold': true, 'italic': false })).toBe('font-bold')
  })
})
