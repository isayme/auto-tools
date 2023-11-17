import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'

dayjs.locale('zh-cn')
dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.tz.setDefault('Asia/Shanghai')

export function formatYYYYMMDD(d: Date) {
  return dayjs(d).format('YYYY-MM-DD')
}

export function formatYYYYMMDDHHmm(d: Date) {
  return dayjs(d).format('YYYY-MM-DD HH:mm')
}
