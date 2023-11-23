import delay from 'delay'
import lodash from 'lodash'
import logger from './logger'

export async function randomDelay(lower: number, upper: number) {
  let delayMills = lodash.random(lower, upper)
  logger.info(`随机延时: ${delayMills}毫秒`)
  await delay(delayMills)
}
