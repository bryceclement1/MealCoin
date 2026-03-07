'use client'

import { useState } from 'react'
import { useAccount } from 'wagmi'
import { Button } from '@/components/ui/button'
import { WalletButton } from '@/components/wallet-button'

export default function OnboardingPage() {
  const { address, isConnected } = useAccount()
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  if (!isConnected) {
    return (
      <main className="flex min-h-[80vh] flex-col items-center justify-center gap-4">
        <h1 className="text-2xl font-bold">Verify your Davidson email</h1>
        <p className="text-muted-foreground">Connect your wallet first to continue.</p>
        <WalletButton />
      </main>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!email.endsWith('@davidson.edu')) {
      setError('Must be a @davidson.edu email address')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet_address: address, davidson_email: email }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Something went wrong')
        return
      }

      setSent(true)
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <main className="flex min-h-[80vh] flex-col items-center justify-center">
        <div className="w-full max-w-sm space-y-4 text-center">
          <h1 className="text-2xl font-bold">Check your email</h1>
          <p className="text-sm text-muted-foreground">
            We sent a verification link to <strong>{email}</strong>. Click it to activate your account.
          </p>
          <button
            onClick={() => setSent(false)}
            className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Didn&apos;t get it? Resend
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="flex min-h-[80vh] flex-col items-center justify-center">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">Verify your Davidson email</h1>
          <p className="text-sm text-muted-foreground">
            Enter your @davidson.edu email to link it to your wallet.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <input
              type="email"
              placeholder="you@davidson.edu"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Verifying...' : 'Verify Email'}
          </Button>
        </form>
      </div>
    </main>
  )
}
