#!/usr/bin/env node
// Fetches Google reviews via the Places API (New) and writes reviews.json.
// Run: GOOGLE_MAPS_API_KEY=... GOOGLE_PLACE_ID=... node scripts/fetch-google-reviews.mjs

import { writeFile, readFile, readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'reviews.json');

const API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const PLACE_ID = process.env.GOOGLE_PLACE_ID;
const MIN_RATING = Number(process.env.MIN_RATING || 4);
const MAX_REVIEWS = Number(process.env.MAX_REVIEWS || 5);

if (!API_KEY || !PLACE_ID) {
  console.error('Missing GOOGLE_MAPS_API_KEY or GOOGLE_PLACE_ID.');
  process.exit(1);
}

const FIELDS = 'id,displayName,rating,userRatingCount,googleMapsUri,reviews';

const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(PLACE_ID)}`, {
  headers: { 'X-Goog-Api-Key': API_KEY, 'X-Goog-FieldMask': FIELDS },
});

if (!res.ok) {
  console.error(`Places API ${res.status}: ${(await res.text()).slice(0, 500)}`);
  process.exit(1);
}

const place = await res.json();

const reviews = (place.reviews || [])
  .filter((r) => typeof r.rating === 'number' && r.rating >= MIN_RATING)
  .filter((r) => (r.text?.text || r.originalText?.text || '').trim().length > 0)
  .sort((a, b) => new Date(b.publishTime) - new Date(a.publishTime))
  .slice(0, MAX_REVIEWS)
  .map((r) => ({
    rating: r.rating,
    text: (r.text?.text || r.originalText?.text).trim(),
    author: r.authorAttribution?.displayName || 'Google user',
    publishTime: r.publishTime,
    relativeTime: r.relativePublishTimeDescription || '',
  }));

// A run that returns nothing usable should not blank the site's review section.
if (reviews.length === 0) {
  console.error('Places API returned no usable reviews — keeping the existing reviews.json.');
  process.exit(1);
}

const next = {
  rating: place.rating ?? null,
  reviewCount: place.userRatingCount ?? null,
  mapsUri: place.googleMapsUri || '',
  updatedAt: new Date().toISOString(),
  reviews,
};

// The JSON-LD aggregateRating is static markup for crawlers, so it can't be
// filled in by the client-side renderer — rewrite it here instead, keeping
// the structured data and the visible count from drifting apart.
async function syncSchema(rating, count) {
  if (rating == null || count == null) return 0;
  const pattern =
    /("aggregateRating"\s*:\s*\{[^}]*?"ratingValue"\s*:\s*")[^"]*("[^}]*?"reviewCount"\s*:\s*")[^"]*(")/g;
  let changed = 0;
  for (const name of (await readdir(ROOT)).filter((f) => f.endsWith('.html'))) {
    const file = resolve(ROOT, name);
    const html = await readFile(file, 'utf8');
    const updated = html.replace(pattern, `$1${rating}$2${count}$3`);
    if (updated !== html) {
      await writeFile(file, updated);
      changed++;
    }
  }
  return changed;
}

const schemaUpdates = await syncSchema(next.rating, next.reviewCount);
if (schemaUpdates) console.log(`Updated aggregateRating in ${schemaUpdates} page(s).`);

// updatedAt always differs, so compare everything else to avoid empty commits.
const stable = (o) => JSON.stringify({ ...o, updatedAt: null });
const prev = await readFile(OUT, 'utf8').then(JSON.parse).catch(() => null);
if (prev && stable(prev) === stable(next)) {
  console.log('No change in reviews.');
  process.exit(0);
}

await writeFile(OUT, JSON.stringify(next, null, 2) + '\n');
console.log(`Wrote ${reviews.length} reviews (rating ${next.rating}, ${next.reviewCount} total).`);
