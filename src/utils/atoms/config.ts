import type { Getter, Setter } from "jotai"
import type { Config } from "@/types/config/config"
import { atom } from "jotai"
import { selectAtom } from "jotai/utils"
import { configSchema } from "@/types/config/config"
import { getLocalConfigForWrite } from "../config/storage"
import { CONFIG_STORAGE_KEY, DEFAULT_CONFIG } from "../constants/config"
import { logger } from "../logger"
import { deepMerge } from "../object"
import { storageAdapter } from "./storage-adapter"

export const configAtom = atom<Config>(DEFAULT_CONFIG)

/**
 * Promise-chain queue for serializing storage writes.
 *
 * Each write chains onto the previous via `.then()`, ensuring sequential execution:
 *   Promise.resolve() → task1 → task2 → task3 → ...
 *
 * This prevents race conditions when multiple writes happen in quick succession.
 * Even if a write fails, the queue continues (see `.catch(() => {})` below).
 */
let writeQueue: Promise<void> = Promise.resolve()

/**
 * Global counter to detect stale writes.
 *
 * Each write captures its version at invocation time. After async storage completes,
 * we compare captured vs current version to determine if this is still the latest write.
 * This prevents older writes from overwriting the optimistic UI state.
 */
let writeVersion = 0

/** The config to store, and the stored config it was built from, if any. */
interface PlannedWrite {
  next: Config
  stored?: Config
}

/**
 * Queues one storage write and shows `optimistic` right away. `plan` runs in
 * queue order. If the write fails, the atom goes back to the stored config
 * the plan read, or else to its previous value.
 */
function queueConfigWrite(
  get: Getter,
  set: Setter,
  optimistic: Config,
  plan: () => Promise<PlannedWrite>,
): Promise<void> {
  // ─────────────────────────────────────────────────────────────────────────
  // STEP 1: Optimistic update (immediate UI feedback)
  // ─────────────────────────────────────────────────────────────────────────
  const localPrev = get(configAtom)
  set(configAtom, optimistic)

  // Capture version for this write (used for stale-write detection later)
  const currentWriteVersion = ++writeVersion

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 2: Queue the actual storage write
  // ─────────────────────────────────────────────────────────────────────────
  // Chain onto writeQueue so writes execute in order.
  // Note: `.then(callback)` schedules callback to microtask queue (async),
  // but `writeQueue = task` assignment happens synchronously.
  const task = writeQueue.then(async () => {
    let planned: PlannedWrite | undefined
    try {
      // Always read fresh from storage to capture any writes that completed before us.
      // This ensures we don't lose concurrent field updates:
      //   write({x:1}) then write({y:2}) → storage ends up with {x:1, y:2}
      planned = await plan()
      const nextToPersist = planned.next

      // Storage write always executes (not affected by version check)
      await storageAdapter.set(CONFIG_STORAGE_KEY, nextToPersist, configSchema)

      // ───────────────────────────────────────────────────────────────────
      // STEP 3: Reconcile atom with persisted value (stale-write check)
      // ───────────────────────────────────────────────────────────────────
      // Only update atom if no newer writes happened since we started.
      // If a newer write exists, its optimistic update already set the correct UI state,
      // so we skip to avoid "flashing back" to this older value.
      if (currentWriteVersion === writeVersion) {
        set(configAtom, nextToPersist)
      }
    }
    catch (error) {
      console.error("Failed to set config to storage:", error)

      // Roll back, but only if we're still the latest write.
      if (currentWriteVersion === writeVersion) {
        set(configAtom, planned?.stored ?? localPrev)
      }

      throw error
    }
  })

  // Update queue head. Use `.catch(() => {})` to ensure queue continues even if this write fails.
  writeQueue = task.catch(() => {})

  return task
}

/**
 * Merges a patch into the stored config. The write fails, and stores
 * nothing, when the stored config does not pass the schema.
 */
export const writeConfigAtom = atom(
  null,
  (get, set, patch: Partial<Config>) =>
    queueConfigWrite(get, set, deepMerge(get(configAtom), patch), async () => {
      const stored = await getLocalConfigForWrite()
      return { next: deepMerge(stored, patch), stored }
    }),
)

/** Replaces the stored config with the default config, whatever is stored now. */
export const resetConfigAtom = atom(
  null,
  (get, set) =>
    queueConfigWrite(get, set, DEFAULT_CONFIG, async () => ({ next: DEFAULT_CONFIG })),
)

/**
 * Initialize atom state from storage and set up cross-context sync.
 *
 * This handles three sync scenarios:
 * 1. Initial load: Read from storage when atom first mounts
 * 2. Cross-context updates: Watch for changes from other extension contexts (popup, options, etc.)
 * 3. Tab reactivation: Reload when tab becomes visible (inactive tabs may miss watch events)
 */
configAtom.onMount = (setAtom: (newValue: Config) => void) => {
  const syncFromStorage = () => {
    const currentWriteVersion = writeVersion
    // A watch event can contain the value of an older local write.
    // Do not apply the value of the event. Read storage after the queued writes.
    // A newer local write makes this read stale, because its optimistic value is newer.
    void writeQueue.then(async () => {
      const value = await storageAdapter.get<Config>(CONFIG_STORAGE_KEY, DEFAULT_CONFIG, configSchema)
      if (currentWriteVersion === writeVersion) {
        setAtom(value)
      }
    })
  }

  // Initial load from storage
  syncFromStorage()

  // Watch for changes from other extension contexts (popup, options page, other tabs)
  const unwatch = storageAdapter.watch<Config>(CONFIG_STORAGE_KEY, syncFromStorage)

  // Handle tab reactivation - inactive tabs may miss storage watch events,
  // so we reload from storage when the tab becomes visible again.
  // Historical regression
  const handleVisibilityChange = () => {
    if (document.visibilityState === "visible") {
      logger.info("configAtom onMount handleVisibilityChange when: ", new Date())
      syncFromStorage()
    }
  }
  document.addEventListener("visibilitychange", handleVisibilityChange)

  return () => {
    unwatch()
    document.removeEventListener("visibilitychange", handleVisibilityChange)
  }
}

// export const configFieldAtom = <K extends Keys>(key: K) => {
//   const readAtom = selectAtom(configAtom, (c) => c[key]); // 现在是同步
//   const writeAtom = atom(null, (_get, set, val: Config[K]) =>
//     set(writeConfigAtom, { [key]: val })
//   );
//   return [readAtom, writeAtom] as const;
// };

type Keys = keyof Config

export function getConfigFieldAtom<K extends Keys>(key: K) {
  // If you don't mind "re-rendering when other fields are changed"
  // you can directly get(configAtom)[key] instead of using selectAtom.
  const sliceAtom = selectAtom(configAtom, c => c[key])

  return atom(
    get => get(sliceAtom),
    (_get, set, newVal: Partial<Config[K]>) =>
      set(writeConfigAtom, { [key]: newVal }),
  )
}

function buildConfigFieldsAtomMap<C extends Config>(cfg: C) {
  type ValidKey = Extract<keyof C, keyof Config>
  type Map = { [K in ValidKey]: ReturnType<typeof getConfigFieldAtom<K>> }

  const res = {} as Map

  const add = <K extends ValidKey>(key: K) => {
    res[key] = getConfigFieldAtom(key)
  };

  (Object.keys(cfg) as ValidKey[]).forEach(add)
  return res
}

export const configFieldsAtomMap = buildConfigFieldsAtomMap(DEFAULT_CONFIG)
