/**
 * Modal for accepting an existing marketplace offer.
 *
 * Accepting requires two on-chain steps batched into a single UserOp:
 *   - Accepting an ask (seller wants USDC): approve USDC + acceptOffer
 *   - Accepting a bid (buyer wants swipes): approve MST + acceptOffer
 *
 * The accept is atomic on-chain — both assets swap in the same transaction,
 * so neither party can be left without their asset if one step fails.
 *
 * A blackout window at 11:55 PM Saturday prevents accepting offers just
 * before the weekly token burn invalidates them.
 */

'use client'

import { useState } from 'react'
import { useReadContract } from 'wagmi'
import { useSmartAccount } from '@/contexts/SmartAccountContext'
import { sendBatch } from '@/lib/kernel-client'
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

/** Map known contract revert reasons to user-friendly messages. */
const REVERT_MESSAGES: Record<string, string> = {
  CannotAcceptOwnOffer: 'You cannot accept your own offer',
  OfferIsExpired: 'This offer has expired',
  OfferNotPending: 'This offer is no longer available',
  InsufficientTokenAllowance: 'Approval failed — please try again',
  InsufficientAllowance: 'Approval failed — please try again',
  InsufficientBalance: 'Insufficient balance',
}

/**
 * Parse a transaction error and return a human-readable message.
 * Falls back to a generic message if the revert reason is not recognized.
 */
function parseRevertError(error: unknown): string {
  console.error('[acceptOffer] tx error:', error)
  const msg = error instanceof Error ? error.message : String(error)
  for (const [key, value] of Object.entries(REVERT_MESSAGES)) {
    if (msg.includes(key)) return value
  }
  return 'Transaction failed. Please try again.'
}

/**
 * Return true if it is Saturday 11:55 PM or later.
 * Accepting offers in this window is blocked because the tokens will burn
 * at midnight, making any pending offers void.
 */
function isBlackout(): boolean {
  const now = new Date()
  return now.getDay() === 6 && now.getHours() === 23 && now.getMinutes() >= 55
}

interface Props {
  offer: Offer
  onAccepted: () => void
}

/**
 * Render the "Accept" button and its confirmation dialog.
 * Shows a summary of the trade (what the user pays and receives) before confirming.
 * Calls onAccepted() after a successful transaction to refresh the listings.
 */
export function AcceptOfferModal({ offer, onAccepted }: Props) {
  const { smartAddress, kernelClient } = useSmartAccount()
  const { data: mstBalance } = useMSTBalance(smartAddress)
  const { data: usdcBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: 'balanceOf',
    args: smartAddress ? [smartAddress] : undefined,
    query: { enabled: !!smartAddress },
  })

  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDone, setIsDone] = useState(false)

  const isAsk = offer.type === 'ask'
  // Pre-compute total USDC in 6-decimal units for the approval amount
  const totalUsdc = BigInt(Math.round(offer.swipe_count * offer.price_per_swipe * 1_000_000))

  /** Reset form state when the dialog closes. */
  function resetForm() {
    setError('')
    setIsSubmitting(false)
    setIsDone(false)
  }

  /** Reset form state when the dialog closes. */
  function handleOpenChange(val: boolean) {
    setOpen(val)
    if (!val) resetForm()
  }

  /**
   * Validate that the user can afford to accept this offer.
   * Mirrors on-chain constraints to give early feedback before submitting a tx.
   */
  function validate(): boolean {
    if (smartAddress?.toLowerCase() === offer.seller_address.toLowerCase()) {
      setError('You cannot accept your own offer')
      return false
    }
    if (isBlackout()) {
      setError('Offers are disabled during Saturday night blackout (11:55 PM – midnight)')
      return false
    }
    if (isAsk) {
      // Accepting a sell offer: user needs enough USDC
      const usdc = (usdcBalance as bigint | undefined) ?? BigInt(0)
      if (totalUsdc > usdc) {
        setError("You don't have enough USDC")
        return false
      }
    } else {
      // Accepting a buy offer: user needs enough swipes
      const mst = (mstBalance as bigint | undefined) ?? BigInt(0)
      if (BigInt(offer.swipe_count) > mst) {
        setError("You don't have enough swipes")
        return false
      }
    }
    return true
  }

  /**
   * Submit the accept transaction.
   * Batches the token approval + acceptOffer call into a single UserOp.
   */
  async function handleAccept() {
    if (!kernelClient) return
    setError('')
    if (!validate()) return

    setIsSubmitting(true)
    try {
      if (isAsk) {
        // Accepting a sell: pay USDC, receive swipes
        await sendBatch(kernelClient, [
          { address: USDC_ADDRESS, abi: USDC_ABI, functionName: 'approve', args: [MARKET_ADDRESS, totalUsdc] },
          { address: MARKET_ADDRESS, abi: MARKET_ABI, functionName: 'acceptOffer', args: [BigInt(offer.onchain_offer_id)] },
        ])
      } else {
        // Accepting a buy: send swipes, receive USDC
        await sendBatch(kernelClient, [
          { address: TOKEN_ADDRESS, abi: TOKEN_ABI, functionName: 'approve', args: [MARKET_ADDRESS, BigInt(offer.swipe_count)] },
          { address: MARKET_ADDRESS, abi: MARKET_ABI, functionName: 'acceptOffer', args: [BigInt(offer.onchain_offer_id)] },
        ])
      }
      setIsDone(true)
    } catch (e) {
      setError(parseRevertError(e))
    } finally {
      setIsSubmitting(false)
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
            {/* Trade summary — what the user gives and receives */}
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
