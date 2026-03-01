import { useState, useMemo, useRef, useEffect } from 'react';

export default function usePagination(items, pageSize = 50) {
  const [page, setPage] = useState(1);

  const totalPages = Math.ceil((items?.length || 0) / pageSize);
  const paged = useMemo(() => {
    if (!items?.length) return [];
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page, pageSize]);

  // Reset to page 1 when items change significantly
  // (e.g., filter changed)
  const prevLen = useRef(items?.length || 0);
  useEffect(() => {
    if (Math.abs((items?.length || 0) - prevLen.current) > pageSize) {
      setPage(1);
    }
    prevLen.current = items?.length || 0;
  }, [items?.length, pageSize]);

  return {
    paged,
    page,
    setPage,
    totalPages,
    totalItems: items?.length || 0,
    pageSize,
    hasNext: page < totalPages,
    hasPrev: page > 1,
    next: () => setPage(p => Math.min(p + 1, totalPages)),
    prev: () => setPage(p => Math.max(p - 1, 1)),
  };
}

// Reusable Pagination UI component
export function PaginationBar({ page, totalPages, totalItems, pageSize, setPage, hasNext, hasPrev, next, prev }) {
  if (totalPages <= 1) return null;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', fontSize: 12, color: '#6b7280' }}>
      <span>顯示 {start}-{end} / {totalItems} 筆</span>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <button disabled={!hasPrev} onClick={() => setPage(1)} style={pgBtnStyle(!hasPrev)}>«</button>
        <button disabled={!hasPrev} onClick={prev} style={pgBtnStyle(!hasPrev)}>‹</button>
        <span style={{ padding: '0 8px', fontWeight: 600 }}>{page} / {totalPages}</span>
        <button disabled={!hasNext} onClick={next} style={pgBtnStyle(!hasNext)}>›</button>
        <button disabled={!hasNext} onClick={() => setPage(totalPages)} style={pgBtnStyle(!hasNext)}>»</button>
      </div>
    </div>
  );
}

function pgBtnStyle(disabled) {
  return {
    padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: 4, cursor: disabled ? 'default' : 'pointer',
    background: disabled ? '#f3f4f6' : '#fff', color: disabled ? '#d1d5db' : '#374151', fontSize: 12, fontWeight: 600,
  };
}
