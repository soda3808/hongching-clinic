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
    id: uid(), name: (c[1]||'').trim(), category: '中藥', unit: 'g',
    stock: stockMatch ? parseFloat(stockMatch[1]) : 0,
    minStock: parseFloat(c[8]) || 0, costPerUnit: parseFloat(c[6]) || 0,
    supplier: (c[11]||'').trim(), store, medicineCode: (c[2]||'').trim(),
    active: true, createdAt: new Date().toISOString().substring(0,10),
  };
}).filter(i => i.name);

const seen = new Set();
const unique = items.filter(i => { const k = i.name+'|'+i.store; if (seen.has(k)) return false; seen.add(k); return true; });
console.log('Total:', items.length, 'Unique:', unique.length);

let ok = 0;
for (let i = 0; i < unique.length; i += 50) {
  const batch = unique.slice(i, i+50);
  const res = await fetch(SUPABASE_URL+'/rest/v1/inventory', {
    method: 'POST', headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer '+SUPABASE_KEY, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify(batch),
  });
  if (res.ok) { ok += batch.length; console.log('  ✅', ok+'/'+unique.length); }
  else { console.error('  ❌', await res.text()); }
  await new Promise(r => setTimeout(r, 300));
}
console.log('Done!', ok, 'inserted');
