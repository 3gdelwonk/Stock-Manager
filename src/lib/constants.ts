import type { GroceryDepartment } from './types'

export const LEAD_TIME_DEFAULT = 2

// ─── IGA / Metcash Department Code Mapping ────────────────────────────────
export const DEPT_CODE_MAP: Record<number, GroceryDepartment> = {
  1:  'grocery',
  2:  'dairy',
  3:  'frozen',
  4:  'fresh_produce',
  5:  'meat',
  6:  'deli',
  7:  'bakery',
  8:  'health_beauty',
  9:  'household',
  10: 'pet',
  11: 'baby',
  12: 'general_merch',
  15: 'tobacco',
  20: 'liquor',
  21: 'liquor',
  22: 'liquor',
  23: 'liquor',
  25: 'liquor',
}

export const DEPT_NAME_MAP: Record<string, GroceryDepartment> = {
  'GROCERY':             'grocery',
  'DAIRY':               'dairy',
  'FROZEN':              'frozen',
  'FRESH PRODUCE':       'fresh_produce',
  'FRUIT & VEG':         'fresh_produce',
  'MEAT':                'meat',
  'BUTCHER':             'meat',
  'DELI':                'deli',
  'BAKERY':              'bakery',
  'HEALTH & BEAUTY':     'health_beauty',
  'HEALTH':              'health_beauty',
  'HOUSEHOLD':           'household',
  'PET':                 'pet',
  'BABY':                'baby',
  'GENERAL MERCHANDISE': 'general_merch',
  'TOBACCO':             'tobacco',
  'LIQUEURS':            'liquor',
  'WINE':                'liquor',
  'SPIRITS':             'liquor',
  'LIQUOR/MISC':         'liquor',
  'BEER':                'liquor',
}

export const DEPARTMENT_LABELS: Record<GroceryDepartment, string> = {
  grocery:       'Grocery',
  dairy:         'Dairy',
  frozen:        'Frozen',
  fresh_produce: 'Fresh Produce',
  meat:          'Meat & Butcher',
  deli:          'Deli',
  bakery:        'Bakery',
  health_beauty: 'Health & Beauty',
  household:     'Household',
  pet:           'Pet',
  baby:          'Baby',
  liquor:        'Liquor',
  tobacco:       'Tobacco',
  general_merch: 'General Merch',
  other:         'Other',
}

export const DEPARTMENT_COLORS: Record<GroceryDepartment, string> = {
  grocery:       '#10b981',
  dairy:         '#3b82f6',
  frozen:        '#6366f1',
  fresh_produce: '#22c55e',
  meat:          '#ef4444',
  deli:          '#f97316',
  bakery:        '#f59e0b',
  health_beauty: '#ec4899',
  household:     '#8b5cf6',
  pet:           '#14b8a6',
  baby:          '#f472b6',
  liquor:        '#7c3aed',
  tobacco:       '#6b7280',
  general_merch: '#64748b',
  other:         '#9ca3af',
}

export const DEPARTMENT_ORDER: GroceryDepartment[] = [
  'grocery', 'dairy', 'frozen', 'fresh_produce', 'meat', 'deli', 'bakery',
  'health_beauty', 'household', 'pet', 'baby', 'liquor', 'tobacco', 'general_merch', 'other',
]

// ─── Expiry Thresholds ──────��─────────────────────────────────────────────
export const EXPIRY_RED_DAYS = 3
export const EXPIRY_AMBER_DAYS = 7

// ─── Price Change Reasons ──���──────────────────────��───────────────────────
export const PRICE_CHANGE_REASONS = [
  { value: 'promo',             label: 'Promotion / TPR' },
  { value: 'markdown',          label: 'Markdown / Clearance' },
  { value: 'cost_increase',     label: 'Cost Increase' },
  { value: 'competitor_match',  label: 'Competitor Match' },
  { value: 'error_correction',  label: 'Error Correction' },
  { value: 'other',             label: 'Other' },
] as const

export function mapDepartmentName(raw: string): GroceryDepartment {
  const upper = raw.toUpperCase().trim()
  if (DEPT_NAME_MAP[upper]) return DEPT_NAME_MAP[upper]
  for (const [key, dept] of Object.entries(DEPT_NAME_MAP)) {
    if (upper.includes(key) || key.includes(upper)) return dept
  }
  return 'other'
}
