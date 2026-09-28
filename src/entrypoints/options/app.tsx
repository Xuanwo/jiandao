import { useEffect } from "react"
import { SettingsHeader } from "./sections/header"
import { QualitySection } from "./sections/quality"
import { ReadingSection } from "./sections/reading"
import { ServiceSection } from "./sections/service"
import { ShortcutSection } from "./sections/shortcut"

function useScrollToHashSection() {
  useEffect(() => {
    const sectionId = window.location.hash.slice(1)
    if (sectionId)
      document.getElementById(sectionId)?.scrollIntoView({ block: "start" })
  }, [])
}

/**
 * One page, ordered by how often a setting is touched: the service you
 * translate with, how pages read, what the model is told, and the shortcut.
 * Everything else adapts on its own; see design/Adaptive.dc.html.
 */
export default function App() {
  useScrollToHashSection()

  return (
    <main className="mx-auto flex w-full max-w-[640px] flex-col gap-10 px-6 pt-12 pb-16 text-[13px]">
      <SettingsHeader />
      <ServiceSection />
      <ReadingSection />
      <QualitySection />
      <ShortcutSection />
    </main>
  )
}
