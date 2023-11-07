import { getBrowser } from './browser'
import { formatYYYYMMDD } from './util/date'
import { notifyDingtalk } from './util/dingtalk'
import { runMain } from './util/run'

async function main() {
  const browser = await getBrowser()

  const page = await browser.newPage()

  // 等待结果
  await Promise.all([
    page.goto('https://v2ex.com'),
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

  await notifyDingtalk({
    msgtype: 'markdown',
    markdown: {
      title: title,
      text: topicText.join('\n'),
    },
  })
}
runMain(main)
