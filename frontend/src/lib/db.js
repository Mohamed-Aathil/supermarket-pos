import Dexie from 'dexie'

/**
 * IndexedDB layer (via Dexie).
 *
 *  products     - local copy of the catalogue. Lets the till search, scan and
 *                 sell with no connection. `&barcode` = unique index, so a
 *                 scan is a single indexed lookup.
 *  pendingSales - the offline queue. Each row is a complete checkout payload
 *                 (with its client_ref UUID) waiting to be pushed.
 *                 status: 'pending' (will be retried) | 'failed' (server
 *                 rejected it permanently, needs a human).
 */
export const db = new Dexie('supermarket-pos')

db.version(1).stores({
  products: 'id, &barcode, name, category',
  pendingSales: '++localId, &clientRef, status, createdAt',
})
