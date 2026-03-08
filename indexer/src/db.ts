import { createClient } from '@supabase/supabase-js'
import { config } from './config'

const supabase = createClient(config.supabaseUrl, config.supabaseKey)

export const db = {

  async upsertOffer(row: {
    onchain_offer_id: number
    contract_address: string
    type: 'ask' | 'bid'
    seller_address: string
    swipe_count: number
    price_per_swipe: number
    status: string
    tx_hash: string
    expires_at: string
  }) {
    const { error } = await supabase
      .from('offers')
      .upsert(row, { onConflict: 'onchain_offer_id,contract_address' })
    if (error) throw new Error(`upsertOffer: ${error.message}`)
  },

  async getOfferByOnchainId(onchainOfferId: number, contractAddress: string) {
    const { data, error } = await supabase
      .from('offers')
      .select('offer_id, seller_address, swipe_count, price_per_swipe')
      .eq('onchain_offer_id', onchainOfferId)
      .eq('contract_address', contractAddress)
      .maybeSingle()
    if (error) throw new Error(`getOfferByOnchainId: ${error.message}`)
    return data
  },

  async updateOfferStatus(offerId: string, status: 'accepted' | 'cancelled' | 'expired') {
    const { error } = await supabase
      .from('offers')
      .update({ status })
      .eq('offer_id', offerId)
    if (error) throw new Error(`updateOfferStatus: ${error.message}`)
  },

  async insertTrade(row: {
    offer_id: string
    buyer_address: string
    seller_address: string
    swipe_count: number
    price: number
    tx_hash: string
  }) {
    const { error } = await supabase
      .from('trades')
      .upsert(row, { onConflict: 'tx_hash' })
    if (error) throw new Error(`insertTrade: ${error.message}`)
  },

  async upsertRedemption(row: { wallet_address: string; tx_hash: string }) {
    const { error } = await supabase
      .from('redemptions')
      .upsert(row, { onConflict: 'tx_hash' })
    if (error) throw new Error(`upsertRedemption: ${error.message}`)
  },

  async expireAllPendingOffers(): Promise<number> {
    const { data, error } = await supabase
      .from('offers')
      .update({ status: 'expired' })
      .eq('status', 'pending')
      .select('offer_id')
    if (error) throw new Error(`expireAllPendingOffers: ${error.message}`)
    return data?.length ?? 0
  },
}
