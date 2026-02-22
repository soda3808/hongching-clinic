// ══════════════════════════════════
// Data Export / Import Utilities
// ══════════════════════════════════

export function exportCSV(data, headers, filename) {
  const headerRow = headers.map(h => h.label || h.key).join(',');
  const keys = headers.map(h => h.key);
  const rows = data.map(row =>
    keys.map(k => {
      let val = row[k] !== undefined ? String(row[k]) : '';
      if (val.includes(',') || val.includes('"') || val.includes('\n')) {
        val = '"' + val.replace(/"/g, '""') + '"';
      }
      return val;
    }).join(',')
  );
  const csv = '\uFEFF' + headerRow + '\n' + rows.join('\n');
  downloadBlob(csv, filename, 'text/csv;charset=utf-8');
}

export function exportJSON(allData, filename) {
  const json = JSON.stringify(allData, null, 2);
  downloadBlob(json, filename, 'application/json');
}

export function importJSON(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!data || typeof data !== 'object') {
          reject(new Error('Invalid JSON format'));
          return;
        }
        const valid = ['revenue', 'expenses', 'arap', 'patients', 'bookings', 'payslips'];
        const hasValid = valid.some(k => Array.isArray(data[k]));
        if (!hasValid) {
          reject(new Error('JSON does not contain valid data collections'));
          return;
        }
        resolve(data);
      } catch (err) {
        reject(new Error('Failed to parse JSON: ' + err.message));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

function downloadBlob(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
