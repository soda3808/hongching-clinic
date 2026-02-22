// ══════════════════════════════════════════════
// 康晴診所管理系統 — Google Apps Script Backend
// ══════════════════════════════════════════════

const SS_ID = PropertiesService.getScriptProperties().getProperty('SHEET_ID') || SpreadsheetApp.getActiveSpreadsheet().getId();

function doGet(e) {
  const ss = SpreadsheetApp.openById(SS_ID);
  const action = e.parameter.action;

  if (action === 'loadAll') {
    const result = {
      revenue: sheetToJson(ss, 'revenue'),
      expenses: sheetToJson(ss, 'expenses'),
      arap: sheetToJson(ss, 'arap'),
      payslips: sheetToJson(ss, 'payslips'),
      patients: sheetToJson(ss, 'patients'),
      bookings: sheetToJson(ss, 'bookings'),
    };
    return jsonResponse(result);
  }

  if (action === 'export') {
    const sheet = e.parameter.sheet || 'revenue';
    const month = e.parameter.month || '';
    let rows = sheetToJson(ss, sheet);
    if (month) rows = rows.filter(r => String(r.date || '').substring(0, 7) === month);
    return jsonResponse(rows);
  }

  return jsonResponse({ error: 'Unknown action' });
}

function doPost(e) {
  const ss = SpreadsheetApp.openById(SS_ID);
  const body = JSON.parse(e.postData.contents);
  const action = body.action;

  const HANDLERS = {
    saveRevenue:  () => saveRecord(ss, 'revenue', body.record, ['id','date','name','item','amount','payment','store','doctor','note']),
    saveExpense:  () => saveRecord(ss, 'expenses', body.record, ['id','date','merchant','amount','category','store','payment','desc','receipt']),
    saveARAP:     () => saveRecord(ss, 'arap', body.record, ['id','type','date','party','amount','dueDate','status','desc']),
    savePayslip:  () => saveRecord(ss, 'payslips', body.record, ['id','date','empName','empPos','period','base','commission','bonus','allowance','deduction','mpfEE','mpfER','net']),
    savePatient:  () => saveRecord(ss, 'patients', body.record, ['id','name','phone','gender','dob','address','allergies','notes','firstVisit','lastVisit','totalVisits','totalSpent','store','doctor','status','createdAt']),
    saveBooking:  () => saveRecord(ss, 'bookings', body.record, ['id','patientName','patientPhone','date','time','duration','doctor','store','type','status','notes','createdAt']),
    deleteRecord: () => deleteRecord(ss, body.sheet, body.id),
    bulkImport:   () => bulkImport(ss, body.data),
    uploadReceipt:() => uploadReceipt(body.fileData, body.fileName, body.mimeType),
  };

  const handler = HANDLERS[action];
  if (!handler) return jsonResponse({ error: 'Unknown action' });

  try {
    const result = handler();
    return jsonResponse({ ok: true, ...result });
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

// ── Sheet Helpers ──

function getOrCreateSheet(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setFontWeight('bold').setFontColor('#ffffff').setBackground('#0e7490');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function sheetToJson(ss, name) {
  const sheet = ss.getSheetByName(name);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  return data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => {
      let val = row[i];
      if (val instanceof Date) {
        val = Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      }
      obj[h] = val;
    });
    return obj;
  });
}

function saveRecord(ss, sheetName, record, headers) {
  const sheet = getOrCreateSheet(ss, sheetName, headers);
  // Check if record exists (update) or new (append)
  const data = sheet.getDataRange().getValues();
  const idCol = 0; // id is first column
  for (let i = 1; i < data.length; i++) {
    if (data[i][idCol] === record.id) {
      // Update existing row
      const row = headers.map(h => record[h] !== undefined ? record[h] : '');
      sheet.getRange(i + 1, 1, 1, row.length).setValues([row]);
      return { updated: true };
    }
  }
  // Append new row
  const row = headers.map(h => record[h] !== undefined ? record[h] : '');
  sheet.appendRow(row);
  return { created: true };
}

function deleteRecord(ss, sheetName, id) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return { deleted: false };
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      sheet.deleteRow(i + 1);
      return { deleted: true };
    }
  }
  return { deleted: false };
}

function bulkImport(ss, data) {
  const counts = {};
  Object.keys(data).forEach(sheetName => {
    const records = data[sheetName];
    if (!Array.isArray(records) || records.length === 0) return;
    const headers = Object.keys(records[0]);
    const sheet = getOrCreateSheet(ss, sheetName, headers);
    // Clear existing data (keep header)
    if (sheet.getLastRow() > 1) {
      sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
    }
    const rows = records.map(r => headers.map(h => r[h] !== undefined ? r[h] : ''));
    if (rows.length > 0) {
      sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
    }
    counts[sheetName] = rows.length;
  });
  return { counts };
}

function uploadReceipt(fileData, fileName, mimeType) {
  const folder = getOrCreateFolder('HCMC_Receipts');
  const blob = Utilities.newBlob(Utilities.base64Decode(fileData), mimeType, fileName);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return {
    fileId: file.getId(),
    url: file.getUrl(),
    viewUrl: `https://drive.google.com/uc?id=${file.getId()}`,
  };
}

function getOrCreateFolder(name) {
  const folders = DriveApp.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(name);
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
