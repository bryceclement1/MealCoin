/**
 * Supabase write helpers used by all event handlers.
 *
 * All writes use upsert (insert-or-update) rather than plain inserts so that
 * the indexer can be restarted and reprocess blocks without creating duplicates.
 * The conflict key on each table mirrors the on-chain uniqueness guarantee:
 *   - offers:      (onchain_offer_id, contract_address)
 *   - trades:      tx_hash
 *   - redemptions: tx_hash
 */

import { createClient } from '@supabase/supabase-js'
import { config } from './config'

const supabase = createClient(config.supabaseUrl, config.supabaseKey)

export const db = {

  /**
   * Insert or update an offer row. The compound key (onchain_offer_id, contract_address)
   * prevents duplicates if the indexer reprocesses a block after a restart.
   */
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

  /**
   * Look up an offer by its on-chain ID and the contract address it belongs to.
   * Both fields are needed because offer IDs are scoped per contract deployment —
   * if the contract is redeployed, IDs restart from 0.
   */
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

  /** Update an offer's lifecycle status. Called by the accepted/cancelled/expired handlers. */
  async updateOfferStatus(offerId: string, status: 'accepted' | 'cancelled' | 'expired') {
    const { error } = await supabase
      .from('offers')
      .update({ status })
      .eq('offer_id', offerId)
    if (error) throw new Error(`updateOfferStatus: ${error.message}`)
  },

  /**
   * Record a completed trade. Uses upsert on tx_hash so replaying the OfferAccepted
   * event does not create a duplicate trade row.
   */
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

  /** Record a dining redemption. Upserts on tx_hash to handle replays safely. */
  async upsertRedemption(row: { wallet_address: string; tx_hash: string }) {
    const { error } = await supabase
      .from('redemptions')
      .upsert(row, { onConflict: 'tx_hash' })
    if (error) throw new Error(`upsertRedemption: ${error.message}`)
  },

  /**
   * Bulk-expire all pending offers in the DB. Called when the SwipesBurned event fires,
   * meaning the weekly token reset has occurred and all in-flight offers are now void.
   * Returns the number of rows updated.
   */
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
