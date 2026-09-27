import type { DeepSeekLanguageModelOptions } from "@ai-sdk/deepseek"
import type { OpenAIResponsesProviderOptions } from "@ai-sdk/openai"
import type { JSONValue } from "ai"

type OpenAIReasoningEffort = Exclude<OpenAIResponsesProviderOptions["reasoningEffort"], undefined>

interface OpenAIGPT5ReasoningEffortPolicy {
  pattern: RegExp
  supportedValues: readonly OpenAIReasoningEffort[]
  recommendedValue?: OpenAIReasoningEffort
}

const OPENAI_GPT5_REASONING_EFFORT_POLICIES: OpenAIGPT5ReasoningEffortPolicy[] = [
  {
    pattern: /^gpt-5\.4-pro$/i,
    supportedValues: ["medium", "high", "xhigh"],
    recommendedValue: "medium",
  },
  {
    pattern: /^gpt-5\.2-pro$/i,
    supportedValues: ["medium", "high", "xhigh"],
    recommendedValue: "medium",
  },
  {
    pattern: /^gpt-5-pro$/i,
    supportedValues: ["high"],
    recommendedValue: "high",
  },
  {
    pattern: /^(?:gpt-5\.4|gpt-5\.4-mini|gpt-5\.4-nano)$/i,
    supportedValues: ["none", "low", "medium", "high", "xhigh"],
    recommendedValue: "none",
  },
  {
    pattern: /^gpt-5\.2$/i,
    supportedValues: ["none", "low", "medium", "high", "xhigh"],
    recommendedValue: "none",
  },
  {
    pattern: /^(?:gpt-5\.1|gpt-5\.1-codex|gpt-5\.1-codex-mini)$/i,
    supportedValues: ["none", "low", "medium", "high"],
    recommendedValue: "none",
  },
  {
    pattern: /^(?:gpt-5|gpt-5-mini|gpt-5-nano|gpt-5-codex)$/i,
    supportedValues: ["minimal", "low", "medium", "high"],
    recommendedValue: "minimal",
  },
  {
    pattern: /^(?:gpt-5-chat-latest|gpt-5\.1-chat-latest|gpt-5\.2-chat-latest|gpt-5\.3-chat-latest)$/i,
    supportedValues: [],
  },
]

const OPENAI_GPT5_RECOMMENDED_MODEL_OPTIONS: Array<{
  pattern: RegExp
  options: Record<string, JSONValue>
}> = OPENAI_GPT5_REASONING_EFFORT_POLICIES.flatMap(({ pattern, recommendedValue }) => {
  if (recommendedValue === undefined) {
    return []
  }

  return [{
    pattern,
    options: { reasoningEffort: recommendedValue } satisfies OpenAIResponsesProviderOptions as Record<string, JSONValue>,
  }]
})

export function getOpenAIGPT5ReasoningEffortPolicy(model: string): OpenAIGPT5ReasoningEffortPolicy | undefined {
  return OPENAI_GPT5_REASONING_EFFORT_POLICIES.find(({ pattern }) => pattern.test(model))
}

/**
 * Model options configuration.
 * Flat list design: first match wins, more specific patterns should be placed first.
 * Options are matched by model name, not by provider.
 */
export const LLM_MODEL_OPTIONS: Array<{
  pattern: RegExp
  options: Record<string, JSONValue>
}> = [
  {
    pattern: /^(?:o1|o3|o4-mini)(?:-|$)/i,
    options: { reasoningEffort: "minimal" } satisfies OpenAIResponsesProviderOptions as Record<string, JSONValue>,
  },
  ...OPENAI_GPT5_RECOMMENDED_MODEL_OPTIONS,
  {
    pattern: /^deepseek-(?:reasoner|v4-(?:flash|pro))$/i,
    options: { thinking: { type: "disabled" } } satisfies DeepSeekLanguageModelOptions as Record<string, JSONValue>,
  },
]
