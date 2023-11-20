import { LaunchOptions } from 'playwright'
import { chromium } from 'playwright-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import logger from './logger'

export function getBrowser() {
  chromium.use(StealthPlugin())
  // chromium.use(AdblockerPlugin())

  let opts: LaunchOptions = {}

  let socks5Server = process.env.SOCKS5_SERVER
  if (socks5Server) {
    logger.info('使用s5代理')

    opts.proxy = {
      server: socks5Server,
    }
  }
  return chromium.launch(opts)
}
