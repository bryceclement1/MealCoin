/**
 * Shared UI utility helpers.
 */

import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * Merge Tailwind CSS class names, resolving conflicts intelligently.
 * Combines clsx (conditional classes) with tailwind-merge (deduplication).
 * Used throughout components to build className strings safely.
 *
 * @example cn('px-4', condition && 'bg-red-500', 'px-2') → 'bg-red-500 px-2'
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
