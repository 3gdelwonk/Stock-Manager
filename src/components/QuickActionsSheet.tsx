import { ScanBarcode, Plus, DollarSign, Clock } from 'lucide-react'

interface QuickActionsSheetProps {
  open: boolean
  onClose: () => void
  onSmartScan: () => void
  onCreateProduct: () => void
  onChangePrice: () => void
  onAddExpiry: () => void
}

const actions = [
  {
    label: 'Smart Scan',
    description: 'Scan barcode or product photo',
    icon: ScanBarcode,
    bg: 'bg-emerald-500',
    key: 'smartScan',
  },
  {
    label: 'New Product',
    description: 'Create and send to POS',
    icon: Plus,
    bg: 'bg-blue-500',
    key: 'createProduct',
  },
  {
    label: 'Change Price',
    description: 'Search or scan to change price',
    icon: DollarSign,
    bg: 'bg-amber-500',
    key: 'changePrice',
  },
  {
    label: 'Add Expiry',
    description: 'Track expiry dates on items',
    icon: Clock,
    bg: 'bg-purple-500',
    key: 'addExpiry',
  },
] as const

export default function QuickActionsSheet({
  open,
  onClose,
  onSmartScan,
  onCreateProduct,
  onChangePrice,
  onAddExpiry,
}: QuickActionsSheetProps) {
  if (!open) return null

  const callbacks: Record<string, () => void> = {
    smartScan: onSmartScan,
    createProduct: onCreateProduct,
    changePrice: onChangePrice,
    addExpiry: onAddExpiry,
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
        <div className="px-4 pb-3 border-b border-gray-100 shrink-0">
          <h2 className="text-base font-semibold text-gray-900">Quick Actions</h2>
        </div>

        {/* 2x2 Grid */}
        <div className="px-4 py-4 grid grid-cols-2 gap-3">
          {actions.map(({ label, description, icon: Icon, bg, key }) => (
            <button
              key={key}
              onClick={() => handleAction(key)}
              className="rounded-xl p-4 bg-white border border-gray-100 shadow-sm text-left hover:shadow-md transition-shadow active:scale-[0.98]"
            >
              <div className={`w-10 h-10 ${bg} rounded-lg flex items-center justify-center mb-3`}>
                <Icon size={24} className="text-white" />
              </div>
              <p className="text-sm font-bold text-gray-900">{label}</p>
              <p className="text-xs text-gray-500 mt-0.5">{description}</p>
            </button>
          ))}
        </div>
      </div>
    </>
  )
}
