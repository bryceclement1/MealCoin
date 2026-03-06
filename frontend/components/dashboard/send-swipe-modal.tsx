'use client'

import { useState } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { isAddress } from 'viem'
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

const REVERT_MESSAGES: Record<string, string> = {
  InsufficientBalance: "You don't have enough swipes",
  InvalidAmount: 'Invalid swipe count',
}

function parseRevertError(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error)
  for (const [key, value] of Object.entries(REVERT_MESSAGES)) {
    if (msg.includes(key)) return value
  }
  return 'Transaction failed. Please try again.'
}

export function SendSwipeModal() {
  const { address } = useAccount()
  const { data: balance } = useMSTBalance(address)
  const [open, setOpen] = useState(false)
  const [recipient, setRecipient] = useState('')
  const [count, setCount] = useState(1)
  const [error, setError] = useState('')

  const { writeContract, data: txHash, isPending, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })

  const maxBalance = Number(balance ?? 0)

  function handleOpenChange(val: boolean) {
    setOpen(val)
    if (!val) {
      setRecipient('')
      setCount(1)
      setError('')
      reset()
    }
  }

  async function handleSend() {
    setError('')

    if (!isAddress(recipient)) {
      setError('Invalid wallet address')
      return
    }
    if (count < 1 || count > maxBalance) {
      setError(`Enter a number between 1 and ${maxBalance}`)
      return
    }

    try {
      writeContract({
        address: TOKEN_ADDRESS,
        abi: TOKEN_ABI,
        functionName: 'transfer',
        args: [recipient as `0x${string}`, BigInt(count)],
      })
    } catch (e) {
      setError(parseRevertError(e))
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
                disabled={isPending || isConfirming}
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
                disabled={isPending || isConfirming}
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button
              className="w-full"
              onClick={handleSend}
              disabled={isPending || isConfirming}
            >
              {isPending
                ? 'Confirm in wallet...'
                : isConfirming
                ? 'Sending...'
                : 'Send'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
