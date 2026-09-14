// Serves page/ on localhost, opens it in the named browser, and prints the
// result the page writes into #result. Exit code 0 only on PASS.
import http from 'node:http'
import { readFile } from 'node:fs/promises'
import { Builder } from 'selenium-webdriver'
import chrome from 'selenium-webdriver/chrome.js'

const [browser, addr] = process.argv.slice(2)
if (!browser || !addr) {
  console.error('usage: node driver.mjs <safari|chrome> <multiaddr>')
  process.exit(2)
}

const page = await readFile(new URL('./page/index.html', import.meta.url))
const server = http.createServer((_, res) => {
  res.setHeader('content-type', 'text/html; charset=utf-8')
  res.end(page)
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const pageURL = `http://localhost:${server.address().port}/?addr=${encodeURIComponent(addr)}`

// HEADLESS=1 runs Chrome without a window, for local checks of the harness.
// Safari has no headless mode; the GitHub runner has a desktop session.
const chromeOptions = new chrome.Options()
if (process.env.HEADLESS) chromeOptions.addArguments('--headless=new')
if (process.env.CHROME_BIN) chromeOptions.setChromeBinaryPath(process.env.CHROME_BIN)
const driver = await new Builder().forBrowser(browser).setChromeOptions(chromeOptions).build()
let result = ''
try {
  await driver.get(pageURL)
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    result = await driver.executeScript('return document.getElementById("result").textContent')
    if (result) break
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  const ua = await driver.executeScript('return navigator.userAgent')
  console.log(`[${browser}] ${ua}`)
  console.log(`[${browser}] ${result || 'TIMEOUT: page reported nothing in 30s'}`)
  if (!result.startsWith('PASS')) {
    const pageLog = await driver.executeScript('return document.getElementById("log").textContent')
    console.log(`[${browser}] page log:\n${pageLog}`)
  }
} finally {
  await driver.quit()
  server.close()
}
process.exit(result.startsWith('PASS') ? 0 : 1)
