export async function runMain(fn: Function) {
  fn()
    .then(() => {
      console.log('ok')
    })
    .catch((err: any) => {
      console.warn(`fail: ${err}`)
    })
    .finally(() => {
      process.exit()
    })
}
