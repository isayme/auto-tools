import delay from 'delay'
import { existsSync, writeFileSync } from 'fs'
import lodash from 'lodash'
import { Browser, BrowserContext, Page } from 'playwright'
import { chromium } from 'playwright-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import { axiosInstance } from '../util/axios'
import logger from '../util/logger'
import { runMain } from '../util/run'

const storageStateFile = './storageState.json'

const chaojiyingUser = process.env.CHAOJIYING_USER
const chaojiyingPass = process.env.CHAOJIYING_PASS
const chaojiyingSoftid = process.env.CHAOJIYING_SOFTID
const chaojiyingCodetype = process.env.CHAOJIYING_CODETYPE || '1902'

async function closeBrowser(browser: Browser, browserContext: BrowserContext) {
  await browserContext.storageState({ path: storageStateFile })
  await browser.close()
}

async function main() {
  let storageStateFileExist = existsSync(storageStateFile)
  if (!storageStateFileExist) {
    writeFileSync(storageStateFile, '{}')
  }

  chromium.use(StealthPlugin())
  const browser = await chromium.launch()
  const browserContext = await browser.newContext({
    storageState: storageStateFile,
  })
  const page: Page = await browserContext.newPage()
  logger.info(await browserContext.cookies())

  await page.goto('https://sh.ke.com', {
    waitUntil: 'domcontentloaded',
  })
  await delay(3000)

  let verifyBtn = page.locator('.bk-captcha-btn')
  if ((await verifyBtn.count()) <= 0) {
    logger.info('无需验证')
    await closeBrowser(browser, browserContext)
    return
  }

  await verifyBtn.click()

  let verifyImg = page.locator('.bk-captcha-box .image-code')
  if ((await verifyImg.count()) <= 0) {
    logger.info('未发现图片')
    await closeBrowser(browser, browserContext)
    return
  }

  await delay(3000)

  let src = await verifyImg.getAttribute('src')
  logger.info(`验证码图片: ${src}`)
  logger.info(`账号: ${chaojiyingUser}`)
  logger.info(`softid: ${chaojiyingSoftid}`)
  logger.info(`codetype: ${chaojiyingCodetype}`)

  const params = new URLSearchParams({ foo: 'bar' })
  params.append('user', chaojiyingUser)
  params.append('pass', chaojiyingPass)
  params.append('softid', chaojiyingSoftid)
  params.append('codetype', chaojiyingCodetype)
  params.append('file_base64', src.replace('data:image/jpeg;base64,', ''))

  const res = await axiosInstance.request({
    method: 'POST',
    url: 'http://upload.chaojiying.net/Upload/Processing.php',
    data: params,
  })

  logger.info('验证码识别结果: ' + JSON.stringify(res.data))

  const { err_no, pic_str } = res.data
  if (err_no != 0) {
    await closeBrowser(browser, browserContext)
    return
  }

  for (let ch of pic_str.split('')) {
    logger.info(`输入: ${ch}`)
    await page
      .locator('.input-box')
      .type(ch, { delay: lodash.random(500, 1500) })
  }

  await delay(5000)
  await closeBrowser(browser, browserContext)
}

runMain(main)
