import type { BatchLimits } from "./batch-queue"
import type { PaceState } from "./pace"
import type { ProviderConfig } from "@/types/config/provider"
import { storage } from "#imports"
import { logger } from "@/utils/logger"

/** What Jiandao has learned about one service: its request pace and the batch size it handles. */
export interface ServiceLimits {
  pace?: PaceState
  batch?: BatchLimits
  /** Milliseconds since the epoch. Entries unused for STALE_AFTER_MS are dropped. */
  updatedAt: number
}

const STORAGE_KEY = "local:serviceLimits"
const STALE_AFTER_MS = 90 * 24 * 60 * 60 * 1000
const FLUSH_DELAY_MS = 2000

/**
 * Limits are learned per service and model: rate limits and batch handling
 * differ between models of the same account, and a new model starts fresh.
 */
export function serviceLimitsKey(provider: Pick<ProviderConfig, "id" | "model">): string {
  return `${provider.id}:${provider.model}`
}

/**
 * Keeps learned limits in extension storage, apart from the reader's config.
 * Writes are coalesced so a burst of requests causes one storage write.
 */
export class ServiceLimitsStore {
  private entries: Record<string, ServiceLimits> = {}
  private loading: Promise<void> | null = null
  private flushTimer: ReturnType<typeof setTimeout> | null = null

  constructor(private readonly now: () => number = Date.now) {}

  /** Reads the stored limits once and drops stale entries. Safe to call before every use. */
  load(): Promise<void> {
    this.loading ??= (async () => {
      try {
        const stored = await storage.getItem<Record<string, ServiceLimits>>(STORAGE_KEY) ?? {}
        const cutoff = this.now() - STALE_AFTER_MS
        this.entries = Object.fromEntries(Object.entries(stored).filter(([, entry]) => entry.updatedAt >= cutoff))
      }
      catch (error) {
        logger.warn("Failed to read learned service limits", error)
      }
    })()
    return this.loading
  }

  get(key: string): ServiceLimits | undefined {
    return this.entries[key]
  }

  update(key: string, patch: Omit<ServiceLimits, "updatedAt">) {
    this.entries[key] = { ...this.entries[key], ...patch, updatedAt: this.now() }
    this.flushTimer ??= setTimeout(() => void this.flush(), FLUSH_DELAY_MS)
  }

  async flush() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    try {
      await storage.setItem(STORAGE_KEY, this.entries)
    }
    catch (error) {
      logger.warn("Failed to store learned service limits", error)
    }
  }
}
