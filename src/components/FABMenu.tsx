import { useState, useEffect, useCallback } from 'react'
import { Plus, X, ScanBarcode, DollarSign, Printer, Tag, Clock, PackagePlus } from 'lucide-react'

interface FABMenuProps {
  onSmartScan: () => void
  onCreateProduct: () => void
  onChangePrice: () => void
  onAddExpiry: () => void
  onBulkPrint: () => void
  onPromotions: () => void
}

const MENU_ITEMS = [
  { key: 'addExpiry',      label: 'Add Expiry',      icon: Clock,        color: 'text-purple-600', bg: 'bg-purple-50' },
  { key: 'promotions',     label: 'Promotions',      icon: Tag,          color: 'text-amber-600',  bg: 'bg-amber-50' },
  { key: 'bulkPrint',      label: 'Bulk Print',      icon: Printer,      color: 'text-rose-600',   bg: 'bg-rose-50' },
  { key: 'changePrice',    label: 'Price Change',    icon: DollarSign,   color: 'text-amber-600',  bg: 'bg-amber-50' },
  { key: 'createProduct',  label: 'New Product',     icon: PackagePlus,  color: 'text-blue-600',   bg: 'bg-blue-50' },
  { key: 'smartScan',      label: 'Smart Scan',      icon: ScanBarcode,  color: 'text-emerald-600', bg: 'bg-emerald-50' },
] as const

export default function FABMenu({
  onSmartScan,
  onCreateProduct,
  onChangePrice,
  onAddExpiry,
  onBulkPrint,
  onPromotions,
}: FABMenuProps) {
  const [open, setOpen] = useState(false)

  const close = useCallback(() => setOpen(false), [])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, close])

  const callbacks: Record<string, () => void> = {
    smartScan: onSmartScan,
    createProduct: onCreateProduct,
    changePrice: onChangePrice,
    addExpiry: onAddExpiry,
    bulkPrint: onBulkPrint,
    promotions: onPromotions,
  }

  function handleAction(key: string) {
    close()
    callbacks[key]?.()
  }

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="absolute inset-0 z-40 bg-black/30 transition-opacity"
          onClick={close}
        />
      )}

      {/* FAB container — bottom right, above tab bar */}
      <div className="absolute bottom-14 right-3 z-50 flex flex-col items-end gap-3 pb-safe">
        {/* Menu items — stack upward */}
        {open && MENU_ITEMS.map(({ key, label, icon: Icon, color, bg }, i) => (
          <button
            key={key}
            onClick={() => handleAction(key)}
            className="flex items-center gap-2.5 pl-4 pr-3 py-2.5 bg-white rounded-full shadow-lg border border-gray-100 hover:shadow-xl active:scale-95 transition-all"
            style={{
              animation: `fab-item-in 0.2s ease-out ${i * 0.04}s both`,
            }}
          >
            <span className="text-sm font-medium text-gray-800 whitespace-nowrap">{label}</span>
            <span className={`w-9 h-9 rounded-full ${bg} flex items-center justify-center shrink-0`}>
              <Icon size={18} className={color} />
            </span>
          </button>
        ))}

        {/* FAB button */}
        <button
          onClick={() => setOpen(o => !o)}
          className={`w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-300 ${
            open
              ? 'bg-gray-700 rotate-[135deg] shadow-xl'
              : 'bg-emerald-600 hover:bg-emerald-700 rotate-0'
          }`}
          aria-label={open ? 'Close menu' : 'Quick actions'}
        >
          {open
            ? <X size={24} className="text-white" />
            : <Plus size={24} className="text-white" />
          }
        </button>
      </div>

      {/* Keyframe animation */}
      <style>{`
        @keyframes fab-item-in {
          from {
            opacity: 0;
            transform: translateY(12px) scale(0.9);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </>
  )
}
