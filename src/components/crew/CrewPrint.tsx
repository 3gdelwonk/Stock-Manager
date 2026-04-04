import { useState, useCallback } from 'react'
import { ScanBarcode, Printer, Check, AlertCircle, Plus, Minus } from 'lucide-react'
import { searchItems, printLabel } from '../../lib/jarvis'
import { resolveBarcode } from '../../lib/barcodeResolver'
import BarcodeScanner from '../BarcodeScanner'
import ProductImage from '../ProductImage'

interface PrintProduct {
  itemCode: string
  barcode: string
  description: string
  department: string
  sellPrice: number
}

export default function CrewPrint() {
  const [scannerOpen, setScannerOpen] = useState(false)
  const [product, setProduct] = useState<PrintProduct | null>(null)
  const [qty, setQty] = useState(1)
  const [loading, setLoading] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [result, setResult] = useState<{ kind: 'success' | 'error'; msg: string } | null>(null)

  const lookupBarcode = useCallback(async (code: string) => {
    const trimmed = code.trim()
    if (!trimmed) return
    setLoading(true)
    setResult(null)
    setProduct(null)
    try {
      // Try alias resolver first (resolves alternate barcodes)
      const resolved = await resolveBarcode(trimmed)
      if (resolved) {
        setProduct({
          itemCode: resolved.itemCode,
          barcode: resolved.primaryBarcode || trimmed,
          description: resolved.description,
          department: '',
          sellPrice: 0,
        })
        // Enrich with full data from search
        const res = await searchItems(resolved.primaryBarcode || resolved.itemCode, 1)
        if (res.items?.length > 0) {
          const item = res.items[0]
          setProduct({
            itemCode: item.itemCode,
            barcode: resolved.primaryBarcode || item.barcode || trimmed,
            description: item.description,
            department: item.department,
            sellPrice: item.sellPrice,
          })
        }
        setQty(1)
      } else {
        setResult({ kind: 'error', msg: 'Product not found' })
      }
    } catch {
      setResult({ kind: 'error', msg: 'Search failed — check connection' })
    } finally {
      setLoading(false)
    }
  }, [])

  function handleScan(code: string) {
    setScannerOpen(false)
    lookupBarcode(code)
  }

  async function handlePrint() {
    if (!product) return
    setPrinting(true)
    setResult(null)
    try {
      await printLabel(product.barcode, qty)
      setResult({ kind: 'success', msg: `${qty} label${qty > 1 ? 's' : ''} queued for printing` })
      setTimeout(() => { setProduct(null); setResult(null) }, 2500)
    } catch (err) {
      setResult({ kind: 'error', msg: err instanceof Error ? err.message : 'Print failed' })
    } finally {
      setPrinting(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-4 py-6">
        {/* Scan prompt */}
        {!product && !loading && (
          <div className="text-center space-y-4 pt-8">
            <button
              onClick={() => setScannerOpen(true)}
              className="mx-auto w-24 h-24 rounded-2xl bg-emerald-50 flex items-center justify-center hover:bg-emerald-100 transition-colors"
            >
              <ScanBarcode size={40} className="text-emerald-500" />
            </button>
            <div>
              <p className="text-sm font-medium text-gray-700">Scan barcode to print label</p>
              <p className="text-xs text-gray-400 mt-1">Point camera at product barcode</p>
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <p className="text-sm text-gray-400 text-center py-8 animate-pulse">Looking up product...</p>
        )}

        {/* Product found */}
        {product && (
          <div className="space-y-5">
            <div className="flex items-start gap-3">
              <ProductImage
                itemCode={product.itemCode}
                description={product.description}
                department={product.department}
                barcode={product.barcode}
                size={64}
                className="rounded-xl shadow-sm"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 leading-tight">{product.description}</p>
                <span className="inline-block mt-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
                  {product.department}
                </span>
                <p className="text-lg font-bold text-emerald-600 mt-1">${product.sellPrice.toFixed(2)}</p>
              </div>
            </div>

            {/* Quantity selector */}
            <div className="flex items-center justify-center gap-6">
              <button
                onClick={() => setQty(q => Math.max(1, q - 1))}
                className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
              >
                <Minus size={20} className="text-gray-600" />
              </button>
              <div className="text-center">
                <p className="text-3xl font-bold text-gray-900">{qty}</p>
                <p className="text-xs text-gray-400">label{qty > 1 ? 's' : ''}</p>
              </div>
              <button
                onClick={() => setQty(q => Math.min(20, q + 1))}
                className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
              >
                <Plus size={20} className="text-gray-600" />
              </button>
            </div>

            {/* Print button */}
            <button
              onClick={handlePrint}
              disabled={printing}
              className="w-full py-3.5 text-sm font-semibold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              {printing ? (
                <span className="animate-pulse">Printing...</span>
              ) : (
                <>
                  <Printer size={18} /> Print {qty} Label{qty > 1 ? 's' : ''}
                </>
              )}
            </button>

            {/* Scan another */}
            <button
              onClick={() => { setProduct(null); setResult(null); setScannerOpen(true) }}
              className="w-full text-xs text-emerald-600 font-medium py-2"
            >
              Scan another product
            </button>
          </div>
        )}

        {/* Result message */}
        {result && (
          <div className={`mt-4 flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
            result.kind === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}>
            {result.kind === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
            <span>{result.msg}</span>
          </div>
        )}
      </div>

      <BarcodeScanner open={scannerOpen} onScan={handleScan} onClose={() => setScannerOpen(false)} />
    </div>
  )
}
