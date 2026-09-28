# Privacy Policy

Jiandao translates the web page you are reading. It has no server, no account,
no analytics, and no telemetry. The developer receives no data from it.

## What Leaves Your Browser

When you translate a page, Jiandao sends the page text to the model provider
you configured, such as OpenAI, DeepSeek, or an OpenAI-compatible endpoint you
entered. If you turn on page summaries, it also sends the page title and main
content so the model can produce a summary for context. Requests go directly
from your browser to that provider, together with the API key you entered for
it. The provider handles this data under its own privacy policy.

Jiandao sends nothing when you are not translating, and it never sends data to
any other destination.

## What Stays in Your Browser

Jiandao stores the following in the browser's local extension storage and
IndexedDB:

- Your settings, including provider endpoints, API keys, prompts, and site
  rules.
- Cached translations and page summaries, so the same text is not requested
  twice.

This data is not synced across devices. Removing the extension deletes it.

## Permissions

- `storage`: saves your settings and caches.
- `tabs`, `webNavigation`, `scripting`, and access to all sites: find the page
  you want translated, including its frames, and insert translations into it.
- `alarms`: runs periodic cache cleanup.

## Changes

Changes to this policy are recorded in this file's history at
<https://github.com/Xuanwo/jiandao/commits/main/PRIVACY.md>.

## Contact

Report questions or problems at <https://github.com/Xuanwo/jiandao/issues>.
