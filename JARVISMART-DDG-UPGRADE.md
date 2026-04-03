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
  if (barcode) return `${barcode} product`;

  let clean = expandPosDescription(description);
  // Strip volume/weight/pack (handle no-space like "540GM")
  clean = clean.replace(/\d+[*xX]?\d*\s*ML\b/gi, '');
  clean = clean.replace(/\d+\s*L\b/gi, '');
  clean = clean.replace(/\d+\s*(S|PK|X)\b/gi, '');
  clean = clean.replace(/\d+\s*(GM|KG|G)\b/gi, '');
  clean = clean.replace(/[*#&]/g, '').replace(/\s+/g, ' ').trim();

  // Add department context for non-generic departments
  const deptHint = department && !['GROCERY', ''].includes(department.toUpperCase())
    ? ` ${department.toLowerCase()}`
    : '';

  return `${clean}${deptHint} product Australia`;
}
```

### Updated Route Handler

```js
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
    let results = await searchDdgImages(query, num);

    // If no results and barcode provided, try barcode search
    if (results.length === 0 && barcode) {
      results = await searchDdgImages(`${barcode} product`, num);
    }

    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: err.message, results: [] });
  }
});
```

### Example Transformations

| Raw POS Description | Expanded Search Query |
|---|---|
| `A/FRSH OLIVES K/MATA PTD 220GM` | `Always Fresh OLIVES Kalamata Pitted product Australia` |
| `19 CRIMES HALLOWEEN SHZ 750ML` | `19 CRIMES HALLOWEEN Shiraz wine product Australia` |
| `ABBOTTS BRD S/DOUGH RYE 760GM` | `ABBOTTS Bread Sourdough RYE product Australia` |
| `ABC SCE CHILLI XTRA HOT #335ML` | `ABC Sauce CHILLI Extra HOT product Australia` |
| `A2 MILK FULL CREAM LONG LIF 1L` | `A2 MILK FULL CREAM LONG LIF dairy product Australia` |
| `BC MANINAS SWT PASTRIES 225G` | `Bakers Collection MANINAS Sweet Pastries product Australia` |
