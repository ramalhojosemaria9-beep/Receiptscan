'use strict';

// Rule-based expense categorizer for a construction/fleet trade business.
// The five reportable categories were chosen by the product owner:
//   Diesel / Construction materials / Machinery and repairs / Travel / Food and groceries

const CATEGORIES = [
  'Diesel',
  'Construction materials',
  'Machinery and repairs',
  'Travel',
  'Food and groceries',
  'Uncategorized',
];

// [keyword, weight] — matches are case-insensitive substring checks.
const RULES = {
  Diesel: [
    ['diesel', 5], ['unleaded', 4], ['fuel', 3], ['petrol', 4], ['gasoline', 4],
    ['gas station', 3], ['service station', 2], ['litres', 2], ['gallons', 2],
    ['pump', 2], ['nozzle', 2], ['pump no', 2],
    ['shell', 2], ['texaco', 3], ['chevron', 3], ['exxon', 3], ['mobil', 2],
    ['citgo', 3], ['sunoco', 3], ['valero', 3], ['luk oil', 2], ['gulf', 1],
    ['pilot travel center', 3], ['flying j', 3], ['loves', 2], ["love's", 2],
    ['road ranger', 3], ['ta travel', 3], ['petro', 2], ['bp ', 2],
  ],
  'Construction materials': [
    ['construction materials', 6], ['building materials', 6], ['home depot', 5],
    ['lowes', 5], ["lowe's", 5], ['builders', 3], ['homedepot', 5],
    ['hardware', 3], ['lumber', 5], ['timber', 4], ['plank', 3], ['plywood', 5],
    ['osb', 3], ['stud', 2], ['cement', 5], ['concrete', 5], ['mortar', 4],
    ['grout', 4], ['sand', 2], ['gravel', 4], ['aggregate', 4], ['crushed stone', 5],
    ['rebar', 5], ['mesh', 2], ['brick', 4], ['block', 2], ['tile', 3],
    ['screed', 4], ['shingle', 5], ['roofing', 4], ['insulation', 4],
    ['drywall', 5], ['gypsum', 4], ['paint', 3], ['nails', 3], ['screws', 3],
    ['bolts', 2], ['fittings', 3], ['pipe', 2], ['plumbing supply', 4],
    ['electrical supply', 4], ['sand & gravel', 5], ['quarry', 4],
    ['fasteners', 3], ['asphalt', 4], ['sealant', 3], ['silicone', 2],
    ['caulk', 3], ['bags of', 2], ['mix', 1],
  ],
  'Machinery and repairs': [
    ['machinery', 6], ['machinery repairs', 6], ['excavator', 6], ['backhoe', 5],
    ['bulldozer', 5], ['loader', 4], ['digger', 4], ['skid steer', 5],
    ['mini digger', 5], ['tipper', 4], ['dumper', 4], ['roller', 3],
    ['compactor', 4], ['generator', 4], ['compressor', 4], ['welder', 5],
    ['tool hire', 5], ['equipment hire', 5], ['equipment rental', 5],
    ['spare parts', 6], ['spares', 4], ['hydraulic', 5], ['hose', 2],
    ['bearing', 5], ['gearbox', 5], ['clutch', 4], ['engine', 3],
    ['oil filter', 4], ['air filter', 3], ['fuel filter', 4], ['lubricant', 3],
    ['grease', 3], ['tracks', 2], ['undercarriage', 5], ['bucket teeth', 6],
    ['mechanic', 5], ['garage', 3], ['auto repair', 5], ['auto service', 5],
    ['workshop', 3], ['service center', 4], ['service centre', 4],
    ['tyre', 4], ['tire', 3], ['tires', 4], ['tyres', 5], ['wheel alignment', 5],
    ['parts', 2], ['repair', 4], ['maintenance', 3], ['diagnostic', 3],
    ['labour', 2], ['labor', 2],
  ],
  Travel: [
    ['travel', 4], ['airline', 5], ['airways', 5], ['flight', 5], ['air fare', 5],
    ['airfare', 5], ['uber', 5], ['lyft', 5], ['bolt ride', 4], ['taxi', 5],
    ['cab ', 3], ['train', 4], ['railway', 4], ['transit', 3], ['metro', 3],
    ['bus ', 2], ['ferry', 4], ['hotel', 5], ['motel', 5], ['inn ', 3],
    ['lodge', 3], ['resort', 4], ['booking.com', 5], ['airbnb', 5],
    ['expedia', 5], ['hotels.com', 5], ['accommodation', 5], ['room rate', 4],
    ['night(s)', 4], ['nights', 3], ['check-in', 3], ['check in', 3],
    ['parking', 4], ['car park', 4], ['toll', 5], ['tolls', 5],
    [' congestion charge', 4], ['mileage', 4], ['per mile', 4],
    ['rental car', 5], ['car rental', 5], ['car hire', 5], ['hertz', 5],
    ['avis', 4], ['enterprise rent', 5], ['budget rental', 5],
  ],
  'Food and groceries': [
    ['groceries', 6], ['grocery', 6], ['supermarket', 5], ['market', 2],
    ['walmart', 4], ['target', 2], ['kroger', 5], ['aldi', 5], ['lidl', 5],
    ['safeway', 5], ['trader joe', 5], ["trader joe's", 5], ['whole foods', 5],
    ['wegmans', 5], ['publix', 4], ['food lion', 5], ['stop & shop', 5],
    ['costco', 3], ['sams club', 4], ["sam's club", 4], ['tesco', 5],
    ['sainsbury', 5], ['asda', 5], ['morrisons', 5], ['waitrose', 5],
    ['convenience', 3], ['deli', 4], ['bakery', 4], ['butcher', 4],
    ['greengrocer', 5], ['produce', 2], ['dairy', 2], ['bread', 2],
    ['milk', 2], ['eggs', 2], ['coffee shop', 4], ['cafe', 4], ['café', 4],
    ['coffee', 2], ['restaurant', 5], ['pizzeria', 4], ['pizza', 3],
    ['burger', 4], ['sandwich', 3], ['takeaway', 4], ['take out', 3],
    ['takeout', 3], ['lunch', 3], ['dinner', 3], ['breakfast', 3],
    ['menu', 2], ['catering', 4], ['vending', 3],
  ],
};

function normalize(text) {
  return String(text).toLowerCase();
}

function categorize(text, merchant) {
  const hay = normalize(text || '');
  const merchantHay = normalize(merchant || '');
  const scores = {};
  const matched = {};

  for (const [category, keywords] of Object.entries(RULES)) {
    let score = 0;
    const hits = [];
    for (const [keyword, weight] of keywords) {
      const idx = merchantHay.indexOf(keyword);
      const inText = hay.includes(keyword);
      if (idx !== -1) {
        score += weight * 3;
        hits.push(keyword);
      } else if (inText) {
        score += weight;
        if (hits.length < 4) hits.push(keyword);
      }
    }
    if (score > 0) {
      scores[category] = score;
      matched[category] = hits;
    }
  }

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (ranked.length === 0) {
    return { category: 'Uncategorized', confidence: 0, matched: [] };
  }
  const [best, bestScore] = ranked[0];
  const runnerUp = ranked[1] ? ranked[1][1] : 0;
  const margin = bestScore > 0 ? (bestScore - runnerUp) / bestScore : 0;
  return {
    category: best,
    confidence: Math.min(0.99, 0.5 + margin * 0.5),
    matched: matched[best] || [],
  };
}

module.exports = { categorize, CATEGORIES };
