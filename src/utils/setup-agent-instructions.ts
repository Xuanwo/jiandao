import type { Config } from "@/types/config/config"
import { i18n } from "#imports"
import { exportSetupDocument, stringifySetupDocument } from "./setup-document"

export const AGENT_SETUP_GUIDE_URL = "https://github.com/Xuanwo/jiandao/blob/main/docs/agent-setup.md"

/**
 * The text the reader hands to their agent. It points at the guide and
 * carries the current configuration with the key masked, so the agent can
 * change one thing without asking for everything again.
 */
export function buildAgentInstructions(config: Config): string {
  const current = exportSetupDocument(config)
  const currentText = current?.apiKey
    ? stringifySetupDocument(current)
    : i18n.t("agentInstructions.noConfiguration")
  return i18n.t("agentInstructions.text", [AGENT_SETUP_GUIDE_URL, currentText])
}
