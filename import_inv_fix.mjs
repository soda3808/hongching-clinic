import { readFileSync } from 'fs';
const SUPABASE_URL = 'https://mbmagioqvixeijuaprwk.supabase.co';
const SUPABASE_KEY = 'sb_publishable_nDQR3mABsE4yAWdJIXKbwg_1ObETWO5';
const uid = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 8);

const raw = readFileSync('/Users/stevenlam/Downloads/ectcm_inventory_537.txt', 'utf-8');
const lines = raw.trim().split('\n').slice(1);
const items = lines.map(line => {
  const clean = line.replace(/^\d+\t/, '');
  const c = clean.split('|');
  const store = (c[0]||'').includes('宋皇臺') ? '宋皇臺' : (c[0]||'').includes('太子') ? '太子' : '';
  const stockMatch = (c[3]||'').match(/([\d.]+)/);
  return {
    id: uid(), name: (c[1]||'').trim(), category: '中藥', unit: '克',
    stock: stockMatch ? parseFloat(stockMatch[1]) : 0,
    minStock: parseFloat(c[8]) || 0, costPerUnit: parseFloat(c[6]) || 0,
    supplier: (c[11]||'').trim(), store, medicineCode: (c[2]||'').trim(),
    active: true,
  };
}).filter(i => i.name);

const seen = new Set();
const unique = items.filter(i => { const k = i.name+'|'+i.store; if (seen.has(k)) return false; seen.add(k); return true; });

// Check existing
const exRes = await fetch(SUPABASE_URL+'/rest/v1/inventory?select=name,store&limit=1000', {
  headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer '+SUPABASE_KEY },
});
const existing = await exRes.json();
const exKeys = new Set((existing||[]).map(i => i.name+'|'+i.store));
const toInsert = unique.filter(i => !exKeys.has(i.name+'|'+i.store));
console.log('Total:', items.length, 'Unique:', unique.length, 'Existing:', (existing||[]).length, 'New:', toInsert.length);

let ok = 0;
for (let i = 0; i < toInsert.length; i += 50) {
  const batch = toInsert.slice(i, i+50);
  const res = await fetch(SUPABASE_URL+'/rest/v1/inventory', {
    method: 'POST', headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer '+SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(batch),
  });
  if (res.ok) { ok += batch.length; console.log('  ✅', ok+'/'+toInsert.length); }
  else { const e = await res.text(); console.error('  ❌', e.substring(0,100)); break; }
  await new Promise(r => setTimeout(r, 300));
}
console.log('Done!', ok, 'inserted. Total in DB:', (existing||[]).length + ok);
