import type { CalendarEvent } from '../../lib/types'
import type { PublicHoliday } from '../../lib/holidays'

interface CalendarDayProps {
  date: string
  dayNum: number
  isToday: boolean
  isCurrentMonth: boolean
  events: CalendarEvent[]
  holiday?: PublicHoliday
}

const TYPE_COLORS: Record<string, string> = {
  'delivery-direct': 'bg-blue-400',
  'delivery-alm': 'bg-indigo-400',
  'order-cutoff': 'bg-red-400',
  'holiday': 'bg-amber-400',
  'forecast': 'bg-emerald-400',
  'custom': 'bg-purple-400',
}

export default function CalendarDay({ dayNum, isToday, isCurrentMonth, events, holiday }: CalendarDayProps) {
  return (
    <div className={`min-h-[80px] lg:min-h-[100px] border border-gray-100 p-1.5 ${
      isCurrentMonth ? 'bg-white' : 'bg-gray-50/50'
    } ${isToday ? 'ring-2 ring-emerald-400 ring-inset' : ''}`}>
      <p className={`text-[11px] font-medium mb-1 ${
        isToday ? 'text-emerald-600 font-bold' :
        isCurrentMonth ? 'text-gray-700' : 'text-gray-300'
      }`}>
        {dayNum}
      </p>

      {holiday && (
        <div className="text-[9px] px-1 py-0.5 rounded bg-amber-50 text-amber-700 truncate mb-0.5" title={holiday.name}>
          {holiday.name}
        </div>
      )}

      {events.slice(0, 3).map(evt => (
        <div key={evt.id} className="flex items-center gap-1 mb-0.5" title={evt.title}>
          <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${TYPE_COLORS[evt.type] || 'bg-gray-400'}`} />
          <p className="text-[9px] text-gray-600 truncate">{evt.title}</p>
        </div>
      ))}
      {events.length > 3 && (
        <p className="text-[9px] text-gray-400">+{events.length - 3} more</p>
      )}
    </div>
  )
}
