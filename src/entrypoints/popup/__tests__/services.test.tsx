// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { createStore, Provider } from "jotai"
import { afterEach, expect, it } from "vitest"
import { storage } from "#imports"
import { configAtom } from "@/utils/atoms/config"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { PopupFooter } from "../components/popup-footer"

afterEach(cleanup)

it("user selects a configured alternative: Given a keyless current entry, When choosing the saved service, Then the active ID persists without changing configurations", async () => {
  const second = { ...DEFAULT_CONFIG.providersConfig[0], id: "second", name: "Second", apiKey: "second-key" }
  const config = { ...DEFAULT_CONFIG, providersConfig: [...DEFAULT_CONFIG.providersConfig, second] }
  await storage.setItem("local:config", config)
  const store = createStore()
  store.set(configAtom, config)
  render(<Provider store={store}><PopupFooter /></Provider>)
  fireEvent.change(screen.getByRole("combobox", { name: "options.service.title" }), { target: { value: "second" } })
  await waitFor(async () => expect((await storage.getItem<typeof config>("local:config"))?.translate.providerId).toBe("second"))
  expect(store.get(configAtom).providersConfig).toEqual(config.providersConfig)
})
