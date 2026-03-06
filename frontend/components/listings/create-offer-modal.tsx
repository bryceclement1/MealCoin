'use client'

import { useState, useEffect } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi'
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

const toUSDC = (dollars: number) => BigInt(Math.round(dollars * 1_000_000))

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

type OfferType = 'ask' | 'bid'
type Step = 'idle' | 'approving' | 'creating' | 'done'

export function CreateOfferModal() {
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
  const [offerType, setOfferType] = useState<OfferType>('ask')
  const [swipeCount, setSwipeCount] = useState(1)
  const [pricePerSwipe, setPricePerSwipe] = useState('')
  const [error, setError] = useState('')
  const [step, setStep] = useState<Step>('idle')

  const {
    writeContract: writeApprove,
    data: approveTxHash,
    reset: resetApprove,
  } = useWriteContract()

  const {
    writeContract: writeCreate,
    data: createTxHash,
    reset: resetCreate,
  } = useWriteContract()

  const approveReceipt = useWaitForTransactionReceipt({ hash: approveTxHash })
  const createReceipt = useWaitForTransactionReceipt({ hash: createTxHash })

  // When approval confirms, automatically submit the create tx
  useEffect(() => {
    if (approveReceipt.isSuccess && step === 'approving') {
      setStep('creating')
      const price = toUSDC(parseFloat(pricePerSwipe))
      const count = BigInt(swipeCount)
      try {
        if (offerType === 'ask') {
          writeCreate({
            address: MARKET_ADDRESS,
            abi: MARKET_ABI,
            functionName: 'createSellOffer',
            args: [count, price],
          })
        } else {
          writeCreate({
            address: MARKET_ADDRESS,
            abi: MARKET_ABI,
            functionName: 'createBuyOffer',
            args: [count, price],
          })
        }
      } catch (e) {
        setError(parseRevertError(e))
        setStep('idle')
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approveReceipt.isSuccess])

  // When create confirms, mark done
  useEffect(() => {
    if (createReceipt.isSuccess && step === 'creating') {
      setStep('done')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createReceipt.isSuccess])

  // Handle failed receipts — reset to idle so user can retry
  useEffect(() => {
    if (approveReceipt.isError && step === 'approving') {
      setError(parseRevertError(approveReceipt.error))
      setStep('idle')
      resetApprove()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approveReceipt.isError])

  useEffect(() => {
    if (createReceipt.isError && step === 'creating') {
      setError(parseRevertError(createReceipt.error))
      setStep('idle')
      resetCreate()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createReceipt.isError])

  function resetForm() {
    setOfferType('ask')
    setSwipeCount(1)
    setPricePerSwipe('')
    setError('')
    setStep('idle')
    resetApprove()
    resetCreate()
  }

  function handleOpenChange(val: boolean) {
    setOpen(val)
    if (!val) resetForm()
  }

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

  function handleSubmit() {
    setError('')
    if (!validate()) return

    const price = toUSDC(parseFloat(pricePerSwipe))
    const count = BigInt(swipeCount)

    setStep('approving')
    try {
      if (offerType === 'ask') {
        writeApprove({
          address: TOKEN_ADDRESS,
          abi: TOKEN_ABI,
          functionName: 'approve',
          args: [MARKET_ADDRESS, count],
        })
      } else {
        const totalUsdc = price * count
        writeApprove({
          address: USDC_ADDRESS,
          abi: USDC_ABI,
          functionName: 'approve',
          args: [MARKET_ADDRESS, totalUsdc],
        })
      }
    } catch (e) {
      setError(parseRevertError(e))
      setStep('idle')
    }
  }

  const isPending = step === 'approving' || step === 'creating'
  const blackout = isBlackout()

  function stepLabel() {
    if (step === 'approving') return 'Step 1 of 2: Approving...'
    if (step === 'creating') return 'Step 2 of 2: Creating offer...'
    return null
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>Post Offer</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Create Offer</DialogTitle>
        </DialogHeader>

        {step === 'done' ? (
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
                  disabled={isPending}
                >
                  Ask (Sell)
                </Button>
                <Button
                  type="button"
                  variant={offerType === 'bid' ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => setOfferType('bid')}
                  disabled={isPending}
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
                disabled={isPending}
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
                disabled={isPending}
              />
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
              onClick={handleSubmit}
              disabled={isPending || blackout}
            >
              {isPending ? stepLabel() : 'Post Offer'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
