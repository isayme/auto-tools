import { dingtalkRobot } from '../util/dingtalk'
import { runMain } from '../util/run'

const { chromium } = require('playwright')

const cardName = process.env.JS_IDCARD_NAME
const cardId = process.env.JS_IDCARD_ID

async function main() {
  if (!cardName) {
    console.log('姓名为空')
    return
  }
  if (!cardId) {
    console.log('证件号为空')
    return
  }

  const browser = await chromium.launch()
  const page = await browser.newPage()

  await page.goto('https://tysfrz.jsga.gov.cn/idQuery/index.html', {
    waitUntil: 'domcontentloaded',
  })

  await page.locator('#card_name').fill(cardName)
  await page.locator('#card_id').fill(cardId)

  await page.locator('.btnSer').click()

  await page.waitForLoadState('networkidle')

  let statusText = '未查到身份证进度'
  let statusLocator = page.locator('#conBox .wlList')
  if ((await statusLocator.count()) > 0) {
    statusText = await statusLocator.first().innerText()
  }

  console.log(statusText)
  await dingtalkRobot.text(statusText)

  await browser.close()
}

runMain(main)
