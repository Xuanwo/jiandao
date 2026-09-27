import { Buffer } from "node:buffer"

/** The error text of a gateway in front of DeepSeek V4.1 Flash for `reasoning_effort: "none"`. */
export const REASONING_EFFORT_ERROR = "Invalid option: expected one of \"low\"|\"medium\"|\"high\"|\"xhigh\"|\"max\""
/** The error text of OpenAI for `reasoning.effort: "none"` and a model that does not accept it, such as gpt-5-mini. */
export const OPENAI_REASONING_EFFORT_ERROR = "Unsupported value: 'reasoning.effort' does not support 'none' with this model. Supported values are: 'low', 'medium', and 'high'."
/** The error text of an OpenAI-style endpoint for the thinking parameter, which it does not know. */
export const THINKING_ERROR = "Unrecognized request argument supplied: thinking"

const SEPARATOR_LINE = /\n[ \t]*%%[ \t]*\n/

/** The text of the last message of a Chat Completions or Responses request. */
export function lastUserText(body) {
  const last = (body.messages ?? body.input ?? []).at(-1)
  if (typeof last?.content === "string")
    return last.content
  return (last?.content ?? []).map(part => part.text ?? "").join("")
}

/** The answer of the gateway: `text` once for each paragraph of the request. */
export function answerEachParagraph(text) {
  return body => lastUserText(body).split(SEPARATOR_LINE).map(() => text).join("\n\n%%\n\n")
}

function chatCompletion(text) {
  return {
    id: "chatcmpl-test",
    object: "chat.completion",
    created: 1,
    model: "any-model",
    choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: "stop" }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  }
}

function responsesBody(text) {
  return {
    id: "resp-test",
    object: "response",
    created_at: 1,
    status: "completed",
    model: "any-model",
    output: [{ type: "message", id: "msg-test", status: "completed", role: "assistant", content: [{ type: "output_text", text, annotations: [] }] }],
    usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
  }
}

/**
 * A fake of an OpenAI-compatible gateway for the server of an E2E test. It
 * follows the wire contracts of Chat Completions
 * (https://platform.openai.com/docs/api-reference/chat/create) and Responses
 * (https://platform.openai.com/docs/api-reference/responses/create). It
 * records the body of each request in `requests`. Each test sets `behavior`:
 *
 * - `rejectNone`: reject the reasoning effort "none" with HTTP 400, with the
 *   text of a DeepSeek gateway (Chat Completions) or of OpenAI (Responses).
 * - `rejectThinking`: reject the thinking parameter with HTTP 400.
 * - `holdThinking`: a promise that a request with the thinking parameter waits for.
 * - `answer(body)`: the text of the answer. The default is "Hola" for each paragraph.
 */
export function createFakeGateway() {
  const waiters = []
  const gateway = {
    requests: [],
    behavior: {},
    /** Clears the requests and the behavior, for the next test. */
    reset() {
      gateway.requests = []
      gateway.behavior = {}
      waiters.length = 0
    },
    /** Resolves with the body of the next request for which `predicate` is true. */
    nextRequest(predicate = () => true) {
      return new Promise(resolve => waiters.push({ predicate, resolve }))
    },
    /** Answers a POST to `…/chat/completions` or `…/responses`, and returns true. For other requests, returns false. */
    async handle(request, response) {
      const isResponses = request.url.endsWith("/responses")
      if (request.method !== "POST" || (!isResponses && !request.url.endsWith("/chat/completions")))
        return false
      const chunks = []
      for await (const chunk of request)
        chunks.push(chunk)
      const body = JSON.parse(Buffer.concat(chunks).toString())
      gateway.requests.push(body)
      for (const waiter of [...waiters]) {
        if (waiter.predicate(body)) {
          waiters.splice(waiters.indexOf(waiter), 1)
          waiter.resolve(body)
        }
      }
      const { rejectNone = false, rejectThinking = false, holdThinking, answer = answerEachParagraph("Hola") } = gateway.behavior
      response.setHeader("Content-Type", "application/json")
      const effort = isResponses ? body.reasoning?.effort : body.reasoning_effort
      if (rejectNone && effort === "none") {
        const error = isResponses
          ? { message: OPENAI_REASONING_EFFORT_ERROR, type: "invalid_request_error", param: "reasoning.effort", code: "unsupported_value" }
          : { message: REASONING_EFFORT_ERROR }
        response.writeHead(400).end(JSON.stringify({ error }))
        return true
      }
      if (rejectThinking && body.thinking) {
        response.writeHead(400).end(JSON.stringify({ error: { message: THINKING_ERROR } }))
        return true
      }
      if (body.thinking)
        await holdThinking
      const text = answer(body)
      response.end(JSON.stringify(isResponses ? responsesBody(text) : chatCompletion(text)))
      return true
    },
  }
  return gateway
}
