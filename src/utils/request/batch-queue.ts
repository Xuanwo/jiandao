import { getRandomUUID } from "@/utils/crypto-polyfill"

export class BatchCountMismatchError extends Error {
  constructor(expected: number, got: number, results: unknown[]) {
    super(`Batch result count mismatch: expected ${expected}, got ${got}.\nResults: ["${results.join("\",\n\"")}"]`)
    this.name = "BatchCountMismatchError"
  }
}

interface BatchTask<T, R> {
  data: T
  resolve: (value: R) => void
  reject: (error: Error) => void
}

interface PendingBatch<T, R> {
  id: string
  limitKey: string
  tasks: BatchTask<T, R>[]
  totalCharacters: number
  createdAt: number
}

export interface BatchLimits {
  maxCharacters: number
  maxItems: number
}

/**
 * Groups items into batches per `getBatchKey`. When a batch comes back with
 * the wrong number of results, the queue splits it in half and retries the
 * halves, and every later batch for the same `getLimitKey` (a service) keeps
 * to the smaller size. `learnedLimits` and `onLimitsLearned` let the caller
 * keep those sizes across sessions. A single item that still fails falls
 * back to `executeIndividual`.
 */
export interface BatchOptions<T, R> {
  maxCharactersPerBatch: number
  maxItemsPerBatch: number
  batchDelay: number
  enableFallbackToIndividual?: boolean
  getBatchKey: (data: T) => string
  /** Which items share learned batch limits. Defaults to the batch key. */
  getLimitKey?: (data: T) => string
  /** Limits learned in an earlier session, if any. */
  learnedLimits?: (limitKey: string) => BatchLimits | undefined
  onLimitsLearned?: (limitKey: string, limits: BatchLimits) => void
  getCharacters: (data: T) => number
  executeBatch: (dataList: T[]) => Promise<R[]>
  executeIndividual?: (data: T) => Promise<R>
  onError?: (error: Error, context: { batchKey: string, retryCount: number, isFallback: boolean }) => void
}

export class BatchQueue<T, R> {
  private pendingBatchMap = new Map<string, PendingBatch<T, R>>()
  private nextScheduleTimer: NodeJS.Timeout | null = null
  private defaultLimits: BatchLimits
  private learnedLimits = new Map<string, BatchLimits>()
  private storedLimits?: (limitKey: string) => BatchLimits | undefined
  private onLimitsLearned?: (limitKey: string, limits: BatchLimits) => void
  private batchDelay: number
  private enableFallbackToIndividual: boolean
  private getBatchKey: (data: T) => string
  private getLimitKey: (data: T) => string
  private getCharacters: (data: T) => number
  private executeBatch: (dataList: T[]) => Promise<R[]>
  private executeIndividual?: (data: T) => Promise<R>
  private onError?: (error: Error, context: { batchKey: string, retryCount: number, isFallback: boolean }) => void

  constructor(config: BatchOptions<T, R>) {
    this.defaultLimits = { maxCharacters: config.maxCharactersPerBatch, maxItems: config.maxItemsPerBatch }
    this.batchDelay = config.batchDelay
    this.enableFallbackToIndividual = config.enableFallbackToIndividual ?? true
    this.getBatchKey = config.getBatchKey
    this.getLimitKey = config.getLimitKey ?? config.getBatchKey
    this.storedLimits = config.learnedLimits
    this.onLimitsLearned = config.onLimitsLearned
    this.getCharacters = config.getCharacters
    this.executeBatch = config.executeBatch
    this.executeIndividual = config.executeIndividual
    this.onError = config.onError
  }

  enqueue(data: T): Promise<R> {
    let resolve!: (value: R) => void
    let reject!: (error: Error) => void
    const promise = new Promise<R>((res, rej) => {
      resolve = res
      reject = rej
    })

    const batchKey = this.getBatchKey(data)
    const task: BatchTask<T, R> = { data, resolve, reject }

    this.addTaskToBatch(task, batchKey)
    this.schedule()

    return promise
  }

  private schedule() {
    if (this.nextScheduleTimer) {
      clearTimeout(this.nextScheduleTimer)
      this.nextScheduleTimer = null
    }

    const now = Date.now()
    const batchesToFlush: string[] = []

    for (const [batchKey, batch] of this.pendingBatchMap.entries()) {
      const shouldFlushNow = this.shouldFlushBatch(batch)
      const isTimedOut = now >= batch.createdAt + this.batchDelay

      if (shouldFlushNow || isTimedOut) {
        batchesToFlush.push(batchKey)
      }
    }

    for (const batchKey of batchesToFlush) {
      this.flushPendingBatchByKey(batchKey)
    }

    if (this.pendingBatchMap.size > 0) {
      this.nextScheduleTimer = setTimeout(() => {
        this.nextScheduleTimer = null
        this.schedule()
      }, this.batchDelay)
    }
  }

  /** The limits a service has settled on; the defaults until one of its batches loses items. */
  limitsFor(limitKey: string): BatchLimits {
    return this.learnedLimits.get(limitKey) ?? this.storedLimits?.(limitKey) ?? this.defaultLimits
  }

  private addTaskToBatch(task: BatchTask<T, R>, batchKey: string) {
    const characters = this.getCharacters(task.data)
    const existingBatch = this.pendingBatchMap.get(batchKey)

    if (existingBatch) {
      if (existingBatch.totalCharacters + characters <= this.limitsFor(existingBatch.limitKey).maxCharacters) {
        existingBatch.tasks.push(task)
        existingBatch.totalCharacters += characters
      }
      else {
        this.flushPendingBatchByKey(batchKey)
        this.createNewPendingBatch(task, batchKey)
      }
    }
    else {
      this.createNewPendingBatch(task, batchKey)
    }
  }

  private shouldFlushBatch(batch: PendingBatch<T, R>): boolean {
    const limits = this.limitsFor(batch.limitKey)
    return batch.tasks.length >= limits.maxItems || batch.totalCharacters >= limits.maxCharacters
  }

  private createNewPendingBatch(task: BatchTask<T, R>, batchKey: string) {
    const batchId = getRandomUUID()

    const pendingBatch: PendingBatch<T, R> = {
      id: batchId,
      limitKey: this.getLimitKey(task.data),
      tasks: [task],
      totalCharacters: this.getCharacters(task.data),
      createdAt: Date.now(),
    }

    this.pendingBatchMap.set(batchKey, pendingBatch)
  }

  private flushPendingBatchByKey(batchKey: string) {
    const pendingBatch = this.pendingBatchMap.get(batchKey)
    if (!pendingBatch)
      return

    this.pendingBatchMap.delete(batchKey)

    void this.executeBatchWithRetry(pendingBatch.tasks, batchKey, pendingBatch.limitKey, 0)
  }

  private async executeBatchWithRetry(tasks: BatchTask<T, R>[], batchKey: string, limitKey: string, retryCount: number): Promise<void> {
    try {
      const results = await this.executeBatch(tasks.map(task => task.data))

      if (!results) {
        throw new Error("Batch execution results are undefined")
      }

      if (results.length !== tasks.length) {
        throw new BatchCountMismatchError(tasks.length, results.length, results)
      }

      tasks.forEach((task, index) => task.resolve(results[index]))
    }
    catch (error) {
      const err = error as Error

      this.onError?.(err, { batchKey, retryCount, isFallback: false })

      if (!(err instanceof BatchCountMismatchError)) {
        tasks.forEach(task => task.reject(err))
        return
      }

      if (tasks.length > 1) {
        this.shrinkLimits(limitKey, tasks)
        const middle = Math.ceil(tasks.length / 2)
        await Promise.all([
          this.executeBatchWithRetry(tasks.slice(0, middle), batchKey, limitKey, retryCount + 1),
          this.executeBatchWithRetry(tasks.slice(middle), batchKey, limitKey, retryCount + 1),
        ])
        return
      }

      if (this.enableFallbackToIndividual && this.executeIndividual) {
        return this.executeFallbackIndividual(tasks, batchKey, retryCount)
      }

      tasks.forEach(task => task.reject(err))
    }
  }

  /** Remembers that this service cannot handle a batch this size. Limits only ever shrink. */
  private shrinkLimits(limitKey: string, tasks: BatchTask<T, R>[]) {
    const current = this.limitsFor(limitKey)
    const characters = tasks.reduce((sum, task) => sum + this.getCharacters(task.data), 0)
    const limits = {
      maxItems: Math.max(1, Math.min(current.maxItems, Math.floor(tasks.length / 2))),
      maxCharacters: Math.max(1, Math.min(current.maxCharacters, Math.floor(characters / 2))),
    }
    this.learnedLimits.set(limitKey, limits)
    this.onLimitsLearned?.(limitKey, limits)
  }

  private async executeFallbackIndividual(tasks: BatchTask<T, R>[], batchKey: string, retryCount: number) {
    await Promise.allSettled(
      tasks.map(async (task) => {
        try {
          if (!this.executeIndividual) {
            throw new Error("executeIndividual is not defined")
          }
          const result = await this.executeIndividual(task.data)
          task.resolve(result)
        }
        catch (error) {
          const err = error as Error
          this.onError?.(err, { batchKey, retryCount, isFallback: true })
          task.reject(err)
        }
      }),
    )
  }
}
