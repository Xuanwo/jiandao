import http from "node:http"

function article(description) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Reading and Experience</title>${description ? `<meta name="description" content="${description}">` : ""}</head><body style="max-width:640px;margin:40px auto;font:16px/1.6 Georgia,serif">
<h1>Reading and Experience</h1>
<p>A few months ago I finished a new book, and in reviews I keep noticing words like gripping and explosive. I did not set out to write a gripping book, but that is what happened.</p>
<p>Reading and experience train your model of the world. And even if you forget the experience or what you read, its effect on your model of the world persists.</p>
<p>Your mind is like a compiled program you have lost the source of. It works, but you do not know why.</p>
<p>So what you want to do is to read things that you will be glad to have compiled into your model of the world, even if you do not remember them.</p>
</body></html>`
}

/**
 * A local stand-in for an OpenAI-compatible service, plus an English article
 * to translate at `/article` (`?description=` adds a meta description).
 * `POST /v1/chat/completions` splits the last user message at the standalone
 * `%%` lines and answers each part with "【译】" and the first 24 characters
 * of the part's last line, keeping the batch separators Jiandao uses, so a
 * translated page is easy to recognize. The model "rejected-model" gets a
 * 400 answer, like a service that does not know the model.
 * Every request is recorded in `requests` for assertions.
 */
export async function startFakeService() {
  const requests = []
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, "http://localhost")
    if (request.method === "GET" && url.pathname === "/article") {
      response.setHeader("Content-Type", "text/html; charset=utf-8")
      response.end(article(url.searchParams.get("description")))
      return
    }
    let body = ""
    for await (const chunk of request)
      body += chunk
    requests.push({ method: request.method, url: request.url, authorization: request.headers.authorization, body })
    if (request.method === "POST" && request.url === "/v1/chat/completions") {
      const json = JSON.parse(body)
      if (json.model === "rejected-model") {
        response.statusCode = 400
        response.setHeader("Content-Type", "application/json")
        response.end(JSON.stringify({ error: { message: "The model rejected-model does not exist" } }))
        return
      }
      const user = [...json.messages].reverse().find(message => message.role === "user")?.content ?? ""
      const translated = user
        .split(/\r?\n[ \t]*%%[ \t]*\r?\n/)
        .map(segment => `【译】${segment.trim().split("\n").at(-1).slice(0, 24)}`)
        .join("\n%%\n")
      response.setHeader("Content-Type", "application/json")
      response.end(JSON.stringify({
        id: "chatcmpl-e2e",
        object: "chat.completion",
        created: 1,
        model: json.model,
        choices: [{ index: 0, message: { role: "assistant", content: translated }, finish_reason: "stop" }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }))
      return
    }
    response.statusCode = 404
    response.end(JSON.stringify({ error: { message: `no route ${request.method} ${request.url}` } }))
  })
  // Port 0 asks the OS for a free port; Chromium refuses a few well-known ports, which the OS never hands out here.
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  return {
    origin,
    requests,
    completions: () => requests.filter(request => request.url === "/v1/chat/completions"),
    close: () => new Promise(resolve => server.close(resolve)),
  }
}

/** A setup document that points Jiandao at the fake service. It describes the service only. */
export function setupDocumentFor(origin, overrides = {}) {
  return {
    type: "openai-compatible",
    name: "Local gateway",
    apiKey: "local-secret-key",
    model: "fake-model",
    baseURL: `${origin}/v1/`,
    ...overrides,
  }
}
