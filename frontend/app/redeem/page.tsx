'use client'

import { useState, useEffect, useRef } from 'react'
import { useReadContract } from 'wagmi'
import { isAddress } from 'viem'
import { useSmartAccount } from '@/contexts/SmartAccountContext'
import { TOKEN_ADDRESS, TOKEN_ABI } from '@/lib/contracts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import QRCode from 'react-qr-code'

// ── helpers ──────────────────────────────────────────────────────────────────

const truncate = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`

const REVERT_MESSAGES: Record<string, string> = {
  NotApprovedDining: 'This wallet is not authorized as a dining terminal',
  InsufficientBalance: 'Student has no swipes remaining this week',
  EpochAlreadyBurned: 'Weekly swipes have already been cleared',
  ZeroAddress: 'Invalid student address',
}

function parseRevertError(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error)
  for (const [key, value] of Object.entries(REVERT_MESSAGES)) {
    if (msg.includes(key)) return value
  }
  return 'Transaction failed. Please try again.'
}

type Step = 'idle' | 'pending' | 'done'

// ── main page ─────────────────────────────────────────────────────────────────

export default function RedeemPage() {
  const { smartAddress } = useSmartAccount()

  const { data: isApproved, isLoading: isApprovalLoading } = useReadContract({
    address: TOKEN_ADDRESS,
    abi: TOKEN_ABI,
    functionName: 'approvedDining',
    args: smartAddress ? [smartAddress] : undefined,
    query: { enabled: !!smartAddress },
  })

  if (!smartAddress) {
    return (
      <PageShell>
        <p className="text-muted-foreground">
          Connect your wallet to continue.
        </p>
      </PageShell>
    )
  }

  if (isApprovalLoading) {
    return (
      <PageShell>
        <p className="text-muted-foreground">Loading...</p>
      </PageShell>
    )
  }

  if (isApproved) {
    return <DiningTerminal cashierAddress={smartAddress} />
  }

  return <StudentView studentAddress={smartAddress} />
}

// ── shared shell ──────────────────────────────────────────────────────────────

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="container mx-auto p-6 max-w-md">
      <h1 className="text-2xl font-bold mb-6">Redeem</h1>
      {children}
    </main>
  )
}

// ── dining terminal view ──────────────────────────────────────────────────────

function DiningTerminal({ cashierAddress }: { cashierAddress: `0x${string}` }) {
  const { kernelClient } = useSmartAccount()
  const [studentAddr, setStudentAddr] = useState('')
  const [error, setError] = useState('')
  const [step, setStep] = useState<Step>('idle')
  const [redeemedAddr, setRedeemedAddr] = useState('')
  const [scannerOpen, setScannerOpen] = useState(false)
  const [scannerError, setScannerError] = useState('')
  const qrScannerRef = useRef<InstanceType<any> | null>(null)

  // Read student balance for live preview
  const { data: week } = useReadContract({
    address: TOKEN_ADDRESS,
    abi: TOKEN_ABI,
    functionName: 'getCurrentWeek',
  })

  const { data: studentBalance } = useReadContract({
    address: TOKEN_ADDRESS,
    abi: TOKEN_ABI,
    functionName: 'balanceOf',
    args: isAddress(studentAddr) && week !== undefined ? [studentAddr as `0x${string}`, week] : undefined,
    query: { enabled: isAddress(studentAddr) && week !== undefined },
  })

  // Scanner lifecycle — dynamically import html5-qrcode to avoid SSR issues
  useEffect(() => {
    if (!scannerOpen) return

    let html5QrScanner: InstanceType<any> | null = null
    let stopped = false // guards against race: import resolves after cleanup fires

    import('html5-qrcode').then(({ Html5Qrcode }) => {
      if (stopped) return

      html5QrScanner = new Html5Qrcode('qr-reader')
      qrScannerRef.current = html5QrScanner

      html5QrScanner
        .start(
          { facingMode: 'environment' }, // rear cam on mobile; falls back to FaceTime on Mac
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText: string) => {
            if (isAddress(decodedText)) {
              setStudentAddr(decodedText)
              setScannerError('')
              // Null out before setScannerOpen(false) so the cleanup effect
              // doesn't attempt a second .stop() on an already-stopped scanner.
              // Use try/catch because .stop() throws synchronously (not a rejected
              // promise) when the scanner is not in a running state.
              const scanner = html5QrScanner
              html5QrScanner = null
              qrScannerRef.current = null
              try { scanner?.stop() } catch (_) {}
              setScannerOpen(false)
            } else {
              setScannerError('QR code is not a valid wallet address')
              // keep scanner open to retry
            }
          },
          () => { /* per-frame non-match — ignore */ }
        )
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err)
          if (msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('denied')) {
            setScannerError('Camera access denied. Enter address manually.')
          } else {
            setScannerError('Could not start camera. Enter address manually.')
          }
          setScannerOpen(false)
        })
    })

    return () => {
      stopped = true
      if (html5QrScanner) {
        const scanner = html5QrScanner
        html5QrScanner = null
        qrScannerRef.current = null
        try { scanner.stop() } catch (_) {}
      }
    }
  }, [scannerOpen])

  async function handleRedeem() {
    if (!kernelClient) return
    setError('')
    if (!isAddress(studentAddr)) {
      setError('Enter a valid wallet address')
      return
    }
    if (studentBalance !== undefined && (studentBalance as bigint) === BigInt(0)) {
      setError('Student has no swipes remaining this week')
      return
    }
    setRedeemedAddr(studentAddr)
    setStep('pending')
    try {
      await kernelClient.writeContract({
        address: TOKEN_ADDRESS,
        abi: TOKEN_ABI,
        functionName: 'redeemSwipe',
        args: [studentAddr as `0x${string}`],
      })
      setStep('done')
    } catch (e) {
      setError(parseRevertError(e))
      setStep('idle')
    }
  }

  function handleRedeemAnother() {
    setStudentAddr('')
    setError('')
    setStep('idle')
    setRedeemedAddr('')
  }

  if (step === 'done') {
    return (
      <PageShell>
        <div className="text-center space-y-3 py-8">
          <p className="text-4xl">✓</p>
          <p className="text-xl font-semibold">Swipe redeemed!</p>
          <p className="text-sm text-muted-foreground">From: {truncate(redeemedAddr)}</p>
          <Button className="w-full mt-4" onClick={handleRedeemAnother}>
            Redeem Another
          </Button>
        </div>
      </PageShell>
    )
  }

  const isPending = step === 'pending'
  const hasBalance = studentBalance !== undefined && (studentBalance as bigint) > BigInt(0)
  const balanceNum = studentBalance !== undefined ? Number(studentBalance as bigint) : null

  return (
    <PageShell>
      <p className="text-xs text-muted-foreground mb-6">
        Terminal: {truncate(cashierAddress)}
      </p>

      <div className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="studentAddr">Student wallet address</Label>
          <Input
            id="studentAddr"
            placeholder="0x..."
            value={studentAddr}
            onChange={(e) => { setStudentAddr(e.target.value); setError('') }}
            disabled={isPending}
          />
        </div>

        {isAddress(studentAddr) && balanceNum !== null && (
          <p className={`text-sm ${hasBalance ? 'text-muted-foreground' : 'text-destructive'}`}>
            Balance: {balanceNum} swipe{balanceNum !== 1 ? 's' : ''} this week
          </p>
        )}

        {isPending && (
          <p className="text-sm text-muted-foreground">Processing...</p>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => { setScannerOpen(prev => !prev); setScannerError('') }}
            disabled={isPending}
          >
            {scannerOpen ? 'Cancel Scan' : 'Scan QR'}
          </Button>
          <Button
            className="flex-1"
            onClick={handleRedeem}
            disabled={isPending || !isAddress(studentAddr)}
          >
            {isPending ? 'Redeeming...' : 'Redeem Swipe'}
          </Button>
        </div>

        {scannerOpen && (
          <div className="space-y-2">
            <div
              id="qr-reader"
              className="w-full rounded-lg overflow-hidden border"
              style={{ minHeight: '300px' }}
            />
            {scannerError && (
              <p className="text-sm text-destructive">{scannerError}</p>
            )}
          </div>
        )}
      </div>
    </PageShell>
  )
}

// ── student display view ──────────────────────────────────────────────────────

function StudentView({ studentAddress }: { studentAddress: `0x${string}` }) {
  const [copied, setCopied] = useState(false)

  const { data: week } = useReadContract({
    address: TOKEN_ADDRESS,
    abi: TOKEN_ABI,
    functionName: 'getCurrentWeek',
  })

  const { data: balance, isLoading } = useReadContract({
    address: TOKEN_ADDRESS,
    abi: TOKEN_ABI,
    functionName: 'balanceOf',
    args: week !== undefined ? [studentAddress, week] : undefined,
    query: { enabled: week !== undefined },
  })

  const balanceNum = balance !== undefined ? Number(balance as bigint) : null

  async function handleCopy() {
    await navigator.clipboard.writeText(studentAddress)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <PageShell>
      <div className="space-y-6">
        <div className="rounded-lg border p-6 text-center space-y-2">
          {isLoading || balanceNum === null ? (
            <p className="text-muted-foreground text-sm">Loading balance...</p>
          ) : (
            <>
              <p className="text-6xl font-bold">{balanceNum}</p>
              <p className="text-muted-foreground text-sm">
                swipe{balanceNum !== 1 ? 's' : ''} available this week
              </p>
            </>
          )}
        </div>

        <div className="rounded-lg border p-6 flex flex-col items-center space-y-4">
          {/* bg-white wrapper ensures contrast in dark mode — QRs require light background */}
          <div className="bg-white p-3 rounded-lg">
            <QRCode value={studentAddress} size={200} />
          </div>
          <p className="font-mono text-xs break-all text-center">{studentAddress}</p>
          <Button variant="outline" size="sm" onClick={handleCopy} className="w-full">
            {copied ? 'Copied!' : 'Copy Address'}
          </Button>
        </div>

        <p className="text-center text-sm text-muted-foreground">
          Show this QR code to the dining hall cashier to redeem a swipe.
        </p>
      </div>
    </PageShell>
  )
}
