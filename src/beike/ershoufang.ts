import { kvsEnvStorage } from '@kvs/env'
import delay from 'delay'
import lodash from 'lodash'
import { Page, chromium } from 'playwright'
import { dingtalkRobot } from '../util/dingtalk'
import logger from '../util/logger'
import { runMain } from '../util/run'

interface IHouseInfo {
  title: string
  imageUrl: string
  href: string
  positionInfo: string
  houseInfo: string
  totalPrice: string
  unitPrice: string
}

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

  await browser.close()
}

async function browseUrl(page: Page, { name, url, conditions }) {
  console.log('\n')
  logger.info(`查看小区 ${name}, 网址: ${url}, 删选条件: ${conditions}`)

  const storage = await kvsEnvStorage({
    name: 'beike-ershoufang',
    version: 1,
  })

  const lastHouses = await storage.get(url)
  const lastHousesMap = {}
  if (Array.isArray(lastHouses)) {
    logger.info(`上次记录房源数 ${lastHouses.length}`)

    lastHouses.forEach((house) => {
      lastHousesMap[house['href']] = house
    })
  }

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
    let delayMills = lodash.random(1500, 3000)
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

  let delayMills = lodash.random(1500, 5000)
  logger.info(`随机延时: ${delayMills}毫秒`)
  await delay(delayMills)

  let sellList = await page
    .locator(sellListContentSelector)
    .first()
    .locator('li.clear')
    .all()

  let items: IHouseInfo[] = []

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
      href: lodash.replace(lodash.trim(href), '\n', ' '),
      imageUrl: lodash.replace(lodash.trim(imageUrl), '\n', ' '),
      title: lodash.replace(lodash.trim(title), '\n', ' '),
      positionInfo: lodash.replace(lodash.trim(positionInfo), '\n', ' '),
      houseInfo: lodash.replace(lodash.trim(houseInfo), '\n', ' '),
      totalPrice: lodash.replace(lodash.trim(totalPrice), '\n', ' '),
      unitPrice: lodash.replace(lodash.trim(unitPrice), '\n', ' '),
    })
  }

  let mds = []

  const existHouses: IHouseInfo[] = lodash.filter(items, (item) => {
    return lodash.has(lastHousesMap, item.href)
  })
  logger.info(`已存在房源数 ${existHouses.length}`)

  if (existHouses.length > 0) {
    existHouses.forEach((item) => {
      let lastHouseInfo: IHouseInfo = lastHousesMap[item.href]
      let lastPrice = lodash.toInteger(
        lodash.replace(lastHouseInfo.totalPrice, /[^0-9.]/g, ''),
      )
      let currentPrice = lodash.toInteger(
        lodash.replace(item.totalPrice, /[^0-9.]/g, ''),
      )

      if (currentPrice > lastPrice) {
        logger.info(`房源 ${item.title} 涨价 ${lastPrice} => ${currentPrice}`)

        mds.push(
          `### [涨价 ${currentPrice - lastPrice}: ${item.title}](${item.href})`,
        )
        mds.push(`${item.houseInfo} ${item.totalPrice}(${item.unitPrice})`)
        mds.push(`![](${item.imageUrl})`)
      } else if (currentPrice < lastPrice) {
        logger.info(`房源 ${item.title} 降价 ${lastPrice} => ${currentPrice}`)
        mds.push(
          `### [降价 ${lastPrice - currentPrice}: ${item.title}](${item.href})`,
        )
        mds.push(`${item.houseInfo} ${item.totalPrice}(${item.unitPrice})`)
        mds.push(`![](${item.imageUrl})`)
      } else {
        logger.info(`房源 ${item.title} 价格未变 ${currentPrice}`)
      }
    })

    if (mds.length > 0) {
      mds.unshift(`## [${name}](${url}) 价格变动房源`)
    }
  }

  const newHouses: IHouseInfo[] = lodash.differenceBy(items, lastHouses, 'href')
  logger.info(`新增房源数 ${newHouses.length}`)

  if (newHouses.length > 0) {
    mds.push(`## [${name}](${url}) 新增房源`)
    newHouses.forEach((item) => {
      mds.push(`### [新增: ${item.title}](${item.href})`)
      mds.push(`${item.houseInfo} ${item.totalPrice}(${item.unitPrice})`)
      mds.push(`![](${item.imageUrl})`)
    })
  }

  if (mds.length > 0) {
    logger.info(mds.join('\n'))
    await dingtalkRobot.markdown({
      title: `${name} 二手房信息`,
      text: mds.join('\n'),
    })
  } else {
    await dingtalkRobot.markdown({
      title: `${name} 二手房信息`,
      text: `[${name}](${url}) 房源信息无更新`,
    })
  }

  logger.info('保存最新房源状态')
  logger.info(JSON.stringify(items, null, 2))

  await storage.set(url, items as any)
  await storage.close()
}

runMain(main)
