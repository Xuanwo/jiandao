import { browser } from "#imports"
import { cacheDb } from "@/utils/db/cache-db"
import { logger } from "@/utils/logger"

export const CHECK_INTERVAL_MINUTES = 24 * 60

export const TRANSLATION_CACHE_CLEANUP_ALARM = "cache-cleanup"
export const TRANSLATION_CACHE_MAX_AGE_MINUTES = 7 * 24 * 60

export const SUMMARY_CACHE_CLEANUP_ALARM = "summary-cache-cleanup"
export const SUMMARY_CACHE_MAX_AGE_MINUTES = 7 * 24 * 60

export async function setUpDatabaseCleanup() {
  // Set up periodic alarms (only if they don't exist)
  const existingCacheAlarm = await browser.alarms.get(TRANSLATION_CACHE_CLEANUP_ALARM)
  if (!existingCacheAlarm) {
    void browser.alarms.create(TRANSLATION_CACHE_CLEANUP_ALARM, {
      delayInMinutes: 1,
      periodInMinutes: CHECK_INTERVAL_MINUTES,
    })
  }

  const existingSummaryAlarm = await browser.alarms.get(SUMMARY_CACHE_CLEANUP_ALARM)
  if (!existingSummaryAlarm) {
    void browser.alarms.create(SUMMARY_CACHE_CLEANUP_ALARM, {
      delayInMinutes: 1,
      periodInMinutes: CHECK_INTERVAL_MINUTES,
    })
  }

  // Register the alarm listener
  browser.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === TRANSLATION_CACHE_CLEANUP_ALARM) {
      await cleanupOldTranslationCache()
    }
    else if (alarm.name === SUMMARY_CACHE_CLEANUP_ALARM) {
      await cleanupOldSummaryCache()
    }
  })
}

async function cleanupOldTranslationCache() {
  try {
    const cutoffDate = new Date()
    cutoffDate.setTime(cutoffDate.getTime() - TRANSLATION_CACHE_MAX_AGE_MINUTES * 60 * 1000)

    // Delete all cache entries older than the cutoff date
    const deletedCount = await cacheDb.translationCache.deleteOlderThan(cutoffDate)

    if (deletedCount > 0) {
      logger.info(`Cache cleanup: Deleted ${deletedCount} old translation cache entries`)
    }
  }
  catch (error) {
    logger.error("Failed to cleanup old cache:", error)
  }
}

export async function cleanupAllTranslationCache() {
  try {
    // Delete all translation cache entries
    await cacheDb.translationCache.clear()

    logger.info(`Cache cleanup: Deleted all translation cache entries`)
  }
  catch (error) {
    logger.error("Failed to cleanup all cache:", error)
    throw error
  }
}

async function cleanupOldSummaryCache() {
  try {
    const cutoffDate = new Date()
    cutoffDate.setTime(cutoffDate.getTime() - SUMMARY_CACHE_MAX_AGE_MINUTES * 60 * 1000)

    // Delete all summary cache entries older than the cutoff date
    const deletedCount = await cacheDb.articleSummaryCache.deleteOlderThan(cutoffDate)

    if (deletedCount > 0) {
      logger.info(`Summary cache cleanup: Deleted ${deletedCount} old article summary cache entries`)
    }
  }
  catch (error) {
    logger.error("Failed to cleanup old summary cache:", error)
  }
}

export async function cleanupAllSummaryCache() {
  try {
    // Delete all article summary cache entries
    await cacheDb.articleSummaryCache.clear()

    logger.info(`Summary cache cleanup: Deleted all article summary cache entries`)
  }
  catch (error) {
    logger.error("Failed to cleanup all summary cache:", error)
    throw error
  }
}
