'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function ConfirmPage() {
  const router = useRouter()
  const [error, setError] = useState('')

  useEffect(() => {
    async function finalize() {
      // Supabase implicit flow appends auth params to the URL hash:
      // #access_token=xxx&refresh_token=xxx&type=magiclink&...
      const hash = window.location.hash.substring(1)
      const params = new URLSearchParams(hash)
      const accessToken = params.get('access_token')

      if (!accessToken) {
        setError('Invalid verification link — no token found.')
        return
      }

      // Decode the JWT payload to extract the email (no library needed)
      let email: string
      try {
        const payload = JSON.parse(
          atob(accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))
        )
        email = payload.email
        if (!email) throw new Error('no email in token')
      } catch {
        setError('Could not read email from verification token.')
        return
      }

      const res = await fetch('/api/verify/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ davidson_email: email }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Verification failed.')
        return
      }

      router.push('/')
    }

    finalize()
  }, [router])

  if (error) {
    return (
      <main className="flex min-h-[80vh] flex-col items-center justify-center gap-4">
        <h1 className="text-2xl font-bold">Verification failed</h1>
        <p className="text-sm text-destructive">{error}</p>
        <a href="/onboarding" className="text-sm underline underline-offset-4">
          Try again
        </a>
      </main>
    )
  }

  return (
    <main className="flex min-h-[80vh] flex-col items-center justify-center">
      <p className="text-muted-foreground">Verifying your email…</p>
    </main>
  )
}
