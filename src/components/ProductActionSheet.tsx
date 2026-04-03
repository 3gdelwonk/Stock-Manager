import { DollarSign, PackageMinus, Printer, Clock, Search, Plus, X } from 'lucide-react'
import { DEPARTMENT_LABELS } from '../lib/constants'

interface ProductInfo {
  itemCode: string
  barcode: string
  name: string
  department: string
  sellPrice: number
}

interface ProductActionSheetProps {
  open: boolean
  product: ProductInfo | null
  onClose: () => void
  onChangePrice: () => void
  onAdjustStock: () => void
  onPrintLabel: () => void
  onAddExpiry: () => void
  onViewInStock: () => void
  onCreateNew: () => void
  notFound?: boolean
}

const actionButtons = [
  { label: 'Change Price', icon: DollarSign, bg: 'bg-emerald-500', key: 'changePrice' },
  { label: 'Adjust Stock', icon: PackageMinus, bg: 'bg-blue-500', key: 'adjustStock' },
  { label: 'Print Label', icon: Printer, bg: 'bg-gray-500', key: 'printLabel' },
  { label: 'Add Expiry', icon: Clock, bg: 'bg-amber-500', key: 'addExpiry' },
  { label: 'View in Stock', icon: Search, bg: 'bg-purple-500', key: 'viewInStock' },
] as const

export default function ProductActionSheet({
  open,
  product,
  onClose,
  onChangePrice,
  onAdjustStock,
  onPrintLabel,
  onAddExpiry,
  onViewInStock,
  onCreateNew,
  notFound,
}: ProductActionSheetProps) {
  if (!open) return null

  const callbacks: Record<string, () => void> = {
    changePrice: onChangePrice,
    adjustStock: onAdjustStock,
    printLabel: onPrintLabel,
    addExpiry: onAddExpiry,
    viewInStock: onViewInStock,
  }

  function handleAction(key: string) {
    callbacks[key]?.()
    onClose()
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />

      {/* Sheet */}
      <div className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-2xl shadow-2xl max-h-[85vh] flex flex-col animate-slide-up">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-3 border-b border-gray-100 shrink-0">
          <h2 className="text-base font-semibold text-gray-900">
            {notFound ? 'Product Not Found' : 'Product Actions'}
          </h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {notFound ? (
            /* Not found state */
            <div className="text-center py-6">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Search size={28} className="text-gray-400" />
              </div>
              <p className="text-sm text-gray-600 mb-4">
                This product was not found in the system.
              </p>
              <button
                onClick={() => {
                  onCreateNew()
                  onClose()
                }}
                className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition-colors"
              >
                <Plus size={16} />
                Create New Product
              </button>
            </div>
          ) : product ? (
            <>
              {/* Product info */}
              <div className="mb-4 pb-4 border-b border-gray-100">
                <p className="text-sm font-semibold text-gray-900">{product.name}</p>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-xs text-gray-500">
                    {DEPARTMENT_LABELS[product.department as keyof typeof DEPARTMENT_LABELS] || product.department}
                    {product.itemCode ? ` \u00B7 ${product.itemCode}` : ''}
                  </p>
                  <p className="text-base font-bold text-emerald-600">
                    ${product.sellPrice.toFixed(2)}
                  </p>
                </div>
              </div>

              {/* Action buttons grid */}
              <div className="grid grid-cols-3 gap-3">
                {actionButtons.map(({ label, icon: Icon, bg, key }) => (
                  <button
                    key={key}
                    onClick={() => handleAction(key)}
                    className="flex flex-col items-center gap-2 p-3 rounded-xl bg-white border border-gray-100 shadow-sm hover:shadow-md transition-shadow active:scale-[0.98]"
                  >
                    <div className={`w-10 h-10 ${bg} rounded-lg flex items-center justify-center`}>
                      <Icon size={20} className="text-white" />
                    </div>
                    <p className="text-xs font-medium text-gray-700 text-center">{label}</p>
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </>
  )
}
