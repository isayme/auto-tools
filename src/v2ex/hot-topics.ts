import lodash from 'lodash'
import { LaunchOptions } from 'playwright'
import { firefox } from 'playwright-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import { SocksProxyAgent } from 'socks-proxy-agent'
import { axiosInstance, expectResponseOk } from '../util/axios'
import { formatYYYYMMDD } from '../util/date'
import { dingtalkRobot } from '../util/dingtalk'
import logger from '../util/logger'
import { runMain } from '../util/run'

interface ITopic {
  title: string
  url: string
}

async function getHotTopicWithAPI(): Promise<ITopic[]> {
  // https://github.com/djyde/V2EX-API

  let httpAgent
  let socks5Server = process.env.SOCKS5_SERVER
  if (socks5Server) {
    logger.info('axios 使用s5代理')

    httpAgent = new SocksProxyAgent(socks5Server)
  }

  let result: ITopic[] = await axiosInstance
    .request({
      method: 'GET',
      url: 'https://v2ex.com/api/topics/hot.json',
      httpAgent,
      httpsAgent: httpAgent,
    })
    .then((resp) => {
      let { data } = resp
      expectResponseOk(resp)

      return data
    })

  return result
}

async function getHotTopicWithPlaywright(): Promise<ITopic[]> {
  firefox.use(StealthPlugin())

  let opts: LaunchOptions = {}

  let socks5Server = process.env.SOCKS5_SERVER
  if (socks5Server) {
    logger.info('playwright 使用s5代理')

    opts.proxy = {
      server: socks5Server,
    }
  }
  const browser = await firefox.launchPersistentContext(
    '/ql/data/.pw-cache',
    opts,
  )

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

  let hotTopics = await Promise.all(
    topicsHot.map(async function (topic) {
      let [title, url] = await Promise.all([
        topic.innerText(),
        topic.getAttribute('href'),
      ])

      return { title, url: `https://v2ex.com${url}` }
    }),
  )

  await browser.close()

  return hotTopics
}

async function main() {
  let hotTopics: ITopic[]
  try {
    hotTopics = await getHotTopicWithAPI()
  } catch (e) {
    logger.warn(`API获取失败 ${e}，改用 playwright`)
    hotTopics = await getHotTopicWithPlaywright()
  }

  if (lodash.isEmpty(hotTopics)) {
    logger.warn('无热议主题')
    return
  }

  const title = `V2EX ${formatYYYYMMDD(new Date())} 热议主题`

  let topicText = [title]

  for (let topic of hotTopics) {
    let { title, url } = topic
    topicText.push(`- [${title}](${url})`)
  }

  await dingtalkRobot.markdown(title, topicText.join('\n'))
}

runMain(main)
