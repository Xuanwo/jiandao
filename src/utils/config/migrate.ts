import type { z } from "zod"
import type { Config } from "@/types/config/config"
import { CONFIG_VERSION, configSchema } from "@/types/config/config"

/** Describe schema issues without stored values, which can contain API keys. */
function describeConfigIssues(error: z.ZodError): string {
  return error.issues.map(issue => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ")
}

/**
 * Upgrades one stored config from the version before its key to that
 * version. It receives the raw stored object, which may not match any
 * current type, and returns the next version's shape; the result's
 * `version` is set by the caller.
 */
export type ConfigMigration = (config: Record<string, unknown>) => Record<string, unknown>

/**
 * Every change to the stored shape bumps CONFIG_VERSION and adds the step
 * from the previous version here, keyed by the version it produces. Steps
 * are kept for every version a released build wrote, so an install that
 * skipped several releases still reaches the current shape.
 */
export const CONFIG_MIGRATIONS: Readonly<Record<number, ConfigMigration>> = {}

/**
 * Jiandao 1.1.0 stored configs without `version`; their shape is version 1.
 * Older configs have no `version` either, but version 1 rejects their
 * shape, so they end up as a conflict.
 */
const UNVERSIONED_CONFIG_VERSION = 1

export type ConfigMigrationResult
  = | { ok: true, config: Config }
    | { ok: false, reason: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * Runs the steps that bring a stored object from its `version` to
 * `targetVersion`, without checking the result against a schema. It fails
 * for a version with no path to the target, including one newer than it.
 */
export function upgradeConfigVersion(
  stored: Record<string, unknown>,
  targetVersion: number,
  migrations: Readonly<Record<number, ConfigMigration>>,
): { ok: true, config: Record<string, unknown> } | { ok: false, reason: string } {
  const version = stored.version ?? UNVERSIONED_CONFIG_VERSION
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1)
    return { ok: false, reason: `unknown config version ${JSON.stringify(version)}` }
  if (version > targetVersion)
    return { ok: false, reason: `config version ${version} is newer than ${targetVersion}` }

  let config = stored
  for (let next = version + 1; next <= targetVersion; next++) {
    const migrate = migrations[next]
    if (!migrate)
      return { ok: false, reason: `no migration from config version ${next - 1} to ${next}` }
    config = migrate(config)
  }
  return { ok: true, config: { ...config, version: targetVersion } }
}

/**
 * Brings a stored config to CONFIG_VERSION and checks it against the current
 * schema. A config that cannot get there is a conflict: it comes from a
 * version with no migration path, from a newer build, or does not match its
 * own version's shape. Each caller decides how to handle the conflict.
 */
export function migrateStoredConfig(stored: unknown): ConfigMigrationResult {
  if (!isRecord(stored))
    return { ok: false, reason: "the stored config is not an object" }

  const upgraded = upgradeConfigVersion(stored, CONFIG_VERSION, CONFIG_MIGRATIONS)
  if (!upgraded.ok)
    return upgraded

  const parsed = configSchema.safeParse(upgraded.config)
  if (!parsed.success)
    return { ok: false, reason: `config does not match version ${CONFIG_VERSION}: ${describeConfigIssues(parsed.error)}` }
  return { ok: true, config: parsed.data }
}
