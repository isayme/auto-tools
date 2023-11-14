import { LaunchOptions, chromium } from 'playwright'

export function getBrowser() {
  let opts: LaunchOptions = {}

  let socks5Server = process.env.SOCKS5_SERVER
  if (socks5Server) {
    console.log('使用s5代理')

    opts = {
      proxy: {
        server: socks5Server,
      },
    }
  }
  return chromium.launch(opts)
}
