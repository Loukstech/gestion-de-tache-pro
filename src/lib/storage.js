/**
 * Couche de persistance.
 * 100 % gratuite et locale : IndexedDB (avec repli automatique sur localStorage).
 *
 * L'API est volontairement identique à celle d'un backend REST : le jour où vous
 * voulez passer sur un service payant (Supabase, Firebase, API maison…), il suffit
 * d'écrire un autre adaptateur exposant les mêmes méthodes.
 */

const DB_NAME = 'taskvox-pro'
const DB_VERSION = 1
const STORES = ['tasks', 'messages', 'settings', 'transcripts']

let dbPromise = null
let usingFallback = false

function fallbackKey(store, id) {
  return `taskvox:${store}:${id}`
}

const memoryFallback = {
  available: () => {
    try {
      const probe = '__taskvox_probe__'
      window.localStorage.setItem(probe, '1')
      window.localStorage.removeItem(probe)
      return true
    } catch {
      return false
    }
  },
  async getAll(store) {
    const out = []
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i)
      if (key && key.startsWith(`taskvox:${store}:`)) {
        try {
          out.push(JSON.parse(window.localStorage.getItem(key)))
        } catch {
          /* entrée corrompue : on ignore */
        }
      }
    }
    return out
  },
  async put(store, value) {
    window.localStorage.setItem(fallbackKey(store, value.id), JSON.stringify(value))
    return value
  },
  async delete(store, id) {
    window.localStorage.removeItem(fallbackKey(store, id))
  },
  async clear(store) {
    const keys = []
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i)
      if (key && key.startsWith(`taskvox:${store}:`)) keys.push(key)
    }
    keys.forEach((key) => window.localStorage.removeItem(key))
  },
}

function openDb() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB indisponible'))
      return
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      STORES.forEach((name) => {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' })
      })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('Ouverture IndexedDB impossible'))
    request.onblocked = () => reject(new Error('IndexedDB bloqué par un autre onglet'))
  }).catch((error) => {
    usingFallback = true
    console.warn('[TaskVox] IndexedDB indisponible, repli localStorage.', error)
    return null
  })
  return dbPromise
}

function tx(db, store, mode) {
  return db.transaction(store, mode).objectStore(store)
}

function wrap(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export const storage = {
  get backend() {
    return usingFallback ? 'localStorage' : 'indexeddb'
  },

  async getAll(store) {
    const db = await openDb()
    if (!db) return memoryFallback.getAll(store)
    try {
      return (await wrap(tx(db, store, 'readonly').getAll())) || []
    } catch {
      usingFallback = true
      return memoryFallback.getAll(store)
    }
  },

  async get(store, id) {
    const db = await openDb()
    if (!db) {
      const all = await memoryFallback.getAll(store)
      return all.find((item) => item.id === id) || null
    }
    try {
      return (await wrap(tx(db, store, 'readonly').get(id))) || null
    } catch {
      usingFallback = true
      return null
    }
  },

  async put(store, value) {
    const db = await openDb()
    if (!db) return memoryFallback.put(store, value)
    try {
      await wrap(tx(db, store, 'readwrite').put(value))
      return value
    } catch {
      usingFallback = true
      return memoryFallback.put(store, value)
    }
  },

  async putMany(store, values) {
    const db = await openDb()
    if (!db) {
      await Promise.all(values.map((value) => memoryFallback.put(store, value)))
      return values
    }
    try {
      await new Promise((resolve, reject) => {
        const transaction = db.transaction(store, 'readwrite')
        const objectStore = transaction.objectStore(store)
        values.forEach((value) => objectStore.put(value))
        transaction.oncomplete = resolve
        transaction.onerror = () => reject(transaction.error)
        transaction.onabort = () => reject(transaction.error)
      })
      return values
    } catch {
      usingFallback = true
      await Promise.all(values.map((value) => memoryFallback.put(store, value)))
      return values
    }
  },

  async delete(store, id) {
    const db = await openDb()
    if (!db) return memoryFallback.delete(store, id)
    try {
      await wrap(tx(db, store, 'readwrite').delete(id))
    } catch {
      usingFallback = true
      return memoryFallback.delete(store, id)
    }
  },

  async clear(store) {
    const db = await openDb()
    if (!db) return memoryFallback.clear(store)
    try {
      await wrap(tx(db, store, 'readwrite').clear())
    } catch {
      usingFallback = true
      return memoryFallback.clear(store)
    }
  },
}

/** Clé unique pour les réglages (objet singleton). */
export const SETTINGS_ID = 'app-settings'
