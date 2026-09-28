export type ClassValue = string | false | null | undefined

/** Joins class names, dropping falsy entries. Callers keep their own classes free of conflicts. */
export function cn(...inputs: ClassValue[]): string {
  return inputs.filter(Boolean).join(" ")
}
