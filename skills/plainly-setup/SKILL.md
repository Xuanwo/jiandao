---
name: plainly-setup
description: Configure the Plainly (素读) browser extension's translation service for the user. Use when the user asks to set up, change, or fix Plainly's translation service, model, API key, or target language, or pastes a Plainly configuration or a Plainly error message.
---

# Plainly setup

Plainly has no settings form for its translation service. You produce a JSON
document, verify it against the real API with the user's key, and put it on
the user's clipboard. The user pastes it into Plainly and applies it.

Read the guide for the document format, the recipes and the verification
templates: https://github.com/Xuanwo/plainly/blob/main/docs/agent-setup.md

## Steps

1. Ask which service (OpenAI, DeepSeek, or an OpenAI-compatible endpoint such
   as Ollama), where the API key is, and which language the user reads in.
   If the user pasted a current configuration, change only what they asked.
2. Load the key into a shell variable from a file or environment variable.
   Never print it, never include it in a message.
3. Verify with the guide's `curl` template for that service, using the model
   and options you will configure. Adjust until a request succeeds.
4. Build the document with `jq --arg k "$KEY"` and pipe it to the clipboard
   (`pbcopy`, `wl-copy`, `xclip -selection clipboard`, or `clip`). A masked
   key from an export (`sk-…a9f2`) is returned unchanged.
5. Tell the user to open the Plainly popup, paste, and click apply. Plainly
   previews the change, confirms the connection, and clears the clipboard.

## Defaults

- OpenAI: `gpt-6-luna` with `{ "reasoningEffort": "none" }`.
- DeepSeek: `deepseek-flash` with `{ "thinking": { "type": "disabled" } }`.
- Ollama / LM Studio: `type: "openai-compatible"`, `baseURL` ending in `/v1`,
  any non-empty `apiKey`, the model tag the server lists.
- Chinese readers: `targetLanguage: "cmn"` (Simplified) or `"cmn-Hant"`.
