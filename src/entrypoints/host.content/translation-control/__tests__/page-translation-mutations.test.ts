// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { PageTranslationManager } from "../page-translation"

const {
  mockDeepQueryTopLevelSelector,
  mockGetDetectedCodeFromStorage,
  mockGetLocalConfig,
  mockGetOrCreateWebPageContext,
  mockHasNoWalkAncestor,
  mockIsDontWalkIntoAndDontTranslateAsChildElement,
  mockIsDontWalkIntoButTranslateAsChildElement,
  mockRemoveAllTranslatedWrapperNodes,
  mockSendMessage,
  mockTranslateTextForPageTitle,
  mockTranslateWalkedElement,
  mockValidateTranslationConfigAndToast,
  mockWalkAndLabelElement,
} = vi.hoisted(() => ({
  mockGetDetectedCodeFromStorage: vi.fn(),
  mockGetLocalConfig: vi.fn(),
  mockGetOrCreateWebPageContext: vi.fn(),
  mockDeepQueryTopLevelSelector: vi.fn(),
  mockHasNoWalkAncestor: vi.fn(),
  mockIsDontWalkIntoAndDontTranslateAsChildElement: vi.fn(),
  mockIsDontWalkIntoButTranslateAsChildElement: vi.fn(),
  mockWalkAndLabelElement: vi.fn(),
  mockRemoveAllTranslatedWrapperNodes: vi.fn(),
  mockTranslateWalkedElement: vi.fn(),
  mockTranslateTextForPageTitle: vi.fn(),
  mockValidateTranslationConfigAndToast: vi.fn(),
  mockSendMessage: vi.fn(),
}))

vi.mock("@/utils/config/languages", () => ({
  getDetectedCodeFromStorage: mockGetDetectedCodeFromStorage,
}))

vi.mock("@/utils/config/storage", () => ({
  getLocalConfig: mockGetLocalConfig,
}))

vi.mock("@/utils/crypto-polyfill", () => ({
  getRandomUUID: () => "walk-id",
}))

vi.mock("@/utils/host/dom/filter", () => ({
  hasNoWalkAncestor: mockHasNoWalkAncestor,
  isDontWalkIntoAndDontTranslateAsChildElement: mockIsDontWalkIntoAndDontTranslateAsChildElement,
  isDontWalkIntoButTranslateAsChildElement: mockIsDontWalkIntoButTranslateAsChildElement,
  isHTMLElement: (node: unknown) => node instanceof HTMLElement,
}))

vi.mock("@/utils/host/dom/find", () => ({
  deepQueryTopLevelSelector: mockDeepQueryTopLevelSelector,
}))

vi.mock("@/utils/host/dom/traversal", () => ({
  walkAndLabelElement: mockWalkAndLabelElement,
}))

vi.mock("@/utils/host/translate/node-manipulation", () => ({
  removeAllTranslatedWrapperNodes: mockRemoveAllTranslatedWrapperNodes,
  translateWalkedElement: mockTranslateWalkedElement,
}))

vi.mock("@/utils/host/translate/translate-text", () => ({
  validateTranslationConfigAndToast: mockValidateTranslationConfigAndToast,
}))

vi.mock("@/utils/host/translate/translate-variants", () => ({
  translateTextForPageTitle: mockTranslateTextForPageTitle,
}))

vi.mock("@/utils/host/translate/webpage-context", () => ({
  getOrCreateWebPageContext: mockGetOrCreateWebPageContext,
}))

vi.mock("@/utils/logger", () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}))

vi.mock("@/utils/message", () => ({
  sendMessage: mockSendMessage,
}))

const intersectionObservers: MockIntersectionObserver[] = []

class MockIntersectionObserver {
  observe = vi.fn((target: Element) => {
    this.targets.add(target)
  })

  unobserve = vi.fn((target: Element) => {
    this.targets.delete(target)
  })

  disconnect = vi.fn(() => {
    this.targets.clear()
  })

  private readonly targets = new Set<Element>()

  constructor(
    private readonly callback: IntersectionObserverCallback,
    _options?: IntersectionObserverInit,
  ) {
    intersectionObservers.push(this)
  }

  async triggerIntersect(target: Element): Promise<void> {
    await this.callback([{
      isIntersecting: true,
      target,
    } as IntersectionObserverEntry], this as unknown as IntersectionObserver)
  }
}

async function flushDomUpdates(): Promise<void> {
  await Promise.resolve()
  await new Promise(resolve => setTimeout(resolve, 0))
  await Promise.resolve()
}

function deepQueryTopLevelSelectorImpl(
  root: Document | ShadowRoot | HTMLElement,
  selectorFn: (element: HTMLElement) => boolean,
): HTMLElement[] {
  if (root instanceof Document) {
    return root.body ? deepQueryTopLevelSelectorImpl(root.body, selectorFn) : []
  }

  if (root instanceof HTMLElement && selectorFn(root)) {
    return [root]
  }

  const result: HTMLElement[] = []

  if (root instanceof HTMLElement && root.shadowRoot) {
    result.push(...deepQueryTopLevelSelectorImpl(root.shadowRoot, selectorFn))
  }

  for (const child of root.children) {
    if (child instanceof HTMLElement) {
      result.push(...deepQueryTopLevelSelectorImpl(child, selectorFn))
    }
  }

  return result
}

function isBlockedForTraversal(element: HTMLElement): boolean {
  return Boolean(element.hidden)
    || element.getAttribute("aria-hidden") === "true"
    || element.classList.contains("closed")
}

function walkAndLabelVisibleParagraphs(element: HTMLElement, walkId: string) {
  if (isBlockedForTraversal(element)) {
    return {
      forceBlock: false,
      isInlineNode: false,
    }
  }

  element.setAttribute("data-jiandao-walked", walkId)

  for (const child of element.children) {
    if (child instanceof HTMLElement) {
      walkAndLabelVisibleParagraphs(child, walkId)
    }
  }

  if (element.tagName === "P" && element.textContent?.trim()) {
    element.setAttribute("data-jiandao-paragraph", "")
  }

  return {
    forceBlock: false,
    isInlineNode: false,
  }
}

describe("pageTranslationManager mutation re-walk", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    intersectionObservers.length = 0

    document.head.innerHTML = ""
    document.body.innerHTML = ""
    document.title = ""

    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver)

    mockGetDetectedCodeFromStorage.mockResolvedValue("eng")
    mockGetLocalConfig.mockResolvedValue(DEFAULT_CONFIG)
    mockGetOrCreateWebPageContext.mockResolvedValue({
      url: window.location.href,
      webTitle: "",
      webContent: "",
    })
    mockHasNoWalkAncestor.mockReturnValue(false)
    mockIsDontWalkIntoButTranslateAsChildElement.mockReturnValue(false)
    mockIsDontWalkIntoAndDontTranslateAsChildElement.mockImplementation((element: HTMLElement) => isBlockedForTraversal(element))
    mockDeepQueryTopLevelSelector.mockImplementation(deepQueryTopLevelSelectorImpl)
    mockWalkAndLabelElement.mockImplementation((element: HTMLElement, walkId: string) => walkAndLabelVisibleParagraphs(element, walkId))
    mockTranslateTextForPageTitle.mockResolvedValue("")
    mockValidateTranslationConfigAndToast.mockReturnValue(true)
    mockSendMessage.mockResolvedValue(undefined)
  })

  it("initializes once when its enabled notification arrives before the background reply", async () => {
    document.body.innerHTML = "<p>Frame text</p>"
    const manager = new PageTranslationManager()
    let echoStart: Promise<void> | undefined
    mockSendMessage.mockImplementationOnce(async () => {
      // The background broadcasts enabled to the sending iframe before replying.
      if (!manager.isActive)
        echoStart = manager.start()
    })

    await manager.start()
    await echoStart
    const paragraph = document.querySelector("p")!
    for (const observer of intersectionObservers)
      await observer.triggerIntersect(paragraph)
    const signals = mockTranslateWalkedElement.mock.calls.map(call => call[4] as AbortSignal)
    manager.stop()

    expect.soft(intersectionObservers).toHaveLength(1)
    expect.soft(mockWalkAndLabelElement).toHaveBeenCalledTimes(1)
    for (const observer of intersectionObservers)
      expect.soft(observer.disconnect).toHaveBeenCalledOnce()
    expect.soft(signals).toHaveLength(1)
    expect.soft(signals.every(signal => signal.aborted)).toBe(true)
    mockWalkAndLabelElement.mockClear()
    document.body.appendChild(document.createElement("p"))
    await flushDomUpdates()
    expect(mockWalkAndLabelElement).not.toHaveBeenCalled()
  })

  it("claims startup before configuration resolves so concurrent starts initialize once", async () => {
    let release!: (config: typeof DEFAULT_CONFIG) => void
    mockGetLocalConfig.mockImplementationOnce(() => new Promise((resolve) => {
      release = resolve
    }))
    const manager = new PageTranslationManager()
    const first = manager.start()
    const second = manager.start()
    release(DEFAULT_CONFIG)
    await Promise.all([first, second])
    try {
      expect(intersectionObservers).toHaveLength(1)
      expect(mockWalkAndLabelElement).toHaveBeenCalledOnce()
    }
    finally {
      manager.stop()
    }
  })

  it.each(["config", "enable reply", "title context"] as const)("cancels startup while waiting for %s", async (stage) => {
    let release!: () => void
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const config = { ...DEFAULT_CONFIG, translate: { ...DEFAULT_CONFIG.translate, enableAIContentAware: true } }
    mockGetLocalConfig.mockResolvedValue(config)
    if (stage === "config") {
      mockGetLocalConfig.mockImplementationOnce(async () => {
        await held
        return config
      })
    }
    if (stage === "enable reply")
      mockSendMessage.mockImplementationOnce(() => held)
    if (stage === "title context")
      mockGetOrCreateWebPageContext.mockImplementationOnce(() => held)

    const manager = new PageTranslationManager()
    const starting = manager.start()
    await flushDomUpdates()
    // Runtime filters a disabled message out if the manager reports inactive.
    if (manager.isActive)
      manager.stop()
    release()
    await starting

    try {
      expect(manager.isActive).toBe(false)
      expect(intersectionObservers).toHaveLength(0)
    }
    finally {
      if (manager.isActive)
        manager.stop()
    }
  })

  it.each(["resolve", "reject"] as const)("does not let an old config request %s change a replacement session", async (outcome) => {
    let resolve!: (config: typeof DEFAULT_CONFIG) => void
    let reject!: (error: Error) => void
    mockGetLocalConfig.mockImplementationOnce(() => new Promise((res, rej) => {
      resolve = res
      reject = rej
    }))
    const manager = new PageTranslationManager()
    const oldStart = manager.start()
    manager.stop()
    await manager.start()
    const replacement = intersectionObservers.at(-1)!
    if (outcome === "resolve") {
      resolve(DEFAULT_CONFIG)
      await oldStart
    }
    else {
      reject(new Error("old config failed"))
      await expect(oldStart).rejects.toThrow("old config failed")
    }

    try {
      expect(manager.isActive).toBe(true)
      expect(intersectionObservers).toHaveLength(1)
      expect(replacement.disconnect).not.toHaveBeenCalled()
    }
    finally {
      manager.stop()
    }
  })

  it.each(["config", "enable reply", "walk"] as const)("cleans up a failed %s and allows startup to be retried", async (stage) => {
    const failure = new Error("startup failed")
    if (stage === "config")
      mockGetLocalConfig.mockRejectedValueOnce(failure)
    if (stage === "enable reply")
      mockSendMessage.mockRejectedValueOnce(failure)
    if (stage === "walk")
      mockWalkAndLabelElement.mockImplementationOnce(() => { throw failure })
    const manager = new PageTranslationManager()
    await expect(manager.start()).rejects.toThrow(failure)
    const failedObservers = [...intersectionObservers]
    expect.soft(manager.isActive).toBe(false)
    for (const observer of failedObservers)
      expect.soft(observer.disconnect).toHaveBeenCalledOnce()

    await manager.start()
    try {
      expect(manager.isActive).toBe(true)
      expect(intersectionObservers).toHaveLength(failedObservers.length + 1)
    }
    finally {
      manager.stop()
    }
  })

  it("allows retry after config validation fails", async () => {
    mockValidateTranslationConfigAndToast.mockReturnValueOnce(false)
    const manager = new PageTranslationManager()
    await manager.start()
    expect(manager.isActive).toBe(false)
    await manager.start()
    try {
      expect(manager.isActive).toBe(true)
      expect(intersectionObservers).toHaveLength(1)
    }
    finally {
      manager.stop()
    }
  })

  it("observes and translates hidden accordion content after it becomes visible", async () => {
    document.body.innerHTML = `
      <section id="accordion" hidden>
        <p id="panel">Accordion body</p>
      </section>
    `

    const manager = new PageTranslationManager()
    await manager.start()
    await flushDomUpdates()

    const observer = intersectionObservers[0]
    const accordion = document.getElementById("accordion") as HTMLElement
    const panel = document.getElementById("panel") as HTMLElement

    expect(observer.observe).not.toHaveBeenCalled()

    accordion.removeAttribute("hidden")
    await flushDomUpdates()

    expect(observer.observe).toHaveBeenCalledWith(panel)

    await observer.triggerIntersect(panel)
    await flushDomUpdates()

    expect(mockTranslateWalkedElement).toHaveBeenCalledWith(panel, "walk-id", DEFAULT_CONFIG, false, expect.any(AbortSignal))

    manager.stop()
  })

  it("observes and translates aria-hidden accordion content after it becomes visible", async () => {
    document.body.innerHTML = `
      <section id="accordion" aria-hidden="true">
        <p id="panel">Accordion body</p>
      </section>
    `

    const manager = new PageTranslationManager()
    await manager.start()
    await flushDomUpdates()

    const observer = intersectionObservers[0]
    const accordion = document.getElementById("accordion") as HTMLElement
    const panel = document.getElementById("panel") as HTMLElement

    expect(observer.observe).not.toHaveBeenCalled()

    accordion.setAttribute("aria-hidden", "false")
    await flushDomUpdates()

    expect(observer.observe).toHaveBeenCalledWith(panel)

    await observer.triggerIntersect(panel)
    await flushDomUpdates()

    expect(mockTranslateWalkedElement).toHaveBeenCalledWith(panel, "walk-id", DEFAULT_CONFIG, false, expect.any(AbortSignal))

    manager.stop()
  })

  it("keeps style/class based re-walk behavior for existing hidden panels", async () => {
    document.body.innerHTML = `
      <section id="accordion" class="closed">
        <p id="panel">Accordion body</p>
      </section>
    `

    const manager = new PageTranslationManager()
    await manager.start()
    await flushDomUpdates()

    const observer = intersectionObservers[0]
    const accordion = document.getElementById("accordion") as HTMLElement
    const panel = document.getElementById("panel") as HTMLElement

    expect(observer.observe).not.toHaveBeenCalled()

    accordion.classList.remove("closed")
    await flushDomUpdates()

    expect(observer.observe).toHaveBeenCalledWith(panel)

    await observer.triggerIntersect(panel)
    await flushDomUpdates()

    expect(mockTranslateWalkedElement).toHaveBeenCalledWith(panel, "walk-id", DEFAULT_CONFIG, false, expect.any(AbortSignal))

    manager.stop()
  })
})
