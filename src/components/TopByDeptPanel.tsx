import { useState, useEffect, useCallback, useMemo } from 'react'
import { RefreshCw, AlertTriangle, Trophy, Zap, Snail } from 'lucide-react'
import {
  getTopByDepartment,
  type TopByDeptEntry,
  type TopByDepartmentResponse,
  type MarginBasis,
} from '../lib/jarvis'
import {
  DEPARTMENT_LABELS,
  DEPARTMENT_COLORS,
  DEPARTMENT_ORDER,
  mapDepartmentName,
} from '../lib/constants'
import type { GroceryDepartment } from '../lib/types'

const AUD = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 })

interface DeptRollup {
  rawName: string
  canonical: GroceryDepartment
  label: string
  color: string
  topMargin: TopByDeptEntry[]
  fastest: TopByDeptEntry[]
  slowest: TopByDeptEntry[]
}

type Window = 7 | 30 | 90

function mergeResponses(
  margin: TopByDepartmentResponse | null,
  velocity: TopByDepartmentResponse | null,
): DeptRollup[] {
  const rawNames = new Set<string>()
  if (margin) for (const k of Object.keys(margin.byDepartment)) rawNames.add(k)
  if (velocity) for (const k of Object.keys(velocity.byDepartment)) rawNames.add(k)

  const rollups: DeptRollup[] = []
  for (const raw of rawNames) {
    const canonical = mapDepartmentName(raw)
    rollups.push({
      rawName: raw,
      canonical,
      label: DEPARTMENT_LABELS[canonical] || raw,
      color: DEPARTMENT_COLORS[canonical] || '#9ca3af',
      topMargin: margin?.byDepartment[raw]?.top ?? [],
      fastest: velocity?.byDepartment[raw]?.top ?? [],
      slowest: velocity?.byDepartment[raw]?.bottom ?? [],
    })
  }

  const orderIndex = new Map(DEPARTMENT_ORDER.map((d, i) => [d, i]))
  rollups.sort((a, b) => {
    const ai = orderIndex.get(a.canonical) ?? 999
    const bi = orderIndex.get(b.canonical) ?? 999
    if (ai !== bi) return ai - bi
    return a.rawName.localeCompare(b.rawName)
  })
  return rollups
}

export default function TopByDeptPanel() {
  const [days, setDays] = useState<Window>(30)
  const [includeMS, setIncludeMS] = useState(true)
  const [marginResp, setMarginResp] = useState<TopByDepartmentResponse | null>(null)
  const [velocityResp, setVelocityResp] = useState<TopByDepartmentResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [m, v] = await Promise.all([
        getTopByDepartment({ days, perDept: 5, sort: 'margin', includeManagerSpecial: includeMS }),
        getTopByDepartment({ days, perDept: 5, sort: 'velocity', includeManagerSpecial: includeMS }),
      ])
      setMarginResp(m)
      setVelocityResp(v)
    } catch (err) {
      setError((err as Error).message || 'Failed to load per-department rankings')
      setMarginResp(null)
      setVelocityResp(null)
    } finally {
      setLoading(false)
    }
  }, [days, includeMS])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const rollups = useMemo(() => mergeResponses(marginResp, velocityResp), [marginResp, velocityResp])
  const basis: MarginBasis | undefined = marginResp?.basis ?? velocityResp?.basis

  return (
    <div className="p-4 space-y-4 pb-8">
      {/* Controls */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            {([7, 30, 90] as Window[]).map((w) => (
              <button
                key={w}
                onClick={() => setDays(w)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  days === w
                    ? 'bg-emerald-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {w}d
              </button>
            ))}
          </div>
          <button
            onClick={() => fetchAll()}
            disabled={loading}
            className="p-2 rounded-md hover:bg-gray-100 active:bg-gray-200 disabled:opacity-50 transition-colors"
            aria-label="Refresh"
          >
            <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-xs text-gray-600 select-none">
            <input
              type="checkbox"
              checked={includeMS}
              onChange={(e) => setIncludeMS(e.target.checked)}
              className="w-4 h-4 accent-emerald-600"
            />
            Include Manager Specials
          </label>
          {basis && (
            <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
              {basis === 'ish_incl_manager_special' ? 'MS included' : 'MS excluded'}
            </span>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
            <span className="text-sm text-red-700 font-medium">Failed to load</span>
          </div>
          <p className="text-xs text-red-600 mt-1">{error}</p>
          <button
            onClick={() => fetchAll()}
            className="mt-2 text-xs font-semibold text-red-700 underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading (initial) */}
      {loading && !marginResp && !velocityResp && !error && (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin" />
          <p className="text-sm text-gray-500">Loading per-department rankings…</p>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && rollups.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <p className="text-sm text-gray-400">No data returned for this window.</p>
        </div>
      )}

      {/* Department cards */}
      {rollups.map((d) => (
        <DeptCard key={d.rawName} dept={d} />
      ))}
    </div>
  )
}

// ─── Department card ─────────────────────────────────────────────────────────

function DeptCard({ dept }: { dept: DeptRollup }) {
  const hasAny = dept.topMargin.length + dept.fastest.length + dept.slowest.length > 0
  if (!hasAny) return null

  return (
    <div
      className="rounded-xl border border-gray-200 bg-white overflow-hidden"
      style={{ borderLeftColor: dept.color, borderLeftWidth: 4 }}
    >
      <div className="px-4 py-2.5 border-b border-gray-100">
        <p className="text-sm font-semibold text-gray-900">{dept.label}</p>
        {dept.label.toUpperCase() !== dept.rawName.toUpperCase() && (
          <p className="text-[10px] text-gray-400 uppercase tracking-wide">{dept.rawName}</p>
        )}
      </div>

      <Section
        title="Best margin"
        icon={<Trophy className="w-3.5 h-3.5 text-emerald-600" />}
        entries={dept.topMargin}
        metric={(e) => ({
          value: `${e.gpPct.toFixed(1)}%`,
          color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
          secondary: AUD.format(e.revenue),
          warn: e.gpPct < -50,
        })}
        emptyHint="No items clear the $10 revenue minimum."
      />

      <Section
        title="Fastest moving"
        icon={<Zap className="w-3.5 h-3.5 text-blue-600" />}
        entries={dept.fastest}
        metric={(e) => ({
          value: `${e.avgDailyVelocity.toFixed(1)}/day`,
          color: 'bg-blue-50 text-blue-700 border-blue-200',
          secondary: AUD.format(e.revenue),
        })}
        emptyHint="No velocity data."
      />

      <Section
        title="Slowest moving"
        icon={<Snail className="w-3.5 h-3.5 text-amber-600" />}
        entries={dept.slowest}
        metric={(e) => ({
          value: `${e.avgDailyVelocity.toFixed(2)}/day`,
          color: 'bg-amber-50 text-amber-700 border-amber-200',
          secondary: `QOH ${e.qoh}`,
          warn: e.gpPct < -50,
        })}
        emptyHint="No slow movers found."
      />
    </div>
  )
}

// ─── Section (one of the three mini-lists inside a card) ─────────────────────

interface Metric {
  value: string
  color: string
  secondary: string
  warn?: boolean
}

function Section({
  title,
  icon,
  entries,
  metric,
  emptyHint,
}: {
  title: string
  icon: React.ReactNode
  entries: TopByDeptEntry[]
  metric: (e: TopByDeptEntry) => Metric
  emptyHint: string
}) {
  return (
    <div className="px-4 py-3 border-b border-gray-50 last:border-b-0">
      <div className="flex items-center gap-1.5 mb-2">
        {icon}
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{title}</p>
        {entries.length > 0 && entries.length < 5 && (
          <span className="text-[10px] text-gray-400">({entries.length})</span>
        )}
      </div>
      {entries.length === 0 ? (
        <p className="text-[11px] text-gray-400 italic">{emptyHint}</p>
      ) : (
        <ul className="space-y-1.5">
          {entries.map((e, i) => {
            const m = metric(e)
            return (
              <li
                key={e.itemCode || `${title}-${i}`}
                className={`flex items-center gap-2 text-xs ${
                  m.warn ? 'border-l-2 border-red-400 pl-1.5' : ''
                }`}
              >
                <span className="w-4 text-center text-gray-400 font-medium">{i + 1}</span>
                <span className="flex-1 min-w-0 truncate text-gray-800">
                  {e.description.trim() || e.itemCode}
                </span>
                <span
                  className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded border ${m.color}`}
                >
                  {m.value}
                </span>
                <span className="shrink-0 w-14 text-right text-[10px] text-gray-400">
                  {m.secondary}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
