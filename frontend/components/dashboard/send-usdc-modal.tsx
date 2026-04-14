/**
 * Modal for sending USDC directly to another wallet address.
 *
 * Calls the USDC `transfer()` function via the Kernel smart account (gasless).
 * The button is disabled when the user has no USDC balance. Dollar amounts
 * are converted to USDC's 6-decimal integer format before the on-chain call.
 */

'use client'

import { useState } from 'react'
import { isAddress } from 'viem'
import { useSmartAccount } from '@/contexts/SmartAccountContext'
import { useUSDCBalance } from '@/hooks/use-usdc-balance'
import { USDC_ADDRESS, USDC_ABI } from '@/lib/contracts'
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

/**
 * Parse a transaction error and return a human-readable message.
 * Falls back to a generic message if the revert reason is not recognized.
 */
function parseRevertError(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error)
  if (msg.includes('InsufficientBalance') || msg.includes('transfer amount exceeds balance')) {
    return "You don't have enough USDC"
  }
  return 'Transaction failed. Please try again.'
}

/**
 * Convert a dollar amount to USDC's 6-decimal integer format.
 * Example: 7.50 → 7_500_000n
 */
const toUSDC = (dollars: number) => BigInt(Math.round(dollars * 1_000_000))

/**
 * Render the "Send USDC" button and its confirmation dialog.
 * Resets all form state when the dialog is closed.
 */
export function SendUSDCModal() {
  const { smartAddress, kernelClient } = useSmartAccount()
  const { data: usdcBalance } = useUSDCBalance(smartAddress)
  const [open, setOpen] = useState(false)
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState('')
  const [isPending, setIsPending] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  // Convert raw bigint balance to a human-readable dollar amount for display
  const maxBalance = usdcBalance !== undefined
    ? Number(usdcBalance) / 1_000_000
    : 0

  /** Reset all form fields when the dialog closes. */
  function handleOpenChange(val: boolean) {
    setOpen(val)
    if (!val) {
      setRecipient('')
      setAmount('')
      setError('')
      setIsPending(false)
      setIsSuccess(false)
    }
  }

  /** Validate inputs and submit the USDC transfer transaction. */
  async function handleSend() {
    if (!kernelClient) return
    setError('')

    if (!isAddress(recipient)) {
      setError('Invalid wallet address')
      return
    }

    const parsed = parseFloat(amount)
    if (!amount || isNaN(parsed) || parsed <= 0) {
      setError('Enter a valid amount')
      return
    }
    if (parsed > maxBalance) {
      setError(`You only have $${maxBalance.toFixed(2)} USDC`)
      return
    }

    setIsPending(true)
    try {
      await kernelClient.writeContract({
        address: USDC_ADDRESS,
        abi: USDC_ABI,
        functionName: 'transfer',
        args: [recipient as `0x${string}`, toUSDC(parsed)],
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
          Send USDC
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Send USDC</DialogTitle>
        </DialogHeader>

        {isSuccess ? (
          <div className="py-6 text-center space-y-2">
            <p className="text-2xl">✓</p>
            <p className="font-medium">USDC sent!</p>
            <Button className="w-full mt-2" onClick={() => handleOpenChange(false)}>
              Done
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="usdc-recipient">Recipient address</Label>
              <Input
                id="usdc-recipient"
                placeholder="0x..."
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                disabled={isPending}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="usdc-amount">Amount (max ${maxBalance.toFixed(2)})</Label>
              <Input
                id="usdc-amount"
                type="number"
                min={0.01}
                step={0.01}
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
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
