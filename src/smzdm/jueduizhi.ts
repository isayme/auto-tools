import lodash from 'lodash'
import { chromium } from 'playwright'
import { formatYYYYMMDDHHmm } from '../util/date'
import { dingtalkRobot } from '../util/dingtalk'
import { runMain } from '../util/run'

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({})

  const title = `绝对值 ${formatYYYYMMDDHHmm(new Date())}`
  const url = 'https://www.smzdm.com/tag/t8joxpm/'

  const productSelector = '.list'

  await Promise.all([
    page.goto(url, {
      waitUntil: 'domcontentloaded',
    }),
    page
      .waitForSelector(productSelector, { timeout: 15000 })
      .catch(lodash.noop),
  ])

  let products = await page.locator(productSelector).all()

  let text = [title]

  for (let product of products) {
    let titleLoc = product.locator('.itemName a')

    let [title, url] = await Promise.all([
      titleLoc.innerText(),
      titleLoc.getAttribute('href'),
    ])

    text.push(`- [${title}](${url})`)
  }

  await dingtalkRobot.markdown(title, text.join('\n'))

  await browser.close()
}

runMain(main)
