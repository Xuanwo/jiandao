# Plainly

素读 · [中文](./README.zh-CN.md)

Plainly translates the web page you are reading, and does nothing else.

The translation sits under each paragraph, or replaces the original if you
prefer. Settings stay in your browser. Text goes straight to the model provider
you configure. There is no Plainly server, no account, and no telemetry. See
the [privacy policy](./PRIVACY.md).

## What It Does

- Translates the whole page, including its title, in bilingual or
  translation-only mode.
- Works with OpenAI, DeepSeek, or any OpenAI-compatible endpoint, including
  local and self-hosted models.
- Can give the model a summary of the page, so translations fit the context.
- Lets you adjust the prompt, translation style, request rate, and batching.

## What It Leaves Out

Plainly began as a fork of [Read Frog](https://github.com/mengxi-ream/read-frog)
and removed everything that is not reading a page: video subtitles, input box
translation, floating toolbars, text to speech, custom AI actions, hosted
storage and accounts, config sync, statistics, and experimental switches.

If you need those, Read Frog and similar tools do them well. Plainly stays
small so that the page stays quiet.

## Development

```bash
pnpm install
pnpm test
pnpm type-check
pnpm build
```

`pnpm test:e2e` builds the extension and opens it in headless Chromium through
[Playwright](https://playwright.dev/), a development dependency. Before the
first run, run `pnpm exec playwright-core install --no-shell chromium` to
download Chromium. On Linux, add `--with-deps` to also install the system
libraries. When a test fails, its report shows the browser logs, the open pages
and the stored config. Set `E2E_ARTIFACTS` to a directory to also save a
screenshot of each page. CI runs the same tests.

## License

Plainly is a modified version of Read Frog. Thanks to the Read Frog authors and
contributors for the original work.

Plainly is distributed under the GNU General Public License version 3, the same
license as upstream. See [LICENSE](./LICENSE). Please report problems here
rather than to the Read Frog project.
