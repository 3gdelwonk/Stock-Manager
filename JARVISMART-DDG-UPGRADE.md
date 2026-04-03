# JARVISmart DDG Image Search — Server-Side Query Improvement

**Context:** The PWA now sends raw POS description + department to `/api/pos/ddg-images` instead of a pre-built query. The server must expand POS abbreviations and build a smart search query before hitting DDG.

## Updated Endpoint: `GET /api/pos/ddg-images`

**New query params** (replaces the old `?q=` param):
- `description` (required) — raw POS description, e.g. `"A/FRSH OLIVES K/MATA PTD 220GM"`
- `department` (required) — department name, e.g. `"GROCERY"`, `"WINE"`, `"DAIRY"`
- `barcode` (optional) — product barcode for fallback search
- `num` (optional, default 5) — max results

**The server should:**

1. **Expand POS abbreviations** in the description
2. **Strip volume/weight/pack size** numbers
3. **Build search query** with department context + "Australia"
4. Search DDG with the cleaned query
5. If no results and barcode provided, try `"{barcode} product"` as fallback

### Department Search Context Map

Use department to add product-category keywords that dramatically improve DDG match rate:

```js
const DEPT_SEARCH_CONTEXT = {
  'GROCERY':          'grocery food product',
  'DAIRY':            'dairy product',
  'FROZEN':           'frozen food product',
  'FRESH PRODUCE':    'fresh produce fruit vegetable',
  'FRUIT & VEG':      'fresh fruit vegetable',
  'MEAT':             'meat product packaged',
  'BUTCHER':          'meat butcher product',
  'DELI':             'deli food product',
  'BAKERY':           'bakery bread product',
  'HEALTH & BEAUTY':  'health beauty product',
  'HEALTH':           'health product',
  'HOUSEHOLD':        'household cleaning product',
  'PET':              'pet food product',
  'BABY':             'baby product',
  'TOBACCO':          'tobacco product',
  'GENERAL MERCHANDISE': 'product',
  'LIQUEURS':         'liqueur bottle',
  'WINE':             'wine bottle',
  'SPIRITS':          'spirits bottle',
  'BEER':             'beer product',
  'LIQUOR/MISC':      'liquor product',
};

function getDeptContext(department) {
  if (!department) return 'product';
  return DEPT_SEARCH_CONTEXT[department.toUpperCase()] || 'product';
}
```

### POS Abbreviation Map (add to server code)

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
  'SICLN': 'Sicilian', 'SICLN': 'Sicilian', 'GRN': 'Green', 'BLCK': 'Black',
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
    // Word boundary match (case-insensitive)
    const escaped = abbr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    expanded = expanded.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), full);
  }
  return expanded;
}

function buildImageQuery(description, department, barcode) {
  if (barcode) return `${barcode} product white background`;

  let clean = expandPosDescription(description);
  // Strip volume/weight/pack (handle no-space like "540GM")
  clean = clean.replace(/\d+[*xX]?\d*\s*ML\b/gi, '');
  clean = clean.replace(/\d+\s*L\b/gi, '');
  clean = clean.replace(/\d+\s*(S|PK|X)\b/gi, '');
  clean = clean.replace(/\d+\s*(GM|KG|G)\b/gi, '');
  clean = clean.replace(/[*#&]/g, '').replace(/\s+/g, ' ').trim();

  // Department-specific context for higher match rate
  const deptContext = getDeptContext(department);

  return `${clean} ${deptContext} Australia white background`;
}
```

### Updated Route Handler

```js
// Score results to prefer clean product images (no background / white background)
function scoreImageResult(result) {
  let score = 0;
  const url = (result.imageUrl || '').toLowerCase();
  const title = (result.title || '').toLowerCase();
  const source = (result.source || '').toLowerCase();

  // Prefer images from product/retail sites
  if (source.includes('woolworths') || source.includes('coles') || source.includes('amazon')
      || source.includes('bigw') || source.includes('chemistwarehouse')
      || source.includes('danmurphy') || source.includes('bws'))
    score += 3;

  // Prefer PNG (often transparent background)
  if (url.endsWith('.png')) score += 2;

  // Prefer URLs suggesting product shots
  if (url.includes('product') || url.includes('packshot')) score += 2;

  // Penalize lifestyle/recipe/blog images
  if (title.includes('recipe') || title.includes('how to') || title.includes('review'))
    score -= 3;
  if (source.includes('pinterest') || source.includes('instagram') || source.includes('facebook'))
    score -= 2;

  // Prefer square-ish images (typical product photos)
  if (result.width > 0 && result.height > 0) {
    const ratio = result.width / result.height;
    if (ratio >= 0.7 && ratio <= 1.4) score += 1; // close to square
  }

  return score;
}

router.get('/ddg-images', async (req, res) => {
  const { description, department, barcode, num: numStr } = req.query;
  const num = parseInt(numStr) || 5;

  // Support both old ?q= format and new description/department format
  let query;
  if (description) {
    query = buildImageQuery(description, department || '', null);
  } else if (req.query.q) {
    query = req.query.q; // backwards compatible
  } else {
    return res.status(400).json({ error: 'Missing description or q parameter', results: [] });
  }

  try {
    // Fetch more results than requested so we can filter/rank
    let results = await searchDdgImages(query, Math.max(num * 2, 10));

    // If no results and barcode provided, try barcode search
    if (results.length === 0 && barcode) {
      results = await searchDdgImages(`${barcode} product white background`, Math.max(num * 2, 10));
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

### Example Transformations

| Raw POS Description | Dept | Expanded Search Query |
|---|---|---|
| `A/FRSH OLIVES K/MATA PTD 220GM` | GROCERY | `Always Fresh OLIVES Kalamata Pitted grocery food product Australia white background` |
| `19 CRIMES HALLOWEEN SHZ 750ML` | WINE | `19 CRIMES HALLOWEEN Shiraz wine bottle Australia white background` |
| `ABBOTTS BRD S/DOUGH RYE 760GM` | BAKERY | `ABBOTTS Bread Sourdough RYE bakery bread product Australia white background` |
| `ABC SCE CHILLI XTRA HOT #335ML` | GROCERY | `ABC Sauce CHILLI Extra HOT grocery food product Australia white background` |
| `A2 MILK FULL CREAM LONG LIF 1L` | DAIRY | `A2 MILK FULL CREAM LONG LIF dairy product Australia white background` |
| `BC MANINAS SWT PASTRIES 225G` | BAKERY | `Bakers Collection MANINAS Sweet Pastries bakery bread product Australia white background` |
| `PENFOLDS BIN 389 CAB SHZ 750ML` | WINE | `PENFOLDS BIN 389 Cabernet Shiraz wine bottle Australia white background` |
| `B/EYE CKN STRIPS 500GM` | FROZEN | `Birds Eye Chicken Strips frozen food product Australia white background` |
