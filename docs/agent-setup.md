# Setting up Jiandao with an agent

This guide is written for a coding agent (Claude Code, Codex, or similar)
acting on behalf of a person who uses Jiandao. Jiandao has no settings form
for the translation service. The service is configured by a small JSON
document that you produce, verify against the real API, and place on the
person's clipboard. The person pastes it into the settings page, checks a
preview and applies it.

Jiandao runs entirely in the browser. It has no server and no account. Page
text goes straight from the browser to the service you configure here, in
the request shape that service documents. There is no SDK in between: the
request body you verify with `curl` is the body Jiandao sends, plus the
prompt.

## What to do

1. **Ask** the person two things: which service they want to use, and where
   their API key is (a file, an environment variable, or they paste it to
   you).
2. **Keep the key out of your output.** Read it into a shell variable and
   never print it. Every command below assumes `KEY` holds it:

   ```bash
   KEY=$(cat ~/.secrets/deepseek)          # or: KEY="$DEEPSEEK_API_KEY"
   ```

3. **Verify** with the request template for the service, using the model and
   the `body` fields you intend to configure. If the service rejects the
   request, change the model or drop the field it rejects and try again,
   until a request succeeds.
4. **Write the document to the clipboard** with `jq`, so the key never appears
   in your output:

   ```bash
   jq -n --arg k "$KEY" '{
     type: "deepseek", apiKey: $k, model: "deepseek-flash",
     body: { thinking: { type: "disabled" } }
   }' | pbcopy          # macOS. Linux: wl-copy or xclip -selection clipboard. Windows: clip
   ```

5. **Tell the person**: open Jiandao's settings page, paste into the box in
   the "Translation service" section, and click "Apply". For another service,
   click "Add service" first. To change an entry, click its "Edit" button. Jiandao shows what will change,
   including the host that page text will be sent to, sends one short request
   to confirm, and saves the service only when that request works. Then it
   clears the clipboard. If the confirmation fails, nothing is saved and the
   person will paste the error text back to you.

To change an existing configuration, ask the person to click “Copy
instructions for your agent” in the "Translation service" section and paste
it to you; the text ends with the current document. The key in it is masked
(`sk-…a9f2`). Return the document with the masked key unchanged and Jiandao
keeps that entry's stored key. A changed provider type or endpoint needs a literal
key. Add always needs a literal key, even for an existing endpoint.

## The document

The document describes the translation service and nothing else. The
languages, the display mode and the translation prompt are the person's own
settings in Jiandao. The JSON Schema is at
[`schema/jiandao-setup.schema.json`](../schema/jiandao-setup.schema.json).
Unknown fields are rejected, so the person sees the error instead of a
silently ignored setting.

```json
{
  "type": "openai",
  "apiKey": "sk-…",
  "model": "gpt-6-luna",
  "body": { "reasoning": { "effort": "none" } }
}
```

| Field                  | Required                | Meaning                                                                                                                                                                                                                                                                                                                       |
| ---------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`        | yes                     | `openai`, `anthropic`, `gemini`, `deepseek`, or `openai-compatible` for any other endpoint that speaks the OpenAI chat completions API (Ollama, LM Studio, vLLM, OpenRouter, Groq, Mistral, Qwen, GLM, Moonshot, MiniMax, Doubao, gateways).                                                                                  |
| `api`         | no                      | Wire format: `openai-chat`, `openai-responses`, `anthropic` or `gemini`. Defaults from `type`: `openai` → `openai-responses`, `anthropic` → `anthropic`, `gemini` → `gemini`, `deepseek` and `openai-compatible` → `openai-chat`. Set `openai-responses` for a compatible service that speaks the Responses API, such as xAI. |
| `apiKey`      | for a new service       | The key. Endpoints without authentication still need a non-empty value such as `"local"`. A masked value from an export keeps the stored key.                                                                                                                                                                                 |
| `model`       | yes                     | Model ID exactly as the service expects it.                                                                                                                                                                                                                                                                                   |
| `baseURL`     | for `openai-compatible` | Base URL up to and including the version path, e.g. `http://localhost:11434/v1`. Omit for an official API.                                                                                                                                                                                                                    |
| `name`        | no                      | Display name. Defaults to the service name.                                                                                                                                                                                                                                                                                   |
| `headers`     | no                      | Extra HTTP headers for every request.                                                                                                                                                                                                                                                                                         |
| `body`        | no                      | JSON merged into every request body, exactly as the API documents it. Objects merge key by key; anything else replaces Jiandao's value. See the recipes.                                                                                                                                                                      |
| `temperature` | no                      | Sampling temperature. Sent only when set. Anthropic's current models accept only `1`.                                                                                                                                                                                                                                         |

"Add service" saves a separate entry, even with the same `type` and `baseURL`.
"Edit" changes only the selected entry. Neither action changes the active service.
Select a saved service in settings or the popup. Existing translations remain;
new requests use the selected service. First setup configures the active default
entry. To delete the active service, select another entry first.
When the person wants a different model or option, they hand you the current
configuration and you return the changed document; they may also edit a
field in place on the settings page.

## Recipes

Translation needs fast answers, so turn thinking off or down where the model
has it. The `body` values below are the fields from each service's own API
reference; check the reference when a model is newer than this guide.

| Service                                                                   | `type`              | `model`                        | `body`                                                                         | Notes                                                                                                                                                      |
| ------------------------------------------------------------------------- | ------------------- | ------------------------------ | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| OpenAI                                                                    | `openai`            | `gpt-6-luna`                   | `{ "reasoning": { "effort": "none" } }`                                        | Cheapest current model that accepts `none`. GPT-5 models reject `"none"`; use `"minimal"` or omit for them.                                                |
| Anthropic                                                                 | `anthropic`         | `claude-haiku-4-5`             | `{ "thinking": { "type": "disabled" } }`                                       | Fastest Claude. For Claude 5 models, thinking is adaptive and always on; use `{ "output_config": { "effort": "low" } }` instead. Do not set `temperature`. |
| Gemini                                                                    | `gemini`            | `gemini-3.5-flash-lite`        | `{ "generationConfig": { "thinkingConfig": { "thinkingLevel": "minimal" } } }` | Older 2.5 models use `"thinkingBudget": 0` instead of `thinkingLevel`.                                                                                     |
| DeepSeek                                                                  | `deepseek`          | `deepseek-flash`               | `{ "thinking": { "type": "disabled" } }`                                       | Thinking is on by default and slows translation.                                                                                                           |
| Ollama                                                                    | `openai-compatible` | the model tag, e.g. `qwen3:8b` | usually none                                                                   | `baseURL`: `http://localhost:11434/v1`, `apiKey`: `"ollama"`. Qwen models accept `{ "enable_thinking": false }` when served with the option.               |
| LM Studio                                                                 | `openai-compatible` | as listed by `GET /v1/models`  | usually none                                                                   | `baseURL`: `http://localhost:1234/v1`, `apiKey`: `"lm-studio"`.                                                                                            |
| xAI                                                                       | `openai-compatible` | e.g. `grok-4.7`                | `{ "reasoning": { "effort": "low" } }`                                         | `api`: `"openai-responses"`, `baseURL`: `https://api.x.ai/v1`.                                                                                             |
| OpenRouter, Groq, Mistral, Qwen, GLM, Moonshot, MiniMax, Doubao, gateways | `openai-compatible` | as the service names it        | `{ "reasoning_effort": "none" }` if it accepts it                              | `baseURL` from the service's docs, ending in its version path. Some services reject `reasoning_effort: "none"` with `Invalid option: expected one of "low" | …`; drop the field then. |

## Verification templates

Use the shortest possible input. One successful response is enough. Each
template is the request Jiandao sends, without the translation prompt.

**OpenAI** (Responses API):

```bash
curl -sS https://api.openai.com/v1/responses \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"model":"gpt-6-luna","input":"Translate to Simplified Chinese: Hello","reasoning":{"effort":"none"}}'
```

**Anthropic** (Messages API; `max_tokens` is required, Jiandao sends 8192):

```bash
curl -sS https://api.anthropic.com/v1/messages \
  -H "x-api-key: $KEY" -H "anthropic-version: 2023-06-01" -H "Content-Type: application/json" \
  -d '{"model":"claude-haiku-4-5","max_tokens":1024,"messages":[{"role":"user","content":"Translate to Simplified Chinese: Hello"}],"thinking":{"type":"disabled"}}'
```

**Gemini** (`generateContent`; the model is part of the path):

```bash
curl -sS "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent" \
  -H "x-goog-api-key: $KEY" -H "Content-Type: application/json" \
  -d '{"contents":[{"role":"user","parts":[{"text":"Translate to Simplified Chinese: Hello"}]}],"generationConfig":{"thinkingConfig":{"thinkingLevel":"minimal"}}}'
```

**DeepSeek and every OpenAI-compatible service** (chat completions at
`baseURL`; DeepSeek's `baseURL` is `https://api.deepseek.com`):

```bash
curl -sS "$BASE_URL/chat/completions" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"model":"deepseek-flash","messages":[{"role":"user","content":"Translate to Simplified Chinese: Hello"}],"thinking":{"type":"disabled"}}'
```

A `200` with a non-empty answer means the configuration works. A `400` or
`422` that names a field means the model does not accept it: remove it from
`body` and try again. A `401` means the key is wrong; a `404` on
`openai-compatible` usually means `baseURL` is missing its version path.

## Opening Jiandao

The popup is the toolbar icon; while no service is set up it links to the
settings page. The "Translation service" section is at
`chrome-extension://bjfjdmmojplcohcbmkoogopanjbojmok/options.html#service` in
Chrome with the store build. Do not put the document into a URL: browsers
keep full URLs, including the fragment, in history.
