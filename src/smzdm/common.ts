import { kvsEnvStorage } from '@kvs/env'
import lodash from 'lodash'
import { chromium } from 'playwright'

interface IProduct {
  title: string
  url: string
}

async function getProductList(url: string): Promise<IProduct[]> {
  const browser = await chromium.launch()
  const page = await browser.newPage({})

  const productSelector = '.list'

  await Promise.all([
    page.goto(url, {
      waitUntil: 'domcontentloaded',
    }),
    page
      .waitForSelector(productSelector, { timeout: 15000 })
      .catch(lodash.noop),
  ])

  let productLocators = await page.locator(productSelector).all()
  let products: IProduct[] = await Promise.all(
    productLocators.map(async function (locator) {
      let titleLoc = locator.locator('.itemName a')

      let [title, url] = await Promise.all([
        titleLoc.innerText(),
        titleLoc.getAttribute('href'),
      ])

      return {
        title,
        url,
      }
    }),
  )

  await browser.close()

  return products
}

async function filterNew(
  products: IProduct[],
  storageName: string,
): Promise<IProduct[]> {
  const storage = await kvsEnvStorage({
    name: storageName,
    version: 1,
    storeFilePath: '/ql/data/.cache/kvs-node-localstorage',
  })

  let lastProducts = await storage.get('last')

  await storage.set('last', products as any)
  await storage.close()

  return lodash.differenceBy(products, lastProducts, 'url')
}

export { filterNew, getProductList }
