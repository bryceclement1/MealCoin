import MealSwipeTokenJson from '../contracts/MealSwipeToken.json'
import MarketplaceJson from '../contracts/Marketplace.json'
import MockUSDCJson from '../contracts/MockUSDC.json'

export const TOKEN_ADDRESS  = process.env.NEXT_PUBLIC_TOKEN_ADDRESS  as `0x${string}`
export const MARKET_ADDRESS = process.env.NEXT_PUBLIC_MARKET_ADDRESS as `0x${string}`
export const USDC_ADDRESS   = process.env.NEXT_PUBLIC_USDC_ADDRESS   as `0x${string}`

export const TOKEN_ABI  = MealSwipeTokenJson.abi
export const MARKET_ABI = MarketplaceJson.abi
export const USDC_ABI   = MockUSDCJson.abi
