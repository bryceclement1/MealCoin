import Link from 'next/link'
import { WalletButton } from '@/components/wallet-button'

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
