import { useState, useEffect, useCallback } from 'react'
import { X, ChevronRight, ChevronLeft, Check, Loader2, Plus, Printer } from 'lucide-react'
import {
  searchItems,
  getDepartmentList,
  createItem,
  sendToPos,
  printLabel,
  type DepartmentListEntry,
  type SearchResult,
} from '../lib/jarvis'

interface CreateProductSheetProps {
  open: boolean
  onClose: () => void
  onSuccess?: () => void
  initialBarcode?: string
}

interface FormData {
  barcode: string
  description: string
  departmentCode: number
  sellPrice: string
  costPrice: string
  isGstFree: boolean
  ctnQty: string
}

const INITIAL_FORM: FormData = {
  barcode: '',
  description: '',
  departmentCode: 0,
  sellPrice: '',
  costPrice: '',
  isGstFree: false,
  ctnQty: '',
}

export default function CreateProductSheet({
  open,
  onClose,
  onSuccess,
  initialBarcode,
}: CreateProductSheetProps) {
  const [step, setStep] = useState(1)
  const [form, setForm] = useState<FormData>({ ...INITIAL_FORM, barcode: initialBarcode ?? '' })
  const [departments, setDepartments] = useState<DepartmentListEntry[]>([])
  const [deptsLoading, setDeptsLoading] = useState(false)

  // Step 1 state
  const [checking, setChecking] = useState(false)
  const [existsWarning, setExistsWarning] = useState(false)
  const [existsResult, setExistsResult] = useState<SearchResult | null>(null)

  // Step 3 state
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  // Step 4 state
  const [createdBarcode, setCreatedBarcode] = useState('')
  const [printing, setPrinting] = useState(false)
  const [printDone, setPrintDone] = useState(false)
  const [printError, setPrintError] = useState('')

  const [error, setError] = useState('')

  // Fetch departments on mount
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setDeptsLoading(true)
    getDepartmentList()
      .then((res) => {
        if (!cancelled) setDepartments(res.departments)
      })
      .catch(() => {
        if (!cancelled) setDepartments([])
      })
      .finally(() => {
        if (!cancelled) setDeptsLoading(false)
      })
    return () => { cancelled = true }
  }, [open])

  // Sync initialBarcode when sheet opens
  useEffect(() => {
    if (open && initialBarcode) {
      setForm((f) => ({ ...f, barcode: initialBarcode }))
    }
  }, [open, initialBarcode])

  const reset = useCallback(() => {
    setStep(1)
    setForm({ ...INITIAL_FORM })
    setExistsWarning(false)
    setExistsResult(null)
    setError('')
    setCreateError('')
    setCreatedBarcode('')
    setPrintDone(false)
    setPrintError('')
  }, [])

  if (!open) return null

  const deptName = departments.find((d) => d.code === form.departmentCode)?.name ?? '—'

  // ── Step 1: Check barcode ─────────────────────────────────────────────────
  async function handleCheckBarcode() {
    const bc = form.barcode.trim()
    if (!bc) { setError('Enter a barcode'); return }
    setError('')
    setChecking(true)
    try {
      const result = await searchItems(bc, 1)
      if (result.items.length > 0 && result.items.some((i) => i.barcode === bc || i.itemCode === bc)) {
        setExistsResult(result)
        setExistsWarning(true)
      } else {
        setStep(2)
      }
    } catch (err) {
      // If search fails (e.g. 404), product doesn't exist — proceed
      setStep(2)
      void err
    } finally {
      setChecking(false)
    }
  }

  // ── Step 3: Create & send ─────────────────────────────────────────────────
  async function handleCreate() {
    setCreating(true)
    setCreateError('')
    try {
      const payload = {
        barcode: form.barcode.trim(),
        description: form.description.trim(),
        departmentCode: form.departmentCode,
        sellPrice: parseFloat(form.sellPrice),
        costPrice: form.costPrice ? parseFloat(form.costPrice) : undefined,
        isGstFree: form.isGstFree,
        ctnQty: form.ctnQty ? parseInt(form.ctnQty, 10) : undefined,
      }
      const res = await createItem(payload)
      if (!res.success) {
        setCreateError(res.message ?? 'Failed to create item')
        return
      }

      // Send to POS
      try {
        await sendToPos([{ barcode: form.barcode.trim() }])
      } catch {
        // Non-fatal: item created but POS send failed
      }

      setCreatedBarcode(form.barcode.trim())
      setStep(4)
      onSuccess?.()
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create item')
    } finally {
      setCreating(false)
    }
  }

  // ── Step 4: Print label ───────────────────────────────────────────────────
  async function handlePrintLabel() {
    setPrinting(true)
    setPrintError('')
    try {
      await printLabel(createdBarcode)
      setPrintDone(true)
    } catch (err) {
      setPrintError(err instanceof Error ? err.message : 'Print failed')
    } finally {
      setPrinting(false)
    }
  }

  function handleAddAnother() {
    reset()
  }

  function handleDone() {
    reset()
    onClose()
  }

  // ── Validation helpers ────────────────────────────────────────────────────
  const step2Valid =
    form.description.trim().length > 0 &&
    form.departmentCode > 0 &&
    form.sellPrice !== '' &&
    parseFloat(form.sellPrice) > 0

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-t-2xl p-6 space-y-4 pb-safe max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {(step === 2 || step === 3) && (
              <button
                onClick={() => setStep(step - 1)}
                className="p-1 text-gray-400 hover:text-gray-600"
              >
                <ChevronLeft size={20} />
              </button>
            )}
            <h2 className="text-base font-semibold text-gray-900">New Product</h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-gray-400">{step}/4</span>
            <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Step indicator bar */}
        <div className="flex gap-1">
          {[1, 2, 3, 4].map((s) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full transition-colors ${
                s <= step ? 'bg-emerald-600' : 'bg-gray-200'
              }`}
            />
          ))}
        </div>

        {/* ── STEP 1: Barcode ──────────────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs text-gray-500">Barcode</label>
              <input
                type="text"
                inputMode="numeric"
                autoFocus
                value={form.barcode}
                onChange={(e) => {
                  setForm((f) => ({ ...f, barcode: e.target.value }))
                  setExistsWarning(false)
                  setError('')
                }}
                placeholder="Scan or enter barcode"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
              />
              {error && <p className="text-xs text-red-600">{error}</p>}
            </div>

            {existsWarning && existsResult && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                <p className="text-sm font-medium text-amber-800">Product already exists</p>
                <p className="text-xs text-amber-700">
                  {existsResult.items[0]?.description} &mdash; ${existsResult.items[0]?.sellPrice.toFixed(2)}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setExistsWarning(false)
                      setStep(2)
                    }}
                    className="flex-1 py-1.5 text-xs font-medium rounded-lg bg-amber-600 text-white"
                  >
                    Continue Anyway
                  </button>
                  <button
                    onClick={() => {
                      setExistsWarning(false)
                      setForm((f) => ({ ...f, barcode: '' }))
                    }}
                    className="flex-1 py-1.5 text-xs font-medium rounded-lg bg-gray-100 text-gray-700"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <button
              onClick={handleCheckBarcode}
              disabled={checking || !form.barcode.trim()}
              className="w-full py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-lg disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {checking ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Checking...
                </>
              ) : (
                <>
                  Next
                  <ChevronRight size={16} />
                </>
              )}
            </button>
          </div>
        )}

        {/* ── STEP 2: Details ──────────────────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs text-gray-500">Description</label>
              <input
                type="text"
                autoFocus
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Product description"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-gray-500">Department</label>
              {deptsLoading ? (
                <div className="flex items-center gap-2 text-xs text-gray-400 py-2">
                  <Loader2 size={14} className="animate-spin" />
                  Loading departments...
                </div>
              ) : (
                <select
                  value={form.departmentCode}
                  onChange={(e) => setForm((f) => ({ ...f, departmentCode: Number(e.target.value) }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300"
                >
                  <option value={0} disabled>
                    Select department
                  </option>
                  {departments.map((d) => (
                    <option key={d.code} value={d.code}>
                      {d.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-gray-500">Sell Price ($)</label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={form.sellPrice}
                  onChange={(e) => setForm((f) => ({ ...f, sellPrice: e.target.value }))}
                  placeholder="0.00"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-300"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-500">Cost Price ($)</label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={form.costPrice}
                  onChange={(e) => setForm((f) => ({ ...f, costPrice: e.target.value }))}
                  placeholder="Optional"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-300"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-gray-500">Carton Qty</label>
                <input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  value={form.ctnQty}
                  onChange={(e) => setForm((f) => ({ ...f, ctnQty: e.target.value }))}
                  placeholder="Optional"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-300"
                />
              </div>
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.isGstFree}
                    onChange={(e) => setForm((f) => ({ ...f, isGstFree: e.target.checked }))}
                    className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  GST Free
                </label>
              </div>
            </div>

            <button
              onClick={() => setStep(3)}
              disabled={!step2Valid}
              className="w-full py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-lg disabled:opacity-50 flex items-center justify-center gap-2"
            >
              Review
              <ChevronRight size={16} />
            </button>
          </div>
        )}

        {/* ── STEP 3: Review ───────────────────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-lg p-4 space-y-2">
              <Row label="Barcode" value={form.barcode} />
              <Row label="Description" value={form.description} />
              <Row label="Department" value={deptName} />
              <Row label="Sell Price" value={`$${parseFloat(form.sellPrice).toFixed(2)}`} />
              {form.costPrice && (
                <Row label="Cost Price" value={`$${parseFloat(form.costPrice).toFixed(2)}`} />
              )}
              {form.ctnQty && <Row label="Carton Qty" value={form.ctnQty} />}
              <Row label="GST" value={form.isGstFree ? 'GST Free' : 'Incl. GST'} />
            </div>

            {createError && (
              <div className="flex items-center gap-2 px-3 py-2 bg-red-50 text-red-700 rounded-lg text-sm">
                <X size={16} className="shrink-0" />
                <span>{createError}</span>
              </div>
            )}

            <button
              onClick={handleCreate}
              disabled={creating}
              className="w-full py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-lg disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {creating ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Check size={16} />
                  Create &amp; Send to POS
                </>
              )}
            </button>
          </div>
        )}

        {/* ── STEP 4: Success ──────────────────────────────────────────── */}
        {step === 4 && (
          <div className="space-y-4">
            <div className="flex flex-col items-center py-4">
              <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mb-3">
                <Check size={24} className="text-emerald-600" />
              </div>
              <p className="text-sm font-semibold text-gray-900">Product Created</p>
              <p className="text-xs text-gray-500 mt-1">
                {form.description} &mdash; {createdBarcode}
              </p>
            </div>

            {printError && (
              <div className="flex items-center gap-2 px-3 py-2 bg-red-50 text-red-700 rounded-lg text-sm">
                <X size={16} className="shrink-0" />
                <span>{printError}</span>
              </div>
            )}

            {printDone && (
              <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 text-emerald-700 rounded-lg text-sm">
                <Check size={16} />
                <span>Label sent to printer</span>
              </div>
            )}

            <div className="space-y-2">
              <button
                onClick={handlePrintLabel}
                disabled={printing || printDone}
                className="w-full py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-lg disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {printing ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Printing...
                  </>
                ) : printDone ? (
                  <>
                    <Check size={16} />
                    Printed
                  </>
                ) : (
                  <>
                    <Printer size={16} />
                    Print Label
                  </>
                )}
              </button>

              <button
                onClick={handleAddAnother}
                className="w-full py-2.5 bg-emerald-50 text-emerald-600 text-sm font-medium rounded-lg flex items-center justify-center gap-2"
              >
                <Plus size={16} />
                Add Another
              </button>

              <button
                onClick={handleDone}
                className="w-full py-2.5 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-900 font-medium text-right">{value}</span>
    </div>
  )
}
