import { useEffect } from "react"
import { AdvancedSection } from "./sections/advanced"
import { SettingsFooter } from "./sections/footer"
import { SettingsHeader } from "./sections/header"
import { QualitySection } from "./sections/quality"
import { ReadingSection } from "./sections/reading"
import { IMPORT_HASH, ServiceSection } from "./sections/service"

function useScrollToHashSection() {
  useEffect(() => {
    const hash = window.location.hash.slice(1)
    if (!hash)
      return
    // "#import" opens the paste box inside the service section.
    const sectionId = hash === IMPORT_HASH ? "service" : hash
    document.getElementById(sectionId)?.scrollIntoView({ block: "start" })
  }, [])
}

/**
 * One page, ordered by how often a setting is touched: the service you
 * translate with, how translations read, what the model is told, and the
 * knobs almost nobody changes.
 */
export default function App() {
  useScrollToHashSection()

  return (
    <main className="mx-auto flex w-full max-w-[640px] flex-col gap-10 px-6 pt-12 pb-16 text-[13px]">
      <SettingsHeader />
      <ServiceSection />
      <ReadingSection />
      <QualitySection />
      <AdvancedSection />
      <SettingsFooter />
    </main>
  )
}
