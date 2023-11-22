import { formatYYYYMMDDHHmm } from '../util/date'
import { dingtalkRobot } from '../util/dingtalk'
import logger from '../util/logger'
import { runMain } from '../util/run'
import { filterNew, getProductList } from './common'

async function main() {
  const url = 'https://www.smzdm.com/tag/t8joxpm/'
  let products = await getProductList(url)
  products = await filterNew(products, 'smzdm-jueduizhi')

  if (products.length == 0) {
    logger.info('未发现新数据')
    return
  }

  const title = `绝对值 ${formatYYYYMMDDHHmm(new Date())}`

  let text = [title]

  products.forEach((product) => {
    text.push(`- [${product.title}](${product.url})`)
  })

  await dingtalkRobot.markdown(title, text.join('\n'))
}

runMain(main)
