import mongoose, { Schema, Types } from 'mongoose'
import logger from '../util/logger'

mongoose.connection.on('error', (err) => {
  logger.error(`mongodb 连接失败: ${err}`)
})
mongoose.connection.on('connecting', () => {
  logger.info(`mongodb connecting`)
})
mongoose.connection.on('connected', () => {
  logger.info(`mongodb connected`)
})
mongoose.connection.on('reconnected', () => {
  logger.warn(`mongodb reconnected`)
})
mongoose.connection.on('fullsetup', () => {
  logger.info(`mongodb fullsetup`)
})

interface IDistrict {
  _id: string
  name: string
  url: string
  conditions?: string[]
  maxPrice?: number
  minPrice?: number
  maxArea?: number
  minArea?: number
  lastView?: Date
  minViewDuration?: string
}

/**
 * 小区
 */
const districtSchema = new Schema<IDistrict>({
  name: String,
  url: String,
  conditions: [String],
  maxPrice: Number,
  minPrice: Number,
  maxArea: Number,
  minArea: Number,
  lastView: Date, // 上次查看时间
  minViewDuration: String, // 最小时间间隔
})
const District = mongoose.model('District', districtSchema)

/**
 * 楼栋
 */
const buildingSchema = new mongoose.Schema({
  name: String,
  buildId: String,
})

const Building = mongoose.model('Building', buildingSchema)

interface IHouse {
  _districtId?: string
  title: string
  url: string
  thumbnail: string
  positionInfo: string
  houseInfo: string
  totalPrice: string
  unitPrice: string
  lastView: Date
}

/**
 * 房源
 */

const houseSchema = new mongoose.Schema<IHouse>({
  _districtId: Types.ObjectId,
  title: String, // 标题
  url: String, // 地址
  thumbnail: String, // 缩略图
  positionInfo: String, // 位置信息
  houseInfo: String, // 房源概要信息
  totalPrice: String, // 总价
  unitPrice: String, // 单价
  lastView: Date, // 上次浏览时间
})

const House = mongoose.model('House', houseSchema)

export { Building, District, House, IDistrict, IHouse }
