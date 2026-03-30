'use client'

import { useState } from 'react'
import { useAccount, useReadContract, useSendCalls, useCallsStatus } from 'wagmi'
import { useMSTBalance } from '@/hooks/use-mst-balance'
import { type Offer } from '@/lib/api'
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

const PAYMASTER_URL = process.env.NEXT_PUBLIC_PAYMASTER_URL

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

interface Props {
  offer: Offer
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

  const { mutate: sendCalls, data: batchResult, isPending, reset } = useSendCalls()

  const { data: callsStatus } = useCallsStatus({
    id: batchResult?.id as string,
    query: {
      enabled: !!batchResult?.id,
      refetchInterval: (data) => (data?.status === 'CONFIRMED' ? false : 1000),
    },
  })

  const isDone = callsStatus?.status === 'CONFIRMED'
  const isSubmitting = isPending || (!!batchResult?.id && !isDone)
  const isAsk = offer.type === 'ask'
  const totalUsdc = BigInt(Math.round(offer.swipe_count * offer.price_per_swipe * 1_000_000))

  function resetForm() {
    setError('')
    reset()
  }

  function handleOpenChange(val: boolean) {
    setOpen(val)
    if (!val) resetForm()
  }

  function validate(): boolean {
    if (address?.toLowerCase() === offer.seller_address.toLowerCase()) {
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
      if (BigInt(offer.swipe_count) > mst) {
        setError("You don't have enough swipes")
        return false
      }
    }
    return true
  }

  function handleAccept() {
    setError('')
    if (!validate()) return

    try {
      if (isAsk) {
        sendCalls({
          calls: [
            { to: USDC_ADDRESS, abi: USDC_ABI, functionName: 'approve', args: [MARKET_ADDRESS, totalUsdc] },
            { to: MARKET_ADDRESS, abi: MARKET_ABI, functionName: 'acceptOffer', args: [BigInt(offer.onchain_offer_id)] },
          ],
          capabilities: PAYMASTER_URL ? { paymasterService: { url: PAYMASTER_URL } } : undefined,
        })
      } else {
        sendCalls({
          calls: [
            { to: TOKEN_ADDRESS, abi: TOKEN_ABI, functionName: 'approve', args: [MARKET_ADDRESS, BigInt(offer.swipe_count)] },
            { to: MARKET_ADDRESS, abi: MARKET_ABI, functionName: 'acceptOffer', args: [BigInt(offer.onchain_offer_id)] },
          ],
          capabilities: PAYMASTER_URL ? { paymasterService: { url: PAYMASTER_URL } } : undefined,
        })
      }
    } catch (e) {
      setError(parseRevertError(e))
    }
  }

  const blackout = isBlackout()

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">Accept</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Accept Offer</DialogTitle>
        </DialogHeader>

        {isDone ? (
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
            <div className="rounded-md border p-4 space-y-1 text-sm">
              {isAsk ? (
                <>
                  <p>You pay <span className="font-semibold">${(offer.swipe_count * offer.price_per_swipe).toFixed(2)} USDC</span></p>
                  <p>You receive <span className="font-semibold">{offer.swipe_count} swipe{offer.swipe_count !== 1 ? 's' : ''}</span></p>
                </>
              ) : (
                <>
                  <p>You send <span className="font-semibold">{offer.swipe_count} swipe{offer.swipe_count !== 1 ? 's' : ''}</span></p>
                  <p>You receive <span className="font-semibold">${(offer.swipe_count * offer.price_per_swipe).toFixed(2)} USDC</span></p>
                </>
              )}
              <p className="text-muted-foreground">${offer.price_per_swipe.toFixed(2)} per swipe</p>
            </div>

            {blackout && !isSubmitting && (
              <p className="text-sm text-destructive">
                Offers are disabled during Saturday night blackout (11:55 PM – midnight).
              </p>
            )}

            {isSubmitting && (
              <p className="text-sm text-muted-foreground">Submitting...</p>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button
              className="w-full"
              onClick={handleAccept}
              disabled={isSubmitting || blackout}
            >
              {isSubmitting ? 'Submitting...' : 'Confirm'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
