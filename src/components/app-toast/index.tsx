import * as React from "react"
import { Toaster } from "sonner"
import { browser } from "#imports"
import plainlyIcon from "@/assets/icons/plainly.png?url&no-inline"
import { kebabCase } from "@/utils/case"
import { APP_NAME } from "@/utils/constants/app"

const plainlyIconUrl = new URL(plainlyIcon, browser.runtime.getURL("/")).href

const plainlyIconElement = (
  <img
    src={plainlyIconUrl}
    alt={APP_NAME}
    style={{
      maxWidth: "100%",
      height: "auto",
      minHeight: "20px",
      minWidth: "20px",
    }}
  />
)

function AppToast({ position = "bottom-left", toastOptions, ...props }: React.ComponentProps<typeof Toaster>) {
  return (
    <Toaster
      {...props}
      position={position}
      richColors
      icons={{
        warning: plainlyIconElement,
        success: plainlyIconElement,
        error: plainlyIconElement,
        info: plainlyIconElement,
        loading: plainlyIconElement,
      }}
      toastOptions={{
        ...toastOptions,
        className: [`${kebabCase(APP_NAME)}-toaster`, toastOptions?.className].filter(Boolean).join(" "),
      }}
      className="z-[2147483647] notranslate"
    />
  )
}

export default AppToast
