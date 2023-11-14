import { LaunchOptions } from 'playwright'
import { chromium } from 'playwright-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'

export function getBrowser() {
  chromium.use(StealthPlugin())
  // chromium.use(AdblockerPlugin())

  let opts: LaunchOptions = {}

  let socks5Server = process.env.SOCKS5_SERVER
  if (socks5Server) {
    console.log('使用s5代理')

    opts.proxy = {
      server: socks5Server,
    }
  }
  return chromium.launch(opts)
}
