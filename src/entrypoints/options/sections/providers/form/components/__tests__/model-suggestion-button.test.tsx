// @vitest-environment jsdom

import { createServer } from "node:http"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen } from "@testing-library/react"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { ModelSuggestionButton } from "../model-suggestion-button"

const requestPaths: string[] = []

const server = createServer((request, response) => {
  requestPaths.push(`${request.method} ${request.url}`)
  response.setHeader("Content-Type", "application/json")
  if (request.url !== "/v1/models") {
    response.statusCode = 404
    response.end(JSON.stringify({ error: { message: "Not found" } }))
    return
  }
  response.end(JSON.stringify({
    object: "list",
    data: [{ id: "test-model", object: "model", created: 0, owned_by: "test" }],
  }))
})

let origin = ""

beforeAll(async () => {
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  if (address === null || typeof address === "string") {
    throw new Error("The test server has no TCP address")
  }
  origin = `http://127.0.0.1:${address.port}`
})

afterAll(async () => {
  await new Promise(resolve => server.close(resolve))
})

describe("model suggestion button", () => {
  it("user fetches the model list: Given a base URL with spaces and trailing slashes, When the user clicks the fetch button, Then the request reaches /v1/models and the model list opens", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ModelSuggestionButton baseURL={` ${origin}/v1// `} apiKey="test-key" onSelect={() => {}} />
      </QueryClientProvider>,
    )

    fireEvent.click(screen.getByRole("button", { name: "options.providers.form.models.fetchModels" }))

    expect(await screen.findByRole("option", { name: "test-model" })).toBeInTheDocument()
    expect(requestPaths).toEqual(["GET /v1/models"])
  })
})
