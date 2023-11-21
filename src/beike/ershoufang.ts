import delay from 'delay'
import lodash from 'lodash'
import { Page, chromium } from 'playwright'
import { dingtalkRobot } from '../util/dingtalk'
import logger from '../util/logger'
import { runMain } from '../util/run'

async function main() {
  const browser = await chromium.launch()
  const page: Page = await browser.newPage({})

  const districtText = process.env.BEIKE_ERSHOU_FANG_DISTRICT_MAP
  if (!districtText) {
    logger.warn('环境变量（BEIKE_ERSHOU_FANG_DISTRICT_MAP）不存在或值为空')
    return
  }
  let districtMap = {}

  try {
    districtMap = JSON.parse(districtText)
  } catch (e) {
    logger.warn(`环境变量（BEIKE_ERSHOU_FANG_DISTRICT_MAP）解析失败: ${e}`)
    return
  }

  for (let url in districtMap) {
    let item = districtMap[url]

    await browseUrl(page, { url, name: item.name, conditions: item.conditions })
  }
}

async function browseUrl(page: Page, { name, url, conditions }) {
  logger.info(`查看小区 ${name}, 网址: ${url}, 删选条件: ${conditions}`)

  const sellListContentSelector = '.sellListContent'

  await Promise.all([
    page.goto(url, {
      waitUntil: 'domcontentloaded',
    }),
    page
      .waitForSelector(sellListContentSelector, { timeout: 15000 })
      .catch(lodash.noop),
  ])

  let moreBtn = page.locator('.m-filter .btn-more', { hasText: '更多选项' })
  if ((await moreBtn.count()) > 0) {
    logger.info('展开更多选项')
    await moreBtn.click()
  }

  for (let condition of conditions) {
    let delayMills = lodash.random(1500, 10000)
    logger.info(`随机延时: ${delayMills}毫秒`)
    await delay(delayMills)

    let locator = page.locator('.m-filter a', { hasText: condition })
    if ((await locator.count()) > 0) {
      if ((await locator.locator('.checked').count()) > 0) {
        logger.warn(`删选条件 ${condition} 已选中`)
      } else {
        logger.info(`添加筛选条件: ${condition}`)
        await locator.click()
      }
    } else {
      logger.warn(`未找到删选条件 ${condition}`)
    }

    await page.waitForLoadState('networkidle')
  }

  let delayMills = lodash.random(1500, 10000)
  logger.info(`随机延时: ${delayMills}毫秒`)
  await delay(delayMills)

  let sellList = await page
    .locator(sellListContentSelector)
    .first()
    .locator('li.clear')
    .all()

  let items = []

  for (let item of sellList) {
    let [
      href,
      imageUrl,
      title,
      positionInfo,
      houseInfo,
      totalPrice,
      unitPrice,
    ] = await Promise.all([
      item.locator('a.img').getAttribute('href'),
      item.locator('img').first().getAttribute('data-original'),
      item.locator('.title').innerText(),
      item.locator('.positionInfo').innerText(),
      item.locator('.houseInfo').innerText(),
      item.locator('.totalPrice').innerText(),
      item.locator('.unitPrice').innerText(),
    ])

    items.push({
      title: `${positionInfo}(${totalPrice}/${unitPrice}) ${houseInfo} ${title}`,
      messageURL: href,
      picURL: imageUrl,
    })
  }

  logger.info(JSON.stringify(items, null, 2))
  await dingtalkRobot.feedCard({ links: items })
}

runMain(main)
