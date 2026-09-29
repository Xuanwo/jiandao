import type { AddressInfo } from "node:net"
import type { ProviderConfig } from "@/types/config/provider"
import http from "node:http"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { checkConnection } from "../test-connection"

// A service that accepts the request and never answers.
let server: http.Server
let origin: string
const pending = new Set<http.ServerResponse>()

beforeAll(async () => {
  server = http.createServer((_request, response) => {
    pending.add(response)
  })
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", () => resolve()))
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  for (const response of pending)
    response.destroy()
  await new Promise(resolve => server.close(resolve))
})

describe("checkConnection", () => {
  it("user tests a service that never answers: Given no response, When the timeout passes, Then the check fails and says how long it waited", async () => {
    const provider: ProviderConfig = {
      id: "silent",
      name: "Silent",
      enabled: true,
      provider: "openai-compatible",
      baseURL: `${origin}/v1`,
      apiKey: "sk-test",
      model: "m",
    }

    const check = await checkConnection(provider, { now: () => 42, timeoutMs: 200 })

    expect(check).toEqual({ ok: false, checkedAt: 42, error: "No answer from the service within 0.2 seconds" })
  })
})
