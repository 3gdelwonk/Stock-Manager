import { useState, useEffect, useRef, useCallback } from 'react'
import {
  ShoppingCart, Milk, Snowflake, Apple, Beef, UtensilsCrossed, CakeSlice,
  Heart, Home, PawPrint, Baby, Cigarette, Store, Wine, GlassWater, Beer,
  RefreshCw, Search, X, Check,
} from 'lucide-react'
import {
  getCachedImageUrl, fetchAndCacheImage, deleteCachedImage,
  searchProductImages, saveSelectedImage,
  type ImageOption
} from '../lib/images'

interface ProductImageProps {
  itemCode: string
  description: string
  department: string
  barcode?: string | null
  size?: number
  className?: string
}

const DEPT_ICONS: Record<string, typeof ShoppingCart> = {
  GROCERY: ShoppingCart,
  DAIRY: Milk,
  FROZEN: Snowflake,
  'FRESH PRODUCE': Apple,
  'FRUIT & VEG': Apple,
  MEAT: Beef,
  BUTCHER: Beef,
  DELI: UtensilsCrossed,
  BAKERY: CakeSlice,
  'HEALTH & BEAUTY': Heart,
  HEALTH: Heart,
  HOUSEHOLD: Home,
  PET: PawPrint,
  BABY: Baby,
  TOBACCO: Cigarette,
  'GENERAL MERCHANDISE': Store,
  LIQUEURS: Wine,
  WINE: Wine,
  SPIRITS: GlassWater,
  BEER: Beer,
  'LIQUOR/MISC': GlassWater,
}

const DEPT_BG: Record<string, string> = {
  GROCERY: 'bg-emerald-50 text-emerald-300',
  DAIRY: 'bg-blue-50 text-blue-300',
  FROZEN: 'bg-indigo-50 text-indigo-300',
  'FRESH PRODUCE': 'bg-green-50 text-green-300',
  MEAT: 'bg-red-50 text-red-300',
  DELI: 'bg-orange-50 text-orange-300',
  BAKERY: 'bg-amber-50 text-amber-300',
  'HEALTH & BEAUTY': 'bg-pink-50 text-pink-300',
  HOUSEHOLD: 'bg-violet-50 text-violet-300',
  PET: 'bg-teal-50 text-teal-300',
  BABY: 'bg-rose-50 text-rose-300',
}

// ── Image Picker Modal ─────────────────────────────────────────────────────

function ImagePicker({ itemCode, description, department, barcode, onSelect, onClose }: {
  itemCode: string
  description: string
  department: string
  barcode?: string | null
  onSelect: (url: string) => void
  onClose: () => void
}) {
  const [options, setOptions] = useState<ImageOption[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    searchProductImages(itemCode, description, department, barcode)
      .then(results => { if (!cancelled) setOptions(results) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [itemCode, description, department, barcode])

  async function handlePick(url: string) {
    setSaving(true)
    await saveSelectedImage(itemCode, url)
    onSelect(url)
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl w-full max-w-sm max-h-[80vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-gray-900">Choose Image</h3>
            <p className="text-[10px] text-gray-400 truncate">{description}</p>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 shrink-0">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-3">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <Search size={20} className="text-emerald-400 animate-pulse" />
              <p className="text-xs text-gray-400">Searching for images...</p>
            </div>
          ) : options.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <p className="text-xs text-gray-400">No images found</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {options.map((opt, i) => (
                <button
                  key={i}
                  onClick={() => handlePick(opt.imageUrl)}
                  disabled={saving}
                  className="relative aspect-square rounded-lg overflow-hidden border-2 border-transparent hover:border-emerald-400 transition-colors disabled:opacity-50"
                >
                  <img
                    src={opt.imageUrl}
                    alt={opt.title}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                  <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent p-1">
                    <p className="text-[8px] text-white/80 truncate">{opt.source}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {saving && (
          <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
            <div className="flex items-center gap-2">
              <Check size={16} className="text-green-600" />
              <span className="text-sm text-gray-600">Saved</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function ProductImage({ itemCode, description, department, barcode, size = 48, className = '' }: ProductImageProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [showActions, setShowActions] = useState(false)
  const [refetching, setRefetching] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false
    // Only read from local cache — bulk prefetch handles fetching sequentially.
    // Triggering fetchAndCacheImage here would fire thousands of parallel requests
    // when the stock list renders all items, crashing the app.
    getCachedImageUrl(itemCode).then(cached => {
      if (cached && !cancelled) setImageUrl(cached)
    })

    // Listen for prefetch caching this item's image
    function onImageCached(e: Event) {
      const { itemCode: code, imageUrl: url } = (e as CustomEvent).detail
      if (code === itemCode && url && !cancelled) setImageUrl(url)
    }
    window.addEventListener('image-cached', onImageCached)
    return () => { cancelled = true; window.removeEventListener('image-cached', onImageCached) }
  }, [itemCode, description, department])

  const handleRefetch = useCallback(async () => {
    setRefetching(true)
    setShowActions(false)
    await deleteCachedImage(itemCode)
    setImageUrl(null)
    setFailed(false)
    const result = await fetchAndCacheImage(itemCode, description, department, barcode)
    setImageUrl(result.url)
    setRefetching(false)
  }, [itemCode, description, department, barcode])

  function handleChoose() {
    setShowActions(false)
    setShowPicker(true)
  }

  function handleImageSelected(url: string) {
    setImageUrl(url)
    setFailed(false)
    setShowPicker(false)
  }

  function startLongPress() {
    // For expanded images (≥80px), show actions immediately on tap
    // For small images, require long-press (400ms, reduced from 600ms)
    const delay = size >= 80 ? 0 : 400
    if (delay === 0) {
      setShowActions(prev => !prev) // toggle on tap for large images
      return
    }
    longPressTimer.current = setTimeout(() => {
      setShowActions(true)
    }, delay)
  }

  function cancelLongPress() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  const Icon = DEPT_ICONS[department] ?? ShoppingCart
  const bgClass = DEPT_BG[department] ?? 'bg-gray-50 text-gray-300'

  const touchHandlers = {
    onTouchStart: startLongPress,
    onTouchEnd: cancelLongPress,
    onTouchCancel: cancelLongPress,
    onMouseDown: startLongPress,
    onMouseUp: cancelLongPress,
    onMouseLeave: cancelLongPress,
  }

  if (refetching) {
    return (
      <div
        className={`rounded-lg flex items-center justify-center shrink-0 ${bgClass} ${className}`}
        style={{ width: size, height: size }}
      >
        <RefreshCw size={size * 0.4} className="animate-spin" />
      </div>
    )
  }

  const isLarge = size >= 80
  const btnSize = isLarge ? 18 : 12
  const btnPad = isLarge ? 'p-2' : 'p-1'

  const actionButtons = showActions && (
    <div className={`absolute ${isLarge ? '-top-2 -right-2' : '-top-1 -right-1'} z-10 flex flex-col gap-1`}>
      <button
        onClick={handleRefetch}
        className={`bg-emerald-600 text-white rounded-full ${btnPad} shadow-lg active:scale-95 transition-transform`}
        title="Re-fetch image"
      >
        <RefreshCw size={btnSize} />
      </button>
      <button
        onClick={handleChoose}
        className={`bg-blue-600 text-white rounded-full ${btnPad} shadow-lg active:scale-95 transition-transform`}
        title="Choose image"
      >
        <Search size={btnSize} />
      </button>
    </div>
  )

  const picker = showPicker && (
    <ImagePicker
      itemCode={itemCode}
      description={description}
      department={department}
      barcode={barcode}
      onSelect={handleImageSelected}
      onClose={() => setShowPicker(false)}
    />
  )

  if (!imageUrl || failed) {
    return (
      <div className="relative">
        <div
          className={`rounded-lg flex items-center justify-center shrink-0 ${bgClass} ${className}`}
          style={{ width: size, height: size }}
          {...touchHandlers}
        >
          <Icon size={size * 0.5} />
        </div>
        {actionButtons}
        {picker}
      </div>
    )
  }

  return (
    <div className="relative">
      <img
        src={imageUrl}
        alt={description}
        className={`rounded-lg object-cover shrink-0 ${className}`}
        style={{ width: size, height: size }}
        onError={() => setFailed(true)}
        loading="lazy"
        {...touchHandlers}
      />
      {actionButtons}
      {picker}
    </div>
  )
}
