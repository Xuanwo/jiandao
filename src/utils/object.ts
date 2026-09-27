/** Every property optional, recursively, for patches applied with deepMerge. */
export type DeepPartial<T> = T extends readonly unknown[]
  ? T
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

/**
 * Returns a new object with `updates` applied over `base`. Plain objects merge
 * key by key; arrays and every other value in `updates` replace the base
 * value, including `undefined` and `null`. Neither input is modified.
 */
export function deepMerge<T>(base: T, updates: NoInfer<DeepPartial<T>>): T {
  if (!isPlainObject(base) || !isPlainObject(updates))
    return updates as T
  const merged: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(updates)) {
    const current = merged[key]
    merged[key] = isPlainObject(current) && isPlainObject(value) ? deepMerge(current, value) : value
  }
  return merged as T
}

/** Structural equality for JSON-like values: plain objects, arrays and primitives. */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b))
    return true
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length)
      return false
    return a.every((item, index) => deepEqual(item, b[index]))
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keysA = Object.keys(a)
    const keysB = Object.keys(b)
    if (keysA.length !== keysB.length)
      return false
    return keysA.every(key => Object.hasOwn(b, key) && deepEqual(a[key], b[key]))
  }
  return false
}
