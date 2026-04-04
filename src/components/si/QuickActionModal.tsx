import { useState } from 'react'
import { X, Search, Loader2, CheckCircle, Camera } from 'lucide-react'
import { searchItems } from '../../lib/jarvis'
import { db } from '../../lib/db'
import BarcodeScanner from '../BarcodeScanner'

type ActionType = 'price-change' | 'stock-adjust' | 'expiry-batch' | 'waste-log' | 'label-print' | 'price-check'

interface QuickActionModalProps {
  open: boolean
  onClose: () => void
  actionType: ActionType
  onExecute: (barcode: string, productName: string, details: Record<string, unknown>) => Promise<void>
  title: string
}

interface FoundProduct {
  barcode: string
  itemCode: string
  name: string
  price: number
  qoh: number
}

export default function QuickActionModal({ open, onClose, actionType, onExecute, title }: QuickActionModalProps) {
  const [step, setStep] = useState<'search' | 'confirm' | 'done'>('search')
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<FoundProduct[]>([])
  const [selected, setSelected] = useState<FoundProduct | null>(null)
  const [formData, setFormData] = useState<Record<string, string>>({})
  const [executing, setExecuting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  if (!open) return null

  const handleSearch = async (q?: string) => {
    const searchQuery = q || query
    if (!searchQuery.trim()) return
    setSearching(true)
    setError(null)
    try {
      const res = await searchItems(searchQuery, 10)
      const items = res.items.map(i => ({
        barcode: i.barcode || '',
        itemCode: i.itemCode,
        name: i.description,
        price: i.sellPrice,
        qoh: i.onHand,
      }))
      setResults(items)
      // Auto-select if barcode scan returned exactly one result
      if (q && items.length === 1) {
        handleSelect(items[0])
      }
    } catch (e) {
      setError((e as Error).message)
    }
    setSearching(false)
  }

  const handleScan = (code: string) => {
    setScannerOpen(false)
    setQuery(code)
    handleSearch(code)
  }

  const handleSelect = (p: FoundProduct) => {
    setSelected(p)
    setStep('confirm')
  }

  const handleExecute = async () => {
    if (!selected) return
    setExecuting(true)
    setError(null)
    try {
      await onExecute(selected.barcode, selected.name, { ...formData, itemCode: selected.itemCode, qoh: selected.qoh })
      // Log to quickActionLog
      await db.quickActionLog.add({
        actionType,
        barcode: selected.barcode,
        productName: selected.name,
        details: formData,
        syncStatus: 'pending',
        performedAt: new Date().toISOString(),
      })
      setStep('done')
      setToast(`${title} completed for ${selected.name}`)
      setTimeout(() => setToast(null), 3000)
    } catch (e) {
      setError((e as Error).message)
    }
    setExecuting(false)
  }

  const reset = () => {
    setStep('search')
    setQuery('')
    setResults([])
    setSelected(null)
    setFormData({})
    setError(null)
    setToast(null)
    onClose()
  }

  // Action-specific form fields
  const renderForm = () => {
    switch (actionType) {
      case 'price-change':
        return (
          <div className="space-y-3">
            <label className="block text-xs font-medium text-gray-700">
              New Price ($)
              <input type="number" step="0.01" value={formData.newPrice || ''} onChange={e => setFormData({ ...formData, newPrice: e.target.value })}
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="0.00" />
            </label>
            <label className="block text-xs font-medium text-gray-700">
              Reason
              <select value={formData.reason || ''} onChange={e => setFormData({ ...formData, reason: e.target.value })}
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                <option value="">Select...</option>
                <option value="promo">Promotion</option>
                <option value="markdown">Markdown</option>
                <option value="cost_increase">Cost Increase</option>
                <option value="competitor_match">Competitor Match</option>
              </select>
            </label>
          </div>
        )
      case 'stock-adjust':
        return (
          <div className="space-y-3">
            <label className="block text-xs font-medium text-gray-700">
              New QOH
              <input type="number" value={formData.newQoh || ''} onChange={e => setFormData({ ...formData, newQoh: e.target.value })}
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="0" />
            </label>
            <label className="block text-xs font-medium text-gray-700">
              Reason
              <input type="text" value={formData.reason || ''} onChange={e => setFormData({ ...formData, reason: e.target.value })}
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="Counted / Damaged / etc." />
            </label>
          </div>
        )
      case 'label-print':
        return (
          <label className="block text-xs font-medium text-gray-700">
            Quantity
            <input type="number" min="1" value={formData.qty || '1'} onChange={e => setFormData({ ...formData, qty: e.target.value })}
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </label>
        )
      case 'expiry-batch':
        return (
          <div className="space-y-3">
            <label className="block text-xs font-medium text-gray-700">
              Expiry Date
              <input type="date" value={formData.expiryDate || ''} onChange={e => setFormData({ ...formData, expiryDate: e.target.value })}
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </label>
            <label className="block text-xs font-medium text-gray-700">
              Quantity Received
              <input type="number" min="1" value={formData.qty || ''} onChange={e => setFormData({ ...formData, qty: e.target.value })}
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </label>
          </div>
        )
      case 'waste-log':
        return (
          <div className="space-y-3">
            <label className="block text-xs font-medium text-gray-700">
              Quantity Wasted
              <input type="number" min="1" value={formData.qty || ''} onChange={e => setFormData({ ...formData, qty: e.target.value })}
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="1" />
            </label>
            <label className="block text-xs font-medium text-gray-700">
              Reason
              <select value={formData.reason || ''} onChange={e => setFormData({ ...formData, reason: e.target.value })}
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                <option value="">Select...</option>
                <option value="expired">Expired</option>
                <option value="damaged">Damaged</option>
                <option value="quality">Quality Issue</option>
                <option value="recall">Recall</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs font-medium text-gray-700">
              <input type="checkbox" checked={formData.claimable === 'true'} onChange={e => setFormData({ ...formData, claimable: e.target.checked ? 'true' : 'false' })}
                className="rounded border-gray-300" />
              Claimable from supplier
            </label>
            <label className="block text-xs font-medium text-gray-700">
              Notes
              <input type="text" value={formData.notes || ''} onChange={e => setFormData({ ...formData, notes: e.target.value })}
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="Optional notes..." />
            </label>
          </div>
        )
      case 'price-check':
        return <p className="text-xs text-gray-500">Will compare against online prices. No additional fields needed.</p>
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/40" onClick={reset} />
        <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 max-h-[85vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
            <button onClick={reset} className="p-1 text-gray-400 hover:text-gray-600 rounded"><X size={18} /></button>
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            {step === 'search' && (
              <div className="space-y-4">
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text" value={query}
                      onChange={e => setQuery(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleSearch()}
                      placeholder="Search barcode or name..."
                      className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm"
                      autoFocus
                    />
                  </div>
                  <button onClick={() => setScannerOpen(true)} title="Scan barcode" className="px-3 py-2 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 hover:text-gray-700">
                    <Camera size={16} />
                  </button>
                  <button onClick={() => handleSearch()} disabled={searching} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 disabled:opacity-50">
                    {searching ? <Loader2 size={14} className="animate-spin" /> : 'Search'}
                  </button>
                </div>
                {results.length > 0 && (
                  <div className="space-y-1.5 max-h-64 overflow-y-auto">
                    {results.map(p => (
                      <button key={p.barcode + p.itemCode} onClick={() => handleSelect(p)}
                        className="w-full text-left px-3 py-2.5 rounded-lg border border-gray-100 hover:border-emerald-200 hover:bg-emerald-50/50 transition-colors">
                        <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                        <p className="text-[11px] text-gray-500 mt-0.5">{p.barcode} · ${p.price.toFixed(2)} · QOH: {p.qoh}</p>
                      </button>
                    ))}
                  </div>
                )}
                {error && <p className="text-xs text-red-500">{error}</p>}
              </div>
            )}

            {step === 'confirm' && selected && (
              <div className="space-y-4">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-sm font-semibold text-gray-900">{selected.name}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">{selected.barcode} · ${selected.price.toFixed(2)} · QOH: {selected.qoh}</p>
                </div>
                {renderForm()}
                {error && <p className="text-xs text-red-500">{error}</p>}
              </div>
            )}

            {step === 'done' && (
              <div className="text-center py-8">
                <CheckCircle size={40} className="mx-auto text-emerald-500 mb-3" />
                <p className="text-sm font-semibold text-gray-900">Action completed</p>
                <p className="text-xs text-gray-500 mt-1">Logged to activity feed</p>
              </div>
            )}
          </div>

          {/* Footer */}
          {step === 'confirm' && (
            <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={() => setStep('search')} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Back</button>
              <button onClick={handleExecute} disabled={executing} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2">
                {executing && <Loader2 size={14} className="animate-spin" />}
                Execute
              </button>
            </div>
          )}
          {step === 'done' && (
            <div className="px-5 py-4 border-t border-gray-100 flex justify-end">
              <button onClick={reset} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700">Done</button>
            </div>
          )}
        </div>
      </div>

      {/* Barcode Scanner */}
      <BarcodeScanner open={scannerOpen} onScan={handleScan} onClose={() => setScannerOpen(false)} />

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[60] bg-emerald-600 text-white px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2 animate-[fadeIn_0.2s]">
          <CheckCircle size={16} />
          {toast}
        </div>
      )}
    </>
  )
}
