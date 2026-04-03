# JARVISmart DDG Image Search — Server-Side Query Improvement (v2)

**Context:** The PWA sends raw POS description + department to `/api/pos/ddg-images`. The server must expand POS abbreviations and build a **short, specific** search query before hitting DDG. Less is more — DDG (backed by Bing) performs best with concise queries, not keyword-stuffed ones.

## Updated Endpoint: `GET /api/pos/ddg-images`

**Query params** (replaces the old `?q=` param):
- `description` (required) — raw POS description, e.g. `"A/FRSH OLIVES K/MATA PTD 220GM"`
- `department` (required) — department name, e.g. `"GROCERY"`, `"WINE"`, `"DAIRY"`
- `barcode` (optional) — product barcode for fallback search
- `num` (optional, default 15) — max results to return

**The server should:**

1. **Expand POS abbreviations** in the description
2. **Strip volume/weight/pack size** numbers
3. **Build a SHORT search query** (brand + product name only, 4-7 words)
4. **Tiered search**: try specific query first → if <3 results, retry with department keyword
5. Set DDG `region: 'au-en'` for Australian product results
6. Score and rank results, return top N
7. If no results and barcode provided, try `"{barcode} product"` as final fallback

### Department Context Map (single keyword only)

```js
const DEPT_SEARCH_CONTEXT = {
  'GROCERY':            '',          // no suffix — it's the default/generic category
  'DAIRY':              'dairy',
  'FROZEN':             'frozen',
  'FRESH PRODUCE':      'produce',
  'FRUIT & VEG':        'produce',
  'MEAT':               'meat',
  'BUTCHER':            'meat',
  'DELI':               'deli',
  'BAKERY':             'bakery',
  'HEALTH & BEAUTY':    'health',
  'HEALTH':             'health',
  'HOUSEHOLD':          'cleaning',
  'PET':                'pet food',
  'BABY':               'baby',
  'TOBACCO':            'tobacco',
  'GENERAL MERCHANDISE': '',
  'LIQUEURS':           'liqueur',
  'WINE':               'wine',
  'SPIRITS':            'spirits',
  'BEER':               'beer',
  'LIQUOR/MISC':        'liquor',
};

function getDeptContext(department) {
  if (!department) return '';
  return DEPT_SEARCH_CONTEXT[department.toUpperCase()] || '';
}
```

### POS Abbreviation Map

```js
const POS_ABBREVIATIONS = {
  // Brands
  'A/FRSH': 'Always Fresh', 'A/PARK': 'Angas Park', "333'S": 'Three Threes',
  '333S': 'Three Threes', 'S/BRAND': 'Savings', 'B/EYE': 'Birds Eye',
  'B/GOLD': 'Black Gold', 'M/PARK': 'Meadow Park', 'P/GOLD': 'Pure Gold',
  'S/DALE': 'Sunnydale', 'L/JACK': 'Lumberjack',
  // Wine varietals
  'SHZ': 'Shiraz', 'CHARD': 'Chardonnay', 'CAB': 'Cabernet',
  'SAUV': 'Sauvignon', 'MRLT': 'Merlot', 'PNT': 'Pinot',
  'SPRK': 'Sparkling', 'RSLNG': 'Riesling',
  // Food terms
  'BRD': 'Bread', 'SWT': 'Sweet', 'SCE': 'Sauce', 'PCKLD': 'Pickled',
  'PCKL': 'Pickle', 'PSTRIES': 'Pastries', 'CHOC': 'Chocolate',
  'CHS': 'Cheese', 'BTR': 'Butter', 'CKN': 'Chicken',
  'K/MATA': 'Kalamata', 'S/DRD': 'Sun Dried', 'S/DRIED': 'Sun Dried',
  'STFD': 'Stuffed', 'SLCD': 'Sliced', 'PTD': 'Pitted',
  'RST': 'Roast', 'MRNT': 'Marinated', 'MRNTD': 'Marinated',
  'STRPS': 'Strips', 'HLVS': 'Halves', 'WHT': 'White',
  'WHLMEAL': 'Wholemeal', 'ORG': 'Organic', 'XTRA': 'Extra',
  'D/STY': 'Deli Style', 'S/GRN': 'Spanish Green', 'SRIRACHA': 'Sriracha',
  'SICLN': 'Sicilian', 'GRN': 'Green', 'BLCK': 'Black',
  'ANCHOV': 'Anchovy', 'TOM': 'Tomato', 'PEPP': 'Pepper',
  'MSTRD': 'Mustard', 'FRT': 'Fruit', 'CONDNSD': 'Condensed',
  'EVAP': 'Evaporated', 'F/C': 'Full Cream', 'S/F': 'Sugar Free',
  'L/F': 'Low Fat', 'N/F': 'No Fat', 'OLD/STY': 'Old Style',
  'SPCD': 'Spiced', 'SPRD': 'Spread', 'S/DOUGH': 'Sourdough',
  'GRNS': 'Grains', 'VNE': 'Vine', 'CRNBRY': 'Cranberry',
  'MDLY': 'Medley', 'BC': 'Bakers Collection',
};

function expandPosDescription(desc) {
  let expanded = desc;
  for (const [abbr, full] of Object.entries(POS_ABBREVIATIONS)) {
    const escaped = abbr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    expanded = expanded.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), full);
  }
  return expanded;
}
```

### Query Building — Short & Specific

**Key principle:** DDG/Bing works best with short queries (4-7 words). Do NOT append "Australia", "white background", "product", or multi-word department phrases. Use `region: 'au-en'` for locale targeting instead.

```js
function buildImageQueries(description, department) {
  let clean = expandPosDescription(description);
  // Strip volume/weight/pack (handle no-space like "540GM")
  clean = clean.replace(/\d+[*xX]?\d*\s*(ML|L|GM|KG|G|S|PK|X)\b/gi, '');
  clean = clean.replace(/[*#&]/g, '').replace(/\s+/g, ' ').trim();

  const dept = getDeptContext(department); // single word or empty

  return {
    primary: clean,                                     // e.g. "Always Fresh Olives Kalamata Pitted"
    withDept: dept ? `${clean} ${dept}` : clean,        // e.g. "Always Fresh Olives Kalamata Pitted dairy"
  };
}
```

### Result Scoring

```js
function scoreImageResult(result) {
  let score = 0;
  const url = (result.imageUrl || '').toLowerCase();
  const title = (result.title || '').toLowerCase();
  const source = (result.source || '').toLowerCase();

  // Prefer images from Australian retail sites
  if (source.includes('woolworths') || source.includes('coles') || source.includes('amazon')
      || source.includes('bigw') || source.includes('chemistwarehouse')
      || source.includes('danmurphy') || source.includes('bws')
      || source.includes('liquorland') || source.includes('iga'))
    score += 3;

  // Prefer PNG (often transparent/white background)
  if (url.endsWith('.png')) score += 2;

  // Prefer URLs suggesting product shots
  if (url.includes('product') || url.includes('packshot')) score += 2;

  // Penalize lifestyle/recipe/blog images
  if (title.includes('recipe') || title.includes('how to') || title.includes('review'))
    score -= 3;
  if (source.includes('pinterest') || source.includes('instagram') || source.includes('facebook'))
    score -= 2;

  // Penalize stock photo sites (watermarked, not real products)
  if (source.includes('shutterstock') || source.includes('istockphoto')
      || source.includes('gettyimages') || source.includes('depositphotos'))
    score -= 5;

  // Prefer square-ish images (typical product photos)
  if (result.width > 0 && result.height > 0) {
    const ratio = result.width / result.height;
    if (ratio >= 0.7 && ratio <= 1.4) score += 1;
  }

  return score;
}
```

### Updated Route Handler — Tiered Search

```js
router.get('/ddg-images', async (req, res) => {
  const { description, department, barcode, num: numStr } = req.query;
  const num = parseInt(numStr) || 15;

  // Support both old ?q= format and new description/department format
  if (!description && !req.query.q) {
    return res.status(400).json({ error: 'Missing description or q parameter', results: [] });
  }

  try {
    let results = [];

    if (description) {
      const queries = buildImageQueries(description, department || '');

      // Tier 1: Specific query (brand + product name only)
      results = await searchDdgImages(queries.primary, 20, { region: 'au-en' });

      // Tier 2: If <3 results, retry with department context
      if (results.length < 3 && queries.withDept !== queries.primary) {
        const more = await searchDdgImages(queries.withDept, 20, { region: 'au-en' });
        // Merge, deduplicate by imageUrl
        const seen = new Set(results.map(r => r.imageUrl));
        for (const r of more) {
          if (!seen.has(r.imageUrl)) { results.push(r); seen.add(r.imageUrl); }
        }
      }

      // Tier 3: Barcode fallback
      if (results.length === 0 && barcode) {
        results = await searchDdgImages(`${barcode} product`, 20, { region: 'au-en' });
      }
    } else {
      // Backwards compatible with old ?q= format
      results = await searchDdgImages(req.query.q, 20, { region: 'au-en' });
    }

    // Score and sort — best product images first
    results.sort((a, b) => scoreImageResult(b) - scoreImageResult(a));

    // Return top N
    res.json({ results: results.slice(0, num) });
  } catch (err) {
    res.status(500).json({ error: err.message, results: [] });
  }
});
```

**Note on `searchDdgImages`:** Pass `region: 'au-en'` to the DDG API call. If using `duckduckgo-images-api` or similar, this maps to the `region` parameter. This targets Australian product results without cluttering the query text with "Australia".

### Example Transformations

| Raw POS Description | Dept | Primary Query | Fallback (if <3 results) |
|---|---|---|---|
| `A/FRSH OLIVES K/MATA PTD 220GM` | GROCERY | `Always Fresh Olives Kalamata Pitted` | (same — GROCERY has no dept keyword) |
| `19 CRIMES HALLOWEEN SHZ 750ML` | WINE | `19 Crimes Halloween Shiraz` | `19 Crimes Halloween Shiraz wine` |
| `B/EYE CKN STRIPS 500GM` | FROZEN | `Birds Eye Chicken Strips` | `Birds Eye Chicken Strips frozen` |
| `A2 MILK FULL CREAM LONG LIF 1L` | DAIRY | `A2 Milk Full Cream Long Life` | `A2 Milk Full Cream Long Life dairy` |
| `ABBOTTS BRD S/DOUGH RYE 760GM` | BAKERY | `ABBOTTS Bread Sourdough RYE` | `ABBOTTS Bread Sourdough RYE bakery` |
| `ABC SCE CHILLI XTRA HOT #335ML` | GROCERY | `ABC Sauce Chilli Extra Hot` | (same) |
| `PENFOLDS BIN 389 CAB SHZ 750ML` | WINE | `Penfolds Bin 389 Cabernet Shiraz` | `Penfolds Bin 389 Cabernet Shiraz wine` |
| `BC MANINAS SWT PASTRIES 225G` | BAKERY | `Bakers Collection Maninas Sweet Pastries` | `Bakers Collection Maninas Sweet Pastries bakery` |

### Changes from v1

| What | v1 (old) | v2 (new) | Why |
|------|----------|----------|-----|
| Query suffix | `grocery food product Australia white background` | (none) | Keyword stuffing hurts DDG/Bing results |
| Dept context | Multi-word phrases (`grocery food product`) | Single word (`dairy`, `wine`) | Shorter = better match rate |
| Locale targeting | `"Australia"` in query text | `region: 'au-en'` API parameter | Proper API-level filtering |
| Search strategy | Single query | Tiered: specific → +dept → barcode | Maximizes chances of finding results |
| Fetch count | `Math.max(num * 2, 10)` → 10 results | Always 20 results | Bigger pool for scoring |
| Default num | 5 | 15 | PWA now requests 15 for better selection |
| Barcode query | `{barcode} product white background` | `{barcode} product` | Simpler = better |
| Stock photos | No penalty | -5 score penalty | Filter shutterstock/istock/getty |
| Retail sites | Only 7 sites scored | Added liquorland, iga | Better AU coverage |
