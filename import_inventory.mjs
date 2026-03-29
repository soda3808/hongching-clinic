import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const SUPABASE_URL = "https://mbmagioqvixeijuaprwk.supabase.co";
const SUPABASE_KEY = "sb_publishable_nDQR3mABsE4yAWdJIXKbwg_1ObETWO5";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const BATCH_SIZE = 50;

function parseStock(raw) {
  // e.g. "藥材: 819.00 克" → 819
  if (!raw) return 0;
  const m = raw.match(/([\d,.]+)/);
  return m ? parseFloat(m[1].replace(/,/g, "")) : 0;
}

function parseNumber(raw) {
  if (!raw) return 0;
  const cleaned = String(raw).replace(/[^0-9.\-]/g, "");
  return cleaned ? parseFloat(cleaned) : 0;
}

function mapStore(raw) {
  if (!raw) return raw;
  if (raw.includes("宋皇臺")) return "宋皇臺";
  if (raw.includes("太子")) return "太子";
  return raw;
}

function parseLine(line) {
  const parts = line.split("|");
  if (parts.length < 12) return null;

  const [
    store,
    name,
    code,
    stockRaw,
    _frozen,
    _remaining,
    avgPrice,
    _stockValue,
    safetyLevel,
    _ratio,
    _barcode,
    supplier,
    // rest ignored
  ] = parts;

  if (!name || !name.trim()) return null;

  return {
    name: name.trim(),
    medicineCode: code?.trim() || null,
    stock: parseStock(stockRaw),
    costPerUnit: parseNumber(avgPrice),
    minStock: parseNumber(safetyLevel),
    supplier: supplier?.trim() || null,
    store: mapStore(store?.trim()),
    category: "中藥",
    unit: "克",
    active: true,
  };
}

async function main() {
  const filePath = new URL("./ectcm_inventory.txt", import.meta.url).pathname;
  console.log(`Reading ${filePath} ...`);

  const raw = readFileSync(filePath, "utf-8");
  const lines = raw.split("\n").filter((l) => l.trim());
  console.log(`Total lines: ${lines.length}`);

  // Parse
  const parsed = lines.map(parseLine).filter(Boolean);
  console.log(`Parsed records: ${parsed.length}`);

  // Dedup by name+store — keep last occurrence
  const dedupMap = new Map();
  for (const rec of parsed) {
    const key = `${rec.name}||${rec.store}`;
    dedupMap.set(key, rec);
  }
  const records = [...dedupMap.values()];
  console.log(`After dedup: ${records.length}`);

  // Batch upsert
  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    const { data, error } = await supabase
      .from("inventory")
      .upsert(batch, { onConflict: "name,store" });

    if (error) {
      console.error(
        `Batch ${Math.floor(i / BATCH_SIZE) + 1} error:`,
        error.message
      );
      errors += batch.length;
    } else {
      inserted += batch.length;
      console.log(
        `Batch ${Math.floor(i / BATCH_SIZE) + 1}: upserted ${batch.length} rows (${inserted}/${records.length})`
      );
    }
  }

  console.log(`\nDone. Upserted: ${inserted}, Errors: ${errors}`);
}

main().catch(console.error);
