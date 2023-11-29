/**
 * 知乎热榜
 * see https://juejin.cn/post/7198434169982255164
 */

import { kvsEnvStorage } from '@kvs/env'
import lodash from 'lodash'
import { chromium } from 'playwright-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import { formatYYYYMMDDHHmm } from '../util/date'
import { dingtalkRobot } from '../util/dingtalk'
import logger from '../util/logger'
import { runMain } from '../util/run'

async function main() {
  chromium.use(StealthPlugin())

  const browser = await chromium.launch()

  const page = await browser.newPage()

  // 等待结果
  await Promise.all([
    page.goto('https://www.zhihu.com/billboard'),
    page.waitForSelector('#js-initialData', { state: 'attached' }),
    page.waitForLoadState('domcontentloaded'),
  ])

  let initialData = await page.locator('#js-initialData').innerText()

  await browser.close()

  let { initialState } = JSON.parse(initialData)
  let { topstory } = initialState
  let hotList = topstory.hotList.map(function (item) {
    let title = lodash.get(item, 'target.titleArea.text')
    let url = lodash.get(item, 'target.link.url')
    return { title, url }
  })

  hotList = hotList.slice(0, 20) // 保留20个

  // 过滤已经发过的
  const storage = await kvsEnvStorage({
    name: 'zhihu-hot',
    version: 1,
  })

  let lastHotList = await storage.get('last')

  await storage.set('last', hotList as any)
  await storage.close()

  hotList = lodash.differenceBy(hotList, lastHotList, 'url')
  if (hotList.length === 0) {
    logger.info('未发现新数据')
    return
  }

  const title = `知乎热榜 ${formatYYYYMMDDHHmm(new Date())}`

  let hotText = [title]

  for (let item of hotList) {
    let { title, url } = item
    hotText.push(`- [${title}](${url})`)
  }

  await dingtalkRobot.markdown(title, hotText.join('\n'))
}

runMain(main)
