import { useState } from 'react'
import { X, Hash, PlusCircle, MinusCircle } from 'lucide-react'
import { adjustStock } from '../lib/jarvis'

// ── Reason codes for adjust mode ─────────────────────────────────────────────

const ADJUST_REASONS = [
  { code: 'damaged',    label: 'Damaged' },
  { code: 'theft',      label: 'Theft / Shrinkage' },
  { code: 'return',     label: 'Customer Return' },
  { code: 'received',   label: 'Stock Received' },
  { code: 'transfer',   label: 'Transfer In/Out' },
  { code: 'correction', label: 'Correction' },
  { code: 'waste',      label: 'Waste / Disposal' },
  { code: 'other',      label: 'Other' },
] as const

type Mode = 'set' | 'adjust'

export interface StockAdjustTarget {
  barcode: string
  description: string
  currentQoh: number
}

interface Props {
  target: StockAdjustTarget
  onClose: () => void
  onSuccess: (msg: string) => void
}

export default function StockAdjustModal({ target, onClose, onSuccess }: Props) {
  const [mode, setMode] = useState<Mode>('set')
  const [newQoh, setNewQoh] = useState('')
  const [adjustQty, setAdjustQty] = useState('')
  const [adjustSign, setAdjustSign] = useState<'+' | '-'>('-')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { barcode, description, currentQoh } = target

  async function handleSubmit() {
    setError(null)

    if (mode === 'set') {
      const val = parseInt(newQoh, 10)
      if (isNaN(val) || val < 0) { setError('Enter a valid quantity'); return }
      const delta = val - currentQoh
      if (delta === 0) { onClose(); return }
      setSaving(true)
      try {
        await adjustStock(barcode, delta, 'count')
        onSuccess(`QOH set to ${val} (was ${currentQoh})`)
        onClose()
      } catch (e) {
        setError((e as Error).message)
      }
      setSaving(false)
    } else {
      const val = parseInt(adjustQty, 10)
      if (isNaN(val) || val <= 0) { setError('Enter a quantity greater than 0'); return }
      if (!reason) { setError('Select a reason'); return }
      const qty = adjustSign === '+' ? val : -val
      setSaving(true)
      try {
        await adjustStock(barcode, qty, reason)
        const newTotal = currentQoh + qty
        onSuccess(`QOH ${adjustSign === '+' ? 'increased' : 'decreased'} by ${val} → ${newTotal}`)
        onClose()
      } catch (e) {
        setError((e as Error).message)
      }
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white w-full max-w-md rounded-t-2xl sm:rounded-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900">Adjust Stock</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        {/* Product info */}
        <div className="bg-gray-50 rounded-lg px-3 py-2">
          <p className="text-sm font-medium text-gray-900 line-clamp-2">{description}</p>
          <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
            <span className="font-mono">{barcode}</span>
            <span>Current QOH: <span className="font-bold text-gray-800">{currentQoh}</span></span>
          </div>
        </div>

        {/* Mode toggle */}
        <div className="grid grid-cols-2 gap-1 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setMode('set')}
            className={`flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-semibold transition-colors ${
              mode === 'set' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500'
            }`}>
            <Hash size={14} /> Set QOH
          </button>
          <button
            onClick={() => setMode('adjust')}
            className={`flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-semibold transition-colors ${
              mode === 'adjust' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500'
            }`}>
            <PlusCircle size={14} /> Add / Remove
          </button>
        </div>

        {/* ── Set QOH mode ── */}
        {mode === 'set' && (
          <div className="space-y-3">
            <p className="text-xs text-gray-500">Enter the physical count — this becomes the new QOH.</p>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={newQoh}
              onChange={e => setNewQoh(e.target.value)}
              placeholder="New QOH"
              autoFocus
              className="w-full border border-gray-200 rounded-lg px-3 py-3 text-lg font-bold text-center focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
            />
            {newQoh !== '' && !isNaN(parseInt(newQoh, 10)) && (
              <p className="text-xs text-center text-gray-500">
                Delta: <span className={`font-bold ${parseInt(newQoh, 10) - currentQoh >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {parseInt(newQoh, 10) - currentQoh >= 0 ? '+' : ''}{parseInt(newQoh, 10) - currentQoh}
                </span>
                {' '}(reason: <span className="font-medium">count</span>)
              </p>
            )}
          </div>
        )}

        {/* ── Adjust mode ── */}
        {mode === 'adjust' && (
          <div className="space-y-3">
            <p className="text-xs text-gray-500">Add or remove stock with a reason code.</p>

            {/* +/- toggle and quantity */}
            <div className="flex gap-2">
              <div className="grid grid-cols-2 gap-1 bg-gray-100 rounded-lg p-1 shrink-0">
                <button
                  onClick={() => setAdjustSign('+')}
                  className={`flex items-center justify-center px-3 py-2 rounded-md text-sm font-bold transition-colors ${
                    adjustSign === '+' ? 'bg-emerald-500 text-white shadow-sm' : 'text-gray-500'
                  }`}>
                  <PlusCircle size={16} />
                </button>
                <button
                  onClick={() => setAdjustSign('-')}
                  className={`flex items-center justify-center px-3 py-2 rounded-md text-sm font-bold transition-colors ${
                    adjustSign === '-' ? 'bg-red-500 text-white shadow-sm' : 'text-gray-500'
                  }`}>
                  <MinusCircle size={16} />
                </button>
              </div>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                value={adjustQty}
                onChange={e => setAdjustQty(e.target.value)}
                placeholder="Qty"
                autoFocus
                className="flex-1 border border-gray-200 rounded-lg px-3 py-3 text-lg font-bold text-center focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>

            {/* Preview */}
            {adjustQty !== '' && !isNaN(parseInt(adjustQty, 10)) && (
              <p className="text-xs text-center text-gray-500">
                New QOH: <span className="font-bold text-gray-800">
                  {currentQoh + (adjustSign === '+' ? 1 : -1) * parseInt(adjustQty, 10)}
                </span>
              </p>
            )}

            {/* Reason code */}
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-gray-700">Reason</p>
              <div className="grid grid-cols-2 gap-1.5">
                {ADJUST_REASONS.map(r => (
                  <button
                    key={r.code}
                    onClick={() => setReason(r.code)}
                    className={`px-3 py-2 rounded-lg text-xs font-medium text-left transition-colors ${
                      reason === r.code
                        ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-300'
                        : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                    }`}>
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={saving}
          className={`w-full py-3 rounded-xl text-sm font-bold text-white transition-colors ${
            saving ? 'bg-gray-300 cursor-not-allowed' :
            mode === 'set' ? 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800' :
            'bg-blue-600 hover:bg-blue-700 active:bg-blue-800'
          }`}>
          {saving ? 'Saving...' : mode === 'set' ? 'Set QOH' : `${adjustSign === '+' ? 'Add' : 'Remove'} Stock`}
        </button>
      </div>
    </div>
  )
}
