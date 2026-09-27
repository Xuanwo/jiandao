import type { EntityTable } from "dexie"
import Dexie from "dexie"
import { pascalCase } from "@/utils/case"
import { APP_NAME } from "@/utils/constants/app"
import ArticleSummaryCache from "./tables/article-summary-cache"
import TranslationCache from "./tables/translation-cache"

export default class AppDB extends Dexie {
  translationCache!: EntityTable<
    TranslationCache,
    "key"
  >

  articleSummaryCache!: EntityTable<
    ArticleSummaryCache,
    "key"
  >

  constructor() {
    super(`${pascalCase(APP_NAME)}DB`)
    this.version(5).stores({
      translationCache: `
        key,
        translation,
        createdAt`,
      articleSummaryCache: `
        key,
        createdAt`,
      batchRequestRecord: null,
      aiSegmentationCache: null,
    })
    this.translationCache.mapToClass(TranslationCache)
    this.articleSummaryCache.mapToClass(ArticleSummaryCache)
  }
}
