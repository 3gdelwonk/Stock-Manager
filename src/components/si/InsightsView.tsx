import { useState, useEffect } from 'react'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import {
  Users, TrendingUp, DollarSign, Star,
  ShoppingCart, AlertCircle, CheckCircle, Calendar,
  Activity, Globe, BookOpen, RefreshCw,
} from 'lucide-react'

// ─── ABS Census 2021 — Camberwell (SAL 20453) ───────────────────────────────
// Source: ABS Census 2021 QuickStats, fetched 2026-04-10
const CAMBERWELL_DEMO = {
  population: 21965,
  medianAge: 43,
  medianWeeklyHHIncome: 2457,
  medianWeeklyFamilyIncome: 3264,
  medianWeeklyPersonalIncome: 1043,
  dwellingSeparateHouse: 60.1,
  dwellingSemiDetached: 21.7,
  dwellingApartment: 17.3,
  tenureOwnedOutright: 42.5,
  tenureOwnedMortgage: 29.2,
  tenureRented: 25.4,
  avgHouseholdSize: 2.6,
  avgCarsPerDwelling: 1.8,
  occupationProfessionals: 39.9,
  occupationManagers: 20.7,
  occupationClerical: 12.1,
  occupationSales: 8.3,
  occupationCommunity: 7.9,
  educationBachelor: 52.2,
  ancestryEnglish: 31.9,
  ancestryAustralian: 24.9,
  ancestryChinese: 15.8,
  ancestryIrish: 12.7,
  ancestryScottish: 10.8,
  bornOverseas: 34.2,
  mandarinSpoken: 9.3,
  nonEnglishHouseholds: 30.4,
  couplesWithChildren: 49.4,
  couplesWithoutChildren: 37.3,
  oneParentFamilies: 11.6,
  labourParticipation: 62.2,
  unemploymentRate: 4.2,
  melbourneMedianHHIncome: 1812,
}

// ─── Seasonal demand index (0–100 relative to annual mean) ──────────────────
const SEASONAL_DATA = [
  { month: 'Jan', premium: 75, beverages: 80, snacking: 82, convenience: 90, wellness: 85, label: 'Back to School' },
  { month: 'Feb', premium: 72, beverages: 75, snacking: 75, convenience: 85, wellness: 90, label: "Valentine's Day" },
  { month: 'Mar', premium: 78, beverages: 88, snacking: 90, convenience: 80, wellness: 85, label: 'AFL Season Starts' },
  { month: 'Apr', premium: 85, beverages: 88, snacking: 92, convenience: 75, wellness: 72, label: 'Easter' },
  { month: 'May', premium: 90, beverages: 95, snacking: 78, convenience: 80, wellness: 78, label: "Mother's Day" },
  { month: 'Jun', premium: 78, beverages: 82, snacking: 78, convenience: 95, wellness: 88, label: 'Winter Begins' },
  { month: 'Jul', premium: 72, beverages: 80, snacking: 80, convenience: 100, wellness: 90, label: 'School Holidays' },
  { month: 'Aug', premium: 75, beverages: 90, snacking: 78, convenience: 92, wellness: 85, label: "Father's Day" },
  { month: 'Sep', premium: 80, beverages: 98, snacking: 100, convenience: 82, wellness: 82, label: 'AFL Finals' },
  { month: 'Oct', premium: 82, beverages: 85, snacking: 82, convenience: 78, wellness: 78, label: 'Spring Produce' },
  { month: 'Nov', premium: 90, beverages: 100, snacking: 85, convenience: 80, wellness: 72, label: 'Melbourne Cup' },
  { month: 'Dec', premium: 100, beverages: 100, snacking: 98, convenience: 72, wellness: 65, label: 'Christmas Peak' },
]

// ─── Stock strategy recommendations ─────────────────────────────────────────
const STRATEGIES = [
  {
    score: 5,
    category: 'Premium & Organic Grocery',
    icon: Star,
    color: '#10b981',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    rationale: '52% hold bachelor degrees. Household income 36% above Melbourne median. Strong preference for quality-over-price.',
    examples: 'Organic produce, free-range eggs, artisan bread, specialty oils, premium pasta',
    avoid: 'Never lead with "budget" or "economy" messaging for this category.',
  },
  {
    score: 5,
    category: 'Premium Wine & Spirits',
    icon: DollarSign,
    color: '#8b5cf6',
    bg: 'bg-violet-50',
    border: 'border-violet-200',
    rationale: 'Affluent entertaining households. 49% are couples with children — family gatherings, dinner parties. Highest ROI per linear metre.',
    examples: 'Premium Australian wine ($20–$60), craft beer, imported spirits, Champagne/Prosecco',
    avoid: 'Low-end cask wine. Price-led alcohol promotions devalue the category.',
  },
  {
    score: 5,
    category: 'Asian Grocery & Specialty',
    icon: Globe,
    color: '#f59e0b',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    rationale: 'Chinese ancestry 15.8%, Mandarin spoken in 9.3% of households. Born overseas 34.2%. Growing multicultural demand.',
    examples: 'Asian sauces, rice varieties, noodles, tofu, coconut milk, dumpling wrappers, mirin, miso',
    avoid: 'Token range — commit to full aisle depth for this community.',
  },
  {
    score: 4,
    category: 'Health & Wellness',
    icon: Activity,
    color: '#06b6d4',
    bg: 'bg-cyan-50',
    border: 'border-cyan-200',
    rationale: 'Professionals and managers (60.6% combined) are health-conscious. High education = strong nutritional awareness.',
    examples: 'Vitamins, protein bars, low-sugar snacks, kombucha, functional beverages, Greek yoghurt, nuts',
    avoid: 'Overstock heavily processed snacks — this demographic reads labels.',
  },
  {
    score: 4,
    category: 'Deli & Specialty Foods',
    icon: ShoppingCart,
    color: '#ec4899',
    bg: 'bg-pink-50',
    border: 'border-pink-200',
    rationale: 'Average 2.6 people per household + high income = regular home entertaining. Professionals seek quality convenience.',
    examples: 'Premium cheese, charcuterie, olives, antipasto, hummus, pâté, specialty crackers',
    avoid: 'Poor deli presentation. Quality perception drives repurchase in this category.',
  },
  {
    score: 4,
    category: 'Convenience Meals',
    icon: RefreshCw,
    color: '#3b82f6',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    rationale: 'Time-poor professionals (39.9%). 62.2% labour participation. Dual-income households value quality convenience.',
    examples: 'Premium ready meals, meal kits, quality sushi, fresh pasta, pre-marinated proteins',
    avoid: 'Budget frozen meals — this segment pays for quality, not just speed.',
  },
  {
    score: 3,
    category: 'Baby & Family',
    icon: Users,
    color: '#84cc16',
    bg: 'bg-lime-50',
    border: 'border-lime-200',
    rationale: 'Families with children 49.4%. Affluent parents buy premium baby and children products without price hesitation.',
    examples: 'Organic baby food, premium nappies, children\'s snacks, lunchbox staples, school snacks',
    avoid: 'Understocking this category — family households are high-frequency shoppers.',
  },
]

// ─── CPI category config ─────────────────────────────────────────────────────
const CPI_CATEGORIES = [
  { code: '20001', name: 'Food overall', color: '#10b981' },
  { code: '30003', name: 'Meat & seafood', color: '#ef4444' },
  { code: '30001', name: 'Dairy', color: '#3b82f6' },
  { code: '30002', name: 'Bread & cereals', color: '#f59e0b' },
  { code: '114120', name: 'Fruit & veg', color: '#84cc16' },
  { code: '20006', name: 'Alcohol & tobacco', color: '#8b5cf6' },
]

type CpiPoint = { period: string; [key: string]: string | number }
type CpiCurrent = { name: string; value: number; color: string }

// ─── ABS CPI fetch ───────────────────────────────────────────────────────────
async function fetchMelbourneFoodCPI(): Promise<{ trend: CpiPoint[]; current: CpiCurrent[] }> {
  const url = '/abs-api/data/ABS,CPI/all?format=jsondata&detail=dataonly&startPeriod=2024-01'
  const res = await fetch(url)
  if (!res.ok) throw new Error(`ABS API ${res.status}`)
  const d = await res.json()

  const s = d.data.structures[0]
  const seriesDims = s.dimensions.series as { id: string; values: { id: string; name: string }[] }[]
  const obsDim = s.dimensions.observation[0].values as { id: string }[]

  const dimIdx = Object.fromEntries(seriesDims.map(dim => [dim.id, dim.values]))

  const findIdx = (dimId: string, codeId: string) =>
    dimIdx[dimId].findIndex(v => v.id === codeId)

  const melbIdx = findIdx('REGION', '2')
  const yoyIdx = findIdx('MEASURE', '3')
  const origIdx = findIdx('TSEST', '10')

  const catIndexMap: Record<number, { code: string; name: string; color: string }> = {}
  for (const cat of CPI_CATEGORIES) {
    const pos = findIdx('INDEX', cat.code)
    if (pos >= 0) catIndexMap[pos] = cat
  }

  const trendMap: Record<string, Record<string, number>> = {}
  const latestMap: Record<string, { value: number; color: string }> = {}

  const datasets = d.data.dataSets[0].series as Record<string, { observations: Record<string, number[]> }>
  for (const [key, val] of Object.entries(datasets)) {
    const parts = key.split(':').map(Number)
    if (
      parts[0] !== yoyIdx ||
      parts[3] !== melbIdx ||
      parts[2] !== origIdx ||
      dimIdx['FREQ'][parts[4]].id !== 'M'
    ) continue

    const cat = catIndexMap[parts[1]]
    if (!cat) continue

    for (const [tIdx, obsVal] of Object.entries(val.observations)) {
      const period = obsDim[parseInt(tIdx)].id
      if (!trendMap[period]) trendMap[period] = {}
      trendMap[period][cat.name] = Math.round(obsVal[0] * 10) / 10
    }
  }

  const trend = Object.entries(trendMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, vals]) => ({ period: period.replace(/^(\d{4})-(\d{2})$/, '$1-$2'), ...vals }))

  // Latest values
  const last = trend[trend.length - 1] as (Record<string, number | string> | undefined)
  if (last) {
    for (const cat of CPI_CATEGORIES) {
      const v = last[cat.name]
      if (typeof v === 'number') latestMap[cat.name] = { value: v, color: cat.color }
    }
  }

  const current: CpiCurrent[] = CPI_CATEGORIES
    .filter(c => latestMap[c.name])
    .map(c => ({ name: c.name, value: latestMap[c.name].value, color: latestMap[c.name].color }))
    .sort((a, b) => b.value - a.value)

  return { trend, current }
}

// ─── Sub-components ──────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color, icon: Icon }: {
  label: string; value: string; sub?: string; color: string; icon: typeof Users
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4" style={{ borderLeft: `3px solid ${color}` }}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">{label}</p>
          <p className="text-xl font-bold text-gray-900 mt-0.5">{value}</p>
          {sub && <p className="text-[11px] text-gray-500 mt-0.5">{sub}</p>}
        </div>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${color}18` }}>
          <Icon size={16} style={{ color }} />
        </div>
      </div>
    </div>
  )
}

function TabBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
        active ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      }`}
    >
      {label}
    </button>
  )
}

function ScoreDots({ score }: { score: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <div
          key={i}
          className={`w-2 h-2 rounded-full ${i <= score ? 'bg-emerald-500' : 'bg-gray-200'}`}
        />
      ))}
    </div>
  )
}

function CpiBar({ name, value }: { name: string; value: number; color: string }) {
  const urgency = value >= 5 ? 'text-red-600' : value >= 3 ? 'text-amber-600' : 'text-emerald-600'
  const barColor = value >= 5 ? '#ef4444' : value >= 3 ? '#f59e0b' : '#10b981'
  const pct = Math.min(100, Math.max(0, (value / 8) * 100))
  return (
    <div className="flex items-center gap-3">
      <p className="text-xs text-gray-600 w-36 shrink-0">{name}</p>
      <div className="flex-1 bg-gray-100 rounded-full h-2">
        <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, background: barColor }} />
      </div>
      <p className={`text-xs font-bold w-12 text-right ${urgency}`}>+{value}%</p>
    </div>
  )
}

// ─── Tabs ────────────────────────────────────────────────────────────────────
function ProfileTab() {
  const d = CAMBERWELL_DEMO
  const premium = ((d.medianWeeklyHHIncome - d.melbourneMedianHHIncome) / d.melbourneMedianHHIncome * 100).toFixed(0)

  return (
    <div className="space-y-5">
      {/* Hero stat */}
      <div className="bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-200/60 rounded-xl p-4">
        <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide mb-0.5">Camberwell (VIC 3124) — ABS Census 2021</p>
        <p className="text-sm text-gray-700">
          One of Melbourne's most affluent inner-eastern suburbs.
          Household income <span className="font-bold text-emerald-700">+{premium}%</span> above Melbourne median.
          Predominantly professional, highly educated, family-oriented.
        </p>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Population" value={d.population.toLocaleString()} sub="suburb total" color="#10b981" icon={Users} />
        <StatCard label="Median Age" value={`${d.medianAge} yrs`} sub="Melbourne avg: 37" color="#3b82f6" icon={Calendar} />
        <StatCard label="Median HH Income" value={`$${d.medianWeeklyHHIncome.toLocaleString()}/wk`} sub={`+${premium}% above Melbourne`} color="#8b5cf6" icon={DollarSign} />
        <StatCard label="University Educated" value={`${d.educationBachelor}%`} sub="Melbourne avg: ~30%" color="#f59e0b" icon={BookOpen} />
      </div>

      {/* Two-col layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Occupations */}
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Top Occupations</p>
          <div className="space-y-2">
            {[
              { label: 'Professionals', pct: d.occupationProfessionals, color: '#10b981' },
              { label: 'Managers', pct: d.occupationManagers, color: '#3b82f6' },
              { label: 'Clerical / Admin', pct: d.occupationClerical, color: '#8b5cf6' },
              { label: 'Sales Workers', pct: d.occupationSales, color: '#f59e0b' },
              { label: 'Community Service', pct: d.occupationCommunity, color: '#ec4899' },
            ].map(({ label, pct, color }) => (
              <div key={label} className="flex items-center gap-2">
                <p className="text-xs text-gray-600 w-36 shrink-0">{label}</p>
                <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                  <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: color }} />
                </div>
                <p className="text-xs font-semibold text-gray-700 w-10 text-right">{pct}%</p>
              </div>
            ))}
          </div>
        </div>

        {/* Community & households */}
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Community Profile</p>
          <div className="space-y-2">
            {[
              { label: 'Couples with children', pct: d.couplesWithChildren, color: '#10b981' },
              { label: 'Couples without children', pct: d.couplesWithoutChildren, color: '#3b82f6' },
              { label: 'One-parent families', pct: d.oneParentFamilies, color: '#f59e0b' },
            ].map(({ label, pct, color }) => (
              <div key={label} className="flex items-center gap-2">
                <p className="text-xs text-gray-600 w-40 shrink-0">{label}</p>
                <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                  <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: color }} />
                </div>
                <p className="text-xs font-semibold text-gray-700 w-10 text-right">{pct}%</p>
              </div>
            ))}
            <div className="pt-2 border-t border-gray-50 space-y-1.5">
              <div className="flex justify-between text-xs"><span className="text-gray-500">Born overseas</span><span className="font-semibold text-gray-700">{d.bornOverseas}%</span></div>
              <div className="flex justify-between text-xs"><span className="text-gray-500">Mandarin spoken at home</span><span className="font-semibold text-gray-700">{d.mandarinSpoken}%</span></div>
              <div className="flex justify-between text-xs"><span className="text-gray-500">Non-English households</span><span className="font-semibold text-gray-700">{d.nonEnglishHouseholds}%</span></div>
              <div className="flex justify-between text-xs"><span className="text-gray-500">Avg cars per dwelling</span><span className="font-semibold text-gray-700">{d.avgCarsPerDwelling}</span></div>
            </div>
          </div>
        </div>
      </div>

      {/* Ancestry */}
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Top Ancestries — Influences Product Range</p>
        <div className="grid grid-cols-5 gap-2">
          {[
            { name: 'English', pct: d.ancestryEnglish, note: 'British-style staples' },
            { name: 'Australian', pct: d.ancestryAustralian, note: 'Core FMCG brands' },
            { name: 'Chinese', pct: d.ancestryChinese, note: 'Asian grocery range' },
            { name: 'Irish', pct: d.ancestryIrish, note: 'European pantry' },
            { name: 'Scottish', pct: d.ancestryScottish, note: 'British products' },
          ].map(({ name, pct, note }) => (
            <div key={name} className="text-center">
              <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-1">
                <p className="text-xs font-bold text-emerald-700">{pct}%</p>
              </div>
              <p className="text-xs font-semibold text-gray-700">{name}</p>
              <p className="text-[10px] text-gray-400">{note}</p>
            </div>
          ))}
        </div>
      </div>

      <p className="text-[10px] text-gray-400 text-center">
        Source: ABS Census 2021 — Camberwell (VIC) SAL 20453 · abs.gov.au
      </p>
    </div>
  )
}

function CpiTab() {
  const [data, setData] = useState<{ trend: CpiPoint[]; current: CpiCurrent[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastFetched, setLastFetched] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchMelbourneFoodCPI()
      setData(result)
      setLastFetched(new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch ABS data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-500">Fetching live data from ABS...</p>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <AlertCircle size={32} className="text-amber-500" />
        <p className="text-sm text-gray-600 font-medium">Could not load ABS live data</p>
        <p className="text-xs text-gray-400">{error}</p>
        <button onClick={load} className="mt-2 px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700">
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-900">Melbourne Food CPI — Annual % Change</p>
          <p className="text-xs text-gray-500">Live from ABS · Updated monthly · Region: Melbourne</p>
        </div>
        <button onClick={load} className="flex items-center gap-1 text-xs text-gray-500 hover:text-emerald-600 transition-colors">
          <RefreshCw size={12} />
          {lastFetched ? `Updated ${lastFetched}` : 'Refresh'}
        </button>
      </div>

      {/* Current values */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Latest Period — YoY Price Change (Melbourne)
        </p>
        {data.current.map(cat => (
          <CpiBar key={cat.name} name={cat.name} value={cat.value} color={cat.color} />
        ))}
        <div className="flex gap-4 pt-2 border-t border-gray-50">
          <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-500" /><p className="text-[10px] text-gray-500">Low (&lt;3%)</p></div>
          <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-amber-500" /><p className="text-[10px] text-gray-500">Moderate (3–5%)</p></div>
          <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-red-500" /><p className="text-[10px] text-gray-500">High (&gt;5%)</p></div>
        </div>
      </div>

      {/* Trend chart */}
      {data.trend.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">12-Month Trend by Category</p>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={data.trend.slice(-12)} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="period" tick={{ fontSize: 10 }} tickFormatter={v => v.slice(5)} />
              <YAxis tick={{ fontSize: 10 }} unit="%" />
              <Tooltip
                formatter={(val: number, name: string) => [`${val}%`, name]}
                labelFormatter={l => `Period: ${l}`}
                contentStyle={{ fontSize: 11 }}
              />
              <ReferenceLine y={0} stroke="#e5e7eb" />
              {CPI_CATEGORIES.map(cat => (
                <Line
                  key={cat.code}
                  type="monotone"
                  dataKey={cat.name}
                  stroke={cat.color}
                  strokeWidth={2}
                  dot={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
            {CPI_CATEGORIES.map(cat => (
              <div key={cat.code} className="flex items-center gap-1">
                <div className="w-3 h-0.5 rounded" style={{ background: cat.color }} />
                <p className="text-[10px] text-gray-500">{cat.name}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pricing implication */}
      <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
        <p className="text-xs font-semibold text-amber-700 mb-1">Pricing Implication for IGA Camberwell</p>
        <p className="text-xs text-amber-800">
          Camberwell shoppers have high income and low price sensitivity. Use CPI data above to
          calibrate margin — particularly for Meat & Seafood and Alcohol where inflation is highest.
          Avoid over-discounting in premium categories; this demographic equates price with quality.
        </p>
      </div>

      <p className="text-[10px] text-gray-400 text-center">
        Source: ABS Consumer Price Index — Melbourne · data.api.abs.gov.au
      </p>
    </div>
  )
}

function StrategyTab() {
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">How to read this</p>
        <p className="text-xs text-gray-600">
          Opportunity score (dots) reflects demand potential based on Camberwell's demographic profile — income, education, household type, and cultural composition from ABS 2021 Census.
        </p>
      </div>

      <div className="space-y-3">
        {STRATEGIES.map(s => {
          const Icon = s.icon
          return (
            <div key={s.category} className={`bg-white rounded-xl border ${s.border} p-4`}>
              <div className="flex items-start gap-3">
                <div className={`w-9 h-9 rounded-lg ${s.bg} flex items-center justify-center shrink-0 mt-0.5`}>
                  <Icon size={18} style={{ color: s.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-gray-900">{s.category}</p>
                    <ScoreDots score={s.score} />
                  </div>
                  <p className="text-xs text-gray-600 mt-1">{s.rationale}</p>
                  <div className="mt-2 space-y-1">
                    <div className="flex gap-1.5">
                      <CheckCircle size={12} className="text-emerald-500 mt-0.5 shrink-0" />
                      <p className="text-xs text-gray-600"><span className="font-medium text-gray-700">Stock:</span> {s.examples}</p>
                    </div>
                    <div className="flex gap-1.5">
                      <AlertCircle size={12} className="text-amber-500 mt-0.5 shrink-0" />
                      <p className="text-xs text-gray-500">{s.avoid}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Pricing strategy box */}
      <div className="bg-slate-900 rounded-xl p-4 text-white">
        <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wide mb-2">Pricing Strategy for Camberwell</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <p className="text-xs font-semibold text-white mb-1">Position</p>
            <p className="text-[11px] text-slate-400">Price at or slightly above Coles/Woolworths on premium lines. Do not discount to match — this signals lower quality to this demographic.</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-white mb-1">Margin</p>
            <p className="text-[11px] text-slate-400">Target 35–42% GP on specialty and organic. 28–34% on core grocery. 45–55% on premium deli and gourmet.</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-white mb-1">Promotion</p>
            <p className="text-[11px] text-slate-400">Multi-buy deals (2-for) outperform percentage-off. Bundle premium wine with cheese. Loyalty rewards beat blanket discounts.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function SeasonalTab() {
  const now = new Date()
  const currentMonth = now.toLocaleString('en-AU', { month: 'short' })

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Relative Demand Index by Category — Camberwell Calendar
        </p>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={SEASONAL_DATA} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} domain={[60, 105]} />
            <Tooltip
              contentStyle={{ fontSize: 11 }}
              formatter={(val: number, name: string) => [`${val}`, name]}
              labelFormatter={(label: string) => {
                const d = SEASONAL_DATA.find(x => x.month === label)
                return `${label}${d ? ` — ${d.label}` : ''}`
              }}
            />
            <Bar dataKey="premium" name="Premium grocery" fill="#10b981" radius={[2, 2, 0, 0]} />
            <Bar dataKey="beverages" name="Beverages & alcohol" fill="#8b5cf6" radius={[2, 2, 0, 0]} />
            <Bar dataKey="snacking" name="Snacking & entertaining" fill="#f59e0b" radius={[2, 2, 0, 0]} />
            <Bar dataKey="convenience" name="Convenience meals" fill="#3b82f6" radius={[2, 2, 0, 0]} />
            <Bar dataKey="wellness" name="Health & wellness" fill="#06b6d4" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
          {[
            { label: 'Premium grocery', color: '#10b981' },
            { label: 'Beverages & alcohol', color: '#8b5cf6' },
            { label: 'Snacking & entertaining', color: '#f59e0b' },
            { label: 'Convenience meals', color: '#3b82f6' },
            { label: 'Health & wellness', color: '#06b6d4' },
          ].map(({ label, color }) => (
            <div key={label} className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
              <p className="text-[10px] text-gray-500">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Monthly event grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
        {SEASONAL_DATA.map(({ month, label, premium, beverages, snacking }) => {
          const isCurrent = month === currentMonth
          const topCat = [
            { name: 'Premium', val: premium },
            { name: 'Beverages', val: beverages },
            { name: 'Snacking', val: snacking },
          ].sort((a, b) => b.val - a.val)[0]

          return (
            <div
              key={month}
              className={`rounded-xl border p-3 ${isCurrent ? 'border-emerald-400 bg-emerald-50' : 'border-gray-100 bg-white'}`}
            >
              <div className="flex items-center justify-between mb-1">
                <p className={`text-sm font-bold ${isCurrent ? 'text-emerald-700' : 'text-gray-800'}`}>{month}</p>
                {isCurrent && <span className="text-[9px] bg-emerald-500 text-white px-1.5 py-0.5 rounded-full font-bold">NOW</span>}
              </div>
              <p className="text-[11px] font-semibold text-gray-700">{label}</p>
              <p className="text-[10px] text-gray-400 mt-1">
                Focus: <span className="text-gray-600 font-medium">{topCat.name}</span>
              </p>
            </div>
          )
        })}
      </div>

      {/* Key ordering notes */}
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Key Ordering Windows</p>
        <div className="space-y-2">
          {[
            { when: 'Late Jan', action: 'Boost lunchbox snacks, muesli bars, packaged fruit, drinks — Back to School volume spike' },
            { when: 'Late Mar', action: 'Pre-order Easter confectionery (chocolate eggs, hot cross buns). Order 3 weeks ahead to avoid stockout.' },
            { when: 'Late Apr', action: "Increase premium wine, boxed chocolates, flowers for Mother's Day (first Sunday of May)" },
            { when: 'Early Jun', action: 'Lift winter comfort foods: soup stock, canned tomatoes, pasta, slow-cook sauces, hot beverages' },
            { when: 'Late Aug', action: "Beer, whisky, BBQ sauces for Father's Day. AFL finals run Sep–Oct — sustain snack/alcohol stock" },
            { when: 'Early Nov', action: "Champagne and premium sparkling for Melbourne Cup carnival. Christmas range planning begins." },
            { when: 'Early Dec', action: 'Maximum Christmas order: premium confectionery, spirits, specialty foods, gift sets, festive goods' },
          ].map(({ when, action }) => (
            <div key={when} className="flex gap-3 text-xs">
              <span className="text-emerald-600 font-semibold w-20 shrink-0">{when}</span>
              <p className="text-gray-600">{action}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────
type Tab = 'profile' | 'cpi' | 'strategy' | 'seasonal'

export default function InsightsView() {
  const [tab, setTab] = useState<Tab>('profile')

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-base font-bold text-gray-900">Camberwell Area Intelligence</h2>
          <p className="text-xs text-gray-500">Data-driven stock & pricing insights for IGA Camberwell</p>
        </div>
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5">
          <TrendingUp size={13} className="text-emerald-600" />
          <p className="text-xs font-semibold text-emerald-700">VIC 3124</p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-2 flex-wrap">
        <TabBtn label="Area Profile" active={tab === 'profile'} onClick={() => setTab('profile')} />
        <TabBtn label="Price Pressure (CPI)" active={tab === 'cpi'} onClick={() => setTab('cpi')} />
        <TabBtn label="Stock Strategy" active={tab === 'strategy'} onClick={() => setTab('strategy')} />
        <TabBtn label="Seasonal Planner" active={tab === 'seasonal'} onClick={() => setTab('seasonal')} />
      </div>

      {/* Tab content */}
      {tab === 'profile' && <ProfileTab />}
      {tab === 'cpi' && <CpiTab />}
      {tab === 'strategy' && <StrategyTab />}
      {tab === 'seasonal' && <SeasonalTab />}
    </div>
  )
}
