export const CONTENT_WRAPPER_CLASS = "jiandao-translated-content-wrapper"
export const INLINE_CONTENT_CLASS = "jiandao-translated-inline-content"
export const BLOCK_CONTENT_CLASS = "jiandao-translated-block-content"
export const FLOAT_WRAP_ATTRIBUTE = "data-jiandao-float-wrap"

export const WALKED_ATTRIBUTE = "data-jiandao-walked"
// paragraph means you need to trigger translation on this element (i.e. we have inline children in it)
export const PARAGRAPH_ATTRIBUTE = "data-jiandao-paragraph"
export const BLOCK_ATTRIBUTE = "data-jiandao-block-node"
export const INLINE_ATTRIBUTE = "data-jiandao-inline-node"

export const TRANSLATION_MODE_ATTRIBUTE = "data-jiandao-translation-mode"

export const MARK_ATTRIBUTES = new Set([WALKED_ATTRIBUTE, PARAGRAPH_ATTRIBUTE, BLOCK_ATTRIBUTE, INLINE_ATTRIBUTE])

export const NOTRANSLATE_CLASS = "notranslate"

export const REACT_SHADOW_HOST_CLASS = "jiandao-react-shadow-host"

export const TRANSLATION_ERROR_CONTAINER_CLASS = "jiandao-translation-error-container"

// The name of the word-prefix emphasis in CSS.highlights. The preset styles paint it with ::highlight(jiandao-word-prefix).
export const WORD_PREFIX_HIGHLIGHT = "jiandao-word-prefix"
