import { Robot } from '@isayme/dingtalk-robot'

let dingtalkRobot: Robot = new Robot({
  url: process.env.DINGTALK_WEBHOOK_URL,
  accessToken: process.env.DINGTALK_WEBHOOK_ACCESS_TOKEN,
  secret: process.env.DINGTALK_WEBHOOK_SECRET,
  timeout: 3000,
})

export { dingtalkRobot }
