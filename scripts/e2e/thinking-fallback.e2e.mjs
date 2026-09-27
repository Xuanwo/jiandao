/* global chrome -- page.evaluate() runs these callbacks in the extension page. */
import assert from "node:assert/strict"
import { createServer } from "node:http"
import { after, afterEach, before, beforeEach, it } from "node:test"
import { clickButton, launchBrowser, listenOnLocalPort, reportFailure, turnOnPageTranslation, waitForText } from "./browser.mjs"
import { answerEachParagraph, createFakeGateway, lastUserText } from "./fake-gateway.mjs"
import { connectionResult, openAdvancedSettings, openProvider, reloadSettings, savedProviderOptions, typeProviderOptions, waitForSavedProviderOptions } from "./provider-form.mjs"

const translated = "Le fournisseur indemnisera le client."
// Each test translates its own page, so no test gets a translation from the cache of another.
const pages = {
  "/": { title: "Agreement", text: "The supplier shall indemnify the customer." },
  "/both": { title: "Payment terms", text: "The buyer shall pay within thirty days." },
  "/own": { title: "Delivery terms", text: "The seller shall deliver the goods." },
  "/openai": { title: "Warranty", text: "The seller gives a warranty of one year." },
  "/summary": { title: "Termination", text: "Either party may end the agreement with notice." },
}
let context
let article
let options
let pageURL

const gateway = createFakeGateway()
const translateEachParagraph = answerEachParagraph(translated)

/** True for the request of the language detection, which is not a translation. */
function isLanguageDetection(body) {
  return JSON.stringify(body.messages ?? body.input).includes("language detection assistant")
}

/** Answers the language detection with English, and a translation with the translated text. */
function answer(body) {
  return isLanguageDetection(body) ? JSON.stringify({ reason: "English", code: "eng" }) : translateEachParagraph(body)
}

const server = createServer(async (request, response) => {
  if (await gateway.handle(request, response))
    return
  const { title, text } = pages[new URL(request.url, "http://localhost").pathname] ?? pages["/"]
  response.setHeader("Content-Type", "text/html; charset=utf-8")
  response.end(`<!doctype html><html lang="en"><head><title>${title}</title></head><body><p id="clause">${text}</p></body></html>`)
})

/**
 * Changes the provider of this type and uses it for page translation, as a
 * user who never tests the connection. With `aiContentAware`, the translation
 * first asks for a summary of the page.
 */
async function translateWith(provider, fields, { aiContentAware = false } = {}) {
  await options.evaluate(async ([provider, fields, aiContentAware]) => {
    const { config } = await chrome.storage.local.get("config")
    const saved = config.providersConfig.find(p => p.provider === provider)
    Object.assign(saved, fields)
    config.translate.providerId = saved.id
    config.translate.enableAIContentAware = aiContentAware
    await chrome.storage.local.set({ config })
  }, [provider, fields, aiContentAware])
}

/** The parameters of the requests that translate the page at this path, without the messages and the model. */
function requestsOf(path) {
  return gateway.requests
    .filter(body => !isLanguageDetection(body) && JSON.stringify(body.messages ?? body.input).includes(pages[path].text))
    .map(({ messages: _messages, input: _input, model: _model, ...parameters }) => parameters)
}

async function savedOptionsOf(provider) {
  return options.evaluate(async provider => (await chrome.storage.local.get("config")).config.providersConfig.find(p => p.provider === provider).providerOptions, provider)
}

/** Translates the page at this path in a new tab, because the extension keeps page translation on per tab. */
async function translatePage(path) {
  const page = path === "/" ? article : await context.newPage()
  await page.bringToFront()
  await page.goto(`${pageURL}${path}`)
  await waitForText(page, pages[path].text)
  await turnOnPageTranslation(page)
  await page.locator("#clause .plainly-translated-content-wrapper", { hasText: translated }).waitFor()
  return page
}

before(async () => {
  await listenOnLocalPort(server)
  pageURL = `http://127.0.0.1:${server.address().port}`
  let extensionId
  ;({ context, page: article, extensionId } = await launchBrowser())
  options = await context.newPage()
  await options.goto(`chrome-extension://${extensionId}/options.html#providers`)
  await waitForText(options, "DeepSeek")
  // A new custom provider keeps its preset provider options; the user never tests the connection.
  await options.evaluate(async (baseURL) => {
    const { config } = await chrome.storage.local.get("config")
    const provider = config.providersConfig.find(p => p.provider === "openai-compatible")
    Object.assign(provider, { baseURL, apiKey: "local-test-key", model: "deepseek-v4.1-flash" })
    config.language = { ...config.language, sourceCode: "eng", targetCode: "fra" }
    await chrome.storage.local.set({ config })
  }, `${pageURL}/v1`)
})

beforeEach(() => {
  gateway.reset()
  gateway.behavior.answer = answer
})

afterEach(async (test) => {
  if (test.error)
    test.diagnostic(`requests to the fake model: ${JSON.stringify(gateway.requests.map(({ messages: _messages, input: _input, ...parameters }) => parameters))}`)
  await reportFailure(test, context)
})

after(async () => {
  await context?.close()
  await new Promise(resolve => server.close(resolve))
})

it("user translates a page with a new custom provider behind a strict gateway: Given the preset reasoningEffort none, another option and no connection test, When the page is translated, Then the page is translated, the page tells why, and the provider options use the thinking switch and keep the other option", async () => {
  // Given
  gateway.behavior.rejectNone = true
  await translateWith("openai-compatible", { providerOptions: { reasoningEffort: "none", topK: 20 } })

  // When
  const page = await translatePage("/")

  // Then
  await page.getByText("and translations send it", { exact: false }).waitFor()
  const own = requestsOf("/")
  assert.ok(own.some(parameters => parameters.reasoning_effort === "none"))
  assert.ok(own.some(parameters => parameters.reasoning_effort === undefined && parameters.thinking?.type === "disabled"))
  assert.ok(own.every(parameters => parameters.topK === 20))
  assert.deepEqual(await savedOptionsOf("openai-compatible"), { topK: 20, thinking: { type: "disabled" } })
})

it("user translates a page with a custom provider that rejects both switches: Given the preset reasoningEffort none, other options and a gateway that also rejects the thinking switch, When the page is translated, Then the page is translated, the page tells why, and the provider options lose only the preset", async () => {
  // Given
  Object.assign(gateway.behavior, { rejectNone: true, rejectThinking: true })
  await translateWith("openai-compatible", { providerOptions: { reasoningEffort: "none", topK: 20, seed: 7 } })

  // When
  const page = await translatePage("/both")

  // Then
  await page.getByText("translations do not send it", { exact: false }).waitFor()
  const own = requestsOf("/both")
  assert.ok(own.some(parameters => parameters.reasoning_effort === undefined && parameters.thinking === undefined))
  assert.ok(own.every(parameters => parameters.topK === 20 && parameters.seed === 7))
  assert.deepEqual(await savedOptionsOf("openai-compatible"), { topK: 20, seed: 7 })
})

it("user translates a page with their own thinking option: Given the preset reasoningEffort none and a thinking option of the user, When the page is translated, Then the thinking option of the user reaches the gateway and stays, and only the preset goes away", async () => {
  // Given
  gateway.behavior.rejectNone = true
  await translateWith("openai-compatible", { providerOptions: { reasoningEffort: "none", thinking: { type: "enabled", budget_tokens: 512 }, topK: 20 } })

  // When
  const page = await translatePage("/own")

  // Then
  await page.getByText("translations do not send it", { exact: false }).waitFor()
  const own = requestsOf("/own")
  assert.ok(own.length > 0 && own.every(parameters => parameters.thinking?.type === "enabled" && parameters.thinking?.budget_tokens === 512 && parameters.topK === 20))
  assert.deepEqual(await savedOptionsOf("openai-compatible"), { thinking: { type: "enabled", budget_tokens: 512 }, topK: 20 })
})

it("user translates a page with an OpenAI model that rejects none: Given the preset reasoningEffort none and another option, When OpenAI answers HTTP 400, Then the page is translated without a reasoning effort, the page tells why, and the provider options lose only the preset", async () => {
  // Given: gpt-5-mini does not accept the reasoning effort "none".
  gateway.behavior.rejectNone = true
  await translateWith("openai", { baseURL: `${pageURL}/v1`, apiKey: "local-test-key", model: "gpt-5-mini", providerOptions: { reasoningEffort: "none", textVerbosity: "low" } })

  // When
  const page = await translatePage("/openai")

  // Then
  await page.getByText("translations do not send it", { exact: false }).waitFor()
  const own = requestsOf("/openai")
  assert.ok(own.some(parameters => parameters.reasoning?.effort === "none"))
  assert.ok(own.some(parameters => parameters.reasoning?.effort === undefined && parameters.thinking === undefined))
  assert.ok(own.every(parameters => parameters.text?.verbosity === "low"))
  assert.deepEqual(await savedOptionsOf("openai"), { textVerbosity: "low" })
})

it("user translates a page with AI content awareness: Given a new custom provider with the preset behind a strict gateway, When the extension asks for a summary of the page, Then the summary request also uses the thinking switch", async () => {
  // Given
  gateway.behavior.rejectNone = true
  await translateWith("openai-compatible", { providerOptions: { reasoningEffort: "none" } }, { aiContentAware: true })

  // When
  await translatePage("/summary")

  // Then
  const summaries = gateway.requests.filter(body => lastUserText(body).startsWith("Summarize the following article"))
  assert.deepEqual(summaries.map(({ reasoning_effort, thinking }) => ({ reasoning_effort, thinking })), [{ reasoning_effort: "none", thinking: undefined }, { reasoning_effort: undefined, thinking: { type: "disabled" } }])
  assert.deepEqual(await savedOptionsOf("openai-compatible"), { thinking: { type: "disabled" } })
})

/** Opens the custom provider on the settings page, with no message from an earlier test, and opens its provider options. */
async function openCustomProvider() {
  await options.bringToFront()
  await reloadSettings(options)
  await openProvider(options, "Custom Provider")
  await openAdvancedSettings(options)
}

it("user tests a custom provider behind a strict gateway: Given the preset reasoningEffort none and another option, When the gateway rejects none, Then the test tries the thinking switch, keeps the other option and tells why", async () => {
  // Given
  gateway.behavior.rejectNone = true
  await openCustomProvider()
  await typeProviderOptions(options, `{ "reasoningEffort": "none", "topK": 20 }`)
  await waitForSavedProviderOptions(options, "Custom Provider", { reasoningEffort: "none", topK: 20 })

  // When
  await clickButton(options, "Test connection")

  // Then
  await waitForText(options, "The service does not accept")
  await connectionResult(options, ".tabler-icon-check").waitFor()
  await waitForSavedProviderOptions(options, "Custom Provider", { topK: 20, thinking: { type: "disabled" } })

  // When the user then changes the options, Then the old result goes away
  await typeProviderOptions(options, `{ "topK": 30, "thinking": { "type": "disabled" } }`)
  await connectionResult(options, ".tabler-icon-check").waitFor({ state: "detached" })
  await waitForSavedProviderOptions(options, "Custom Provider", { topK: 30, thinking: { type: "disabled" } })
  await reloadSettings(options)
  assert.deepEqual(await savedProviderOptions(options, "Custom Provider"), { topK: 30, thinking: { type: "disabled" } })
})

it("user edits the options during a test: Given the gateway rejects none, When the user changes the options before the second request ends, Then the test keeps the user's options and shows no fallback message", async () => {
  // Given
  const hold = Promise.withResolvers()
  Object.assign(gateway.behavior, { rejectNone: true, holdThinking: hold.promise })
  await openCustomProvider()
  await typeProviderOptions(options, `{ "reasoningEffort": "none" }`)
  await waitForSavedProviderOptions(options, "Custom Provider", { reasoningEffort: "none" })
  const thinkingRequest = gateway.nextRequest(body => body.thinking !== undefined)

  // When
  await clickButton(options, "Test connection")
  await thinkingRequest
  await typeProviderOptions(options, `{ "reasoningEffort": "low" }`)
  await waitForSavedProviderOptions(options, "Custom Provider", { reasoningEffort: "low" })
  hold.resolve()

  // Then
  await options.getByRole("button", { name: "Test connection", exact: true }).and(options.locator(":enabled")).waitFor()
  assert.equal(await options.getByText("The service does not accept").count(), 0)
  assert.deepEqual(await savedProviderOptions(options, "Custom Provider"), { reasoningEffort: "low" })
})
