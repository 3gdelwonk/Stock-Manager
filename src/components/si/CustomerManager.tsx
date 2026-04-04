import { useState, useEffect, useMemo } from 'react'
import {
  Search, ArrowLeft, RefreshCw, Users, ChevronDown, ChevronUp,
} from 'lucide-react'
import {
  getAccounts, getAccountTransactions,
  type CustomerAccount, type CustomerTransaction,
} from '../../lib/jarvis'

function fmtMoney(n: number) { return n.toFixed(2) }

// ── Monthly summary helper ──────────────────────────────────────────────────

interface MonthlySummary {
  month: string // 'YYYY-MM'
  label: string // 'Apr 2026'
  charges: number
  payments: number
  net: number
  txCount: number
  transactions: CustomerTransaction[]
}

function groupByMonth(txns: CustomerTransaction[]): MonthlySummary[] {
  const map = new Map<string, CustomerTransaction[]>()
  for (const tx of txns) {
    const month = tx.date.slice(0, 7) // 'YYYY-MM'
    if (!map.has(month)) map.set(month, [])
    map.get(month)!.push(tx)
  }

  const result: MonthlySummary[] = []
  for (const [month, txs] of map) {
    const [y, m] = month.split('-')
    const label = new Date(parseInt(y), parseInt(m) - 1).toLocaleString('en-AU', { month: 'short', year: 'numeric' })
    const charges = txs.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0)
    const payments = txs.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0)
    result.push({ month, label, charges, payments, net: charges - payments, txCount: txs.length, transactions: txs })
  }

  result.sort((a, b) => b.month.localeCompare(a.month))
  return result
}

// ── Main component ──────────────────────────────────────────────────────────

export default function CustomerManager() {
  const [accounts, setAccounts] = useState<CustomerAccount[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  // Detail view
  const [selected, setSelected] = useState<CustomerAccount | null>(null)
  const [transactions, setTransactions] = useState<CustomerTransaction[]>([])
  const [txLoading, setTxLoading] = useState(false)
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null)

  // Fetch accounts
  useEffect(() => {
    setLoading(true)
    setError(null)
    getAccounts()
      .then(setAccounts)
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false))
  }, [])

  // Fetch transactions when account selected
  useEffect(() => {
    if (!selected) return
    setTxLoading(true)
    setExpandedMonth(null)
    getAccountTransactions(selected.accountNumber)
      .then(setTransactions)
      .catch(() => setTransactions([]))
      .finally(() => setTxLoading(false))
  }, [selected])

  const filteredAccounts = useMemo(() => {
    if (!search.trim()) return accounts
    const q = search.toLowerCase()
    return accounts.filter(a =>
      a.name.toLowerCase().includes(q) ||
      a.accountNumber.toLowerCase().includes(q) ||
      (a.phone && a.phone.includes(q))
    )
  }, [accounts, search])

  const monthlySummaries = useMemo(() => groupByMonth(transactions), [transactions])

  const totalOutstanding = useMemo(() => accounts.reduce((s, a) => s + a.balance, 0), [accounts])

  function handleBack() {
    setSelected(null)
    setTransactions([])
  }

  // ── Detail view ──────────────────────────────────────────────────────────

  if (selected) {
    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={handleBack} className="p-2 hover:bg-gray-100 rounded-lg"><ArrowLeft size={18} /></button>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-gray-900">{selected.name}</h2>
            <p className="text-xs text-gray-500">Account #{selected.accountNumber}{selected.phone ? ` | ${selected.phone}` : ''}</p>
          </div>
        </div>

        {/* Account summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-gray-200 p-3">
            <p className="text-[10px] text-gray-400 uppercase">Balance</p>
            <p className={`text-xl font-bold ${selected.balance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
              ${fmtMoney(Math.abs(selected.balance))}
            </p>
            <p className="text-[10px] text-gray-400">{selected.balance > 0 ? 'Owing' : 'Credit'}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-3">
            <p className="text-[10px] text-gray-400 uppercase">Credit Limit</p>
            <p className="text-xl font-bold text-gray-900">${fmtMoney(selected.creditLimit)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-3">
            <p className="text-[10px] text-gray-400 uppercase">Transactions</p>
            <p className="text-xl font-bold text-gray-900">{transactions.length}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-3">
            <p className="text-[10px] text-gray-400 uppercase">Status</p>
            <p className={`text-xl font-bold ${selected.active ? 'text-emerald-600' : 'text-gray-400'}`}>
              {selected.active ? 'Active' : 'Inactive'}
            </p>
          </div>
        </div>

        {/* Monthly summaries */}
        {txLoading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw size={20} className="text-gray-400 animate-spin" />
          </div>
        ) : monthlySummaries.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">No transactions found</div>
        ) : (
          <div className="space-y-2">
            {monthlySummaries.map(ms => (
              <div key={ms.month} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <button
                  onClick={() => setExpandedMonth(expandedMonth === ms.month ? null : ms.month)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-gray-900">{ms.label}</span>
                    <span className="text-xs text-gray-400">{ms.txCount} transactions</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <span className="text-xs text-red-500">+${fmtMoney(ms.charges)}</span>
                      <span className="text-xs text-gray-300 mx-1">|</span>
                      <span className="text-xs text-emerald-500">-${fmtMoney(ms.payments)}</span>
                    </div>
                    <span className={`text-sm font-bold ${ms.net > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                      ${fmtMoney(Math.abs(ms.net))}
                    </span>
                    {expandedMonth === ms.month ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                  </div>
                </button>

                {expandedMonth === ms.month && (
                  <div className="border-t border-gray-100 divide-y divide-gray-50">
                    {ms.transactions.map(tx => (
                      <div key={tx.id} className="flex items-center justify-between px-4 py-2 text-sm">
                        <div className="min-w-0 flex-1">
                          <p className="text-gray-900 truncate">{tx.description}</p>
                          <div className="flex items-center gap-2 text-xs text-gray-400">
                            <span>{new Date(tx.date).toLocaleDateString('en-AU', { day: '2-digit', month: 'short' })}</span>
                            <span className="px-1 py-0.5 bg-gray-100 rounded text-[10px]">{tx.type}</span>
                            {tx.reference && <span className="font-mono">{tx.reference}</span>}
                          </div>
                        </div>
                        <div className="text-right shrink-0 ml-3">
                          <p className={`font-bold ${tx.amount > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                            {tx.amount > 0 ? '+' : '-'}${fmtMoney(Math.abs(tx.amount))}
                          </p>
                          <p className="text-[10px] text-gray-400">Bal: ${fmtMoney(tx.balance)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ── Summary view (account list) ───────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-3">
          <p className="text-[10px] text-gray-400 uppercase">Total Accounts</p>
          <p className="text-xl font-bold text-gray-900">{accounts.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-3">
          <p className="text-[10px] text-gray-400 uppercase">Total Outstanding</p>
          <p className={`text-xl font-bold ${totalOutstanding > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
            ${fmtMoney(Math.abs(totalOutstanding))}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-3">
          <p className="text-[10px] text-gray-400 uppercase">Active</p>
          <p className="text-xl font-bold text-emerald-600">{accounts.filter(a => a.active).length}</p>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-2">
        <Search size={14} className="text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, account number, or phone"
          className="flex-1 bg-transparent text-sm outline-none" />
        {loading && <RefreshCw size={14} className="text-gray-400 animate-spin" />}
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 text-xs px-3 py-2 rounded-lg">{error}</div>
      )}

      {/* Account list */}
      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        {filteredAccounts.length === 0 ? (
          <div className="py-12 text-center">
            <Users size={24} className="text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">{loading ? 'Loading accounts...' : 'No accounts found'}</p>
          </div>
        ) : (
          filteredAccounts.map(acct => (
            <button
              key={acct.accountNumber}
              onClick={() => setSelected(acct)}
              className="w-full text-left flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900">{acct.name}</p>
                <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                  <span className="font-mono">#{acct.accountNumber}</span>
                  {acct.phone && <span>{acct.phone}</span>}
                  {!acct.active && <span className="text-[10px] px-1 py-0.5 bg-gray-100 text-gray-400 rounded">Inactive</span>}
                </div>
              </div>
              <div className="text-right shrink-0 ml-3">
                <p className={`text-sm font-bold ${acct.balance > 0 ? 'text-red-600' : acct.balance < 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
                  ${fmtMoney(Math.abs(acct.balance))}
                </p>
                <p className="text-[10px] text-gray-400">
                  {acct.balance > 0 ? 'Owing' : acct.balance < 0 ? 'Credit' : 'Clear'}
                </p>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
