import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'

dayjs.locale('zh-cn')

export function formatYYYYMMDD(d: Date) {
  return dayjs(d).format('YYYY-MM-DD')
}
