import { api } from './api'
import { db } from './db'

/** Persist a completed sale locally so it survives refreshes, crashes and power cuts. */
export async function enqueueSale(payload, total) {
  await db.pendingSales.add({
    clientRef: payload.client_ref,
    payload,
    total,
    status: 'pending',
    error: null,
    createdAt: Date.now(),
  })
}

export async function getQueueCounts() {
  const [pending, failed] = await Promise.all([
    db.pendingSales.where('status').equals('pending').count(),
    db.pendingSales.where('status').equals('failed').count(),
  ])
  return { pending, failed }
}

let running = false

/**
 * Push queued sales to the backend, oldest first.
 *
 *  - Safe to call any time and from several places: overlapping calls collapse
 *    into one, and the server de-duplicates on client_ref, so even a sale whose
 *    response was lost mid-flight can't be recorded twice.
 *  - Network error / 5xx  -> stop and keep everything for the next attempt.
 *  - 4xx (e.g. product deleted) -> that sale is marked 'failed' and skipped so
 *    one bad sale can't block the rest of the queue.
 */
export async function syncPendingSales() {
  if (running) return { synced: 0, failed: 0, offline: false, skipped: true }
  running = true
  let synced = 0
  let failed = 0
  let offline = false
  try {
    const queue = await db.pendingSales.where('status').equals('pending').sortBy('createdAt')
    for (const sale of queue) {
      try {
        await api.checkout(sale.payload)
        await db.pendingSales.delete(sale.localId)
        synced++
      } catch (err) {
        if (err.isNetwork || err.status >= 500 || err.status === 429 || err.status === 408) {
          offline = true
          break
        }
        await db.pendingSales.update(sale.localId, { status: 'failed', error: err.message })
        failed++
      }
    }
  } finally {
    running = false
  }
  return { synced, failed, offline, skipped: false }
}

/** Put failed sales back in the queue (e.g. after the product was re-created). */
export async function retryFailedSales() {
  await db.pendingSales.where('status').equals('failed').modify({ status: 'pending', error: null })
}

export async function discardFailedSales() {
  await db.pendingSales.where('status').equals('failed').delete()
}
