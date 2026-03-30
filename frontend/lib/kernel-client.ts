import { createKernelAccount, createKernelAccountClient } from '@zerodev/sdk'
import { signerToEcdsaValidator } from '@zerodev/ecdsa-validator'
import { createPublicClient, encodeFunctionData, http, type Address, type WalletClient } from 'viem'
import { base } from 'viem/chains'
import { createPimlicoClient } from 'permissionless/clients/pimlico'

// EntryPoint v0.6 + Kernel v2.4 — both factory and validator are already deployed on Base mainnet
const ENTRY_POINT = {
  address: '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789' as Address,
  version: '0.6' as const,
}
const KERNEL_VERSION = '0.2.4' as const

export const publicClient = createPublicClient({
  chain: base,
  transport: http(process.env.NEXT_PUBLIC_RPC_URL),
})

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
    ...(pimlicoClient && { paymaster: pimlicoClient }),
  })

  return {
    kernelClient,
    smartAddress: account.address as Address,
  }
}

// Convenience: send multiple contract calls as a single batched UserOp.
// ABIs are typed loosely (any[]) since they come from JSON imports.
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
  // sendTransaction without a top-level `to` field delegates to sendUserOperation({ calls })
  return (kernelClient as any).sendTransaction({ calls: encoded })
}

export type KernelClient = Awaited<ReturnType<typeof buildKernelClient>>['kernelClient']
