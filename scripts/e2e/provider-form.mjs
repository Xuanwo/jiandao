/* global chrome -- page.evaluate() runs these callbacks in the extension page. */
import { clickButton, waitForStorage, waitForText } from "./browser.mjs"

// Helpers for the provider form on the settings page. `page` is the settings page.

/** Opens the inline editor of the provider row with this name. */
export async function openProvider(page, name) {
  const row = page.locator("button[aria-expanded]").filter({ has: page.locator("span").filter({ hasText: new RegExp(`^${RegExp.escape(name)}$`) }) })
  if (await row.getAttribute("aria-expanded") !== "true")
    await row.click()
  await row.and(page.locator("[aria-expanded=true]")).waitFor()
  await modelInput(page).waitFor()
}

export function modelInput(page) {
  return page.getByRole("textbox", { name: "Model", exact: true })
}

export async function fill(page, selector, text) {
  await page.locator(selector).fill(text)
}

/** Waits until a stored provider has all these field values. */
export async function waitForSavedProvider(page, fields) {
  await waitForStorage(page, (config, fields) => config.providersConfig.some(provider => Object.entries(fields).every(([key, value]) => provider[key] === value)), fields)
}

/** The provider options editor in the open provider form. */
export function providerOptionsEditor(page) {
  return page.locator("[aria-label='provider-options-editor'] .cm-content")
}

export async function openAdvancedSettings(page) {
  await clickButton(page, "Advanced: temperature, headers, provider options")
  await providerOptionsEditor(page).waitFor()
}

/** Replaces the text of the provider options editor, like a user who pastes it. */
export async function typeProviderOptions(page, text) {
  await providerOptionsEditor(page).click()
  await page.keyboard.press("ControlOrMeta+a")
  if (text)
    await page.keyboard.insertText(text)
  else
    await page.keyboard.press("Backspace")
  await page.keyboard.press("Tab")
}

/** Waits until the stored provider with this name has these provider options. */
export async function waitForSavedProviderOptions(page, name, options) {
  await waitForStorage(page, (config, { name, options }) => {
    // Storage can keep the keys in another order.
    const sorted = value => value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])])) : value
    const saved = config.providersConfig.find(provider => provider.name === name)
    return saved !== undefined && JSON.stringify(sorted(saved.providerOptions)) === JSON.stringify(sorted(options))
  }, { name, options })
}

/** The saved provider options of the provider with this name. */
export async function savedProviderOptions(page, name) {
  return page.evaluate(async name => (await chrome.storage.local.get("config")).config.providersConfig.find(provider => provider.name === name).providerOptions, name)
}

/**
 * The result icon beside "Test connection". Other icons, such as the check of
 * the selected model in the closing model list, are not part of the result.
 */
export function connectionResult(page, icon = ".tabler-icon-check, .tabler-icon-x") {
  return page.getByRole("button", { name: "Test connection", exact: true }).locator("..").locator(icon)
}

export async function reloadSettings(page) {
  await page.reload()
  await waitForText(page, "DeepSeek")
}
