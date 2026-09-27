/** Splits on separators and on lower→upper boundaries: "cmn-Hant" → ["cmn", "Hant"], "plainly custom" → ["plainly", "custom"]. */
function words(text: string): string[] {
  return text
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .split(/[^A-Z\d]+/i)
    .filter(Boolean)
}

const capitalize = (word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()

export function camelCase(text: string): string {
  const [first = "", ...rest] = words(text)
  return first.toLowerCase() + rest.map(capitalize).join("")
}

export function pascalCase(text: string): string {
  return words(text).map(capitalize).join("")
}

export function kebabCase(text: string): string {
  return words(text).map(word => word.toLowerCase()).join("-")
}
