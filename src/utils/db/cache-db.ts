import { pascalCase } from "@/utils/case"
import { APP_NAME } from "@/utils/constants/app"

/**
 * The translation and summary caches in IndexedDB. The database name and
 * version match what Plainly 1.0 created through Dexie (which stores its
 * schema version times ten), so existing caches open as they are.
 */

export interface TranslationCacheRecord {
  key: string
  translation: string
  createdAt: Date
}

export interface ArticleSummaryCacheRecord {
  key: string // sha256Hex(webTitle, textContentHash, JSON.stringify(providerConfig))
  summary: string
  createdAt: Date
}

const DB_NAME = `${pascalCase(APP_NAME)}DB`
const DB_VERSION = 50
const STORES = ["translationCache", "articleSummaryCache"] as const
type StoreName = typeof STORES[number]

let opening: Promise<IDBDatabase> | undefined

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function openDatabase(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      for (const name of STORES) {
        const store = db.objectStoreNames.contains(name)
          ? req.transaction!.objectStore(name)
          : db.createObjectStore(name, { keyPath: "key" })
        if (!store.indexNames.contains("createdAt"))
          store.createIndex("createdAt", "createdAt")
      }
    }
    req.onsuccess = () => {
      const db = req.result
      // Another context upgraded the schema: drop this connection so the next call reopens.
      db.onversionchange = () => {
        db.close()
        opening = undefined
      }
      resolve(db)
    }
    req.onerror = () => {
      opening = undefined
      reject(req.error)
    }
    req.onblocked = () => reject(new Error(`IndexedDB "${DB_NAME}" is blocked by another open connection`))
  })
  return opening
}

class CacheTable<T extends { key: string, createdAt: Date }> {
  constructor(private readonly name: StoreName) {}

  private async store(mode: IDBTransactionMode): Promise<IDBObjectStore> {
    const db = await openDatabase()
    return db.transaction(this.name, mode).objectStore(this.name)
  }

  async get(key: string): Promise<T | undefined> {
    return request((await this.store("readonly")).get(key)) as Promise<T | undefined>
  }

  async put(record: T): Promise<void> {
    await request((await this.store("readwrite")).put(record))
  }

  async clear(): Promise<void> {
    await request((await this.store("readwrite")).clear())
  }

  /** Removes records created before `cutoff` and returns how many. */
  async deleteOlderThan(cutoff: Date): Promise<number> {
    const store = await this.store("readwrite")
    const keys = await request(store.index("createdAt").getAllKeys(IDBKeyRange.upperBound(cutoff, true)))
    await Promise.all(keys.map(key => request(store.delete(key))))
    return keys.length
  }
}

export const cacheDb = {
  translationCache: new CacheTable<TranslationCacheRecord>("translationCache"),
  articleSummaryCache: new CacheTable<ArticleSummaryCacheRecord>("articleSummaryCache"),
}
