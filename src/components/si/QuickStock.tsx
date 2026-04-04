import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { DollarSign, Package, Clock, Trash2, Printer, Search } from 'lucide-react'
import { db } from '../../lib/db'
import { changeAndSend, adjustStock, printLabel, getOnlinePrices } from '../../lib/jarvis'
import { addExpiryBatch, markAsWaste } from '../../lib/expiry'
import QuickActionTile from './QuickActionTile'
import QuickActionModal from './QuickActionModal'

type ActionType = 'price-change' | 'stock-adjust' | 'expiry-batch' | 'waste-log' | 'label-print' | 'price-check'

const TILES: { type: ActionType; icon: typeof DollarSign; title: string; subtitle: string; bg: string }[] = [
  { type: 'price-change', icon: DollarSign, title: 'Change Price', subtitle: 'Update & send to POS', bg: 'bg-emerald-50' },
  { type: 'stock-adjust', icon: Package, title: 'Adjust Stock', subtitle: 'Count correction', bg: 'bg-blue-50' },
  { type: 'expiry-batch', icon: Clock, title: 'Add Expiry', subtitle: 'New batch tracking', bg: 'bg-amber-50' },
  { type: 'waste-log', icon: Trash2, title: 'Log Waste', subtitle: 'Record write-offs', bg: 'bg-red-50' },
  { type: 'label-print', icon: Printer, title: 'Print Label', subtitle: 'Shelf edge labels', bg: 'bg-purple-50' },
  { type: 'price-check', icon: Search, title: 'Price Check', subtitle: 'Online comparison', bg: 'bg-teal-50' },
]

const ACTION_TITLES: Record<ActionType, string> = {
  'price-change': 'Change Price',
  'stock-adjust': 'Adjust Stock',
  'expiry-batch': 'Add Expiry Batch',
  'waste-log': 'Log Waste',
  'label-print': 'Print Label',
  'price-check': 'Price Check',
}

export default function QuickStock() {
  const [activeAction, setActiveAction] = useState<ActionType | null>(null)

  // Today's activity log
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayStr = todayStart.toISOString()
  const activityLog = useLiveQuery(
    () => db.quickActionLog.where('performedAt').aboveOrEqual(todayStr).reverse().toArray(),
    [todayStr],
  )

  const executeAction = async (actionType: ActionType, barcode: string, _productName: string, details: Record<string, unknown>) => {
    switch (actionType) {
      case 'price-change':
        await changeAndSend(details.itemCode as string, Number(details.newPrice), details.reason as string || 'manual')
        break
      case 'stock-adjust':
        await adjustStock(details.itemCode as string, Number(details.newQoh), details.reason as string || 'count')
        break
      case 'expiry-batch':
        await addExpiryBatch({
          barcode,
          itemCode: details.itemCode as string,
          productName: _productName,
          department: 'other',
          expiryDate: details.expiryDate as string,
          qtyReceived: Number(details.qty),
          qtyRemaining: Number(details.qty),
          status: 'active',
          receivedDate: new Date().toISOString().slice(0, 10),
        })
        break
      case 'label-print':
        await printLabel(barcode, Number(details.qty) || 1)
        break
      case 'price-check':
        await getOnlinePrices(details.itemCode as string)
        break
      case 'waste-log': {
        // Find active batch for this barcode, or create a waste entry directly
        const batches = await db.expiryBatches.where('barcode').equals(barcode).and(b => b.status === 'active').toArray()
        if (batches.length > 0 && batches[0].id) {
          await markAsWaste(
            batches[0].id,
            Number(details.qty) || 1,
            (details.reason as 'expired' | 'damaged' | 'quality' | 'recall' | 'other') || 'other',
            0, 0,
            details.claimable === 'true',
            details.notes as string,
          )
        }
        break
      }
    }
  }

  return (
    <div className="space-y-6">
      {/* Action tiles */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {TILES.map(tile => (
          <QuickActionTile
            key={tile.type}
            icon={tile.icon}
            title={tile.title}
            subtitle={tile.subtitle}
            bgColor={tile.bg}
            onClick={() => setActiveAction(tile.type)}
          />
        ))}
      </div>

      {/* Activity log */}
      <div className="bg-white rounded-xl border border-gray-100">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="text-[13px] font-semibold text-gray-900">Today's Activity</h3>
        </div>
        <div className="divide-y divide-gray-50 max-h-64 overflow-y-auto">
          {(!activityLog || activityLog.length === 0) ? (
            <p className="text-xs text-gray-400 text-center py-6">No actions logged today</p>
          ) : (
            activityLog.map(entry => (
              <div key={entry.id} className="px-4 py-2.5 flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full shrink-0 ${
                  entry.syncStatus === 'synced' ? 'bg-emerald-400' :
                  entry.syncStatus === 'failed' ? 'bg-red-400' : 'bg-amber-400'
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-700 truncate">{entry.productName}</p>
                  <p className="text-[10px] text-gray-400">{entry.actionType} · {new Date(entry.performedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Modal */}
      {activeAction && (
        <QuickActionModal
          open={!!activeAction}
          onClose={() => setActiveAction(null)}
          actionType={activeAction}
          title={ACTION_TITLES[activeAction]}
          onExecute={(barcode, name, details) => executeAction(activeAction, barcode, name, details)}
        />
      )}
    </div>
  )
}
