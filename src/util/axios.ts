import axios, { AxiosResponse } from 'axios'
import axiosRetry from 'axios-retry'

const axiosInstance = axios.create({})

axios.interceptors.request.use(function (request) {
  request.headers.set('x-request-id', crypto.randomUUID())

  request.params = request.params || {}
  request.params['_'] = Date.now()

  return request
})

axiosRetry(axiosInstance, {
  retries: 10,
  retryDelay: function () {
    return 1000
  },
  retryCondition: function (err) {
    if (axiosRetry.isNetworkOrIdempotentRequestError(err)) {
      return true
    }

    return false
  },
})

async function expectResponseOk(resp: AxiosResponse) {
  let { status, data } = resp
  if (status >= 300) {
    throw new Error(
      `RequestFail, status: ${status}, respBody: ${JSON.stringify(data)}`,
    )
  }
}

export { axiosInstance, expectResponseOk }
