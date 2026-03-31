import MealSwipeTokenJson from '../contracts/MealSwipeToken.json'
import MarketplaceJson from '../contracts/Marketplace.json'

export const TOKEN_ADDRESS  = process.env.NEXT_PUBLIC_TOKEN_ADDRESS  as `0x${string}`
export const MARKET_ADDRESS = process.env.NEXT_PUBLIC_MARKET_ADDRESS as `0x${string}`
export const USDC_ADDRESS   = process.env.NEXT_PUBLIC_USDC_ADDRESS   as `0x${string}`

export const TOKEN_ABI  = MealSwipeTokenJson.abi
export const MARKET_ABI = MarketplaceJson.abi

// Minimal ERC-20 ABI — only the functions MealCoin calls on USDC
export const USDC_ABI = [
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const
