// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { createStore, Provider } from "jotai"
import { afterEach, describe, expect, it } from "vitest"
import { configAtom } from "@/utils/atoms/config"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { attachRequestErrorMeta } from "@/utils/request/retry-policy"
import { TranslationError } from "../index"

describe("translationError", () => {
  afterEach(() => {
    cleanup()
  })

  function renderError({ statusCode, message }: { statusCode?: number, message: string }) {
    const store = createStore()
    store.set(configAtom, DEFAULT_CONFIG)
    const error = statusCode ? attachRequestErrorMeta(new Error(message), { statusCode }) : new Error(message)

    return render(
      <Provider store={store}>
        <TranslationError nodes={[]} error={error} />
      </Provider>,
    )
  }

  it("shows the status code, message and a retry button inline without portals", () => {
    const { container } = renderError({ statusCode: 429, message: "Too Many Requests" })

    expect(container).toHaveTextContent("translation.failed")
    expect(container).toHaveTextContent("429 Too Many Requests")
    expect(screen.getByRole("button", { name: "translation.retry" })).toBeInTheDocument()
    expect(document.body.querySelector("[data-slot='tooltip-content']")).toBeNull()
  })

  it("falls back to a generic reason when the error carries no message", () => {
    const { container } = renderError({ message: "" })

    expect(container).toHaveTextContent("translation.unknownError")
  })
})
