// Marketing knowledge base. Default copy phrases are deliberately neutral:
// specific claims (free trial, warranty, delivery, returns) only ever come from
// what the business owner types in, never from this file.
//
// Marketing knowledge base. Everything the engine "knows" about businesses and
// ad platforms lives here as plain data so it is easy to audit and tune.
//
// IMPORTANT: platform numbers are rounded, publicly-reported *industry
// benchmarks* (US baseline, USD) scaled by a region cost index. They are used
// for planning estimates, never as promises. Real results vary by creative,
// offer, season, and competition. The UI says so wherever they are shown.

export const REGIONS = {
  IN: { id: 'IN', label: 'India', currency: 'INR', symbol: '₹', locale: 'en-IN', fx: 83, costIndex: 0.14, minDaily: 150, step: 10 },
  US: { id: 'US', label: 'United States', currency: 'USD', symbol: '$', locale: 'en-US', fx: 1, costIndex: 1, minDaily: 5, step: 1 },
  UK: { id: 'UK', label: 'United Kingdom', currency: 'GBP', symbol: '£', locale: 'en-GB', fx: 0.79, costIndex: 0.85, minDaily: 4, step: 1 },
  EU: { id: 'EU', label: 'Europe', currency: 'EUR', symbol: '€', locale: 'de-DE', fx: 0.92, costIndex: 0.8, minDaily: 4, step: 1 },
  GL: { id: 'GL', label: 'Other / Global', currency: 'USD', symbol: '$', locale: 'en-US', fx: 1, costIndex: 0.45, minDaily: 3, step: 1 },
};

// cpc in USD, ctr and cvr in percent (click-through, click-to-purchase).
export const PLATFORMS = {
  instagram: {
    id: 'instagram', name: 'Instagram', short: 'IG', cpc: 0.95, ctr: 0.9, cvr: 1.6,
    formats: 'Reels + Stories (9:16) and Feed (4:5)',
    role: 'Visual discovery. Best for products people want to see.',
  },
  facebook: {
    id: 'facebook', name: 'Facebook', short: 'FB', cpc: 0.85, ctr: 0.9, cvr: 1.9,
    formats: 'Feed (1:1) and Reels, with local targeting',
    role: 'Local reach and older buyers. Strong for enquiries and events.',
  },
  google: {
    id: 'google', name: 'Google Ads', short: 'G', cpc: 1.9, ctr: 3.5, cvr: 3.2,
    formats: 'Search text ads + Maps/local listing',
    role: 'High intent. Catches people already searching to buy.',
  },
  youtube: {
    id: 'youtube', name: 'YouTube Shorts', short: 'YT', cpc: 0.5, ctr: 0.55, cvr: 0.9,
    formats: 'Shorts video (9:16), 10–20 seconds',
    role: 'Cheap reach and awareness with video.',
  },
};

export const PLATFORM_ORDER = ['instagram', 'facebook', 'google', 'youtube'];

// How each goal shifts the platform mix and what a "conversion" is worth.
export const GOAL_MODEL = {
  sales: { weights: { instagram: 1, facebook: 1, google: 1.15, youtube: 0.8 }, cvr: 1, value: 1, label: 'purchases', noun: 'purchase' },
  leads: { weights: { instagram: 0.9, facebook: 1.25, google: 1.3, youtube: 0.5 }, cvr: 2.2, value: 0.3, label: 'enquiries', noun: 'enquiry' },
  traffic: { weights: { instagram: 1.1, facebook: 1.1, google: 0.9, youtube: 0.8 }, cvr: 0.6, value: 1, label: 'purchases', noun: 'purchase' },
  awareness: { weights: { instagram: 1.3, facebook: 1, google: 0.4, youtube: 1.8 }, cvr: 0.3, value: 1, label: 'purchases', noun: 'purchase' },
};

// Chance an enquiry (DM / call / visit) turns into a sale. Used only for the
// "leads" goal, and stated openly in the forecast notes.
export const LEAD_CLOSE_RATE = 0.3;

export const SCENARIOS = {
  cautious: { label: 'Cautious', cpc: 1.35, ctr: 0.8, cvr: 0.65 },
  expected: { label: 'Expected', cpc: 1, ctr: 1, cvr: 1 },
  optimistic: { label: 'Optimistic', cpc: 0.8, ctr: 1.2, cvr: 1.35 },
};

export const CATEGORIES = {
  fashion: {
    label: 'Fashion & boutique',
    audience: { age: [18, 38], gender: 'women', interests: ['Fashion & style', 'Online shopping', 'Ethnic & festive wear', 'Instagram shopping', 'Style influencers'], behaviors: ['Engaged shoppers', 'Frequent online buyers'], hours: ['12:00–14:00', '20:00–23:00'], days: ['Thu', 'Fri', 'Sat', 'Sun'] },
    personas: [
      { name: 'Occasion shopper', age: [25, 40], gender: 'women', why: 'Buys for weddings, festivals and events; higher basket size.' },
      { name: 'Gift buyer', age: [24, 45], gender: 'all', why: 'Shops for someone else; responds to gift-ready offers.' },
    ],
    weights: { instagram: 0.5, facebook: 0.2, google: 0.2, youtube: 0.1 },
    mult: { cpc: 1, ctr: 1.15, cvr: 0.9 },
    keywords: ['boutique near me', 'buy {p} online', '{p} {c}', 'new arrivals {p}'],
    negatives: ['free', 'wholesale', 'pattern', 'diy', 'jobs', 'second hand'],
    benefits: ['Styles you will love', 'Made for real life', 'Pieces worth wearing', 'Find your fit'],
    hooks: ['Your next favourite outfit is here', 'Stop scrolling. Start styling.', 'Find the piece everyone will ask about'],
    hashtags: ['ootd', 'boutique', 'shopsmall', 'newarrivals', 'styleinspo'],
    themeHint: 'elegant', radiusKm: 10,
  },
  food: {
    label: 'Food, café & home kitchen',
    audience: { age: [18, 45], gender: 'all', interests: ['Foodies', 'Local restaurants', 'Home delivery', 'Desserts & baking', 'Weekend plans'], behaviors: ['Engaged with food content', 'Uses delivery apps'], hours: ['11:00–13:30', '18:00–21:30'], days: ['Wed', 'Thu', 'Fri', 'Sat'] },
    personas: [
      { name: 'Office lunch crowd', age: [22, 40], gender: 'all', why: 'Nearby workers deciding lunch; quick, repeat orders.' },
      { name: 'Family & celebration buyer', age: [28, 50], gender: 'all', why: 'Orders for birthdays and gatherings; bigger baskets.' },
    ],
    weights: { instagram: 0.4, facebook: 0.3, google: 0.25, youtube: 0.05 },
    mult: { cpc: 0.8, ctr: 1.2, cvr: 1.35 },
    keywords: ['{p} near me', 'order {p} online', '{p} {c}', 'best {p} delivery'],
    negatives: ['recipe', 'free', 'jobs', 'franchise', 'wholesale', 'how to make'],
    benefits: ['Made with care', 'Flavours worth coming back for', 'Simple, honest food', 'Good food, close to home'],
    hooks: ['Hungry? Good food is closer than you think', 'Your new go-to is right around the corner', 'Made for people who love to eat'],
    hashtags: ['foodie', 'freshlymade', 'supportlocal', 'homemade', 'eatlocal'],
    themeHint: 'bold', radiusKm: 5,
  },
  beauty: {
    label: 'Beauty, salon & skincare',
    audience: { age: [18, 40], gender: 'women', interests: ['Skincare', 'Makeup', 'Hair care', 'Self-care', 'Beauty tutorials'], behaviors: ['Beauty product buyers', 'Engaged with beauty content'], hours: ['10:00–12:00', '20:00–23:00'], days: ['Wed', 'Fri', 'Sat', 'Sun'] },
    personas: [
      { name: 'Routine builder', age: [20, 35], gender: 'women', why: 'Researches ingredients and buys repeat products.' },
      { name: 'Event-ready booker', age: [22, 45], gender: 'women', why: 'Books before weddings and parties; responds to slots and offers.' },
    ],
    weights: { instagram: 0.5, facebook: 0.25, google: 0.15, youtube: 0.1 },
    mult: { cpc: 1.05, ctr: 1.1, cvr: 1.05 },
    keywords: ['salon near me', 'book {p}', '{p} {c}', 'skincare {p} online'],
    negatives: ['free', 'diy', 'jobs', 'course', 'wholesale', 'home remedy'],
    benefits: ['Made for your routine', 'Care that feels personal', 'Look and feel your best', 'Easy to book or buy'],
    hooks: ['Glow like you mean it', 'Your skin called. It wants this', 'Self-care that fits your week'],
    hashtags: ['skincare', 'glowup', 'selfcare', 'beautytips', 'salonlife'],
    themeHint: 'fresh', radiusKm: 8,
  },
  handmade: {
    label: 'Handmade, crafts & gifts',
    audience: { age: [22, 50], gender: 'women', interests: ['Handmade gifts', 'Home decor', 'Small businesses', 'Personalised gifts', 'Festive shopping'], behaviors: ['Gift shoppers', 'Engaged shoppers'], hours: ['13:00–15:00', '20:00–22:30'], days: ['Thu', 'Fri', 'Sat', 'Sun'] },
    personas: [
      { name: 'Thoughtful gifter', age: [24, 45], gender: 'all', why: 'Wants something personal, buys ahead of occasions.' },
      { name: 'Small-business supporter', age: [25, 50], gender: 'women', why: 'Prefers local makers and shares finds with friends.' },
    ],
    weights: { instagram: 0.55, facebook: 0.25, google: 0.1, youtube: 0.1 },
    mult: { cpc: 0.9, ctr: 1.2, cvr: 1.0 },
    keywords: ['handmade {p}', 'personalised {p}', 'buy {p} online', 'gift ideas {p}'],
    negatives: ['free', 'diy', 'tutorial', 'wholesale', 'pattern', 'bulk cheap'],
    benefits: ['Made by hand', 'Small batch, big care', 'A gift with a story', 'Thoughtful details'],
    hooks: ['Made by hand. Made for someone special', 'The gift they will actually keep', 'Small batch. Big heart'],
    hashtags: ['handmade', 'smallbatch', 'giftideas', 'shopsmall', 'madewithlove'],
    themeHint: 'fresh', radiusKm: 15,
  },
  fitness: {
    label: 'Fitness, yoga & wellness',
    audience: { age: [20, 45], gender: 'all', interests: ['Fitness & workouts', 'Yoga', 'Healthy eating', 'Weight loss', 'Wellness'], behaviors: ['Gym-goers', 'Health-conscious buyers'], hours: ['05:30–07:30', '19:00–22:00'], days: ['Sun', 'Mon', 'Tue'] },
    personas: [
      { name: 'Fresh-start resolver', age: [22, 38], gender: 'all', why: 'Starting again after a break; responds to trials and offers.' },
      { name: 'Stress-relief seeker', age: [28, 50], gender: 'women', why: 'Looking for yoga, calm and routine rather than hard training.' },
    ],
    weights: { instagram: 0.4, facebook: 0.3, google: 0.2, youtube: 0.1 },
    mult: { cpc: 0.95, ctr: 1.05, cvr: 1.1 },
    keywords: ['gym near me', '{p} classes {c}', 'join {p}', 'yoga classes near me'],
    negatives: ['free workout', 'jobs', 'equipment', 'home gym', 'diy', 'pdf'],
    benefits: ['Real coaching', 'Plans that fit your week', 'Start at your own level', 'Progress you can feel'],
    hooks: ['Day one starts today', 'Your strongest self is closer than you think', 'No perfect time. Just a first step'],
    hashtags: ['fitness', 'yoga', 'healthylifestyle', 'workoutmotivation', 'wellness'],
    themeHint: 'bold', radiusKm: 6,
  },
  jewellery: {
    label: 'Jewellery & accessories',
    audience: { age: [22, 45], gender: 'women', interests: ['Jewellery', 'Fashion accessories', 'Wedding shopping', 'Gifts', 'Luxury & style'], behaviors: ['Gift shoppers', 'Engaged shoppers'], hours: ['13:00–15:00', '20:30–23:00'], days: ['Thu', 'Fri', 'Sat', 'Sun'] },
    personas: [
      { name: 'Occasion buyer', age: [24, 45], gender: 'women', why: 'Buys for weddings and festivals; high order value.' },
      { name: 'Gift partner', age: [25, 45], gender: 'men', why: 'Shops for anniversaries and birthdays; needs confidence and delivery dates.' },
    ],
    weights: { instagram: 0.5, facebook: 0.2, google: 0.25, youtube: 0.05 },
    mult: { cpc: 1.1, ctr: 1.0, cvr: 0.7 },
    keywords: ['{p} online', 'buy {p}', '{p} {c}', 'gift for her jewellery'],
    negatives: ['free', 'wholesale', 'repair', 'jobs', 'scrap', 'gold rate'],
    benefits: ['Designs with character', 'Made to be noticed', 'A gift they will keep', 'Details you will love'],
    hooks: ['Wear the moment', 'Small details. Big compliments', 'Found: the piece that completes it'],
    hashtags: ['jewellery', 'handcrafted', 'accessories', 'giftforher', 'styleoftheday'],
    themeHint: 'elegant', radiusKm: 15,
  },
  home: {
    label: 'Home & decor',
    audience: { age: [25, 55], gender: 'all', interests: ['Home decor', 'Interior design', 'DIY & renovation', 'New homeowners', 'Furniture'], behaviors: ['Recently moved', 'Home improvement shoppers'], hours: ['12:00–14:00', '20:00–22:30'], days: ['Fri', 'Sat', 'Sun'] },
    personas: [
      { name: 'New-home setter', age: [26, 40], gender: 'all', why: 'Furnishing a first or new home; buys in bundles.' },
      { name: 'Refresh decorator', age: [32, 55], gender: 'women', why: 'Upgrades rooms seasonally; responds to inspiration.' },
    ],
    weights: { instagram: 0.4, facebook: 0.3, google: 0.25, youtube: 0.05 },
    mult: { cpc: 1.0, ctr: 1.0, cvr: 0.85 },
    keywords: ['{p} online', 'buy {p}', '{p} {c}', 'home decor ideas {p}'],
    negatives: ['free', 'diy plans', 'jobs', 'wholesale', 'second hand', 'used'],
    benefits: ['Made for real homes', 'Style that feels like you', 'Details that finish a room', 'Built to be lived in'],
    hooks: ['Make home feel like you', 'One piece changes the whole room', 'Your space, finally finished'],
    hashtags: ['homedecor', 'interiordesign', 'homeinspo', 'cozyhome', 'newhome'],
    themeHint: 'fresh', radiusKm: 15,
  },
  electronics: {
    label: 'Electronics & accessories',
    audience: { age: [18, 40], gender: 'all', interests: ['Consumer electronics', 'Mobile phones', 'Gadgets', 'Gaming', 'Tech reviews'], behaviors: ['Early technology adopters', 'Online shoppers'], hours: ['12:00–14:00', '21:00–23:59'], days: ['Fri', 'Sat', 'Sun'] },
    personas: [
      { name: 'Deal hunter', age: [18, 32], gender: 'all', why: 'Compares prices; reacts to limited-time offers.' },
      { name: 'Upgrade buyer', age: [26, 45], gender: 'men', why: 'Replaces gear; cares about warranty and specs.' },
    ],
    weights: { instagram: 0.3, facebook: 0.25, google: 0.35, youtube: 0.1 },
    mult: { cpc: 1.15, ctr: 0.95, cvr: 0.95 },
    keywords: ['buy {p}', '{p} price', '{p} {c}', '{p} near me'],
    negatives: ['free', 'repair', 'jobs', 'manual', 'driver', 'used cheap'],
    benefits: ['Gear that just works', 'Picked for everyday use', 'Simple and reliable', 'Made for your daily grind'],
    hooks: ['Upgrade day is here', 'Gear that just works', 'Skip the guesswork. Get the good one'],
    hashtags: ['tech', 'gadgets', 'mobileaccessories', 'techdeals', 'newtech'],
    themeHint: 'aurora', radiusKm: 12,
  },
  services: {
    label: 'Local services (repair, cleaning, etc.)',
    audience: { age: [25, 60], gender: 'all', interests: ['Home services', 'Home improvement', 'Local businesses', 'Homeowners', 'Renters'], behaviors: ['Homeowners', 'Recently searched for services'], hours: ['07:30–09:30', '18:00–21:00'], days: ['Mon', 'Tue', 'Sat'] },
    personas: [
      { name: 'Urgent fixer', age: [28, 55], gender: 'all', why: 'Has a problem now; picks the first trusted local option.' },
      { name: 'Planner', age: [30, 60], gender: 'all', why: 'Books ahead for maintenance; compares reviews.' },
    ],
    weights: { instagram: 0.15, facebook: 0.3, google: 0.5, youtube: 0.05 },
    mult: { cpc: 1.25, ctr: 1.1, cvr: 1.3 },
    keywords: ['{p} near me', '{p} {c}', 'book {p}', 'emergency {p}'],
    negatives: ['diy', 'jobs', 'course', 'training', 'free', 'salary'],
    benefits: ['Local and easy to reach', 'Clear, honest service', 'Done properly', 'Simple to book'],
    hooks: ['Fixed properly. Priced clearly', 'Skip the search. Book today', 'Your local expert is one message away'],
    hashtags: ['localservice', 'trusted', 'homeservices', 'supportlocal', 'bookonline'],
    themeHint: 'spotlight', radiusKm: 10,
  },
  education: {
    label: 'Education, tuition & coaching',
    audience: { age: [22, 48], gender: 'all', interests: ['Online learning', 'Career development', 'Exam preparation', 'Parenting', 'Skill building'], behaviors: ['Engaged with education content', 'Parents of school-age children'], hours: ['19:00–22:30', '13:00–15:00'], days: ['Sun', 'Mon', 'Wed'] },
    personas: [
      { name: 'Parent researcher', age: [30, 48], gender: 'all', why: 'Chooses tutors and classes for kids; needs trust signals.' },
      { name: 'Career upskiller', age: [22, 35], gender: 'all', why: 'Learns for a job or exam; responds to outcomes and free trials.' },
    ],
    weights: { instagram: 0.25, facebook: 0.35, google: 0.3, youtube: 0.1 },
    mult: { cpc: 1.1, ctr: 1.05, cvr: 1.2 },
    keywords: ['{p} classes', '{p} near me', 'join {p}', '{p} {c}'],
    negatives: ['free pdf', 'jobs', 'cheating', 'answers', 'torrent', 'crack'],
    benefits: ['Clear, structured learning', 'Support when you are stuck', 'Progress you can see', 'Built around your goals'],
    hooks: ['Learn it once. Use it for life', 'The plan that gets you from stuck to sorted', 'Ready when you are'],
    hashtags: ['learning', 'upskill', 'education', 'coaching', 'studytips'],
    themeHint: 'spotlight', radiusKm: 12,
  },
  startup: {
    label: 'Tech startup / app / SaaS',
    audience: { age: [22, 45], gender: 'all', interests: ['Startups', 'Productivity apps', 'Small business', 'Technology news', 'Entrepreneurship'], behaviors: ['Small business owners', 'Technology early adopters'], hours: ['08:00–10:30', '14:00–16:00'], days: ['Tue', 'Wed', 'Thu'] },
    personas: [
      { name: 'Overloaded founder', age: [26, 45], gender: 'all', why: 'Time-poor; wants a problem solved this week.' },
      { name: 'Team lead evaluator', age: [28, 45], gender: 'all', why: 'Compares tools; needs proof and a free trial.' },
    ],
    weights: { instagram: 0.15, facebook: 0.25, google: 0.4, youtube: 0.2 },
    mult: { cpc: 1.4, ctr: 0.9, cvr: 0.8 },
    keywords: ['{p}', 'best {p} software', '{p} alternative', 'try {p} free'],
    negatives: ['free download', 'crack', 'jobs', 'tutorial', 'open source', 'salary'],
    benefits: ['Made for small teams', 'Simple from day one', 'Less busywork, more done', 'Built around how you work'],
    hooks: ['Do in minutes what used to take a day', 'Your busywork, handled', 'Built for teams that ship'],
    hashtags: ['startup', 'saas', 'productivity', 'buildinpublic', 'smallbusiness'],
    themeHint: 'aurora', radiusKm: 0,
  },
};

export const CATEGORY_IDS = Object.keys(CATEGORIES);
export const REGION_IDS = Object.keys(REGIONS);

// Rough currency formatting used by every module.
export function fmtMoney(value, region) {
  if (value == null || !Number.isFinite(value)) return '–';
  const r = typeof region === 'string' ? REGIONS[region] : region;
  const abs = Math.abs(value);
  return new Intl.NumberFormat(r.locale, {
    style: 'currency',
    currency: r.currency,
    maximumFractionDigits: abs >= 100 ? 0 : 2,
    minimumFractionDigits: abs >= 100 ? 0 : 2,
  }).format(value);
}

export function fmtNumber(value, digits = 0) {
  if (value == null || !Number.isFinite(value)) return '–';
  return new Intl.NumberFormat('en', { maximumFractionDigits: digits }).format(value);
}
