// eCTCM-style UI constants and shared styles
// Matches the look and feel of 中醫在線 system

// ── Colors ──
export const ECTCM = {
  // Header / nav
  headerBg: '#006666',
  headerText: '#fff',
  headerBorder: '#005555',

  // Sub-nav / tabs
  tabActiveBg: '#fff',
  tabActiveText: '#333',
  tabBg: '#e0e0e0',
  tabText: '#666',

  // Filter bar
  filterBg: '#ffffcc',
  filterBorder: '#cccc99',

  // Table
  thBg: '#008080',
  thText: '#fff',
  trEvenBg: '#f0fafa',
  trOddBg: '#fff',
  trHoverBg: '#e0f0f0',
  tdBorder: '#cde0e0',

  // Buttons
  btnPrimary: '#006699',
  btnPrimaryText: '#fff',
  btnSuccess: '#228B22',
  btnSuccessText: '#fff',
  btnWarning: '#cc6600',
  btnWarningText: '#fff',
  btnDanger: '#cc0000',

  // Status tags
  tagGreen: { bg: '#e6ffe6', color: '#006600', border: '#99cc99' },
  tagOrange: { bg: '#fff3e0', color: '#cc6600', border: '#ffcc80' },
  tagRed: { bg: '#ffe6e6', color: '#cc0000', border: '#ff9999' },
  tagBlue: { bg: '#e6f0ff', color: '#0066cc', border: '#99ccff' },

  // Text
  link: '#0066cc',
  text: '#333',
  textLight: '#666',
  textMuted: '#999',

  // Layout
  pageBg: '#f5f5f5',
  cardBg: '#fff',
  borderColor: '#ddd',
};

// ── Shared inline styles ──
export const S = {
  // Page container
  page: {
    background: ECTCM.pageBg,
    minHeight: '100%',
    fontFamily: "'Microsoft YaHei', 'PingFang TC', sans-serif",
    fontSize: 13,
  },

  // Page title bar (like "配藥/收費 > 配藥/收費列表")
  titleBar: {
    background: ECTCM.headerBg,
    color: ECTCM.headerText,
    padding: '6px 12px',
    fontSize: 13,
    fontWeight: 600,
  },

  // Filter bar (yellow background with inputs)
  filterBar: {
    background: ECTCM.filterBg,
    padding: '6px 12px',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    borderBottom: `1px solid ${ECTCM.filterBorder}`,
    fontSize: 13,
  },

  // Filter input
  filterInput: {
    padding: '3px 8px',
    border: '1px solid #999',
    borderRadius: 2,
    fontSize: 13,
    height: 26,
    boxSizing: 'border-box',
  },

  // Filter select
  filterSelect: {
    padding: '3px 6px',
    border: '1px solid #999',
    borderRadius: 2,
    fontSize: 13,
    height: 26,
    boxSizing: 'border-box',
    background: '#fff',
  },

  // Filter label
  filterLabel: {
    fontSize: 13,
    fontWeight: 600,
    color: '#333',
    whiteSpace: 'nowrap',
  },

  // Action button (toolbar)
  actionBtn: {
    padding: '4px 12px',
    background: ECTCM.btnPrimary,
    color: '#fff',
    border: '1px solid #005588',
    borderRadius: 3,
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 600,
    whiteSpace: 'nowrap',
  },

  // Green action button
  actionBtnGreen: {
    padding: '4px 12px',
    background: ECTCM.btnSuccess,
    color: '#fff',
    border: '1px solid #1a6b1a',
    borderRadius: 3,
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 600,
    whiteSpace: 'nowrap',
  },

  // Orange/warning action button
  actionBtnOrange: {
    padding: '4px 12px',
    background: ECTCM.btnWarning,
    color: '#fff',
    border: '1px solid #995500',
    borderRadius: 3,
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 600,
    whiteSpace: 'nowrap',
  },

  // Table
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 13,
    tableLayout: 'auto',
  },

  // Table header
  th: {
    background: ECTCM.thBg,
    color: ECTCM.thText,
    padding: '6px 8px',
    textAlign: 'left',
    fontWeight: 600,
    fontSize: 12,
    borderBottom: '2px solid #006060',
    whiteSpace: 'nowrap',
    position: 'sticky',
    top: 0,
    zIndex: 1,
  },

  // Table cell
  td: {
    padding: '5px 8px',
    borderBottom: `1px solid ${ECTCM.tdBorder}`,
    fontSize: 13,
    verticalAlign: 'middle',
  },

  // Table row (even)
  trEven: {
    background: ECTCM.trEvenBg,
  },

  // Table row (odd)
  trOdd: {
    background: ECTCM.trOddBg,
  },

  // Quick action tabs (like 掛號列表 | 網上預約列表 | 顧客列表)
  tabBar: {
    display: 'flex',
    gap: 0,
    borderBottom: '2px solid ' + ECTCM.headerBg,
    background: '#e8e8e8',
  },

  tab: {
    padding: '6px 16px',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
    border: '1px solid #ccc',
    borderBottom: 'none',
    borderRadius: '4px 4px 0 0',
    background: '#e0e0e0',
    color: '#666',
    marginRight: 2,
  },

  tabActive: {
    padding: '6px 16px',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 700,
    border: '1px solid ' + ECTCM.headerBg,
    borderBottom: '2px solid #fff',
    borderRadius: '4px 4px 0 0',
    background: '#fff',
    color: '#333',
    marginRight: 2,
    marginBottom: -2,
    position: 'relative',
    zIndex: 1,
  },

  // Quick action toolbar (搜索顧客 | 新增顧客 | 掛號 | 快速掛號)
  toolbar: {
    display: 'flex',
    gap: 6,
    padding: '6px 12px',
    background: '#f0f0f0',
    borderBottom: '1px solid #ddd',
    flexWrap: 'wrap',
    alignItems: 'center',
  },

  // Link style (like eCTCM blue links)
  link: {
    color: ECTCM.link,
    textDecoration: 'none',
    cursor: 'pointer',
    fontSize: 12,
  },

  // Stats footer
  footer: {
    padding: '6px 12px',
    background: '#f8f8f8',
    borderTop: '1px solid #ddd',
    fontSize: 12,
    color: '#666',
  },

  // Summary stat card (compact)
  statCard: {
    display: 'inline-flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '8px 16px',
    background: '#fff',
    border: '1px solid #ddd',
    borderRadius: 4,
    minWidth: 80,
  },

  statValue: {
    fontSize: 20,
    fontWeight: 700,
    color: ECTCM.headerBg,
  },

  statLabel: {
    fontSize: 11,
    color: '#999',
    marginTop: 2,
  },
};

// ── Helper: get row style based on index ──
export function rowStyle(idx) {
  return idx % 2 === 0 ? S.trOdd : S.trEven;
}

// ── Helper: status tag ──
export function statusTag(label, type = 'blue') {
  const colors = ECTCM[`tag${type.charAt(0).toUpperCase() + type.slice(1)}`] || ECTCM.tagBlue;
  return {
    display: 'inline-block',
    padding: '1px 8px',
    borderRadius: 3,
    fontSize: 11,
    fontWeight: 600,
    background: colors.bg,
    color: colors.color,
    border: `1px solid ${colors.border}`,
  };
}
