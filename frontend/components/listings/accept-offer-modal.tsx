'use client'

import { useState, useEffect } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi'
import { useMSTBalance } from '@/hooks/use-mst-balance'
import { type OnChainOffer } from '@/hooks/use-market-offers'
import {
  TOKEN_ADDRESS, TOKEN_ABI,
  MARKET_ADDRESS, MARKET_ABI,
  USDC_ADDRESS, USDC_ABI,
} from '@/lib/contracts'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

const toUSDCDisplay = (raw: bigint) => `$${(Number(raw) / 1_000_000).toFixed(2)}`

const REVERT_MESSAGES: Record<string, string> = {
  CannotAcceptOwnOffer: 'You cannot accept your own offer',
  OfferIsExpired: 'This offer has expired',
  OfferNotPending: 'This offer is no longer available',
  InsufficientTokenAllowance: 'Approval failed — please try again',
  InsufficientAllowance: 'Approval failed — please try again',
  InsufficientBalance: 'Insufficient balance',
}

function parseRevertError(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error)
  for (const [key, value] of Object.entries(REVERT_MESSAGES)) {
    if (msg.includes(key)) return value
  }
  return 'Transaction failed. Please try again.'
}

function isBlackout(): boolean {
  const now = new Date()
  return now.getDay() === 6 && now.getHours() === 23 && now.getMinutes() >= 55
}

type Step = 'idle' | 'approving' | 'accepting' | 'done'

interface Props {
  offer: OnChainOffer
  onAccepted: () => void
}

export function AcceptOfferModal({ offer, onAccepted }: Props) {
  const { address } = useAccount()
  const { data: mstBalance } = useMSTBalance(address)
  const { data: usdcBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })

  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const [step, setStep] = useState<Step>('idle')

  const { writeContract: writeApprove, data: approveTxHash, reset: resetApprove } = useWriteContract()
  const { writeContract: writeAccept, data: acceptTxHash, reset: resetAccept } = useWriteContract()

  const approveReceipt = useWaitForTransactionReceipt({ hash: approveTxHash })
  const acceptReceipt = useWaitForTransactionReceipt({ hash: acceptTxHash })

  const isAsk = offer.offerType === 0
  const totalUsdc = offer.swipeCount * offer.pricePerSwipe

  // Approval confirmed → submit acceptOffer
  useEffect(() => {
    if (approveReceipt.isSuccess && step === 'approving') {
      setStep('accepting')
      try {
        writeAccept({
          address: MARKET_ADDRESS,
          abi: MARKET_ABI,
          functionName: 'acceptOffer',
          args: [offer.offerId],
        })
      } catch (e) {
        setError(parseRevertError(e))
        setStep('idle')
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approveReceipt.isSuccess])

  // Accept confirmed → done
  useEffect(() => {
    if (acceptReceipt.isSuccess && step === 'accepting') {
      setStep('done')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acceptReceipt.isSuccess])

  // Handle failed receipts
  useEffect(() => {
    if (approveReceipt.isError && step === 'approving') {
      setError(parseRevertError(approveReceipt.error))
      setStep('idle')
      resetApprove()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approveReceipt.isError])

  useEffect(() => {
    if (acceptReceipt.isError && step === 'accepting') {
      setError(parseRevertError(acceptReceipt.error))
      setStep('idle')
      resetAccept()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acceptReceipt.isError])

  function resetForm() {
    setError('')
    setStep('idle')
    resetApprove()
    resetAccept()
  }

  function handleOpenChange(val: boolean) {
    setOpen(val)
    if (!val) resetForm()
  }

  function validate(): boolean {
    if (address?.toLowerCase() === offer.creator.toLowerCase()) {
      setError('You cannot accept your own offer')
      return false
    }
    if (isBlackout()) {
      setError('Offers are disabled during Saturday night blackout (11:55 PM – midnight)')
      return false
    }
    if (isAsk) {
      const usdc = (usdcBalance as bigint | undefined) ?? BigInt(0)
      if (totalUsdc > usdc) {
        setError("You don't have enough USDC")
        return false
      }
    } else {
      const mst = (mstBalance as bigint | undefined) ?? BigInt(0)
      if (offer.swipeCount > mst) {
        setError("You don't have enough swipes")
        return false
      }
    }
    return true
  }

  function handleAccept() {
    setError('')
    if (!validate()) return

    setStep('approving')
    try {
      if (isAsk) {
        writeApprove({
          address: USDC_ADDRESS,
          abi: USDC_ABI,
          functionName: 'approve',
          args: [MARKET_ADDRESS, totalUsdc],
        })
      } else {
        writeApprove({
          address: TOKEN_ADDRESS,
          abi: TOKEN_ABI,
          functionName: 'approve',
          args: [MARKET_ADDRESS, offer.swipeCount],
        })
      }
    } catch (e) {
      setError(parseRevertError(e))
      setStep('idle')
    }
  }

  const isPending = step === 'approving' || step === 'accepting'
  const blackout = isBlackout()

  function stepLabel() {
    if (step === 'approving') return 'Step 1 of 2: Approving...'
    if (step === 'accepting') return 'Step 2 of 2: Accepting offer...'
    return null
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">Accept</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Accept Offer</DialogTitle>
        </DialogHeader>

        {step === 'done' ? (
          <div className="py-6 text-center space-y-2">
            <p className="text-2xl">✓</p>
            <p className="font-medium">Offer accepted!</p>
            <Button
              className="w-full mt-2"
              onClick={() => { handleOpenChange(false); onAccepted() }}
            >
              Done
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Offer summary */}
            <div className="rounded-md border p-4 space-y-1 text-sm">
              {isAsk ? (
                <>
                  <p>You pay <span className="font-semibold">{toUSDCDisplay(totalUsdc)} USDC</span></p>
                  <p>You receive <span className="font-semibold">{Number(offer.swipeCount)} swipe{Number(offer.swipeCount) !== 1 ? 's' : ''}</span></p>
                </>
              ) : (
                <>
                  <p>You send <span className="font-semibold">{Number(offer.swipeCount)} swipe{Number(offer.swipeCount) !== 1 ? 's' : ''}</span></p>
                  <p>You receive <span className="font-semibold">{toUSDCDisplay(totalUsdc)} USDC</span></p>
                </>
              )}
              <p className="text-muted-foreground">{toUSDCDisplay(offer.pricePerSwipe)} per swipe</p>
            </div>

            {blackout && !isPending && (
              <p className="text-sm text-destructive">
                Offers are disabled during Saturday night blackout (11:55 PM – midnight).
              </p>
            )}

            {stepLabel() && (
              <p className="text-sm text-muted-foreground">{stepLabel()}</p>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button
              className="w-full"
              onClick={handleAccept}
              disabled={isPending || blackout}
            >
              {isPending ? stepLabel() : 'Confirm'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
