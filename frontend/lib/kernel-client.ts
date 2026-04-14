/**
 * Kernel smart account setup and UserOperation helpers.
 *
 * MealCoin uses ERC-4337 account abstraction so students pay no gas fees.
 * Every transaction is routed through a Kernel smart account (ZeroDev) with
 * Pimlico acting as the bundler and paymaster.
 *
 * Flow:
 *   1. Student connects their Coinbase Wallet (EOA)
 *   2. buildKernelClient() derives a deterministic Kernel smart account from that EOA
 *   3. Contract calls use kernelClient.writeContract(), which packages the call
 *      as a UserOperation and submits it to Pimlico for gas sponsorship
 *   4. Pimlico pays the gas; the student only signs
 *
 * All on-chain assets (swipes, USDC) are held by the smart account address,
 * not the raw EOA address.
 */

import { createKernelAccount, createKernelAccountClient } from '@zerodev/sdk'
import { signerToEcdsaValidator } from '@zerodev/ecdsa-validator'
import { createPublicClient, encodeFunctionData, http, type Address, type WalletClient } from 'viem'
import { base } from 'viem/chains'
import { createPimlicoClient } from 'permissionless/clients/pimlico'

// EntryPoint v0.6 + Kernel v2.4 — both the factory and validator contracts
// for these versions are already deployed on Base mainnet.
const ENTRY_POINT = {
  address: '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789' as Address,
  version: '0.6' as const,
}
const KERNEL_VERSION = '0.2.4' as const

/** Shared public client for reading on-chain state (balances, offers, etc.). */
export const publicClient = createPublicClient({
  chain: base,
  transport: http(process.env.NEXT_PUBLIC_RPC_URL),
})

/**
 * Build a Kernel smart account client from a connected EOA wallet.
 *
 * Derives the ECDSA validator from the signer, creates the Kernel account,
 * and wraps it in a KernelAccountClient configured with Pimlico for gas
 * sponsorship. If NEXT_PUBLIC_PAYMASTER_URL is not set, transactions will
 * require the user to have ETH for gas (development only).
 *
 * @param walletClient - The Wagmi WalletClient from the connected EOA
 * @returns kernelClient for sending UserOps, and smartAddress (the account address)
 */
export async function buildKernelClient(walletClient: WalletClient) {
  const bundlerUrl = process.env.NEXT_PUBLIC_BUNDLER_URL!
  const paymasterUrl = process.env.NEXT_PUBLIC_PAYMASTER_URL

  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    // WalletClient satisfies the Signer union type at runtime; cast required for TS
    signer: walletClient as Parameters<typeof signerToEcdsaValidator>[1]['signer'],
    entryPoint: ENTRY_POINT,
    kernelVersion: KERNEL_VERSION,
  })

  const account = await createKernelAccount(publicClient, {
    plugins: { sudo: ecdsaValidator },
    entryPoint: ENTRY_POINT,
    kernelVersion: KERNEL_VERSION,
  })

  // Pimlico's client handles both bundler + paymaster via the same URL
  const pimlicoClient = paymasterUrl
    ? createPimlicoClient({
        transport: http(paymasterUrl),
        entryPoint: ENTRY_POINT,
      })
    : undefined

  const kernelClient = createKernelAccountClient({
    account,
    chain: base,
    bundlerTransport: http(bundlerUrl),
    ...(pimlicoClient && {
      paymaster: pimlicoClient,
      // ZeroDev's default gas price method (zd_getUserOperationGasPrice) doesn't
      // exist on Pimlico — override to use Pimlico's own gas price endpoint.
      userOperation: {
        estimateFeesPerGas: async () => {
          const { fast } = await pimlicoClient.getUserOperationGasPrice()
          return fast
        },
      },
    }),
  })

  return {
    kernelClient,
    smartAddress: account.address as Address,
  }
}

/**
 * Send multiple contract calls as a single batched UserOperation.
 *
 * Batching is critical for flows that require approve + action in one step
 * (e.g. token approval + createSellOffer). Without batching these would be
 * two separate transactions requiring two wallet signatures.
 *
 * @param kernelClient - The Kernel client returned by buildKernelClient
 * @param calls        - Array of contract calls to batch together
 * @returns The UserOperation hash
 */
export async function sendBatch(
  kernelClient: KernelClient,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  calls: { address: Address; abi: readonly any[] | any[]; functionName: string; args?: readonly unknown[] }[]
): Promise<`0x${string}`> {
  const encoded = calls.map(({ address, abi, functionName, args }) => ({
    to: address,
    data: encodeFunctionData({ abi, functionName, args }),
    value: BigInt(0),
  }))
  try {
    return await kernelClient.sendUserOperation({ calls: encoded })
  } catch (err) {
    console.error('[sendBatch] UserOp failed:', err)
    throw err
  }
}

/** Convenience type alias for the kernel client instance. */
export type KernelClient = Awaited<ReturnType<typeof buildKernelClient>>['kernelClient']
