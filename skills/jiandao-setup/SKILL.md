---
name: jiandao-setup
description: Configure the Jiandao (简道翻译) browser extension's translation service for the user. Use when the user asks to set up, change, or fix Jiandao's translation service, model, API key, or target language, or pastes a Jiandao configuration or a Jiandao error message.
---

# Jiandao setup

Jiandao has no settings form for its translation service. You produce a JSON
document, verify it against the real API with the user's key, and put it on
the user's clipboard. The user pastes it into Jiandao and applies it.

Read the guide for the document format, the recipes and the verification
templates: https://github.com/Xuanwo/jiandao/blob/main/docs/agent-setup.md

## Steps

1. Ask which service (OpenAI, Anthropic, Gemini, DeepSeek, or an
   OpenAI-compatible endpoint such as Ollama, OpenRouter or a gateway), where
   the API key is, and which language the user reads in. If the user pasted a
   current configuration, change only what they asked.
2. Load the key into a shell variable from a file or environment variable.
   Never print it, never include it in a message.
3. Verify with the guide's `curl` template for that service, using the model
   and the `body` fields you will configure. Jiandao sends the same request.
   Adjust until a request succeeds.
4. Build the document with `jq --arg k "$KEY"` and pipe it to the clipboard
   (`pbcopy`, `wl-copy`, `xclip -selection clipboard`, or `clip`). A masked
   key from an export (`sk-…a9f2`) is returned unchanged.
5. Tell the user to open the Jiandao popup, paste, and click apply. Jiandao
   previews the change, confirms the connection, and clears the clipboard.

## Defaults

- OpenAI: `gpt-6-luna` with `body: { "reasoning": { "effort": "none" } }`.
- Anthropic: `claude-haiku-4-5` with `body: { "thinking": { "type": "disabled" } }`; no `temperature`.
- Gemini: `gemini-3.5-flash-lite` with `body: { "generationConfig": { "thinkingConfig": { "thinkingLevel": "minimal" } } }`.
- DeepSeek: `deepseek-flash` with `body: { "thinking": { "type": "disabled" } }`.
- Ollama / LM Studio / other compatible services: `type: "openai-compatible"`,
  `baseURL` ending in the version path, any non-empty `apiKey`, the model ID
  the service lists. Add `api: "openai-responses"` for a service that only
  speaks the Responses API (xAI).
- Chinese readers: `targetLanguage: "cmn"` (Simplified) or `"cmn-Hant"`.
- A custom prompt goes in `prompt: { name, systemPrompt, prompt }` with
  `{{input}}` in `prompt`; `prompt: null` restores the built-in one.
