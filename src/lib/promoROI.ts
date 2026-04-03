import { getItemSales } from './jarvis'

export interface PromoROIResult {
  itemCode: string
  promoStart: string
  promoEnd: string
  baselineDailyQty: number
  baselineDailyRevenue: number
  promoDailyQty: number
  promoDailyRevenue: number
  upliftPercent: number
  incrementalGP: number
  roiGrade: 'A' | 'B' | 'C' | 'F'
}

export interface PriceImpactResult {
  itemCode: string
  changeDate: string
  beforeDailyQty: number
  beforeDailyRevenue: number
  afterDailyQty: number
  afterDailyRevenue: number
  revenueImpactPercent: number
  qtyImpactPercent: number
}

const MARGIN_RATE = 0.3

function daysBetween(a: string, b: string): number {
  const msPerDay = 86_400_000
  return Math.round(
    (new Date(b).getTime() - new Date(a).getTime()) / msPerDay,
  )
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function gradeFromUplift(uplift: number): 'A' | 'B' | 'C' | 'F' {
  if (uplift > 50) return 'A'
  if (uplift > 20) return 'B'
  if (uplift > 0) return 'C'
  return 'F'
}

export async function computePromoROI(
  itemCode: string,
  promoStart: string,
  promoEnd: string,
): Promise<PromoROIResult> {
  const { dailySales } = await getItemSales(itemCode)

  const baselineStart = addDays(promoStart, -14)
  const baselineEnd = addDays(promoStart, -1)

  const baselineSales = dailySales.filter(
    (s) => s.date >= baselineStart && s.date <= baselineEnd,
  )
  const promoSales = dailySales.filter(
    (s) => s.date >= promoStart && s.date <= promoEnd,
  )

  const baselineDays = Math.max(baselineSales.length, 1)
  const promoDays = Math.max(promoSales.length, 1)

  const baselineTotalQty = baselineSales.reduce((sum, s) => sum + s.qty, 0)
  const baselineTotalRev = baselineSales.reduce((sum, s) => sum + s.revenue, 0)
  const promoTotalQty = promoSales.reduce((sum, s) => sum + s.qty, 0)
  const promoTotalRev = promoSales.reduce((sum, s) => sum + s.revenue, 0)

  const baselineDailyQty = baselineTotalQty / baselineDays
  const baselineDailyRevenue = baselineTotalRev / baselineDays
  const promoDailyQty = promoTotalQty / promoDays
  const promoDailyRevenue = promoTotalRev / promoDays

  const upliftPercent =
    baselineDailyQty === 0
      ? promoDailyQty > 0
        ? 100
        : 0
      : ((promoDailyQty - baselineDailyQty) / baselineDailyQty) * 100

  const promoLength = daysBetween(promoStart, promoEnd) + 1
  const incrementalGP =
    promoDailyRevenue * MARGIN_RATE * promoLength -
    baselineDailyRevenue * MARGIN_RATE * promoLength

  return {
    itemCode,
    promoStart,
    promoEnd,
    baselineDailyQty,
    baselineDailyRevenue,
    promoDailyQty,
    promoDailyRevenue,
    upliftPercent,
    incrementalGP,
    roiGrade: gradeFromUplift(upliftPercent),
  }
}

export async function computePriceImpact(
  itemCode: string,
  changeDate: string,
): Promise<PriceImpactResult> {
  const { dailySales } = await getItemSales(itemCode)

  const beforeStart = addDays(changeDate, -14)
  const beforeEnd = addDays(changeDate, -1)
  const afterStart = changeDate
  const afterEnd = addDays(changeDate, 13)

  const beforeSales = dailySales.filter(
    (s) => s.date >= beforeStart && s.date <= beforeEnd,
  )
  const afterSales = dailySales.filter(
    (s) => s.date >= afterStart && s.date <= afterEnd,
  )

  const beforeDays = Math.max(beforeSales.length, 1)
  const afterDays = Math.max(afterSales.length, 1)

  const beforeDailyQty =
    beforeSales.reduce((sum, s) => sum + s.qty, 0) / beforeDays
  const beforeDailyRevenue =
    beforeSales.reduce((sum, s) => sum + s.revenue, 0) / beforeDays
  const afterDailyQty =
    afterSales.reduce((sum, s) => sum + s.qty, 0) / afterDays
  const afterDailyRevenue =
    afterSales.reduce((sum, s) => sum + s.revenue, 0) / afterDays

  const revenueImpactPercent =
    beforeDailyRevenue === 0
      ? afterDailyRevenue > 0
        ? 100
        : 0
      : ((afterDailyRevenue - beforeDailyRevenue) / beforeDailyRevenue) * 100

  const qtyImpactPercent =
    beforeDailyQty === 0
      ? afterDailyQty > 0
        ? 100
        : 0
      : ((afterDailyQty - beforeDailyQty) / beforeDailyQty) * 100

  return {
    itemCode,
    changeDate,
    beforeDailyQty,
    beforeDailyRevenue,
    afterDailyQty,
    afterDailyRevenue,
    revenueImpactPercent,
    qtyImpactPercent,
  }
}
