import dayjs from 'dayjs'
import mongoose from 'mongoose'

import lodash from 'lodash'
import ms from 'ms'
import { Page, chromium } from 'playwright'
import { District, House, IDistrict, IHouse } from '../schema/beike'
import { randomDelay } from '../util/delay'
import { dingtalkRobot } from '../util/dingtalk'
import logger from '../util/logger'
import { runMain } from '../util/run'

async function main() {
  let mongoUrl = process.env.BEIKE_MONGODB_URI
  if (!mongoUrl) {
    logger.warn('环境变量 BEIKE_MONGODB_URI 未配置')
    return
  }

  await mongoose.connect(mongoUrl)

  const browser = await chromium.launch()
  const page: Page = await browser.newPage({})

  let now = new Date()

  const districts = await District.find({})
  logger.info(`共有 ${districts.length} 个小区待处理`)
  for (let district of districts) {
    let { name, lastView, minViewDuration = '4h' } = district
    let minViewDurationInMills = ms(minViewDuration)

    if (!lastView) {
      logger.info(`首次查看小区 ${name}`)
    } else if (
      dayjs(lastView).add(minViewDurationInMills, 'millisecond').isBefore(now)
    ) {
      logger.info(`距离上次查看小区 ${name} 已超过 ${minViewDuration}`)
    } else {
      logger.info(`距离上次查看小区 ${name} 未超过 ${minViewDuration}`)
      continue
    }

    await browseUrl(page, district)
  }

  await browser.close()
}

async function browseUrl(page: Page, district: IDistrict) {
  let { name, url, conditions, minPrice, maxPrice, minArea, maxArea } = district

  console.log('\n')
  logger.info(
    `查看小区 ${name}, 网址: ${url}, 删选条件: ${conditions}, 删选价格: [${minPrice}, ${maxPrice}], 筛选面积: [${minArea}, ${maxArea}]`,
  )

  const lastHouses = await House.find({ _districtId: district._id })
  const lastHousesMap = {}
  if (Array.isArray(lastHouses)) {
    logger.info(`上次记录房源数 ${lastHouses.length}`)

    lastHouses.forEach((house) => {
      lastHousesMap[house.url] = house
    })
  }

  const sellListContentSelector = 'div[data-component=list] .sellListContent'

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

    await randomDelay(500, 1000)
  }

  for (let condition of conditions) {
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

    await randomDelay(1500, 3000)
    await page.waitForLoadState('networkidle')
  }

  {
    // 自定义价格筛选

    logger.info(`价格筛选: [${minPrice}, ${maxPrice}]`)

    if (lodash.isNumber(minPrice) || lodash.isNumber(maxPrice)) {
      let customPriceLocator = page.locator(
        '.m-filter .customFilter[data-role=price]',
      )
      if ((await customPriceLocator.count()) > 0) {
        if (minPrice) {
          logger.info(`填入自定义最小价格 ${minPrice}`)
          await customPriceLocator
            .locator('input[role=minValue]')
            .type(lodash.toString(minPrice), { delay: 300 })
        }

        if (maxPrice) {
          logger.info(`填入自定义最大价格 ${maxPrice}`)
          await customPriceLocator
            .locator('input[role=maxValue]')
            .type(lodash.toString(maxPrice), { delay: 300 })
        }

        let confirmBtn = customPriceLocator.getByRole('button', {
          name: /确定/i,
        })
        if ((await confirmBtn.count()) > 0) {
          logger.info('点击确认按钮')
          await confirmBtn.click()
          await randomDelay(1000, 3000)
          await page.waitForLoadState('networkidle')
        }
      }
    }
  }

  {
    // 自定义面积筛选
    logger.info(`价格面积: [${minArea}, ${maxArea}]`)

    if (lodash.isNumber(minArea) || lodash.isNumber(maxArea)) {
      let customAreaLocator = page.locator(
        '.m-filter .customFilter[data-role=area]',
      )
      if ((await customAreaLocator.count()) > 0) {
        if (minArea) {
          logger.info(`填入自定义最小面积 ${minArea}`)
          await customAreaLocator
            .locator('input[role=minValue]')
            .type(lodash.toString(minArea), { delay: 300 })
          await randomDelay(100, 1000)
        }

        if (maxArea) {
          logger.info(`填入自定义最大面积 ${maxArea}`)
          await customAreaLocator
            .locator('input[role=maxValue]')
            .type(lodash.toString(maxArea), { delay: 300 })
          await randomDelay(100, 1000)
        }

        let confirmBtn = customAreaLocator.getByRole('button', {
          name: /确定/i,
        })
        if ((await confirmBtn.count()) > 0) {
          logger.info('点击确认按钮')
          await confirmBtn.click()
          await randomDelay(1000, 3000)
          await page.waitForLoadState('networkidle')
        }
      }
    }
  }

  {
    // 总价升序
    let orderByPriceLocator = page.locator('.orderTag li', { hasText: '总价' })
    let orderByPriceLocatorCount = await orderByPriceLocator.count()
    logger.info('找到"总价"排序')
    if (orderByPriceLocatorCount > 0) {
      let classAttr = await orderByPriceLocator.first().getAttribute('class')
      if (classAttr && classAttr.split(' ').includes('selected')) {
        logger.warn('当前已是"总价"排序')
      } else {
        logger.info('点击选择"总价"排序')
        await orderByPriceLocator.click()
        await randomDelay(1000, 3000)
        await page.waitForLoadState('networkidle')
      }
    }
  }

  await randomDelay(1500, 5000)

  let sellList = await page
    .locator(sellListContentSelector)
    .first()
    .locator('li.clear')
    .all()

  let items: IHouse[] = []

  for (let item of sellList) {
    let [
      url,
      thumbnail,
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
      url: lodash.replace(lodash.trim(url), '\n', ' '),
      thumbnail: lodash.replace(lodash.trim(thumbnail), '\n', ' '),
      title: lodash.replace(lodash.trim(title), '\n', ' '),
      positionInfo: lodash.replace(lodash.trim(positionInfo), '\n', ' '),
      houseInfo: lodash.replace(lodash.trim(houseInfo), '\n', ' '),
      totalPrice: lodash.replace(lodash.trim(totalPrice), '\n', ' '),
      unitPrice: lodash.replace(lodash.trim(unitPrice), '\n', ' '),
    })
  }

  let mds = []

  const existHouses: IHouse[] = lodash.filter(items, (item) => {
    return lodash.has(lastHousesMap, item.url)
  })
  logger.info(`已存在房源数 ${existHouses.length}`)

  if (existHouses.length > 0) {
    existHouses.forEach((item) => {
      let lastHouseInfo: IHouse = lastHousesMap[item.url]
      let lastPrice = lodash.toInteger(
        lodash.replace(lastHouseInfo.totalPrice, /[^0-9.]/g, ''),
      )
      let currentPrice = lodash.toInteger(
        lodash.replace(item.totalPrice, /[^0-9.]/g, ''),
      )

      if (currentPrice > lastPrice) {
        logger.info(`房源 ${item.title} 涨价 ${lastPrice} => ${currentPrice}`)

        mds.push(
          `### [涨价 ${currentPrice - lastPrice}: ${item.title}](${item.url})`,
        )
        mds.push(`${item.houseInfo} ${item.totalPrice}(${item.unitPrice})`)
        mds.push(`![](${item.thumbnail})`)
      } else if (currentPrice < lastPrice) {
        logger.info(`房源 ${item.title} 降价 ${lastPrice} => ${currentPrice}`)
        mds.push(
          `### [降价 ${lastPrice - currentPrice}: ${item.title}](${item.url})`,
        )
        mds.push(`${item.houseInfo} ${item.totalPrice}(${item.unitPrice})`)
        mds.push(`![](${item.thumbnail})`)
      } else {
        logger.info(`房源 ${item.title} 价格未变 ${currentPrice}`)
      }
    })

    if (mds.length > 0) {
      mds.unshift(`## [${name}](${url}) 价格变动房源`)
    }
  }

  const newHouses: IHouse[] = lodash.differenceBy(items, lastHouses, 'url')
  logger.info(`新增房源数 ${newHouses.length}`)

  if (newHouses.length > 0) {
    mds.push(`## [${name}](${url}) 新增房源`)
    newHouses.forEach((item) => {
      mds.push(`### [新增: ${item.title}](${item.url})`)
      mds.push(`${item.houseInfo} ${item.totalPrice}(${item.unitPrice})`)
      mds.push(`![](${item.thumbnail})`)
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

  for (let item of items) {
    await House.findOneAndUpdate(
      { _districtId: district._id, url: item.url },
      item,
      {
        upsert: true,
      },
    )
  }

  await District.findOneAndUpdate(
    { _id: district._id },
    { lastView: new Date() },
  )
}

runMain(main)
