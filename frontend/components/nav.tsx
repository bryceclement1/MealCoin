/**
 * Top navigation bar shown on every page.
 *
 * Contains links to all main sections of the app and the wallet connection
 * button. Rendered once in app/layout.tsx, above the VerificationGuard.
 */

import Link from 'next/link'
import { WalletButton } from '@/components/wallet-button'

/** Render the site-wide navigation bar. */
export function Nav() {
  return (
    <nav className="border-b">
      <div className="container mx-auto flex h-14 items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="font-semibold text-lg">
            MealCoin
          </Link>
          <Link
            href="/"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Dashboard
          </Link>
          <Link
            href="/listings"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Listings
          </Link>
          <Link
            href="/redeem"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Redeem
          </Link>
          <Link
            href="/history"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            History
          </Link>
        </div>
        <WalletButton />
      </div>
    </nav>
  )
}
