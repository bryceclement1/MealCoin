'use client'

import { useState, useEffect } from 'react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { isAddress } from 'viem'
import { TOKEN_ADDRESS, TOKEN_ABI } from '@/lib/contracts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

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
  const { address } = useAccount()

  const { data: isApproved, isLoading: isApprovalLoading } = useReadContract({
    address: TOKEN_ADDRESS,
    abi: TOKEN_ABI,
    functionName: 'approvedDining',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })

  if (!address) {
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
    return <DiningTerminal cashierAddress={address} />
  }

  return <StudentView studentAddress={address} />
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
  const [studentAddr, setStudentAddr] = useState('')
  const [error, setError] = useState('')
  const [step, setStep] = useState<Step>('idle')
  const [redeemedAddr, setRedeemedAddr] = useState('')

  const { writeContract, data: txHash, reset } = useWriteContract()
  const receipt = useWaitForTransactionReceipt({ hash: txHash })

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

  useEffect(() => {
    if (receipt.isSuccess && step === 'pending') {
      setStep('done')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt.isSuccess])

  useEffect(() => {
    if (receipt.isError && step === 'pending') {
      setError(parseRevertError(receipt.error))
      setStep('idle')
      reset()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt.isError])

  function handleRedeem() {
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
      writeContract({
        address: TOKEN_ADDRESS,
        abi: TOKEN_ABI,
        functionName: 'redeemSwipe',
        args: [studentAddr as `0x${string}`],
      })
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
    reset()
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
          <p className="text-sm text-muted-foreground">Confirming transaction...</p>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button
          className="w-full"
          onClick={handleRedeem}
          disabled={isPending || !isAddress(studentAddr)}
        >
          {isPending ? 'Redeeming...' : 'Redeem Swipe'}
        </Button>
      </div>
    </PageShell>
  )
}

// ── student display view ──────────────────────────────────────────────────────

function StudentView({ studentAddress }: { studentAddress: `0x${string}` }) {
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

        <div className="rounded-lg border p-4 space-y-1">
          <p className="text-xs text-muted-foreground">Your wallet address</p>
          <p className="font-mono text-sm break-all">{studentAddress}</p>
        </div>

        <p className="text-center text-sm text-muted-foreground">
          Show this page to the dining hall cashier to redeem a swipe.
        </p>
      </div>
    </PageShell>
  )
}
