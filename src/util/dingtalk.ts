import axios from 'axios'

let webhookUrl = process.env.DINGTALK_WEBHOOK_URL

export async function notifyDingtalk(data: any) {
  if (!webhookUrl) {
    return
  }

  return axios.request({
    method: 'POST',
    url: webhookUrl,
    timeout: 3000,
    headers: {
      'Content-Type': 'application/json',
    },
    data: JSON.stringify(data),
  })
}
