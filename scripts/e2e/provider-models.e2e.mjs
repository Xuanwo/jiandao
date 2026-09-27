/* global chrome -- page.evaluate() runs these callbacks in the extension page. */
import assert from "node:assert/strict"
import { Buffer } from "node:buffer"
import { createServer } from "node:http"
import { after, afterEach, before, beforeEach, it } from "node:test"
import { clickButton, launchBrowser, listenOnLocalPort, reportFailure, waitForStorage, waitForText } from "./browser.mjs"

let context
let page
let optionsURL
let baseURL
let models
let expectedAuthorization
let expectedTenant
let responseMode
let pendingRequest
let chatRequests
let chatRequestSeen

// Wire contract checked against the provider documentation, not application code:
// https://developers.openai.com/api/reference/resources/models/methods/list
// https://api-docs.deepseek.com/api/list-models
// https://lmstudio.ai/docs/developer/openai-compat/models
const server = createServer(async (request, response) => {
  response.setHeader("Content-Type", "application/json")
  // OpenAI Chat Completions wire contract, also used by DeepSeek and compatible providers:
  // https://platform.openai.com/docs/api-reference/chat/create
  if (request.method === "POST" && request.url === "/v1/chat/completions" && request.headers.authorization === expectedAuthorization) {
    const chunks = []
    for await (const chunk of request)
      chunks.push(chunk)
    chatRequests.push(JSON.parse(Buffer.concat(chunks).toString()))
    chatRequestSeen?.()
    response.end(JSON.stringify({
      id: "chatcmpl-test",
      object: "chat.completion",
      created: 1,
      model: "future-chat-model",
      choices: [{ index: 0, message: { role: "assistant", content: "你好" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 },
    }))
    return
  }
  if (request.method !== "GET" || !["/v1/models", "/other/models"].includes(request.url)) {
    response.writeHead(404).end(JSON.stringify({ error: { message: "Unknown endpoint" } }))
    return
  }
  if (request.headers.authorization !== expectedAuthorization || request.headers["x-tenant"] !== expectedTenant || request.headers["x-empty"] !== undefined) {
    response.writeHead(401).end(JSON.stringify({ error: { message: "Invalid API key", type: "authentication_error", code: "invalid_api_key" } }))
    return
  }
  if (responseMode === "error") {
    response.writeHead(503).end(JSON.stringify({ error: { message: "Provider temporarily unavailable" } }))
    return
  }
  const body = JSON.stringify(responseMode === "malformed"
    ? { data: [{ id: 42 }] }
    : {
        object: "list",
        data: models.map(id => ({ id, object: "model", created: 1686935002, owned_by: "test-provider" })),
      })
  if (pendingRequest) {
    pendingRequest(() => response.end(body))
    pendingRequest = undefined
  }
  else {
    response.end(body)
  }
})

/** Opens the inline editor of the provider row with this name. */
async function openProvider(name) {
  const row = page.locator("button[aria-expanded]").filter({ has: page.locator("span").filter({ hasText: new RegExp(`^${RegExp.escape(name)}$`) }) })
  if (await row.getAttribute("aria-expanded") !== "true")
    await row.click()
  await row.and(page.locator("[aria-expanded=true]")).waitFor()
  await modelInput().waitFor()
}

function modelInput() {
  return page.getByRole("textbox", { name: "Model", exact: true })
}

async function fill(selector, text) {
  await page.locator(selector).fill(text)
}

async function modelValue() {
  return modelInput().inputValue()
}

async function selectModel(name) {
  await page.getByRole("option", { name, exact: true }).click()
}

/** Waits until a stored provider has all these field values. */
async function waitForSavedProvider(fields) {
  await waitForStorage(page, (config, fields) => config.providersConfig.some(provider => Object.entries(fields).every(([key, value]) => provider[key] === value)), fields)
}

/** The provider options editor in the open provider form. */
function providerOptionsEditor() {
  return page.locator("[aria-label='provider-options-editor'] .cm-content")
}

async function openAdvancedSettings() {
  await clickButton(page, "Advanced: temperature, headers, provider options")
  await providerOptionsEditor().waitFor()
}

/** Replaces the text of the provider options editor, like a user who pastes it. */
async function typeProviderOptions(text) {
  await providerOptionsEditor().click()
  await page.keyboard.press("ControlOrMeta+a")
  if (text)
    await page.keyboard.insertText(text)
  else
    await page.keyboard.press("Backspace")
  await page.keyboard.press("Tab")
}

/** Waits until the stored provider with this name has these provider options. */
async function waitForSavedProviderOptions(name, options) {
  await waitForStorage(page, (config, { name, options }) => {
    const saved = config.providersConfig.find(provider => provider.name === name)
    return saved !== undefined && JSON.stringify(saved.providerOptions) === JSON.stringify(options)
  }, { name, options })
}

/** Clicks "Test connection" and waits until the endpoint gets the request and the test succeeds. */
async function testConnection() {
  const seen = new Promise((resolve) => {
    chatRequestSeen = resolve
  })
  await clickButton(page, "Test connection")
  await seen
  await connectionResult(".tabler-icon-check").waitFor()
}

/**
 * The result icon beside "Test connection". Other icons, such as the check of
 * the selected model in the closing model list, are not part of the result.
 */
function connectionResult(icon = ".tabler-icon-check, .tabler-icon-x") {
  return page.getByRole("button", { name: "Test connection", exact: true }).locator("..").locator(icon)
}

async function reloadSettings() {
  await page.reload()
  await waitForText(page, "DeepSeek")
}

before(async () => {
  await listenOnLocalPort(server)
  baseURL = `http://127.0.0.1:${server.address().port}/v1`
})

beforeEach(async () => {
  let extensionId
  ;({ context, page, extensionId } = await launchBrowser())
  optionsURL = `chrome-extension://${extensionId}/options.html#providers`
  models = ["future-chat-model", "another-chat-model"]
  expectedAuthorization = "Bearer test-key"
  expectedTenant = undefined
  responseMode = "models"
  pendingRequest = undefined
  chatRequests = []
  chatRequestSeen = undefined
  await page.goto(optionsURL)
  await waitForText(page, "DeepSeek")
})

afterEach(async (test) => {
  try {
    await reportFailure(test, context)
  }
  finally {
    await context.close()
  }
})

after(async () => {
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
})

const DEFAULT_MODELS_URLS = {
  OpenAI: "https://api.openai.com/v1/models",
  DeepSeek: "https://api.deepseek.com/models",
}

for (const [providerName, modelsURL] of Object.entries(DEFAULT_MODELS_URLS)) {
  it(`user selects a fetched model for ${providerName}: Given no base URL, When the user fetches models from the default endpoint and selects one, Then the model survives reloading settings`, async () => {
    // Given: the local fake answers for the default endpoint of the provider.
    await context.route(modelsURL, async route => route.fulfill({ response: await route.fetch({ url: `${baseURL}/models` }) }))
    await openProvider(providerName)
    await fill("#apiKey", "test-key")

    // When
    await clickButton(page, "Fetch available models")
    await waitForText(page, "future-chat-model")
    await selectModel("future-chat-model")

    // Then
    assert.equal(await modelValue(), "future-chat-model")
    await reloadSettings()
    await openProvider(providerName)
    assert.equal(await modelValue(), "future-chat-model")
  })
}

it("user refreshes available models: Given a saved model, When the provider changes its list, Then new models can be searched without changing the saved selection", async () => {
  // Given
  await openProvider("DeepSeek")
  await fill("#apiKey", "test-key")
  await fill("#baseURL", `${baseURL}///`)
  const savedModel = await modelValue()
  await clickButton(page, "Fetch available models")
  await waitForText(page, "future-chat-model")

  // When
  models = ["new-model", "another-model"]
  await clickButton(page, "Fetch available models")
  await waitForText(page, "new-model")
  await page.getByPlaceholder("Search models…").fill("new-")

  // Then
  await page.waitForFunction("document.querySelectorAll('[role=option]').length === 1")
  assert.equal(await page.getByRole("option").textContent(), "new-model")
  assert.equal(await modelValue(), savedModel)
})

for (const failure of ["error", "malformed"]) {
  it(`user recovers from ${failure}: Given a saved model, When fetching fails and is retried, Then the selection is preserved and the new list is available`, async () => {
    // Given
    await openProvider("DeepSeek")
    await fill("#apiKey", "test-key")
    await fill("#baseURL", baseURL)
    const savedModel = await modelValue()
    responseMode = failure

    // When
    await clickButton(page, "Fetch available models")
    await waitForText(page, "Click to retry")
    assert.equal(await modelValue(), savedModel)
    responseMode = "models"
    await clickButton(page, "Click to retry")

    // Then
    await waitForText(page, "future-chat-model")
    assert.equal(await modelValue(), savedModel)
  })
}

it("user uses a local provider without a key: Given an unauthenticated endpoint, When it returns no models, Then the user can still enter and save a model manually", async () => {
  // Given
  await openProvider("Custom Provider")
  await fill("#baseURL", baseURL)
  expectedAuthorization = undefined
  models = []

  // When
  await clickButton(page, "Fetch available models")
  await waitForText(page, "No models available")
  await modelInput().fill("local-model")
  await page.keyboard.press("Tab")
  await waitForSavedProvider({ model: "local-model" })
  await reloadSettings()

  // Then
  await openProvider("Custom Provider")
  assert.equal(await modelValue(), "local-model")
})

it("user authenticates with custom headers: Given a provider with a key and header overrides, When models are fetched, Then the endpoint accepts the custom authorization and tenant", async () => {
  // Given
  await openProvider("DeepSeek")
  await fill("#apiKey", "unused-key")
  await fill("#baseURL", baseURL)
  await clickButton(page, "Advanced: temperature, headers, provider options")
  await fill("[aria-label='provider-headers-editor'] .cm-content", JSON.stringify({ "authorization": "Bearer custom-key", "X-Tenant": "reading", "X-Empty": "" }))
  await page.keyboard.press("Tab")
  await waitForStorage(page, config => config.providersConfig.some(provider => provider.headers?.authorization === "Bearer custom-key"))
  expectedAuthorization = "Bearer custom-key"
  expectedTenant = "reading"

  // When
  await clickButton(page, "Fetch available models")

  // Then
  await waitForText(page, "future-chat-model")
  await selectModel("future-chat-model")
  assert.equal(await modelValue(), "future-chat-model")
})

it("user switches providers during a request: Given an unfinished old request, When another provider is opened, Then only that provider's models are offered", async () => {
  // Given
  await openProvider("DeepSeek")
  await fill("#apiKey", "test-key")
  await fill("#baseURL", baseURL)
  const pending = Promise.withResolvers()
  pendingRequest = pending.resolve
  models = ["old-provider-model"]
  await clickButton(page, "Fetch available models")
  const release = await pending.promise
  await page.getByRole("button", { name: "Fetch available models", exact: true, disabled: true }).waitFor()

  // When
  await openProvider("OpenAI")
  await fill("#apiKey", "test-key")
  await fill("#baseURL", baseURL.replace("/v1", "/other"))
  models = ["new-provider-model"]
  await clickButton(page, "Fetch available models")
  await waitForText(page, "new-provider-model")
  release()
  await page.waitForFunction(url => performance.getEntriesByType("resource").some(entry => entry.name === url), `${baseURL}/models`)

  // Then
  assert.equal(await page.getByRole("option").textContent(), "new-provider-model")
  await selectModel("new-provider-model")
  await reloadSettings()
  await openProvider("OpenAI")
  assert.equal(await modelValue(), "new-provider-model")
})

for (const [choice, name, options] of [
  ["OpenAI", "OpenAI 1", { reasoningEffort: "none" }],
  ["DeepSeek", "DeepSeek 1", { thinking: { type: "disabled" } }],
  ["OpenAI-compatible endpoint", "Custom Provider 1", { reasoningEffort: "none" }],
]) {
  it(`user adds a ${choice} service: Given the add menu, When the service is added, Then its provider options show the options that turn off thinking`, async () => {
    // Given
    await page.getByRole("button", { name: /^Add a service/ }).click()

    // When
    await page.getByRole("button", { name: choice, exact: true }).click()
    await page.waitForFunction(name => document.querySelector("#name")?.value === name, name)

    // Then
    await openAdvancedSettings()
    assert.deepEqual(JSON.parse(await providerOptionsEditor().textContent()), options)
    await waitForSavedProviderOptions(name, options)
  })
}

for (const [providerName, thinkingOff] of [
  ["DeepSeek", { thinking: { type: "disabled" } }],
  ["Custom Provider", { reasoning_effort: "none" }],
]) {
  it(`user tests the connection of ${providerName}: Given the options of a new install, When the options are removed and the connection is tested again, Then only the first request turns off thinking`, async () => {
    // Given
    await openProvider(providerName)
    await fill("#apiKey", "test-key")
    await fill("#baseURL", baseURL)
    await modelInput().fill("future-chat-model")
    await waitForSavedProvider({ name: providerName, model: "future-chat-model", baseURL })
    await testConnection()

    // When
    await openAdvancedSettings()
    await typeProviderOptions("")
    await waitForSavedProviderOptions(providerName, undefined)
    await testConnection()

    // Then
    const thinkingFields = body => Object.fromEntries(Object.entries(body).filter(([key]) => ["thinking", "reasoning_effort"].includes(key)))
    assert.deepEqual(chatRequests.map(thinkingFields), [thinkingOff, {}])
  })
}

it("user clears the model: Given a provider with a model, When the model field is cleared, Then an error shows and the saved model stays", async () => {
  // Given
  await openProvider("DeepSeek")
  const savedModel = await modelValue()

  // When
  await modelInput().clear()
  await page.keyboard.press("Tab")

  // Then
  await waitForText(page, "Enter a model ID.")
  await reloadSettings()
  await openProvider("DeepSeek")
  assert.equal(await modelValue(), savedModel)
})

it("user tests a connection with a config from an older version: Given the stored provider still uses the old model fields, When the connection is tested, Then the translation request succeeds", async () => {
  // Given: storage that the background has not converted yet.
  await page.evaluate(async (url) => {
    const { config } = await chrome.storage.local.get("config")
    const provider = config.providersConfig.find(p => p.provider === "deepseek")
    provider.apiKey = "test-key"
    provider.baseURL = url
    provider.model = { model: "deepseek-chat", isCustomModel: true, customModel: "future-chat-model" }
    await chrome.storage.local.set({ config })
  }, baseURL)
  await reloadSettings()
  await openProvider("DeepSeek")
  assert.equal(await modelValue(), "future-chat-model")

  // When
  await clickButton(page, "Test connection")

  // Then
  await connectionResult().waitFor()
  assert.equal(await connectionResult(".tabler-icon-check").count(), 1)
})
