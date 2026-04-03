import { useState, useEffect, useCallback, useMemo } from 'react'
import { RefreshCw, WifiOff, Search, ScanBarcode, ChevronDown, ChevronUp, Database } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { checkConnection, getStockLevels, getDepartmentBreakdown, type StockItem, type DepartmentBreakdown } from '../lib/jarvis'
import { useProductCodeLookup } from '../lib/useProductCodes'
import { db } from '../lib/db'
import BarcodeScanner from './BarcodeScanner'
import BarcodeStripe from './BarcodeStripe'
import ProductImage from './ProductImage'
import { DEPARTMENT_COLORS, DEPARTMENT_LABELS } from '../lib/constants'

// ── Department badge colors (keyed by JARVISmart department name) ────────────

const DEPT_BADGE_COLORS: Record<string, string> = {
  GROCERY: 'bg-emerald-100 text-emerald-700',
  DAIRY: 'bg-blue-100 text-blue-700',
  FROZEN: 'bg-indigo-100 text-indigo-700',
  'FRESH PRODUCE': 'bg-green-100 text-green-700',
  MEAT: 'bg-red-100 text-red-700',
  DELI: 'bg-orange-100 text-orange-700',
  BAKERY: 'bg-amber-100 text-amber-700',
  'HEALTH & BEAUTY': 'bg-pink-100 text-pink-700',
  HOUSEHOLD: 'bg-violet-100 text-violet-700',
  PET: 'bg-teal-100 text-teal-700',
  BABY: 'bg-rose-100 text-rose-700',
  LIQUEURS: 'bg-purple-100 text-purple-700',
  WINE: 'bg-purple-100 text-purple-700',
  SPIRITS: 'bg-purple-100 text-purple-700',
  BEER: 'bg-purple-100 text-purple-700',
  'LIQUOR/MISC': 'bg-purple-100 text-purple-700',
  TOBACCO: 'bg-gray-100 text-gray-700',
  'GENERAL MERCHANDISE': 'bg-slate-100 text-slate-700',
}

const FALLBACK_BADGE = 'bg-gray-100 text-gray-600'

type SortMode = 'qoh' | 'department' | 'velocity' | 'name'

function fmtMoney(n: number) {
  return n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ── Component ────────────────────────────────────────────────────────────────

export default function LiveStockView() {
  const [loading, setLoading] = useState(false)
  const [connected, setConnected] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastFetch, setLastFetch] = useState<Date | null>(null)
  const [dataSource, setDataSource] = useState<'live' | 'local'>('live')

  const [stockItems, setStockItems] = useState<StockItem[] | null>(null)
  const [deptBreakdown, setDeptBreakdown] = useState<DepartmentBreakdown[] | null>(null)

  const [selectedDept, setSelectedDept] = useState<string | null>(null) // null = "All"
  const [searchQuery, setSearchQuery] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('department')
  const [scannerOpen, setScannerOpen] = useState(false)
  const [collapsedDepts, setCollapsedDepts] = useState<Set<string>>(new Set())

  const { getOrderCode, resolveCode } = useProductCodeLookup()

  // ── Local fallback data from Dexie ─────────────────────────────────────────
  const localProducts = useLiveQuery(() => db.products.toArray(), [])
  const localSnapshots = useLiveQuery(() => db.stockSnapshots.toArray(), [])

  const localStockItems = useMemo((): StockItem[] | null => {
    if (!localProducts || localProducts.length === 0) return null
    // Build latest QOH map from snapshots
    const latestQoh = new Map<number, number>()
    if (localSnapshots) {
      for (const s of localSnapshots) {
        const existing = latestQoh.get(s.productId)
        if (existing === undefined) latestQoh.set(s.productId, s.qoh)
        // keep latest by checking importedAt
      }
      // More accurate: group by productId and pick latest
      const byProduct = new Map<number, typeof localSnapshots>()
      for (const s of localSnapshots) {
        const arr = byProduct.get(s.productId) ?? []
        arr.push(s)
        byProduct.set(s.productId, arr)
      }
      for (const [pid, snaps] of byProduct) {
        const latest = snaps.reduce((best, s) => s.importedAt > best.importedAt ? s : best, snaps[0])
        latestQoh.set(pid, latest.qoh)
      }
    }

    return localProducts.map(p => ({
      itemCode: p.itemCode,
      barcode: p.barcode ?? null,
      description: p.name,
      department: DEPARTMENT_LABELS[p.department] ?? p.department,
      departmentCode: p.departmentCode,
      onHand: latestQoh.get(p.id!) ?? 0,
      reorderLevel: p.minStockLevel,
      sellPrice: p.sellPrice,
      avgCost: p.costPrice,
      onOrder: 0,
      isOnReorder: false,
      avgDayQty: 0,
      avgWeekQty: 0,
    }))
  }, [localProducts, localSnapshots])

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const status = await checkConnection()
      setConnected(status.connected)
      if (!status.connected) {
        setError(status.reason ?? 'Cannot reach JARVISmart')
        setDataSource('local')
        setLoading(false)
        return
      }

      const [stock, depts] = await Promise.all([
        getStockLevels({ limit: 5000 }),
        getDepartmentBreakdown('today'),
      ])
      setStockItems(stock)
      setDeptBreakdown(depts)
      setLastFetch(new Date())
      setDataSource('live')
    } catch (err) {
      setError((err as Error).message)
      setConnected(false)
      setDataSource('local')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAll()
    const id = setInterval(fetchAll, 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [fetchAll])

  // Use live API data if available, otherwise fall back to local imported data
  const effectiveStockItems = stockItems ?? (dataSource === 'local' ? localStockItems : null)

  // ── Barcode scan handler ───────────────────────────────────────────────────

  const handleScan = useCallback((code: string) => {
    setScannerOpen(false)
    setSearchQuery(resolveCode(code))
  }, [resolveCode])

  // ── Derived: unique departments with counts ────────────────────────────────

  const departmentCounts = useMemo(() => {
    if (!effectiveStockItems) return new Map<string, number>()
    const counts = new Map<string, number>()
    for (const item of effectiveStockItems) {
      counts.set(item.department, (counts.get(item.department) ?? 0) + 1)
    }
    return counts
  }, [effectiveStockItems])

  const departmentNames = useMemo(
    () => Array.from(departmentCounts.keys()).sort(),
    [departmentCounts]
  )

  // ── Derived: department sales context map ──────────────────────────────────

  const deptSalesMap = useMemo(() => {
    const map = new Map<string, DepartmentBreakdown>()
    if (deptBreakdown) {
      for (const d of deptBreakdown) {
        map.set(d.department, d)
      }
    }
    return map
  }, [deptBreakdown])

  // ── Filtered + sorted stock ────────────────────────────────────────────────

  const filteredStock = useMemo(() => {
    if (!effectiveStockItems) return []

    let items = effectiveStockItems

    // Department filter
    if (selectedDept) {
      items = items.filter(s => s.department === selectedDept)
    }

    // Search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      items = items.filter(s => {
        const orderCode = getOrderCode(s.barcode)
        return (
          s.description.toLowerCase().includes(q) ||
          s.itemCode.toLowerCase().includes(q) ||
          (s.barcode && s.barcode.includes(searchQuery)) ||
          (orderCode && orderCode.toLowerCase().includes(q))
        )
      })
    }

    // Sort
    const sorted = [...items]
    switch (sortMode) {
      case 'qoh':
        sorted.sort((a, b) => a.onHand - b.onHand)
        break
      case 'department':
        sorted.sort((a, b) => a.department.localeCompare(b.department) || a.description.localeCompare(b.description))
        break
      case 'velocity':
        sorted.sort((a, b) => b.avgDayQty - a.avgDayQty)
        break
      case 'name':
        sorted.sort((a, b) => a.description.localeCompare(b.description))
        break
    }

    return sorted
  }, [effectiveStockItems, selectedDept, searchQuery, sortMode, getOrderCode])

  // ── Grouped by department (for "All" view) ─────────────────────────────────

  const groupedByDept = useMemo(() => {
    if (selectedDept) return null // flat list when filtered
    const groups = new Map<string, StockItem[]>()
    for (const item of filteredStock) {
      const list = groups.get(item.department) ?? []
      list.push(item)
      groups.set(item.department, list)
    }
    // Sort groups alphabetically
    return new Map([...groups.entries()].sort(([a], [b]) => a.localeCompare(b)))
  }, [filteredStock, selectedDept])

  // ── Toggle collapsed department ────────────────────────────────────────────

  const toggleDept = useCallback((dept: string) => {
    setCollapsedDepts(prev => {
      const next = new Set(prev)
      if (next.has(dept)) next.delete(dept)
      else next.add(dept)
      return next
    })
  }, [])

  // ── Render: stock item row ─────────────────────────────────────────────────

  const renderStockItem = (item: StockItem) => {
    const low = item.onHand > 0 && item.onHand < item.reorderLevel
    const negative = item.onHand < 0
    const orderCode = getOrderCode(item.barcode)

    return (
      <div key={item.itemCode} className="py-3 space-y-1.5">
        <div className="flex items-center gap-3">
          <ProductImage
            itemCode={item.itemCode}
            description={item.description}
            department={item.department}
            barcode={item.barcode}
            size={40}
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-800 truncate">{item.description}</p>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              {orderCode && (
                <span className="text-[10px] text-gray-400 font-mono">#{orderCode}</span>
              )}
              <span className="text-[10px] text-gray-300 font-mono">{item.itemCode}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${DEPT_BADGE_COLORS[item.department] ?? FALLBACK_BADGE}`}>
                {item.department}
              </span>
              {item.onOrder > 0 && (
                <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-medium">
                  +{item.onOrder} on order
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] text-gray-400">
                Sell ${fmtMoney(item.sellPrice)}
              </span>
              <span className="text-[10px] text-gray-400">
                Avg/day {item.avgDayQty.toFixed(1)}
              </span>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className={`text-sm font-bold ${negative ? 'text-red-600' : low ? 'text-red-500' : 'text-gray-800'}`}>
              {item.onHand}
            </p>
            <p className={`text-[10px] ${negative ? 'text-red-400' : low ? 'text-red-400' : 'text-gray-400'}`}>
              {negative ? 'Negative' : low ? `min ${item.reorderLevel}` : 'QOH'}
            </p>
          </div>
        </div>
        {item.barcode && (
          <div className="ml-12">
            <BarcodeStripe value={item.barcode} height={28} />
          </div>
        )}
      </div>
    )
  }

  // ── Render: department section (grouped view) ──────────────────────────────

  const renderDeptGroup = (dept: string, items: StockItem[]) => {
    const isCollapsed = collapsedDepts.has(dept)
    const totalValue = items.reduce((sum, s) => sum + s.onHand * s.sellPrice, 0)
    const lowCount = items.filter(s => s.onHand > 0 && s.onHand < s.reorderLevel).length
    const negCount = items.filter(s => s.onHand < 0).length
    const salesInfo = deptSalesMap.get(dept)

    return (
      <div key={dept} className="border border-gray-100 rounded-xl overflow-hidden shadow-sm bg-white">
        <button
          className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors"
          onClick={() => toggleDept(dept)}
        >
          <span
            className="w-3 h-3 rounded-full shrink-0"
            style={{ background: DEPARTMENT_COLORS[dept.toLowerCase().replace(/[^a-z]/g, '_') as keyof typeof DEPARTMENT_COLORS] ?? '#94a3b8' }}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-gray-800">{dept}</p>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${DEPT_BADGE_COLORS[dept] ?? FALLBACK_BADGE}`}>
                {items.length} items
              </span>
            </div>
            <div className="flex items-center gap-3 mt-0.5">
              <span className="text-xs text-gray-500">
                Stock value ${fmtMoney(totalValue)}
              </span>
              {salesInfo && (
                <span className="text-xs text-emerald-600">
                  Today ${fmtMoney(salesInfo.sales)}
                </span>
              )}
              {lowCount > 0 && (
                <span className="text-xs text-red-500">{lowCount} low</span>
              )}
              {negCount > 0 && (
                <span className="text-xs text-red-600 font-medium">{negCount} negative</span>
              )}
            </div>
          </div>
          <div className="text-gray-400 shrink-0">
            {isCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </div>
        </button>

        {!isCollapsed && (
          <div className="border-t border-gray-100 px-4 divide-y divide-gray-50">
            {items.map(renderStockItem)}
          </div>
        )}
      </div>
    )
  }

  // ── Status banner ──────────────────────────────────────────────────────────

  const statusBanner = (
    <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 bg-white shrink-0">
      <div className="flex items-center gap-2">
        {connected === null && loading ? (
          <span className="text-xs text-gray-400">Connecting...</span>
        ) : connected ? (
          <>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <span className="text-xs text-emerald-600 font-medium">Live &middot; JARVISmart</span>
          </>
        ) : dataSource === 'local' && effectiveStockItems ? (
          <>
            <Database size={12} className="text-amber-500 shrink-0" />
            <span className="text-xs text-amber-600 font-medium">Offline &middot; Imported data</span>
          </>
        ) : (
          <>
            <WifiOff size={12} className="text-red-400 shrink-0" />
            <span className="text-xs text-red-500 font-medium">Offline</span>
          </>
        )}
        {lastFetch && (
          <span className="text-xs text-gray-400">
            {lastFetch.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>
      <button
        onClick={fetchAll}
        disabled={loading}
        className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500 disabled:opacity-40"
        aria-label="Refresh"
      >
        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
      </button>
    </div>
  )

  // ── Loading state (first fetch) ────────────────────────────────────────────

  if (loading && !effectiveStockItems) {
    return (
      <div className="flex flex-col h-full bg-gray-50">
        {statusBanner}
        <div className="flex items-center justify-center flex-1">
          <div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  // ── Offline / error state (no data at all) ─────────────────────────────────

  if (connected === false && !effectiveStockItems) {
    return (
      <div className="flex flex-col h-full bg-gray-50">
        {statusBanner}
        <div className="flex flex-col items-center justify-center flex-1 gap-3 p-6 text-center">
          <WifiOff size={40} className="text-red-200" />
          <p className="text-sm font-medium text-red-600">Cannot reach JARVISmart</p>
          <p className="text-xs text-gray-400 max-w-xs">{error}</p>
          <p className="text-xs text-gray-400">Import stock data via Settings to view offline.</p>
          <button
            onClick={fetchAll}
            disabled={loading}
            className="text-sm text-emerald-600 font-medium underline disabled:opacity-50"
          >
            {loading ? 'Retrying...' : 'Retry'}
          </button>
        </div>
      </div>
    )
  }

  // ── Main view ──────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {statusBanner}

      {/* ── Department filter chips ───────────────────────────────────────── */}
      <div className="px-4 py-2 border-b border-gray-100 bg-white shrink-0 overflow-x-auto">
        <div className="flex gap-1.5 min-w-max">
          <button
            onClick={() => setSelectedDept(null)}
            className={`text-xs font-medium px-3 py-1.5 rounded-full whitespace-nowrap transition-colors ${
              selectedDept === null
                ? 'bg-emerald-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            All ({effectiveStockItems?.length ?? 0})
          </button>
          {departmentNames.map(dept => (
            <button
              key={dept}
              onClick={() => setSelectedDept(selectedDept === dept ? null : dept)}
              className={`text-xs font-medium px-3 py-1.5 rounded-full whitespace-nowrap transition-colors ${
                selectedDept === dept
                  ? 'bg-emerald-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {dept} ({departmentCounts.get(dept) ?? 0})
            </button>
          ))}
        </div>
      </div>

      {/* ── Search bar + scan button ──────────────────────────────────────── */}
      <div className="px-4 py-2 border-b border-gray-100 bg-white shrink-0">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search name, barcode, item code..."
              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-300"
            />
          </div>
          <button
            onClick={() => setScannerOpen(true)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50"
            title="Scan barcode"
          >
            <ScanBarcode size={18} />
          </button>
        </div>
      </div>

      {/* ── Sort options ──────────────────────────────────────────────────── */}
      <div className="px-4 py-1.5 border-b border-gray-100 bg-white shrink-0 flex items-center gap-2">
        <span className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">Sort</span>
        {([
          ['qoh', 'QOH'],
          ['department', 'Department'],
          ['velocity', 'Velocity'],
          ['name', 'Name'],
        ] as [SortMode, string][]).map(([mode, label]) => (
          <button
            key={mode}
            onClick={() => setSortMode(mode)}
            className={`text-[10px] px-2 py-1 rounded font-medium transition-colors ${
              sortMode === mode
                ? 'bg-emerald-100 text-emerald-700'
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Stock count summary ───────────────────────────────────────────── */}
      {effectiveStockItems && (
        <div className="px-4 py-1.5 bg-gray-50 shrink-0">
          <p className="text-xs text-gray-400">
            {filteredStock.length} of {effectiveStockItems.length} items
            {selectedDept && <> in <span className="font-medium text-gray-500">{selectedDept}</span></>}
            {searchQuery && <> matching &ldquo;{searchQuery}&rdquo;</>}
            {' '}&middot; {dataSource === 'live' ? 'live QOH' : 'imported data'}
          </p>
        </div>
      )}

      {/* ── Stock list ────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        <div className="px-4 pb-8 space-y-3 pt-2">
          {filteredStock.length > 0 ? (
            groupedByDept ? (
              // Grouped view (All departments)
              Array.from(groupedByDept.entries()).map(([dept, items]) =>
                renderDeptGroup(dept, items)
              )
            ) : (
              // Flat list (single department selected)
              <div className="bg-white border border-gray-100 rounded-xl shadow-sm divide-y divide-gray-50 px-4">
                {filteredStock.map(renderStockItem)}
              </div>
            )
          ) : (
            <p className="text-center text-sm text-gray-400 py-12">
              {loading ? 'Loading stock levels...' : searchQuery ? 'No items match your search' : 'No stock data — import via Settings or connect to JARVISmart'}
            </p>
          )}
        </div>
      </div>

      {/* ── Barcode scanner modal ─────────────────────────────────────────── */}
      <BarcodeScanner open={scannerOpen} onScan={handleScan} onClose={() => setScannerOpen(false)} />
    </div>
  )
}
