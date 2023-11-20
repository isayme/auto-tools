import logger from './logger'

export async function runMain(fn: Function) {
  fn()
    .then(() => {
      logger.info('任务完成')
    })
    .catch((err: any) => {
      logger.warn(`任务失败: ${err}`)
    })
    .finally(() => {
      process.exit()
    })
}
