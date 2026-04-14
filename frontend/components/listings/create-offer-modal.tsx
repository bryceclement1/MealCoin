/**
 * Modal for creating a new ask (sell) or bid (buy) offer on the Marketplace.
 *
 * Creating an offer requires two on-chain steps batched into a single UserOp:
 *   - Ask: approve(Marketplace, swipeCount) + createSellOffer(count, price)
 *   - Bid: approve(Marketplace, totalUSDC) + createBuyOffer(count, price)
 *
 * Batching is critical — without it the user would need to sign two separate
 * transactions, and the approval would be useless if the second tx failed.
 *
 * A "blackout" window at 11:55 PM Saturday disables offer creation to prevent
 * offers being posted just before the weekly token burn.
 */

'use client'

import { useState } from 'react'
import { useReadContract } from 'wagmi'
import { useSmartAccount } from '@/contexts/SmartAccountContext'
import { sendBatch } from '@/lib/kernel-client'
import { useMSTBalance } from '@/hooks/use-mst-balance'
import {
  TOKEN_ADDRESS, TOKEN_ABI,
  MARKET_ADDRESS, MARKET_ABI,
  USDC_ADDRESS, USDC_ABI,
} from '@/lib/contracts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

/** Convert a dollar amount to USDC's 6-decimal integer format (e.g. 7.00 → 7_000_000n). */
const toUSDC = (dollars: number) => BigInt(Math.round(dollars * 1_000_000))

/** Map known contract revert reasons to user-friendly messages. */
const REVERT_MESSAGES: Record<string, string> = {
  InsufficientBalance: "You don't have enough swipes",
  InsufficientAllowance: 'Approval failed — please try again',
  InsufficientTokenAllowance: 'Token approval insufficient — please try again',
  PriceExceedsMax: 'Price cannot exceed $12 per swipe',
  InvalidAmount: 'Invalid swipe count',
  InvalidSwipeCount: 'Invalid swipe count',
  InvalidPrice: 'Price must be greater than $0',
  OfferAlreadyExpired: 'Cannot post offer — weekly expiry window has passed',
}

/**
 * Parse a transaction error and return a human-readable message.
 * Falls back to a generic message if the revert reason is not recognized.
 */
function parseRevertError(error: unknown): string {
  console.error('[createOffer] tx error:', error)
  const msg = error instanceof Error ? error.message : String(error)
  for (const [key, value] of Object.entries(REVERT_MESSAGES)) {
    if (msg.includes(key)) return value
  }
  return 'Transaction failed. Please try again.'
}

/**
 * Return true if it is Saturday 11:55 PM or later.
 * Offers posted in this window would expire almost immediately once the
 * weekly burn fires at midnight, so we block them client-side.
 */
function isBlackout(): boolean {
  const now = new Date()
  return now.getDay() === 6 && now.getHours() === 23 && now.getMinutes() >= 55
}

type OfferType = 'ask' | 'bid'

/**
 * Render the "Post Offer" button and its offer creation dialog.
 * Handles form state, client-side validation, and the batched approval + create transaction.
 */
export function CreateOfferModal() {
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
  const [offerType, setOfferType] = useState<OfferType>('ask')
  const [swipeCount, setSwipeCount] = useState(1)
  const [pricePerSwipe, setPricePerSwipe] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDone, setIsDone] = useState(false)

  /** Reset all form fields to their defaults. */
  function resetForm() {
    setOfferType('ask')
    setSwipeCount(1)
    setPricePerSwipe('')
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
   * Validate form inputs against business rules.
   * Returns true if valid, false (and sets error) if not.
   * Mirrors on-chain constraints so the UI catches errors before the transaction.
   */
  function validate(): boolean {
    const price = parseFloat(pricePerSwipe)
    if (!pricePerSwipe || isNaN(price) || price <= 0) {
      setError('Enter a valid price')
      return false
    }
    if (price > 12) {
      setError('Price cannot exceed $12 per swipe')
      return false
    }
    if (swipeCount < 1 || swipeCount > 6) {
      setError('Swipe count must be between 1 and 6')
      return false
    }
    if (offerType === 'ask') {
      const mst = Number(mstBalance ?? BigInt(0))
      if (swipeCount > mst) {
        setError("You don't have enough swipes")
        return false
      }
    } else {
      const total = toUSDC(parseFloat(pricePerSwipe) * swipeCount)
      const usdc = (usdcBalance as bigint | undefined) ?? BigInt(0)
      if (total > usdc) {
        setError("You don't have enough USDC")
        return false
      }
    }
    if (isBlackout()) {
      setError('Offers are disabled during Saturday night blackout (11:55 PM – midnight)')
      return false
    }
    return true
  }

  /**
   * Submit the offer creation transaction.
   * For asks: batches token approval + createSellOffer in one UserOp.
   * For bids: batches USDC approval + createBuyOffer in one UserOp.
   */
  async function handleSubmit() {
    if (!kernelClient) return
    setError('')
    if (!validate()) return

    const price = toUSDC(parseFloat(pricePerSwipe))
    const count = BigInt(swipeCount)

    setIsSubmitting(true)
    try {
      if (offerType === 'ask') {
        await sendBatch(kernelClient, [
          { address: TOKEN_ADDRESS, abi: TOKEN_ABI, functionName: 'approve', args: [MARKET_ADDRESS, count] },
          { address: MARKET_ADDRESS, abi: MARKET_ABI, functionName: 'createSellOffer', args: [count, price] },
        ])
      } else {
        const totalUsdc = price * count
        await sendBatch(kernelClient, [
          { address: USDC_ADDRESS, abi: USDC_ABI, functionName: 'approve', args: [MARKET_ADDRESS, totalUsdc] },
          { address: MARKET_ADDRESS, abi: MARKET_ABI, functionName: 'createBuyOffer', args: [count, price] },
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
        <Button>Post Offer</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Create Offer</DialogTitle>
        </DialogHeader>

        {isDone ? (
          <div className="py-6 text-center space-y-2">
            <p className="text-2xl">✓</p>
            <p className="font-medium">Offer created!</p>
            <Button className="w-full mt-2" onClick={() => handleOpenChange(false)}>
              Done
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Offer type toggle */}
            <div className="space-y-1">
              <Label>Offer type</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={offerType === 'ask' ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => setOfferType('ask')}
                  disabled={isSubmitting}
                >
                  Ask (Sell)
                </Button>
                <Button
                  type="button"
                  variant={offerType === 'bid' ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => setOfferType('bid')}
                  disabled={isSubmitting}
                >
                  Bid (Buy)
                </Button>
              </div>
            </div>

            {/* Swipe count */}
            <div className="space-y-1">
              <Label htmlFor="swipeCount">
                Swipe count (1–6
                {offerType === 'ask' ? `, you have ${Number(mstBalance ?? BigInt(0))}` : ''})
              </Label>
              <Input
                id="swipeCount"
                type="number"
                min={1}
                max={6}
                value={swipeCount}
                onChange={(e) => setSwipeCount(Number(e.target.value))}
                disabled={isSubmitting}
              />
            </div>

            {/* Price per swipe */}
            <div className="space-y-1">
              <Label htmlFor="price">Price per swipe (max $12.00)</Label>
              <Input
                id="price"
                type="number"
                min={0.01}
                max={12}
                step={0.01}
                placeholder="7.00"
                value={pricePerSwipe}
                onChange={(e) => setPricePerSwipe(e.target.value)}
                disabled={isSubmitting}
              />
            </div>

            {blackout && !isSubmitting && (
              <p className="text-sm text-destructive">
                Offers are disabled during Saturday night blackout (11:55 PM – midnight).
              </p>
            )}

            {isSubmitting && (
              <p className="text-sm text-muted-foreground">Submitting offer...</p>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button
              className="w-full"
              onClick={handleSubmit}
              disabled={isSubmitting || blackout}
            >
              {isSubmitting ? 'Submitting...' : 'Post Offer'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
