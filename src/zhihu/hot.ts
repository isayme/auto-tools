/**
 * 知乎热榜
 * see https://juejin.cn/post/7198434169982255164
 */

import lodash from 'lodash'
import { chromium } from 'playwright'
import { formatYYYYMMDDHHmm } from '../util/date'
import { dingtalkRobot } from '../util/dingtalk'
import { runMain } from '../util/run'

async function main() {
  const browser = await chromium.launch()

  const page = await browser.newPage()

  // 等待结果
  await Promise.all([
    page.goto('https://www.zhihu.com/billboard'),
    page.waitForSelector('#js-initialData', { state: 'attached' }),
  ])

  let initialData = await page.locator('#js-initialData').innerText()
  let { initialState } = JSON.parse(initialData)
  let { topstory } = initialState
  let { hotList } = topstory
  hotList = hotList.slice(0, 20) // 保留20个

  const title = `知乎热榜 ${formatYYYYMMDDHHmm(new Date())}`

  let hotText = [title]

  for (let item of hotList) {
    let title = lodash.get(item, 'target.titleArea.text')
    let url = lodash.get(item, 'target.link.url')
    hotText.push(`- [${title}](${url})`)
  }

  await dingtalkRobot.markdown(title, hotText.join('\n'))

  await browser.close()
}
runMain(main)
