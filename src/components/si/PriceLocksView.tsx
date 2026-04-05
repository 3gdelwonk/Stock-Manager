import { useState, useEffect, useCallback } from 'react'
import { Lock, Unlock, RefreshCw, Search, AlertCircle } from 'lucide-react'
import { getPriceLocks, setPriceLock, type PriceLockItem } from '../../lib/jarvis'

export default function PriceLocksView() {
  const [items, setItems] = useState<PriceLockItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [unlocking, setUnlocking] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getPriceLocks()
      setItems(res.items)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load locked items')
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function handleUnlock(barcode: string) {
    setUnlocking(prev => new Set(prev).add(barcode))
    try {
      await setPriceLock(barcode, false)
      setItems(prev => prev.filter(i => i.barcode !== barcode))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to unlock')
    }
    setUnlocking(prev => {
      const next = new Set(prev)
      next.delete(barcode)
      return next
    })
  }

  const filtered = search.trim()
    ? items.filter(i =>
        i.description.toLowerCase().includes(search.toLowerCase()) ||
        i.barcode.includes(search) ||
        i.itemCode.includes(search)
      )
    : items

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
            <Lock size={20} className="text-amber-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Price Locks</h2>
            <p className="text-sm text-gray-500">
              {items.length} item{items.length !== 1 ? 's' : ''} locked against host updates
            </p>
          </div>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Search locked items..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-50 text-red-700 rounded-lg text-sm">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Loading */}
      {loading && items.length === 0 && (
        <div className="py-12 text-center">
          <RefreshCw size={24} className="text-gray-300 mx-auto mb-2 animate-spin" />
          <p className="text-sm text-gray-400">Loading locked items...</p>
        </div>
      )}

      {/* Empty */}
      {!loading && items.length === 0 && !error && (
        <div className="py-12 text-center">
          <Unlock size={32} className="text-gray-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-500">No locked prices</p>
          <p className="text-xs text-gray-400 mt-1">Items locked via price change or promotions will appear here</p>
        </div>
      )}

      {/* Table */}
      {filtered.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Product</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Department</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Price</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Locked</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(item => (
                <tr key={item.barcode} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900 line-clamp-1">{item.description}</p>
                    <p className="text-xs text-gray-400 font-mono mt-0.5">{item.barcode}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                      {item.department}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-gray-900">
                    ${item.sellPrice.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {item.lockedAt ? new Date(item.lockedAt).toLocaleDateString() : '-'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleUnlock(item.barcode)}
                      disabled={unlocking.has(item.barcode)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors"
                    >
                      <Unlock size={12} />
                      {unlocking.has(item.barcode) ? 'Unlocking...' : 'Unlock'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* No search results */}
      {!loading && items.length > 0 && filtered.length === 0 && search.trim() && (
        <p className="text-center text-sm text-gray-400 py-8">No locked items matching "{search}"</p>
      )}
    </div>
  )
}
