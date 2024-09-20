import delay from 'delay'
import { dingtalkRobot } from '../util/dingtalk'
import { runMain } from '../util/run'

const { chromium } = require('playwright')

const cardName = process.env.JS_IDCARD_NAME
const cardId = process.env.JS_IDCARD_ID
const houseLocation = process.env.SH_HOUSE_LOCATION

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

  await page.goto('https://rkglwx.gaj.sh.gov.cn/rkbyw/fchk/queryReq/0?flag=1', {
    waitUntil: 'domcontentloaded',
  })

  await page.locator('#xm').type(cardName, { delay: 300 })
  await page.locator('#sfzh').type(cardId, { delay: 300 })
  await page.locator('#fcdz').type(houseLocation, { delay: 300 })
  await delay(500)

  await page.locator('.btn1').click()

  await page.waitForLoadState('networkidle')

  let statusText = '未查到户口信息'
  let statusLocator = page.locator('.resultlist table')
  if ((await statusLocator.count()) > 0) {
    statusText = await statusLocator.first().innerText()
  }

  console.log(statusText)
  await dingtalkRobot.text(statusText)

  await browser.close()
}

runMain(main)
