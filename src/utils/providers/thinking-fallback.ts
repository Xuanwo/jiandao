import type { JSONValue } from "ai"
import type { LLMProviderConfig } from "@/types/config/provider"
import { THINKING_OFF_PROVIDER_OPTIONS } from "@/utils/constants/providers"
import { getRequestErrorMeta } from "@/utils/request/retry-policy"

// OpenAI names the parameter as `reasoning.effort`. Gateways in front of
// DeepSeek V4.1 Flash reject `reasoning_effort: "none"` with a message such as
// `Invalid option: expected one of "low"|"medium"|"high"|"xhigh"|"max"`,
// which does not name the parameter.
const REASONING_EFFORT_ERROR = /reasoning[._\s-]?effort|expected one of "low"\|"medium"\|"high"/i

// An endpoint that does not accept the thinking switch names it, for example
// `Unrecognized request argument supplied: thinking`.
const THINKING_ERROR = /\bthinking\b/i
// The HTTP statuses of a request that the endpoint cannot accept. A rate
// limit, a time-out or a server error is not about the options.
const REJECTED_REQUEST_STATUSES = new Set([400, 404, 422])

/** True when the endpoint rejected the request, and its error names the option. */
function rejectsOption(error: unknown, option: RegExp): error is Error {
  const status = getRequestErrorMeta(error).statusCode
  return error instanceof Error && status !== undefined && REJECTED_REQUEST_STATUSES.has(status) && option.test(error.message)
}

export interface ThinkingFallback {
  /**
   * "thinking" when the DeepSeek switch replaced the preset, "removed" when
   * the options only lost the preset.
   */
  kind: "thinking" | "removed"
  /** The provider options that worked in place of the preset. */
  options: Record<string, JSONValue>
  /** The error messages of the rejected options. */
  reason: string
}

/**
 * Runs `run` with the provider. When an OpenAI or custom provider rejects the
 * preset `reasoningEffort: "none"`, runs it again without the preset. The
 * fallback changes only the preset and the switch that it adds; all other
 * options of the user stay:
 *
 * - An OpenAI provider sends the request again without the preset, because
 *   the DeepSeek switch is not an OpenAI option.
 * - A custom provider without a `thinking` option of the user sends the
 *   DeepSeek switch in place of the preset. When the provider also rejects
 *   the switch, a third request has neither.
 * - A custom provider with a `thinking` option of the user sends only the
 *   options of the user.
 *
 * An error that does not show that the endpoint rejected the option ends the
 * retries. Returns the result, and the fallback when it was used.
 */
export async function runWithThinkingFallback<T>(
  providerConfig: LLMProviderConfig,
  run: (providerConfig: LLMProviderConfig) => Promise<T>,
): Promise<{ result: T, fallback?: ThinkingFallback }> {
  try {
    return { result: await run(providerConfig) }
  }
  catch (error) {
    const { provider, providerOptions: options } = providerConfig
    if (provider === "deepseek" || !rejectsOption(error, REASONING_EFFORT_ERROR) || options?.reasoningEffort !== THINKING_OFF_PROVIDER_OPTIONS[provider].reasoningEffort)
      throw error
    const { reasoningEffort: _preset, ...userOptions } = options
    const runWith = (providerOptions: Record<string, JSONValue>) => run({ ...providerConfig, providerOptions })
    if (provider === "openai" || userOptions.thinking !== undefined)
      return { result: await runWith(userOptions), fallback: { kind: "removed", options: userOptions, reason: error.message } }

    const withSwitch = { ...userOptions, ...THINKING_OFF_PROVIDER_OPTIONS.deepseek }
    try {
      return { result: await runWith(withSwitch), fallback: { kind: "thinking", options: withSwitch, reason: error.message } }
    }
    catch (thinkingError) {
      if (!rejectsOption(thinkingError, THINKING_ERROR))
        throw thinkingError
      return { result: await runWith(userOptions), fallback: { kind: "removed", options: userOptions, reason: `${error.message}; ${thinkingError.message}` } }
    }
  }
}
