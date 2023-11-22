import { LaunchOptions } from 'playwright'
import { firefox } from 'playwright-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import { formatYYYYMMDD } from '../util/date'
import { dingtalkRobot } from '../util/dingtalk'
import logger from '../util/logger'
import { runMain } from '../util/run'

async function main() {
  firefox.use(StealthPlugin())

  let opts: LaunchOptions = {}

  let socks5Server = process.env.SOCKS5_SERVER
  if (socks5Server) {
    logger.info('使用s5代理')

    opts.proxy = {
      server: socks5Server,
    }
  }
  // const browser = await firefox.launch(opts)
  const browser = await firefox.launchPersistentContext('./.pw-cache', opts)

  const page = await browser.newPage()

  const userAgent = await page.evaluate('navigator.userAgent')
  logger.info(userAgent)

  // 等待结果
  await Promise.all([
    page.goto('https://v2ex.com/?tab=all', { timeout: 70000 }),
    page.waitForSelector('#TopicsHot'),
  ])

  const topicsHot = await page
    .locator('#TopicsHot .item_hot_topic_title a')
    .all()

  const title = `V2EX ${formatYYYYMMDD(new Date())} 热议主题`

  let topicText = [title]

  for (let topic of topicsHot) {
    let [title, href] = await Promise.all([
      topic.innerText(),
      topic.getAttribute('href'),
    ])
    topicText.push(`- [${title}](https://v2ex.com${href})`)
  }

  await dingtalkRobot.markdown(title, topicText.join('\n'))

  await browser.close()
}

runMain(main)
