import dayjs from 'dayjs'
import { existsSync, writeFileSync } from 'fs'
import mongoose from 'mongoose'

import delay from 'delay'
import lodash from 'lodash'
import ms from 'ms'
import { Browser, BrowserContext, Page, Response } from 'playwright'
import { chromium } from 'playwright-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import { District, House, IDistrict, IHouse } from '../schema/beike'
import { axiosInstance } from '../util/axios'
import { randomDelay } from '../util/delay'
import { dingtalkRobot } from '../util/dingtalk'
import logger from '../util/logger'
import { runMain } from '../util/run'

const chaojiyingUser = process.env.CHAOJIYING_USER
const chaojiyingPass = process.env.CHAOJIYING_PASS
const chaojiyingSoftid = process.env.CHAOJIYING_SOFTID
const chaojiyingCodetype = process.env.CHAOJIYING_CODETYPE || '1902'

const storageStateFile = './storageState.json'

async function closeBrowser(browser: Browser, browserContext: BrowserContext) {
  await browserContext.storageState({ path: storageStateFile })
  await browser.close()
}

async function handleCaptcha(page: Page, response: Response) {
  await page.goto('https://sh.ke.com', {
    waitUntil: 'domcontentloaded',
  })
  await delay(3000)

  let verifyBtn = page.locator('.bk-captcha-btn')
  if ((await verifyBtn.count()) <= 0) {
    logger.info('无需验证')
    return
  }

  await verifyBtn.click()

  let verifyImg = page.locator('.bk-captcha-box .image-code')
  if ((await verifyImg.count()) <= 0) {
    logger.info('未发现图片')
    return
  }

  await delay(lodash.random(3000, 5000))

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
    return
  }

  for (let ch of pic_str.split('')) {
    logger.info(`输入: ${ch}`)
    await page
      .locator('.input-box')
      .type(ch, { delay: lodash.random(500, 1500) })
  }

  await delay(5000)
}

async function main() {
  let storageStateFileExist = existsSync(storageStateFile)
  if (!storageStateFileExist) {
    writeFileSync(storageStateFile, '{}')
  }

  chromium.use(StealthPlugin())

  let mongoUrl = process.env.BEIKE_MONGODB_URI
  if (!mongoUrl) {
    logger.warn('环境变量 BEIKE_MONGODB_URI 未配置')
    return
  }
  logger.info(mongoUrl)
  await mongoose.connect(mongoUrl, { dbName: 'qinglong' })

  const browser = await chromium.launch()
  const browserContext = await browser.newContext({
    storageState: storageStateFile,
  })
  const page: Page = await browserContext.newPage()

  page.on('response', (response) => {
    if (response.status() == 302) {
      handleCaptcha(page, response)
    }
  })

  let now = new Date()

  const districts = await District.find({})
  logger.info(`共有 ${districts.length} 个小区待处理`)
  for (let district of districts) {
    let { name, lastView, minViewDuration = '3h' } = district
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

  await dingtalkRobot.text(`已完成本次房源查看，小区数 ${districts.length}`)
  await closeBrowser(browser, browserContext)
}

async function browseUrl(page: Page, district: IDistrict) {
  let { name, url, conditions, minPrice, maxPrice, minArea, maxArea } = district
  conditions = conditions || []

  console.log('\n')
  logger.info(
    `查看小区 ${name}, 网址: ${url}, 删选条件: ${conditions}, 删选价格: [${minPrice}, ${maxPrice}], 筛选面积: [${minArea}, ${maxArea}]`,
  )

  const lastHouses = await House.find({
    _districtId: district._id,
    lastView: {
      $gt: dayjs(Date.now()).add(-20, 'day'),
    },
  })
  const lastHousesLength = lastHouses.length
  const lastHousesMap = {}
  if (Array.isArray(lastHouses)) {
    logger.info(`上次记录房源数 ${lastHousesLength}`)

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

  let items: IHouse[] = []

  while (true) {
    let pageNum = '1'
    let currentPageLocator = page.locator('.house-lst-page-box .on')
    if ((await currentPageLocator.count()) > 0) {
      pageNum = await currentPageLocator.innerText()
    }

    let sellList = await page
      .locator(sellListContentSelector)
      .first()
      .locator('li.clear')
      .all()

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
        lastView: new Date(),
      })
    }

    // 是否还有下一页？
    let nexPageNum = lodash.toInteger(pageNum) + 1
    let nextPageLocator = page.locator('.house-lst-page-box a', {
      hasText: new RegExp(`^${nexPageNum}$`),
    })
    if ((await nextPageLocator.count()) > 0) {
      logger.info(`当前是第 ${pageNum} 页, 还有下一页，等待浏览...`)
      await nextPageLocator.click()
      await randomDelay(5000, 10000)
      await page.waitForLoadState('networkidle')
    } else {
      logger.info(`当前是第 ${pageNum} 页, 没有下一页`)
      break
    }
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

  logger.info(`保存最新房源状态, 共找到房源 ${items.length} 个`)

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

  if (mds.length > 0 && lastHousesLength != 0) {
    logger.info(mds.join('\n'))
    let arr = partition(mds, 20)
    for (let item of arr) {
      await dingtalkRobot.markdown({
        title: `${name} 二手房信息`,
        text: item.join('\n'),
      })
    }
  } else {
    // await dingtalkRobot.markdown({
    //   title: `${name} 二手房信息`,
    //   text: `[${name}](${url}) 房源信息无更新`,
    // })
  }
}

function partition(array, n) {
  return array.length ? [array.splice(0, n)].concat(partition(array, n)) : []
}

runMain(main)
