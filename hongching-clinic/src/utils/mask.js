// Data Masking Utilities for PII Protection
// Used for non-authorized roles and exported data

export function maskPhone(phone) {
  if (!phone || phone.length < 4) return '****';
  return phone.slice(0, -4) + '****';
}

export function maskName(name) {
  if (!name || name.length < 2) return '*';
  return name[0] + '*'.repeat(name.length - 1);
}

export function maskEmail(email) {
  if (!email || !email.includes('@')) return '****';
  const [local, domain] = email.split('@');
  return local[0] + '***@' + domain;
}

export function maskAddress(addr) {
  if (!addr) return '****';
  // Show only district/area (first 3 chars or up to first number)
  const match = addr.match(/^[\u4e00-\u9fff]{2,3}/);
  return match ? match[0] + '***' : '****';
}

export function maskIdNumber(id) {
  if (!id || id.length < 4) return '****';
  return id.slice(0, 1) + '***' + id.slice(-1);
}

// Apply masking to a patient record based on role
export function maskPatientData(patient, role) {
  if (role === 'admin' || role === 'manager' || role === 'superadmin') return patient;
  return {
    ...patient,
    phone: maskPhone(patient.phone),
    address: patient.address ? maskAddress(patient.address) : '',
    email: patient.email ? maskEmail(patient.email) : '',
  };
}

// Apply masking to export data
export function maskExportData(rows, sensitiveFields = ['phone', 'address', 'email']) {
  return rows.map(row => {
    const masked = { ...row };
    sensitiveFields.forEach(f => {
      if (masked[f]) {
        if (f === 'phone') masked[f] = maskPhone(masked[f]);
        else if (f === 'email') masked[f] = maskEmail(masked[f]);
        else if (f === 'address') masked[f] = maskAddress(masked[f]);
        else masked[f] = maskName(masked[f]);
      }
    });
    return masked;
  });
}

// Print watermark with user info and timestamp
export function addPrintWatermark(windowRef, userName) {
  if (!windowRef?.document) return;
  const ts = new Date().toLocaleString('zh-HK');
  const style = windowRef.document.createElement('style');
  style.textContent = `
    @media print {
      body::after {
        content: '${userName} | ${ts} | 機密文件';
        position: fixed;
        bottom: 10px;
        right: 10px;
        font-size: 9px;
        color: rgba(0,0,0,0.15);
        transform: rotate(-15deg);
        pointer-events: none;
        z-index: 9999;
      }
    }
  `;
  windowRef.document.head.appendChild(style);
}
