import { useEffect, useState } from "react"
import { wasConfigReset } from "@/utils/config/storage"

/**
 * Whether the stored config was cleared on a version conflict and no service
 * has been applied since. Read once per mount; it only changes when the
 * reader applies a service, which also replaces the prompt that uses it.
 */
export function useConfigReset(): boolean {
  const [reset, setReset] = useState(false)

  useEffect(() => {
    let active = true
    void wasConfigReset().then((value) => {
      if (active)
        setReset(value)
    })
    return () => {
      active = false
    }
  }, [])

  return reset
}
