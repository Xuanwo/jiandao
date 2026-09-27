import type { AddressInfo } from "node:net"
import type { ProviderConfig } from "@/types/config/provider"
import http from "node:http"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { getRequestErrorMeta } from "@/utils/request/retry-policy"
import { extractResponseText, mergeBody, prepareRequest, ProviderRequestError, requestText } from "../request"

/**
 * A local server that records what Plainly sends and answers whatever the
 * test tells it to, so each wire format is checked on the wire and not
 * against a mock of fetch.
 */
interface Recorded { url: string, headers: http.IncomingHttpHeaders, body: unknown }

let server: http.Server
let origin: string
let recorded: Recorded[] = []
let respond: (request: Recorded) => { status?: number, headers?: Record<string, string>, body: string } = () => ({ body: "{}" })

beforeAll(async () => {
  server = http.createServer(async (request, response) => {
    let raw = ""
    for await (const chunk of request)
      raw += chunk
    const entry: Recorded = { url: request.url ?? "", headers: request.headers, body: raw ? JSON.parse(raw) : undefined }
    recorded.push(entry)
    const answer = respond(entry)
    response.writeHead(answer.status ?? 200, { "Content-Type": "application/json", ...answer.headers })
    response.end(answer.body)
  })
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", () => resolve()))
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

beforeEach(() => {
  recorded = []
  respond = () => ({ body: "{}" })
})

afterAll(async () => {
  await new Promise(resolve => server.close(resolve))
})

function provider(overrides: Partial<ProviderConfig>): ProviderConfig {
  return { id: "p", name: "Service", enabled: true, provider: "openai-compatible", baseURL: `${origin}/v1`, apiKey: "secret", model: "m", ...overrides }
}

describe("prepareRequest", () => {
  it("builds a chat completions request with the system and user messages", () => {
    const prepared = prepareRequest(provider({ provider: "deepseek", baseURL: undefined }), { system: "S", prompt: "P", temperature: 0.2 })
    expect(prepared.url).toBe("https://api.deepseek.com/chat/completions")
    expect(prepared.headers).toEqual({ "content-type": "application/json", "authorization": "Bearer secret" })
    expect(prepared.body).toEqual({ model: "m", messages: [{ role: "system", content: "S" }, { role: "user", content: "P" }], temperature: 0.2 })
  })

  it("builds a Responses API request for OpenAI", () => {
    const prepared = prepareRequest(provider({ provider: "openai", baseURL: undefined, model: "gpt-6-luna" }), { system: "S", prompt: "P" })
    expect(prepared.url).toBe("https://api.openai.com/v1/responses")
    expect(prepared.body).toEqual({ model: "gpt-6-luna", instructions: "S", input: "P" })
  })

  it("builds a Messages API request for Anthropic with its headers and max_tokens", () => {
    const prepared = prepareRequest(provider({ provider: "anthropic", baseURL: undefined, model: "claude-haiku-4-5" }), { system: "S", prompt: "P" })
    expect(prepared.url).toBe("https://api.anthropic.com/v1/messages")
    expect(prepared.headers).toEqual({ "content-type": "application/json", "x-api-key": "secret", "anthropic-version": "2023-06-01" })
    expect(prepared.body).toEqual({ model: "claude-haiku-4-5", max_tokens: 8192, system: "S", messages: [{ role: "user", content: "P" }] })
  })

  it("builds a generateContent request for Gemini with the model in the path", () => {
    const prepared = prepareRequest(provider({ provider: "gemini", baseURL: undefined, model: "gemini-3.5-flash-lite" }), { system: "S", prompt: "P", temperature: 0 })
    expect(prepared.url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent")
    expect(prepared.headers).toEqual({ "content-type": "application/json", "x-goog-api-key": "secret" })
    expect(prepared.body).toEqual({
      systemInstruction: { parts: [{ text: "S" }] },
      contents: [{ role: "user", parts: [{ text: "P" }] }],
      generationConfig: { temperature: 0 },
    })
  })

  it("lets a compatible service pick the Responses API and strips trailing slashes from the base URL", () => {
    const prepared = prepareRequest(provider({ api: "openai-responses", baseURL: "https://api.x.ai/v1//" }), { prompt: "P" })
    expect(prepared.url).toBe("https://api.x.ai/v1/responses")
    expect(prepared.body).toEqual({ model: "m", input: "P" })
  })

  it("merges the configured body into the request and applies extra headers", () => {
    const prepared = prepareRequest(provider({
      provider: "gemini",
      baseURL: undefined,
      headers: { "x-goog-api-key": "from-header", "X-Tenant": "t1" },
      body: { generationConfig: { thinkingConfig: { thinkingLevel: "minimal" } }, contents: null },
    }), { prompt: "P", temperature: 0.5 })
    expect(prepared.headers["x-goog-api-key"]).toBe("from-header")
    expect(prepared.headers["x-tenant"]).toBe("t1")
    expect(prepared.body).toEqual({
      contents: null,
      generationConfig: { temperature: 0.5, thinkingConfig: { thinkingLevel: "minimal" } },
    })
  })

  it("sends no temperature and no authorization unless the config has them", () => {
    const prepared = prepareRequest(provider({ apiKey: undefined }), { prompt: "P" })
    expect(prepared.headers).toEqual({ "content-type": "application/json" })
    expect(prepared.body).not.toHaveProperty("temperature")
  })

  it("refuses a compatible service without a base URL or a service without a model", () => {
    expect(() => prepareRequest(provider({ baseURL: undefined }), { prompt: "P" })).toThrow(/no base URL/)
    expect(() => prepareRequest(provider({ model: " " }), { prompt: "P" })).toThrow(/no model/)
  })
})

describe("mergeBody", () => {
  it("merges nested objects and replaces everything else", () => {
    expect(mergeBody({ a: { b: 1, c: 2 }, list: [1], keep: true }, { a: { c: 3 }, list: [2, 3], gone: null })).toEqual({
      a: { b: 1, c: 3 },
      list: [2, 3],
      keep: true,
      gone: null,
    })
  })
})

describe("extractResponseText", () => {
  it("reads each wire format's answer", () => {
    expect(extractResponseText("openai-chat", { choices: [{ message: { content: "hi" } }] })).toBe("hi")
    expect(extractResponseText("openai-chat", { choices: [{ message: { content: [{ type: "text", text: "a" }, { type: "text", text: "b" }] } }] })).toBe("ab")
    expect(extractResponseText("openai-responses", { output_text: "hi" })).toBe("hi")
    expect(extractResponseText("openai-responses", { output: [{ type: "reasoning" }, { type: "message", content: [{ type: "output_text", text: "hi" }] }] })).toBe("hi")
    expect(extractResponseText("anthropic", { content: [{ type: "thinking", thinking: "..." }, { type: "text", text: "hi" }] })).toBe("hi")
    expect(extractResponseText("gemini", { candidates: [{ content: { parts: [{ text: "...", thought: true }, { text: "hi" }] } }] })).toBe("hi")
  })

  it("returns undefined when there is no text", () => {
    expect(extractResponseText("openai-chat", { choices: [] })).toBeUndefined()
    expect(extractResponseText("anthropic", { content: [] })).toBeUndefined()
    expect(extractResponseText("gemini", null)).toBeUndefined()
  })
})

describe("requestText", () => {
  it("posts the prepared request and returns the model's text", async () => {
    respond = () => ({ body: JSON.stringify({ choices: [{ message: { role: "assistant", content: "你好" } }] }) })

    await expect(requestText(provider({ body: { reasoning_effort: "none" } }), { system: "S", prompt: "P" })).resolves.toBe("你好")

    expect(recorded).toHaveLength(1)
    expect(recorded[0].url).toBe("/v1/chat/completions")
    expect(recorded[0].headers.authorization).toBe("Bearer secret")
    expect(recorded[0].body).toEqual({ model: "m", messages: [{ role: "system", content: "S" }, { role: "user", content: "P" }], reasoning_effort: "none" })
  })

  it("turns an error answer into a ProviderRequestError the retry policy can read", async () => {
    respond = () => ({ status: 429, headers: { "retry-after": "3" }, body: JSON.stringify({ error: { message: "Rate limit reached", type: "rate_limit" } }) })

    const error = await requestText(provider({}), { prompt: "P" }).catch(caught => caught)

    expect(error).toBeInstanceOf(ProviderRequestError)
    expect(error.message).toBe("Rate limit reached")
    expect(error.statusCode).toBe(429)
    expect(getRequestErrorMeta(error)).toEqual(expect.objectContaining({ statusCode: 429, retryAfterMs: 3000, kind: "rate-limit" }))
  })

  it("keeps the raw body as the message when the error is not the usual JSON", async () => {
    respond = () => ({ status: 502, body: "upstream unavailable" })

    const error = await requestText(provider({}), { prompt: "P" }).catch(caught => caught)

    expect(error.message).toBe("upstream unavailable")
    expect(getRequestErrorMeta(error).statusCode).toBe(502)
  })

  it("fails on an answer without text so an empty translation is never shown as success", async () => {
    respond = () => ({ body: JSON.stringify({ choices: [{ message: { content: "" } }] }) })

    await expect(requestText(provider({}), { prompt: "P" })).rejects.toThrow(/Response has no text/)
  })
})
