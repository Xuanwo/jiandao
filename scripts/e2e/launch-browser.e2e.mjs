import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import process from "node:process"
import { afterEach, it } from "node:test"
import { pathToFileURL } from "node:url"

const browserModule = pathToFileURL(resolve("scripts/e2e/browser.mjs")).href

let child
let folder

afterEach(async () => {
  // A child that did not end holds a browser open; stop it so that this file ends too.
  if (child && child.exitCode === null && child.signalCode === null)
    child.kill("SIGKILL")
  child = undefined
  if (folder)
    await rm(folder, { recursive: true, force: true })
  folder = undefined
})

/**
 * Runs launchBrowser in a new Node.js process whose working folder holds
 * `.output/chrome-mv3` with the given files. Resolves when the process ends,
 * with its exit code, its error output and its run time. Like a test
 * runner, the process catches the error and then waits for its open
 * handles, so it ends only when no browser stays open.
 */
async function launchIn(files) {
  folder = await mkdtemp(join(tmpdir(), "jiandao-launch-"))
  const output = join(folder, ".output/chrome-mv3")
  await mkdir(output, { recursive: true })
  for (const [name, text] of Object.entries(files))
    await writeFile(join(output, name), text)
  const started = performance.now()
  child = spawn(process.execPath, ["--input-type=module", "-e", `const { launchBrowser } = await import(${JSON.stringify(browserModule)})
try {
  await launchBrowser()
}
catch (error) {
  // Like node --test, keep running until the open handles close.
  console.error(String(error))
  process.exitCode = 1
}`], { cwd: folder })
  let stderr = ""
  child.stderr.on("data", (chunk) => {
    stderr += chunk
  })
  const code = await new Promise(resolve => child.on("exit", resolve))
  return { code, stderr, seconds: (performance.now() - started) / 1000 }
}

it("user runs the E2E tests without a build: Given an empty output folder, When launchBrowser runs, Then it fails at once with a hint to build, and the process ends", async () => {
  const { code, stderr, seconds } = await launchIn({})

  assert.notEqual(code, 0)
  assert.match(stderr, /no built extension in .*chrome-mv3; run pnpm build first/)
  assert.ok(seconds < 10, `the process ended after ${seconds.toFixed(1)} s`)
})

it("user runs the E2E tests with a broken build: Given an extension whose service worker does not load, When launchBrowser gives up, Then it closes the browser and the process ends", async () => {
  const manifest = { manifest_version: 3, name: "Broken build", version: "1.0.0", background: { service_worker: "missing.js" } }

  const { code, stderr } = await launchIn({ "manifest.json": JSON.stringify(manifest) })

  assert.notEqual(code, 0)
  assert.match(stderr, /waiting for event "serviceworker"/)
})
