import type { ProviderConfig } from "@/types/config/provider"

export function getProviderConfigById<T extends ProviderConfig>(providersConfig: T[], providerId: string): T | undefined {
  return providersConfig.find(p => p.id === providerId)
}
