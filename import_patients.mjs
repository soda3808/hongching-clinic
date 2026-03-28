#!/usr/bin/env node
// Import 413 eCTCM patients into Supabase
// Usage: node import_patients.mjs

import { readFileSync } from 'fs';

const SUPABASE_URL = 'https://mbmagioqvixeijuaprwk.supabase.co';
const SUPABASE_KEY = 'sb_publishable_nDQR3mABsE4yAWdJIXKbwg_1ObETWO5';

// Read patient data
const raw = readFileSync('./ectcm_patients.txt', 'utf-8');
const lines = raw.trim().split('\n');
const header = lines[0].split('|'); // code|name|gender|age|phone|createdDate|visits|doctor
const patients = lines.slice(1).map(line => {
  const cols = line.split('|');
  return {
    code: cols[0]?.trim(),
    name: cols[1]?.trim(),
    gender: cols[2]?.trim(),
    age: cols[3]?.trim(),
    phone: cols[4]?.trim(),
    createdDate: cols[5]?.trim(),
    visits: parseInt(cols[6]?.trim()) || 0,
    doctor: cols[7]?.trim(),
  };
});

console.log(`📋 Total patients to import: ${patients.length}`);

// Filter out test accounts
const realPatients = patients.filter(p =>
  p.phone !== '00000000' &&
  p.phone !== '123456789' &&
  p.phone !== '12345688' &&
  p.phone !== '11111111' &&
  p.name !== '測試' &&
  p.name !== '通用顧客' &&
  p.name !== 'LION' &&
  p.name !== 'LIONA'
);
console.log(`✅ After filtering test accounts: ${realPatients.length} real patients`);

// Fetch existing patients to avoid duplicates
const existingRes = await fetch(`${SUPABASE_URL}/rest/v1/patients?select=id,name,phone`, {
  headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
});
const existing = await existingRes.json();
const existingNames = new Set(existing.map(p => p.name));
console.log(`📦 Existing patients in Supabase: ${existing.length}`);

// Generate unique IDs
function uid() {
  return Math.random().toString(36).substring(2, 15);
}

// Determine store from doctor
function getStore(doctor) {
  if (doctor.includes('許植輝')) return '宋皇臺';
  if (doctor.includes('常凱晴')) return '太子';
  if (doctor.includes('曾其方')) return '宋皇臺';
  if (doctor.includes('余耀安')) return '太子';
  return '';
}

// Calculate approximate DOB from age
function ageToDob(ageStr) {
  const age = parseInt(ageStr);
  if (!age || age < 1) return '';
  const year = new Date().getFullYear() - age;
  return `${year}-01-01`;
}

// Build records
const records = realPatients
  .filter(p => !existingNames.has(p.name)) // Skip duplicates
  .map(p => ({
    id: uid(),
    name: p.name,
    phone: p.phone,
    gender: p.gender,
    dob: ageToDob(p.age),
    address: '',
    allergies: '',
    notes: `eCTCM: ${p.code}`,
    store: getStore(p.doctor),
    doctor: p.doctor.replace('(D)', '').trim(),
    status: 'active',
    firstVisit: p.createdDate,
    lastVisit: '',
    totalVisits: p.visits,
    totalSpent: 0,
    createdAt: p.createdDate,
  }));

console.log(`🆕 New patients to insert: ${records.length}`);

if (records.length === 0) {
  console.log('ℹ️  All patients already exist. Nothing to import.');
  process.exit(0);
}

// Batch upsert (50 at a time)
const BATCH_SIZE = 50;
let inserted = 0;
let failed = 0;

for (let i = 0; i < records.length; i += BATCH_SIZE) {
  const batch = records.slice(i, i + BATCH_SIZE);

  const res = await fetch(`${SUPABASE_URL}/rest/v1/patients`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify(batch),
  });

  if (res.ok) {
    inserted += batch.length;
    console.log(`  ✅ Batch ${Math.floor(i/BATCH_SIZE)+1}: ${batch.length} patients inserted (${inserted}/${records.length})`);
  } else {
    const err = await res.text();
    console.error(`  ❌ Batch ${Math.floor(i/BATCH_SIZE)+1} failed: ${err}`);
    failed += batch.length;
  }

  // Small delay to avoid rate limits
  await new Promise(r => setTimeout(r, 500));
}

console.log(`\n🎉 Import complete!`);
console.log(`   ✅ Inserted: ${inserted}`);
console.log(`   ❌ Failed: ${failed}`);
console.log(`   📊 Total in Supabase: ${existing.length + inserted}`);
