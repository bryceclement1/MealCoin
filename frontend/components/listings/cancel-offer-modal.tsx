'use client'

import { useState, useEffect } from 'react'
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { type Offer } from '@/lib/api'
import { MARKET_ADDRESS, MARKET_ABI } from '@/lib/contracts'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

const REVERT_MESSAGES: Record<string, string> = {
  NotOfferCreator: 'Only the offer creator can cancel',
  OfferNotPending: 'This offer is no longer active',
  OfferNotFound: 'Offer not found',
}

function parseRevertError(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error)
  for (const [key, value] of Object.entries(REVERT_MESSAGES)) {
    if (msg.includes(key)) return value
  }
  return 'Transaction failed. Please try again.'
}

type Step = 'idle' | 'cancelling' | 'done'

interface Props {
  offer: Offer
  onCancelled: () => void
}

export function CancelOfferModal({ offer, onCancelled }: Props) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const [step, setStep] = useState<Step>('idle')

  const { writeContract, data: txHash, reset } = useWriteContract()
  const receipt = useWaitForTransactionReceipt({ hash: txHash })

  const isAsk = offer.type === 'ask'
  const totalUsdcDisplay = (offer.swipe_count * offer.price_per_swipe).toFixed(2)

  useEffect(() => {
    if (receipt.isSuccess && step === 'cancelling') {
      setStep('done')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt.isSuccess])

  useEffect(() => {
    if (receipt.isError && step === 'cancelling') {
      setError(parseRevertError(receipt.error))
      setStep('idle')
      reset()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt.isError])

  function resetForm() {
    setError('')
    setStep('idle')
    reset()
  }

  function handleOpenChange(val: boolean) {
    setOpen(val)
    if (!val) resetForm()
  }

  function handleCancel() {
    setError('')
    setStep('cancelling')
    try {
      writeContract({
        address: MARKET_ADDRESS,
        abi: MARKET_ABI,
        functionName: 'cancelOffer',
        args: [BigInt(offer.onchain_offer_id)],
      })
    } catch (e) {
      setError(parseRevertError(e))
      setStep('idle')
    }
  }

  const isPending = step === 'cancelling'

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">Cancel</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Cancel Offer</DialogTitle>
        </DialogHeader>

        {step === 'done' ? (
          <div className="py-6 text-center space-y-2">
            <p className="text-2xl">✓</p>
            <p className="font-medium">Offer cancelled!</p>
            <Button
              className="w-full mt-2"
              onClick={() => { handleOpenChange(false); onCancelled() }}
            >
              Done
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-md border p-4 space-y-1 text-sm">
              {isAsk ? (
                <p>
                  Your sell offer for{' '}
                  <span className="font-semibold">
                    {offer.swipe_count} swipe{offer.swipe_count !== 1 ? 's' : ''}
                  </span>{' '}
                  will be cancelled and the swipes returned to your wallet.
                </p>
              ) : (
                <p>
                  Your buy offer will be cancelled and{' '}
                  <span className="font-semibold">${totalUsdcDisplay} USDC</span>{' '}
                  will be returned to your wallet.
                </p>
              )}
            </div>

            {isPending && (
              <p className="text-sm text-muted-foreground">Cancelling offer...</p>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button
              className="w-full"
              variant="destructive"
              onClick={handleCancel}
              disabled={isPending}
            >
              {isPending ? 'Cancelling...' : 'Confirm Cancel'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
