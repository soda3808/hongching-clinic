// Utility to import inventory from 中醫在線 XLS export
// Usage: Call importInventoryFromXLS(fileContent) with the HTML content of the .xls file

export function parseInventoryXLS(htmlContent) {
  // Parse HTML table
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent, 'text/html');
  const rows = doc.querySelectorAll('tr');

  const records = [];
  let isHeader = true;

  rows.forEach((row) => {
    const cells = Array.from(row.querySelectorAll('td, th')).map(c => c.textContent.trim());
    if (isHeader) { isHeader = false; return; }
    if (cells.length < 9) return;

    const [storeRaw, name, code, medType, , currentQty, frozen, remaining] = cells;
    if (!name) return;

    const store = storeRaw.includes('宋皇臺') ? '宋皇臺' : storeRaw.includes('太子') ? '太子' : storeRaw;
    const stock = parseFloat(remaining) || 0;
    const catMap = { '單味顆粒': '顆粒-單味', '複方顆粒': '顆粒-複方', '藥材': '飲片' };
    const category = catMap[medType] || medType;
    const minStock = stock > 0 ? Math.min(Math.max(10, Math.round(stock * 0.15)), 50) : 10;

    records.push({
      id: `inv_${code.replace(/-/g, '')}_${records.length}`,
      name,
      code,
      category,
      type: medType,
      stock,
      unit: 'g',
      minStock,
      store,
      supplier: '',
      price: 0,
      note: '',
      createdAt: new Date().toISOString().substring(0, 10),
    });
  });

  return records;
}

// Generate summary stats from parsed records
export function getImportSummary(records) {
  const byType = {};
  const byStore = {};
  let withStock = 0;
  let totalStock = 0;

  records.forEach(r => {
    byType[r.type] = (byType[r.type] || 0) + 1;
    byStore[r.store] = (byStore[r.store] || 0) + 1;
    if (r.stock > 0) { withStock++; totalStock += r.stock; }
  });

  return { total: records.length, byType, byStore, withStock, totalStock: Math.round(totalStock) };
}
