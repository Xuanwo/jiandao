import type { TranslatePromptObj } from "@/types/config/translate"
import { APP_NAME } from "@/utils/constants/app"

export type PromptConfig = Omit<TranslatePromptObj, "id">
export type PromptConfigList = PromptConfig[]

const PROMPTS_FILE = `${APP_NAME}_prompts`
const OBJECT_URL_LIFETIME_MS = 40_000

export function checkPromptConfig(list: PromptConfig[]) {
  if (!Array.isArray(list)) {
    return false
  }

  return list.every(item => item.name && item.prompt)
}

export function downloadJSONFile(data: object) {
  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: "text/json" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.download = `${PROMPTS_FILE}.json`
  anchor.href = url
  document.body.append(anchor)
  anchor.click()
  anchor.remove()

  // Firefox and Chromium can still use the URL after the click returns.
  setTimeout(() => URL.revokeObjectURL(url), OBJECT_URL_LIFETIME_MS)
}

export function analysisJSONFile(file: File): Promise<PromptConfigList> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsText(file)
    reader.onload = (e) => {
      try {
        const fileResult = e.target?.result ?? "[]"
        if (typeof fileResult === "string") {
          const list = JSON.parse(fileResult)
          const checked = checkPromptConfig(list)
          checked ? resolve(list) : reject(new Error("Prompt config is invalid"))
        }
        else {
          reject(new Error("Prompt config is invalid"))
        }
      }
      catch (e) {
        reject(e)
      }
    }
    reader.onerror = error => reject(error)
  })
}
