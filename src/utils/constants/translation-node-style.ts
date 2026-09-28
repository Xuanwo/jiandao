export const DEFAULT_TRANSLATION_NODE_STYLE = "default"
export const TRANSLATION_NODE_STYLE_ON_INSTALLED = "line"

// Order is the order shown in settings. Existing values stay valid so stored configs keep parsing.
export const TRANSLATION_NODE_STYLE = [DEFAULT_TRANSLATION_NODE_STYLE, "line", "weakened", "textColor", "dashedLine", "background", "blockquote", "border", "blur"] as const

export const CUSTOM_TRANSLATION_NODE_ATTRIBUTE = "jiandao-custom-translation-style"
