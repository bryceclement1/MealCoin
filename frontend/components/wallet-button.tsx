/**
 * Wallet connection button shown in the navigation bar.
 *
 * Has two states:
 *   - Disconnected: shows a "Connect Wallet" button that opens a connector picker dialog
 *   - Connected: shows a dropdown with the truncated smart account address, a
 *                "Copy address" option, and a "Disconnect" option
 *
 * Displays the smart account address (not the raw EOA) because that is the address
 * that holds the user's tokens and is registered in the students table.
 */

'use client'

import { useAccount, useConnect, useDisconnect } from 'wagmi'
import { useSmartAccount } from '@/contexts/SmartAccountContext'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

/** Shorten an address to "0x1234...abcd" for display. */
function truncateAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

/**
 * Render the wallet button. Shows a dropdown when connected, or a connector
 * picker dialog when disconnected.
 */
export function WalletButton() {
  const { isConnected } = useAccount()
  const { smartAddress } = useSmartAccount()
  const { connectors, connect, isPending } = useConnect()
  const { disconnect } = useDisconnect()
  const [open, setOpen] = useState(false)

  if (isConnected && smartAddress) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline">{truncateAddress(smartAddress)}</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() => navigator.clipboard.writeText(smartAddress)}
          >
            Copy address
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive"
            onClick={() => disconnect()}
          >
            Disconnect
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={isPending}>
        {isPending ? 'Connecting...' : 'Connect Wallet'}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>Connect a wallet</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 pt-2">
            {connectors.map((connector) => (
              <Button
                key={connector.uid}
                variant="outline"
                className="w-full justify-start gap-3"
                onClick={() => {
                  connect({ connector })
                  setOpen(false)
                }}
              >
                {connector.name}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
