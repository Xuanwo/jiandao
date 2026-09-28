/*
 * Request pacing adapts to each service instead of being a setting (see
 * utils/request/pace.ts). A service Jiandao has not used yet starts at
 * INITIAL_REQUEST_RATE; after that it starts from the pace it has learned.
 */
export const INITIAL_REQUEST_RATE = 4
export const MIN_REQUEST_RATE = 0.5
/** A numerical guard only; a service's own 429s and timeouts set its real limit. */
export const MAX_REQUEST_RATE = 256
/** Requests may burst up to this many seconds' worth at the current rate. */
export const REQUEST_BURST_SECONDS = 4

/** Batch limits a service starts with. A service that loses paragraphs in a batch gets smaller batches. */
export const DEFAULT_MAX_CHARACTER_PER_BATCH = 1000
export const DEFAULT_MAX_ITEMS_PER_BATCH = 4

export const DEFAULT_AUTO_TRANSLATE_SHORTCUT_KEY = "Alt+E"

/** Paragraphs this far below the viewport are translated before they scroll in. */
export const PRELOAD_MARGIN_PX = 1000
export const PRELOAD_THRESHOLD = 0
