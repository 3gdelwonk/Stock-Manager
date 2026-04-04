/** Australian public holidays 2025-2027 (national only) */
export interface PublicHoliday {
  date: string
  name: string
}

export const AUSTRALIAN_HOLIDAYS: PublicHoliday[] = [
  // 2025
  { date: '2025-01-01', name: "New Year's Day" },
  { date: '2025-01-27', name: 'Australia Day' },
  { date: '2025-04-18', name: 'Good Friday' },
  { date: '2025-04-19', name: 'Easter Saturday' },
  { date: '2025-04-21', name: 'Easter Monday' },
  { date: '2025-04-25', name: 'Anzac Day' },
  { date: '2025-06-09', name: "Queen's Birthday" },
  { date: '2025-12-25', name: 'Christmas Day' },
  { date: '2025-12-26', name: 'Boxing Day' },
  // 2026
  { date: '2026-01-01', name: "New Year's Day" },
  { date: '2026-01-26', name: 'Australia Day' },
  { date: '2026-04-03', name: 'Good Friday' },
  { date: '2026-04-04', name: 'Easter Saturday' },
  { date: '2026-04-06', name: 'Easter Monday' },
  { date: '2026-04-25', name: 'Anzac Day' },
  { date: '2026-06-08', name: "Queen's Birthday" },
  { date: '2026-12-25', name: 'Christmas Day' },
  { date: '2026-12-26', name: 'Boxing Day' },
  // 2027
  { date: '2027-01-01', name: "New Year's Day" },
  { date: '2027-01-26', name: 'Australia Day' },
  { date: '2027-03-26', name: 'Good Friday' },
  { date: '2027-03-27', name: 'Easter Saturday' },
  { date: '2027-03-29', name: 'Easter Monday' },
  { date: '2027-04-25', name: 'Anzac Day' },
  { date: '2027-06-14', name: "Queen's Birthday" },
  { date: '2027-12-25', name: 'Christmas Day' },
  { date: '2027-12-26', name: 'Boxing Day' },
]

export function getHolidaysForMonth(year: number, month: number): PublicHoliday[] {
  const prefix = `${year}-${String(month + 1).padStart(2, '0')}`
  return AUSTRALIAN_HOLIDAYS.filter(h => h.date.startsWith(prefix))
}

export function isHoliday(date: string): PublicHoliday | undefined {
  return AUSTRALIAN_HOLIDAYS.find(h => h.date === date)
}
