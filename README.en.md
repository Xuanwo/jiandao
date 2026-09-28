# Jiandao

简道翻译 · [中文](./README.md)

Jiandao is a browser extension that does one thing: it translates the web page you are reading into your language.

Click "Translate this page" and a translation appears under each paragraph, set apart from the original by a thin line on its left. Nothing else is added to the page: no floating buttons, no selection bubbles, no sidebar. Click again and the page is back to how it was.

The translation comes from a model you choose, such as OpenAI, Anthropic, Gemini, DeepSeek, or a model running on your own computer. Page text goes from your browser straight to that service. There is no Jiandao server in between.

## Before You Start

You need two things:

- **A model service.** An API key for OpenAI, Anthropic, Gemini, DeepSeek or any OpenAI-compatible service, or a local model such as Ollama or LM Studio running on your computer. Online services bill you for what you use.
- **A coding agent that can run commands**, such as Claude Code or Codex. Jiandao has no form for service addresses and keys. The agent does the first setup for you, as described below.

## Install

**Chrome and Edge**: install from the [Chrome Web Store](https://chromewebstore.google.com/detail/bjfjdmmojplcohcbmkoogopanjbojmok). Edge can install extensions from the Chrome Web Store directly.

**Firefox**: Jiandao is not on Firefox Add-ons yet, so build it from source. You need [Node.js](https://nodejs.org/) and [pnpm](https://pnpm.io/):

```bash
git clone https://github.com/Xuanwo/jiandao.git
cd jiandao
pnpm install
pnpm build:firefox
```

Then open `about:debugging#/runtime/this-firefox`, click "Load Temporary Add-on", and choose `.output/firefox-mv3/manifest.json`. Firefox removes temporary add-ons when it restarts.

To try unreleased code in Chrome, build it the same way: run `pnpm build`, open `chrome://extensions`, turn on "Developer mode", click "Load unpacked", and choose the `.output/chrome-mv3` directory.

## First Setup

1. Click the Jiandao icon in the browser toolbar. The popup says there is no translation service yet.
2. Click "Copy instructions for your agent" and paste them into your coding agent.
3. The agent asks which service you want, where your API key is, and which language you read. It sends a real translation request with your key, and once that works it puts a configuration on your clipboard.
4. Back in the popup, paste the configuration and click "Apply and translate this page".

Changing the service, the model or the prompt later works the same way: click "Copy instructions for your agent" on the settings page, tell the agent what you want to change, and paste the new configuration back.

Setup goes through an agent because service addresses, model names and parameters change often and are easy to get wrong by hand. The agent checks each one against the guide and makes a real request with your key, so the configuration you receive has already worked once. The full guide for agents is [docs/agent-setup.md](./docs/agent-setup.md). If your agent supports skills, you can install [skills/jiandao-setup](./skills/jiandao-setup/SKILL.md) instead.

## Everyday Use

Open a page, click the toolbar icon, check the source and target languages, and click "Translate this page". The source language is detected automatically by default.

- **Shortcut**: `Alt+E` by default (`Option+E` on a Mac). Press it once to translate and again to show the original. It does nothing while the cursor is in a text field. You can change it in settings.
- **Display mode**: "Bilingual" puts the translation under the original; "Translation only" replaces the original.
- **Translates as you read**: Jiandao translates the paragraphs you can see first and the rest as you scroll, so long articles don't wait for the whole page.
- **Pages it can't translate**: the browser's own pages (such as those starting with `chrome://`) and extension store pages don't allow extensions to change them. The popup says so.

## Settings

Open settings from the popup. The options you are most likely to use:

- **Translation style**: Hairline, Muted, Tinted, Dashed underline, Highlight, Quote bar, Outline, or Reveal on hover. You can also write your own CSS.
- **Translation range**: Main content or Whole page.
- **Use page context**: the model reads a summary of the page before translating paragraphs. Terms and references come out more accurate, at the cost of one extra request per page.
- **Advanced**: request rate, concurrency, paragraphs and characters per request, and clearing the translation cache.

## Privacy

Jiandao has no server, no account, and collects no usage data. Settings and cached translations stay in your browser, are not synced across devices, and are deleted when you remove the extension. Page text is sent only when you translate a page, and only to the service you configured. See the [privacy policy](./PRIVACY.md).

## FAQ

**How much does translation cost?**
Jiandao is free. The service you choose bills you for what you use. Translated paragraphs are cached locally, so opening the same page again sends no new requests. A local model costs nothing.

**Can I use it without a coding agent?**
Yes, but you write the configuration yourself. It is a piece of JSON described in [docs/agent-setup.md](./docs/agent-setup.md) and the [JSON Schema](./schema/jiandao-setup.schema.json). Paste it into the popup when it's ready.

**Why no selection translation, video subtitles or text to speech?**
Jiandao is a fork of [Read Frog](https://github.com/mengxi-ream/read-frog) that deliberately removed everything besides reading a page: video subtitles, input box translation, floating toolbars, text to speech, custom AI actions, hosted accounts, config sync and statistics. If you need those, Read Frog and similar tools do them well.

**Where do I report problems?**
In this repository's [issues](https://github.com/Xuanwo/jiandao/issues), not in the Read Frog project.

## Development

```bash
pnpm install
pnpm dev         # development mode; opens Chrome with the extension loaded
pnpm test        # unit tests
pnpm type-check
pnpm build
```

`pnpm test:e2e` builds the extension and opens it in headless Chromium through [Playwright](https://playwright.dev/), a development dependency. Before the first run, run `pnpm exec playwright-core install --no-shell chromium` to download Chromium. On Linux, add `--with-deps` to also install the system libraries. When a test fails, its report shows the browser logs, the open pages and the stored config. Set `E2E_ARTIFACTS` to a directory to also save a screenshot of each page. CI runs the same tests.

## License

Jiandao is a modified version of Read Frog. Thanks to the Read Frog authors and contributors for the original work. Jiandao is distributed under the GNU General Public License version 3, the same license as upstream. See [LICENSE](./LICENSE).
