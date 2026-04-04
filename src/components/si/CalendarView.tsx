import { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, ChevronRight, Plus, Calendar as CalendarIcon, LayoutList } from 'lucide-react'
import { db } from '../../lib/db'
import { getHolidaysForMonth, isHoliday, AUSTRALIAN_HOLIDAYS } from '../../lib/holidays'
import type { CalendarEvent } from '../../lib/types'
import CalendarDay from './CalendarDay'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

type ViewMode = 'month' | 'week'

export default function CalendarView() {
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [month, setMonth] = useState(() => new Date().getMonth())
  const [viewMode, setViewMode] = useState<ViewMode>('month')
  const [weekOffset, setWeekOffset] = useState(0) // 0 = current week
  const [showAdd, setShowAdd] = useState(false)
  const [newEvent, setNewEvent] = useState({ title: '', date: '', type: 'custom' as CalendarEvent['type'] })

  const events = useLiveQuery(() => db.calendarEvents.toArray(), [])
  const suppliers = useLiveQuery(() => db.suppliers.where('active').equals(1).toArray().catch(() => []), [])

  const holidays = useMemo(() => getHolidaysForMonth(year, month), [year, month])

  const todayStr = new Date().toISOString().slice(0, 10)

  // Build month grid (6 weeks × 7 days)
  const monthGrid = useMemo(() => {
    const firstDay = new Date(year, month, 1)
    let startDow = firstDay.getDay() - 1
    if (startDow < 0) startDow = 6

    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const prevMonth = new Date(year, month, 0).getDate()

    const cells: { date: string; dayNum: number; isCurrentMonth: boolean }[] = []

    for (let i = startDow - 1; i >= 0; i--) {
      const d = prevMonth - i
      const m = month === 0 ? 12 : month
      const y = month === 0 ? year - 1 : year
      cells.push({ date: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, dayNum: d, isCurrentMonth: false })
    }

    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ date: `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`, dayNum: d, isCurrentMonth: true })
    }

    const remaining = 42 - cells.length
    for (let d = 1; d <= remaining; d++) {
      const m = month + 2 > 12 ? 1 : month + 2
      const y = month + 2 > 12 ? year + 1 : year
      cells.push({ date: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, dayNum: d, isCurrentMonth: false })
    }

    return cells
  }, [year, month])

  // Build week grid (7 days starting from Monday of current week + offset)
  const weekGrid = useMemo(() => {
    const today = new Date()
    const dayOfWeek = today.getDay() || 7 // Mon=1..Sun=7
    const monday = new Date(today)
    monday.setDate(today.getDate() - (dayOfWeek - 1) + weekOffset * 7)

    const cells: { date: string; dayNum: number; isCurrentMonth: boolean }[] = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday)
      d.setDate(monday.getDate() + i)
      const dateStr = d.toISOString().slice(0, 10)
      cells.push({ date: dateStr, dayNum: d.getDate(), isCurrentMonth: d.getMonth() === month })
    }
    return cells
  }, [weekOffset, month])

  const grid = viewMode === 'month' ? monthGrid : weekGrid

  const eventsMap = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    if (events) {
      for (const e of events) {
        const list = map.get(e.date) || []
        list.push(e)
        map.set(e.date, list)
      }
    }
    return map
  }, [events])

  const navigateMonth = (dir: -1 | 1) => {
    let m = month + dir
    let y = year
    if (m < 0) { m = 11; y-- }
    if (m > 11) { m = 0; y++ }
    setMonth(m)
    setYear(y)
  }

  const navigateWeek = (dir: -1 | 1) => {
    setWeekOffset(prev => prev + dir)
  }

  const handleAddEvent = async () => {
    if (!newEvent.title || !newEvent.date) return
    await db.calendarEvents.add({
      ...newEvent,
      source: 'manual',
      createdAt: new Date().toISOString(),
    })
    setNewEvent({ title: '', date: '', type: 'custom' })
    setShowAdd(false)
  }

  const monthLabel = new Date(year, month).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })

  const weekLabel = useMemo(() => {
    if (viewMode !== 'week' || weekGrid.length < 7) return ''
    const start = weekGrid[0].date
    const end = weekGrid[6].date
    return `${new Date(start + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} — ${new Date(end + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`
  }, [viewMode, weekGrid])

  // Order reminders: cutoffs from suppliers within next 7 days
  const orderReminders = useMemo(() => {
    if (!suppliers || suppliers.length === 0) return []
    const reminders: { supplier: string; day: string; time: string; color: string }[] = []
    const today = new Date()
    for (const s of suppliers) {
      if (s.orderCutoff) {
        for (let offset = 0; offset < 7; offset++) {
          const d = new Date(today)
          d.setDate(today.getDate() + offset)
          if (d.getDay() === s.orderCutoff.dayOfWeek) {
            reminders.push({
              supplier: s.name,
              day: d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' }),
              time: s.orderCutoff.time,
              color: s.color,
            })
          }
        }
      }
    }
    return reminders
  }, [suppliers])

  // Upcoming holidays (next 3 from today)
  const upcomingHolidays = useMemo(() => {
    return AUSTRALIAN_HOLIDAYS.filter(h => h.date >= todayStr).slice(0, 3)
  }, [todayStr])

  return (
    <div className="flex flex-col lg:flex-row gap-5">
      {/* Calendar grid */}
      <div className="flex-1">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => viewMode === 'month' ? navigateMonth(-1) : navigateWeek(-1)}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
            >
              <ChevronLeft size={18} />
            </button>
            <h2 className="text-lg font-semibold text-gray-900 min-w-[220px] text-center">
              {viewMode === 'month' ? monthLabel : weekLabel}
            </h2>
            <button
              onClick={() => viewMode === 'month' ? navigateMonth(1) : navigateWeek(1)}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => setViewMode('month')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  viewMode === 'month' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <CalendarIcon size={12} /> Month
              </button>
              <button
                onClick={() => { setViewMode('week'); setWeekOffset(0) }}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  viewMode === 'week' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <LayoutList size={12} /> Week
              </button>
            </div>

            <button onClick={() => { setShowAdd(true); setNewEvent(n => ({ ...n, date: todayStr })) }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700">
              <Plus size={14} /> Add Event
            </button>
          </div>
        </div>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 mb-1">
          {WEEKDAYS.map(d => (
            <div key={d} className="text-[10px] font-semibold text-gray-400 uppercase text-center py-1">{d}</div>
          ))}
        </div>

        {/* Day cells */}
        <div className={`grid grid-cols-7 border-t border-l border-gray-100 ${viewMode === 'week' ? 'min-h-[200px]' : ''}`}>
          {grid.map(cell => (
            <CalendarDay
              key={cell.date}
              date={cell.date}
              dayNum={cell.dayNum}
              isToday={cell.date === todayStr}
              isCurrentMonth={cell.isCurrentMonth}
              events={eventsMap.get(cell.date) || []}
              holiday={isHoliday(cell.date)}
            />
          ))}
        </div>
      </div>

      {/* Sidebar */}
      <div className="lg:w-[250px] space-y-4">
        {/* Order Reminders */}
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <h3 className="text-[13px] font-semibold text-gray-900 mb-3">Order Reminders</h3>
          {orderReminders.length === 0 ? (
            <p className="text-xs text-gray-400">No order cutoffs this week. Add suppliers to see reminders.</p>
          ) : (
            <div className="space-y-2">
              {orderReminders.map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: r.color }} />
                  <div>
                    <p className="text-xs font-medium text-gray-700">{r.supplier}</p>
                    <p className="text-[10px] text-gray-400">{r.day} by {r.time}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Key dates / holidays */}
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <h3 className="text-[13px] font-semibold text-gray-900 mb-3">
            {viewMode === 'month' ? 'Holidays This Month' : 'Upcoming Holidays'}
          </h3>
          {(viewMode === 'month' ? holidays : upcomingHolidays).length === 0 ? (
            <p className="text-xs text-gray-400">No holidays</p>
          ) : (
            <div className="space-y-2">
              {(viewMode === 'month' ? holidays : upcomingHolidays).map(h => (
                <div key={h.date} className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-gray-700">{h.name}</p>
                    <p className="text-[10px] text-gray-400">{h.date}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming events */}
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <h3 className="text-[13px] font-semibold text-gray-900 mb-3">Upcoming Events</h3>
          {(!events || events.filter(e => e.date >= todayStr).length === 0) ? (
            <p className="text-xs text-gray-400">No upcoming events</p>
          ) : (
            <div className="space-y-2">
              {events.filter(e => e.date >= todayStr).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5).map(e => (
                <div key={e.id} className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-gray-700 truncate">{e.title}</p>
                    <p className="text-[10px] text-gray-400">{e.date}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add Event Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowAdd(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-900">Add Calendar Event</h2>
            <label className="block text-xs font-medium text-gray-700">
              Title
              <input type="text" value={newEvent.title} onChange={e => setNewEvent({ ...newEvent, title: e.target.value })}
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </label>
            <label className="block text-xs font-medium text-gray-700">
              Date
              <input type="date" value={newEvent.date} onChange={e => setNewEvent({ ...newEvent, date: e.target.value })}
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </label>
            <label className="block text-xs font-medium text-gray-700">
              Type
              <select value={newEvent.type} onChange={e => setNewEvent({ ...newEvent, type: e.target.value as CalendarEvent['type'] })}
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                <option value="custom">Custom</option>
                <option value="delivery-direct">Delivery (Direct)</option>
                <option value="delivery-alm">Delivery (ALM)</option>
                <option value="order-cutoff">Order Cutoff</option>
                <option value="forecast">Forecast</option>
              </select>
            </label>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button onClick={handleAddEvent} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700">Add</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
