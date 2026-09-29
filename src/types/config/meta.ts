/**
 * Metadata stored with the config via WXT storage.setMeta. A type alias, not
 * an interface, so it satisfies the Record type storage.getMeta asks for.
 */
// eslint-disable-next-line ts/consistent-type-definitions
export type ConfigMeta = {
  /**
   * Set when the stored config was cleared because it could not be migrated
   * to the current version. The setup prompts explain the reset while it is
   * set; applying a service removes it.
   */
  resetAt?: number
}
