// @vitest-environment jsdom
import type { ProviderConfig } from "@/types/config/provider"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, cleanup, render } from "@testing-library/react"
import { createStore, Provider } from "jotai"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { fakeBrowser } from "wxt/testing"
import { ThemeProvider } from "@/components/providers/theme-provider"
import { configSchema } from "@/types/config/config"
import { isAPIProviderConfig } from "@/types/config/provider"
import { configAtom } from "@/utils/atoms/config"
import { CONFIG_STORAGE_KEY, DEFAULT_CONFIG } from "@/utils/constants/config"
import { ProviderForm } from "../index"

const provider = DEFAULT_CONFIG.providersConfig.find(isAPIProviderConfig)
if (!provider) {
  throw new Error("DEFAULT_CONFIG has no API provider")
}
const providerId = provider.id

function nextMacrotask() {
  return new Promise<void>(resolve => setImmediate(resolve))
}

// Let storage writes and React work complete.
async function settle() {
  await act(async () => {
    for (let i = 0; i < 5; i++) {
      await nextMacrotask()
    }
  })
}

function inputById(container: HTMLElement, id: string) {
  const input = container.querySelector(`#${id}`)
  if (!(input instanceof HTMLInputElement)) {
    throw new TypeError(`No input #${id}`)
  }
  return input
}

// Set the value through the native setter, so that React gets a real change event.
function typeInto(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value)
  input.dispatchEvent(new Event("input", { bubbles: true }))
}

function renderProviderForm(store: ReturnType<typeof createStore>) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <Provider store={store}>
        <ThemeProvider>
          <ProviderForm providerId={providerId} />
        </ThemeProvider>
      </Provider>
    </QueryClientProvider>,
  )
}

async function storedProvider() {
  const items = await fakeBrowser.storage.local.get(CONFIG_STORAGE_KEY)
  return configSchema.parse(items[CONFIG_STORAGE_KEY]).providersConfig.find(item => item.id === providerId)
}

describe("providerForm", () => {
  beforeEach(() => {
    fakeBrowser.reset()
  })

  afterEach(() => {
    cleanup()
  })

  it("user keeps a field edit: Given the save of a new API key completed, When the user changes the base URL before React updates the form, Then the form and the storage keep the new base URL", async () => {
    const store = createStore()
    const { container } = renderProviderForm(store)
    await settle()

    // React applies updates only when act() ends. Thus React does not run
    // between the save of the API key and the change of the base URL.
    await act(async () => {
      const saveCompleted = new Promise<void>((resolve) => {
        let updates = 0
        const unsubscribe = store.sub(configAtom, () => {
          updates += 1
          // Update 1 is the optimistic write. The next update is the saved copy from storage.
          if (updates === 2) {
            unsubscribe()
            resolve()
          }
        })
      })
      typeInto(inputById(container, "apiKey"), "sk-edited")
      await saveCompleted
      typeInto(inputById(container, "baseURL"), "https://edited.example/v1")
    })
    await settle()

    expect(inputById(container, "baseURL").value).toBe("https://edited.example/v1")
    expect(await storedProvider()).toMatchObject({ apiKey: "sk-edited", baseURL: "https://edited.example/v1" })
  })

  it("user sees edits from another page: Given the user saved an API key, When another page saves a new base URL, the user leaves the base URL field, and another page restores the provider, Then the form shows each stored base URL", async () => {
    const store = createStore()
    const { container } = renderProviderForm(store)
    await settle()
    const baseURLInput = () => inputById(container, "baseURL")

    async function saveProviderFromOtherPage(update: (item: ProviderConfig) => ProviderConfig) {
      const items = await fakeBrowser.storage.local.get(CONFIG_STORAGE_KEY)
      const config = configSchema.parse(items[CONFIG_STORAGE_KEY])
      const providersConfig = config.providersConfig.map(item => item.id === providerId ? update(item) : item)
      await act(async () => {
        await fakeBrowser.storage.local.set({ [CONFIG_STORAGE_KEY]: { ...config, providersConfig } })
      })
      await settle()
    }

    await act(async () => {
      typeInto(inputById(container, "apiKey"), "sk-edited")
    })
    await settle()
    const savedProvider = await storedProvider()
    if (!savedProvider) {
      throw new Error("The provider is not in storage")
    }

    await saveProviderFromOtherPage(item => ({ ...item, baseURL: "https://other-page.example/v1" }))
    expect(baseURLInput().value).toBe("https://other-page.example/v1")

    act(() => {
      baseURLInput().focus()
      baseURLInput().blur()
    })
    await saveProviderFromOtherPage(() => savedProvider)
    expect(baseURLInput().value).toBe(savedProvider.baseURL ?? "")
  })
})
