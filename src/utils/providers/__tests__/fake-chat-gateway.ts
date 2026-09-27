import type { LLMProviderConfig } from "@/types/config/provider"
import { createServer } from "node:http"
import { isLLMProviderConfig } from "@/types/config/provider"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { BATCH_SEPARATOR, BATCH_SEPARATOR_LINE_PATTERN } from "@/utils/constants/prompt"

/** The error text of a gateway in front of DeepSeek V4.1 Flash for a reasoning_effort it does not accept. */
export const REASONING_EFFORT_ERROR = "Invalid option: expected one of \"low\"|\"medium\"|\"high\"|\"xhigh\"|\"max\""
/** The error text of OpenAI for `reasoning.effort: "none"` and a model that does not accept it, such as gpt-5-mini. */
export const OPENAI_REASONING_EFFORT_ERROR = "Unsupported value: 'reasoning.effort' does not support 'none' with this model. Supported values are: 'low', 'medium', and 'high'."
/** The error text of an OpenAI-style endpoint for the thinking parameter, which it does not know. */
export const THINKING_ERROR = "Unrecognized request argument supplied: thinking"

export interface ChatGatewayBehavior {
  /**
   * The reasoning efforts that the gateway rejects, with {@link REASONING_EFFORT_ERROR}
   * (Chat Completions) or {@link OPENAI_REASONING_EFFORT_ERROR} (Responses).
   */
  rejectedEfforts?: string[]
  /** When true, the gateway answers every request with a server error. */
  down?: boolean
  /** When true, the gateway rejects a request with the thinking parameter with {@link THINKING_ERROR}. */
  rejectThinking?: boolean
  /** When set, the gateway waits for it before it answers a request with the thinking switch. */
  holdThinking?: Promise<void>
  /** When true, the gateway answers one paragraph more than the request has. */
  extraParagraph?: boolean
}

export interface ReceivedOptions {
  /** `reasoning_effort` of Chat Completions, or `reasoning.effort` of Responses. */
  reasoning_effort?: string
  thinking?: unknown
}

interface RequestBody {
  reasoning_effort?: string
  reasoning?: { effort?: string }
  thinking?: unknown
  messages?: { content: string }[]
}

/**
 * Starts a local gateway with the OpenAI Chat Completions wire contract
 * (https://platform.openai.com/docs/api-reference/chat/create), which custom
 * providers use, and the OpenAI Responses wire contract
 * (https://platform.openai.com/docs/api-reference/responses/create) at
 * `/responses`, which OpenAI providers use. It answers each paragraph of a
 * Chat Completions request with "Hola", and records the reasoning options of
 * each request. A test changes `behavior` to make the gateway strict, down or slow.
 */
export async function startFakeChatGateway() {
  const received: ReceivedOptions[] = []
  const gateway: { behavior: ChatGatewayBehavior, received: ReceivedOptions[], baseURL: string, close: () => Promise<void> } = {
    behavior: {},
    received,
    baseURL: "",
    close: async () => {},
  }
  const server = createServer(async (request, response) => {
    let body = ""
    for await (const chunk of request)
      body += chunk
    const parsed: RequestBody = JSON.parse(body)
    const isResponses = request.url?.endsWith("/responses") ?? false
    const reasoning_effort = isResponses ? parsed.reasoning?.effort : parsed.reasoning_effort
    const { thinking, messages = [] } = parsed
    received.push({ reasoning_effort, thinking })
    const { rejectedEfforts = [], down = false, rejectThinking = false, holdThinking, extraParagraph = false } = gateway.behavior
    response.setHeader("Content-Type", "application/json")
    if (down) {
      response.writeHead(500).end(JSON.stringify({ error: { message: "The server had an error" } }))
      return
    }
    if (reasoning_effort !== undefined && rejectedEfforts.includes(reasoning_effort)) {
      const error = isResponses
        ? { message: OPENAI_REASONING_EFFORT_ERROR, type: "invalid_request_error", param: "reasoning.effort", code: "unsupported_value" }
        : { message: REASONING_EFFORT_ERROR }
      response.writeHead(400).end(JSON.stringify({ error }))
      return
    }
    if (thinking && rejectThinking) {
      response.writeHead(400).end(JSON.stringify({ error: { message: THINKING_ERROR } }))
      return
    }
    if (thinking)
      await holdThinking
    if (isResponses) {
      response.end(JSON.stringify({
        id: "resp-test",
        object: "response",
        created_at: 1,
        status: "completed",
        model: "gpt-5-mini",
        output: [{ type: "message", id: "msg-test", status: "completed", role: "assistant", content: [{ type: "output_text", text: "Hola", annotations: [] }] }],
        usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
      }))
      return
    }
    const paragraphs = (messages.at(-1)?.content.split(BATCH_SEPARATOR_LINE_PATTERN).length ?? 1) + (extraParagraph ? 1 : 0)
    const answer = Array.from({ length: paragraphs }).fill("Hola").join(`\n\n${BATCH_SEPARATOR}\n\n`)
    response.end(JSON.stringify({
      id: "chatcmpl-test",
      object: "chat.completion",
      created: 1,
      model: "deepseek-v4.1-flash",
      choices: [{ index: 0, message: { role: "assistant", content: answer }, finish_reason: "stop" }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }))
  })
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  if (!address || typeof address === "string")
    throw new Error("The fake gateway has no port")
  gateway.baseURL = `http://127.0.0.1:${address.port}`
  gateway.close = () => new Promise<void>(resolve => server.close(() => resolve()))
  return gateway
}

/** The provider of this type in the default config. */
export function defaultProvider<P extends LLMProviderConfig["provider"]>(provider: P): Extract<LLMProviderConfig, { provider: P }> {
  const defaults = DEFAULT_CONFIG.providersConfig.find((config): config is Extract<LLMProviderConfig, { provider: P }> => isLLMProviderConfig(config) && config.provider === provider)
  if (!defaults)
    throw new Error(`The default config has no ${provider} provider`)
  return defaults
}
