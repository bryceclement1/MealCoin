/**
 * Modal for sending meal swipes directly to another wallet address.
 *
 * Calls the MealSwipeToken `transfer()` function via the Kernel smart account
 * (gasless). The button is disabled when the user has no swipes. Input
 * validation prevents sending more swipes than the user's current balance.
 */

'use client'

import { useState } from 'react'
import { isAddress } from 'viem'
import { useSmartAccount } from '@/contexts/SmartAccountContext'
import { useMSTBalance } from '@/hooks/use-mst-balance'
import { TOKEN_ADDRESS, TOKEN_ABI } from '@/lib/contracts'
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

/** Map known contract revert reason strings to user-friendly messages. */
const REVERT_MESSAGES: Record<string, string> = {
  InsufficientBalance: "You don't have enough swipes",
  InvalidAmount: 'Invalid swipe count',
}

/**
 * Parse a transaction error and return a human-readable message.
 * Falls back to a generic message if the revert reason is not recognized.
 */
function parseRevertError(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error)
  for (const [key, value] of Object.entries(REVERT_MESSAGES)) {
    if (msg.includes(key)) return value
  }
  return 'Transaction failed. Please try again.'
}

/**
 * Render the "Send Swipe" button and its confirmation dialog.
 * Resets all form state when the dialog is closed.
 */
export function SendSwipeModal() {
  const { smartAddress, kernelClient } = useSmartAccount()
  const { data: balance } = useMSTBalance(smartAddress)
  const [open, setOpen] = useState(false)
  const [recipient, setRecipient] = useState('')
  const [count, setCount] = useState(1)
  const [error, setError] = useState('')
  const [isPending, setIsPending] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  const maxBalance = Number(balance ?? 0)

  /** Reset all form fields when the dialog closes. */
  function handleOpenChange(val: boolean) {
    setOpen(val)
    if (!val) {
      setRecipient('')
      setCount(1)
      setError('')
      setIsPending(false)
      setIsSuccess(false)
    }
  }

  /** Validate inputs and submit the transfer transaction. */
  async function handleSend() {
    if (!kernelClient) return
    setError('')

    if (!isAddress(recipient)) {
      setError('Invalid wallet address')
      return
    }
    if (count < 1 || count > maxBalance) {
      setError(`Enter a number between 1 and ${maxBalance}`)
      return
    }

    setIsPending(true)
    try {
      await kernelClient.writeContract({
        address: TOKEN_ADDRESS,
        abi: TOKEN_ABI,
        functionName: 'transfer',
        args: [recipient as `0x${string}`, BigInt(count)],
      })
      setIsSuccess(true)
    } catch (e) {
      setError(parseRevertError(e))
    } finally {
      setIsPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={maxBalance === 0}>
          Send Swipe
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Send a Swipe</DialogTitle>
        </DialogHeader>

        {isSuccess ? (
          <div className="py-6 text-center space-y-2">
            <p className="text-2xl">✓</p>
            <p className="font-medium">Swipe sent!</p>
            <Button className="w-full mt-2" onClick={() => handleOpenChange(false)}>
              Done
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="recipient">Recipient address</Label>
              <Input
                id="recipient"
                placeholder="0x..."
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                disabled={isPending}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="count">Swipe count (max {maxBalance})</Label>
              <Input
                id="count"
                type="number"
                min={1}
                max={maxBalance}
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                disabled={isPending}
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button
              className="w-full"
              onClick={handleSend}
              disabled={isPending}
            >
              {isPending ? 'Processing...' : 'Send'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
