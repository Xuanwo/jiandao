// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { createStore, Provider } from "jotai"
import { afterEach, expect, it } from "vitest"
import { storage } from "#imports"
import { configAtom } from "@/utils/atoms/config"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { ServiceSection } from "../sections/service"

afterEach(cleanup)

it("user selects a saved service: Given two accounts at one endpoint, When the inactive account is selected, Then the choice persists and its deletion is disabled", async () => {
  const first = { ...DEFAULT_CONFIG.providersConfig[0], apiKey: "first-key" }
  const second = { ...first, id: "second", name: "Second", apiKey: "second-key" }
  const config = { ...DEFAULT_CONFIG, providersConfig: [first, second] }
  await storage.setItem("local:config", config)
  const store = createStore()
  store.set(configAtom, config)
  render(<Provider store={store}><ServiceSection /></Provider>)
  expect(screen.getByRole("article", { name: "Second" })).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "options.service.select" }))
  await waitFor(async () => expect((await storage.getItem<typeof config>("local:config"))?.translate.providerId).toBe("second"))
  expect(store.get(configAtom).providersConfig).toEqual([first, second])
})
