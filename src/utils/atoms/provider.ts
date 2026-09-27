import type { FeatureKey } from "../constants/feature-providers"
import type { DeepPartial } from "../object"
import type { ProviderConfig } from "@/types/config/provider"
import { atom } from "jotai"
import { providerConfigItemSchema } from "@/types/config/provider"
import { getProviderConfigById } from "../config/helpers"
import { FEATURE_PROVIDER_DEFS } from "../constants/feature-providers"
import { deepMerge } from "../object"
import { configAtom, configFieldsAtomMap } from "./config"

/** One atom per key, created on first use, like jotai's atomFamily. */
function memoizedAtoms<K, A>(create: (key: K) => A): (key: K) => A {
  const atoms = new Map<K, A>()
  return (key) => {
    let created = atoms.get(key)
    if (!created) {
      created = create(key)
      atoms.set(key, created)
    }
    return created
  }
}

export const featureProviderConfigAtom = memoizedAtoms((featureKey: FeatureKey) =>
  atom((get) => {
    const config = get(configAtom)
    const def = FEATURE_PROVIDER_DEFS[featureKey]
    const providerId = def.getProviderId(config)
    return getProviderConfigById(config.providersConfig, providerId) ?? null
  }),
)

// Generic provider config atom family that accepts a name parameter
export const providerConfigAtom = memoizedAtoms((id: string) =>
  atom(
    (get) => {
      const providersConfig = get(configFieldsAtomMap.providersConfig)
      return getProviderConfigById(providersConfig, id)
    },
    async (get, set, newProviderConfig: ProviderConfig) => {
      const providersConfig = get(configFieldsAtomMap.providersConfig)

      const updatedProviders = providersConfig.map(provider =>
        provider.id === id ? newProviderConfig : provider,
      )

      await set(configFieldsAtomMap.providersConfig, updatedProviders)
    },
  ),
)

export function updateProviderConfig(
  config: ProviderConfig,
  updates: DeepPartial<ProviderConfig>,
): ProviderConfig {
  return providerConfigItemSchema.parse(deepMerge(config, updates))
}
