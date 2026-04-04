import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { X, Wifi, WifiOff } from 'lucide-react'
import { db } from '../lib/db'

interface Props {
  open: boolean
  onClose: () => void
}

export default function ConnectionHistorySheet({ open, onClose }: Props) {
  const entries = useLiveQuery(
    () => db.connectionLog.orderBy('checkedAt').reverse().limit(50).toArray(),
    [],
  )

  const uptime = useMemo(() => {
    if (!entries || entries.length === 0) return null
    const now = Date.now()
    const cutoff = now - 24 * 60 * 60 * 1000
    const recent = entries.filter(e => e.checkedAt.getTime() >= cutoff)
    if (recent.length === 0) return null
    const up = recent.filter(e => e.connected).length
    return Math.round((up / recent.length) * 100)
  }, [entries])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white w-full max-w-md rounded-t-2xl sm:rounded-2xl p-5 space-y-4 max-h-[80vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900">POS Connection Log</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        {uptime !== null && (
          <div className="bg-gray-50 rounded-lg px-3 py-2 flex items-center justify-between">
            <span className="text-xs text-gray-500">24h Uptime</span>
            <span className={`text-sm font-bold ${uptime >= 95 ? 'text-emerald-600' : uptime >= 80 ? 'text-amber-600' : 'text-red-600'}`}>
              {uptime}%
            </span>
          </div>
        )}

        <div className="space-y-1">
          {(!entries || entries.length === 0) && (
            <p className="text-xs text-gray-400 text-center py-4">No connection data yet</p>
          )}
          {entries?.map(e => (
            <div key={e.id} className="flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-0">
              {e.connected
                ? <Wifi size={12} className="text-emerald-500 shrink-0" />
                : <WifiOff size={12} className="text-red-500 shrink-0" />}
              <span className={`text-xs font-medium ${e.connected ? 'text-emerald-600' : 'text-red-600'}`}>
                {e.connected ? 'Connected' : 'Offline'}
              </span>
              {e.reason && !e.connected && (
                <span className="text-[10px] text-gray-400 truncate flex-1">{e.reason}</span>
              )}
              <span className="text-[10px] text-gray-400 shrink-0 ml-auto">
                {e.checkedAt.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
