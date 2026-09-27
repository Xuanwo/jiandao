import { Entity } from "dexie"

export default class ArticleSummaryCache extends Entity {
  key!: string // sha256Hex(webTitle, textContentHash, JSON.stringify(providerConfig))
  summary!: string
  createdAt!: Date
}
