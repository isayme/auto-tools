import { LaunchOptions, chromium } from 'playwright'

export function getBrowser() {
  let opts: LaunchOptions = {}

  let socks5Server = process.env.SOCKS5_SERVER
  if (socks5Server) {
    opts = {
      proxy: {
        server: socks5Server,
      },
    }
  }
  return chromium.launch(opts)
}
