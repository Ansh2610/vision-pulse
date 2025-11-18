/**
 * Hybrid cache using IndexedDB (primary) + localStorage (fallback)
 * Securely stores session data with automatic expiration
 * Works offline, survives page reloads, scales to 100+ images
 */

import { Box } from '../types'

// Public interface for cached images
export interface CachedImage {
  id: string
  imageSrc: string // base64 data URL
  boxes: Box[]
  timestamp: Date
  filename: string
  selectedBoxIndex?: number | null
}

// Internal storage format (timestamps as ISO strings for serialization)
interface StoredCachedImage extends Omit<CachedImage, 'timestamp'> {
  timestamp: string
}

interface SessionData {
  sessionId: string
  images: StoredCachedImage[]
  savedAt: string
  version: number // For future migration compatibility
}

// Configuration
const DB_NAME = 'VisionPulseCache'
const DB_VERSION = 1
const STORE_NAME = 'sessions'
const SESSION_KEY = 'current_session'
const CACHE_EXPIRY_HOURS = 24
const MAX_IMAGES = 200 // Limit to prevent excessive storage

// Fallback localStorage key (used if IndexedDB unavailable)
const LOCALSTORAGE_KEY = 'visionpulse_session_cache'

/**
 * Initialize IndexedDB connection
 * Returns null if IndexedDB is unavailable (falls back to localStorage)
 */
async function openDB(): Promise<IDBDatabase | null> {
  // Check if IndexedDB is available (not available in some private browsing modes)
  if (!window.indexedDB) {
    console.warn('[CACHE] IndexedDB not available, using localStorage fallback')
    return null
  }

  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    
    request.onerror = () => {
      console.error('[CACHE] IndexedDB open failed:', request.error)
      resolve(null) // Fallback to localStorage
    }
    
    request.onsuccess = () => resolve(request.result)
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      
      // Create object store if it doesn't exist
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
        console.log('[CACHE] Created IndexedDB object store')
      }
    }
  })
}

/**
 * Save session data (tries IndexedDB first, falls back to localStorage)
 * Auto-prunes old images if exceeding MAX_IMAGES limit
 */
export async function saveSessionCache(sessionId: string, images: CachedImage[]): Promise<void> {
  // Security: Only store non-sensitive data (no API keys, tokens, etc.)
  // Images are base64 data URLs which are safe to cache
  
  // Prune old images if needed
  let imagesToStore = images
  if (images.length > MAX_IMAGES) {
    console.warn(`[CACHE] Too many images (${images.length}), keeping most recent ${MAX_IMAGES}`)
    imagesToStore = images.slice(-MAX_IMAGES)
  }
  
  const sessionData: SessionData = {
    sessionId,
    images: imagesToStore.map(img => ({
      ...img,
      timestamp: img.timestamp.toISOString(),
    })),
    savedAt: new Date().toISOString(),
    version: 1,
  }
  
  // Try IndexedDB first
  const db = await openDB()
  if (db) {
    try {
      const transaction = db.transaction([STORE_NAME], 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      store.put(sessionData, SESSION_KEY)
      
      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => {
          console.log(`[CACHE:IDB] Saved ${imagesToStore.length} images`)
          resolve()
        }
        transaction.onerror = () => reject(transaction.error)
      })
      
      db.close()
      return
    } catch (err) {
      console.error('[CACHE:IDB] Save failed:', err)
      db.close()
    }
  }
  
  // Fallback to localStorage
  saveToLocalStorage(sessionData)
}

/**
 * Load session data (tries IndexedDB first, falls back to localStorage)
 * Returns null if cache doesn't exist or is expired
 */
export async function loadSessionCache(): Promise<{ sessionId: string; images: CachedImage[] } | null> {
  // Try IndexedDB first
  const db = await openDB()
  if (db) {
    try {
      const transaction = db.transaction([STORE_NAME], 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.get(SESSION_KEY)
      
      const data = await new Promise<SessionData | undefined>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      
      db.close()
      
      if (data) {
        const result = processLoadedData(data)
        if (result) {
          console.log(`[CACHE:IDB] Loaded ${result.images.length} images`)
          return result
        }
      }
    } catch (err) {
      console.error('[CACHE:IDB] Load failed:', err)
      db.close()
    }
  }
  
  // Fallback to localStorage
  return loadFromLocalStorage()
}

/**
 * Clear all cached session data (both IndexedDB and localStorage)
 */
export async function clearSessionCache(): Promise<void> {
  // Clear IndexedDB
  const db = await openDB()
  if (db) {
    try {
      const transaction = db.transaction([STORE_NAME], 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      store.delete(SESSION_KEY)
      
      await new Promise<void>((resolve) => {
        transaction.oncomplete = () => {
          console.log('[CACHE:IDB] Cleared')
          resolve()
        }
        transaction.onerror = () => resolve() // Don't fail if already empty
      })
      
      db.close()
    } catch (err) {
      console.error('[CACHE:IDB] Clear failed:', err)
      db.close()
    }
  }
  
  // Clear localStorage fallback
  try {
    localStorage.removeItem(LOCALSTORAGE_KEY)
    console.log('[CACHE:LS] Cleared')
  } catch (err) {
    console.error('[CACHE:LS] Clear failed:', err)
  }
}

/**
 * Process loaded session data (validate and check expiration)
 */
function processLoadedData(data: SessionData): { sessionId: string; images: CachedImage[] } | null {
  try {
    const savedAt = new Date(data.savedAt)
    const ageInHours = (Date.now() - savedAt.getTime()) / (1000 * 60 * 60)
    
    // Security: Auto-expire old sessions
    if (ageInHours > CACHE_EXPIRY_HOURS) {
      console.log(`[CACHE] Session expired (${ageInHours.toFixed(1)} hours old), clearing`)
      clearSessionCache()
      return null
    }
    
    return {
      sessionId: data.sessionId,
      images: data.images.map(img => ({
        ...img,
        timestamp: new Date(img.timestamp),
      })),
    }
  } catch (err) {
    console.error('[CACHE] Invalid data format:', err)
    return null
  }
}

/**
 * localStorage fallback implementation
 */
function saveToLocalStorage(data: SessionData): void {
  try {
    // Keep only last 20 images for localStorage (smaller quota)
    const limitedData = {
      ...data,
      images: data.images.slice(-20),
    }
    
    localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(limitedData))
    console.log(`[CACHE:LS] Saved ${limitedData.images.length} images (fallback)`)
  } catch (err) {
    console.error('[CACHE:LS] Save failed:', err)
    // Try clearing old data and retry
    try {
      localStorage.removeItem(LOCALSTORAGE_KEY)
      const minimal = {
        ...data,
        images: data.images.slice(-10),
      }
      localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(minimal))
      console.log('[CACHE:LS] Saved minimal cache (10 images)')
    } catch {
      console.error('[CACHE:LS] Even minimal save failed')
    }
  }
}

/**
 * Load from localStorage fallback
 */
function loadFromLocalStorage(): { sessionId: string; images: CachedImage[] } | null {
  try {
    const cached = localStorage.getItem(LOCALSTORAGE_KEY)
    if (!cached) return null
    
    const data: SessionData = JSON.parse(cached)
    const result = processLoadedData(data)
    
    if (result) {
      console.log(`[CACHE:LS] Loaded ${result.images.length} images (fallback)`)
    }
    
    return result
  } catch (err) {
    console.error('[CACHE:LS] Load failed:', err)
    return null
  }
}
