import { useEffect, useRef, useCallback } from 'react';

function useFocusTrap(ref) {
  useEffect(() => {
    const el = ref?.current;
    if (!el) return;
    const focusable = el.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    first.focus();
    const handler = (e) => {
      if (e.key !== 'Tab') return;
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    el.addEventListener('keydown', handler);
    return () => el.removeEventListener('keydown', handler);
  }, [ref]);
}

const nullRef = { current: null };

export { useFocusTrap, nullRef };

export default function ConfirmModal({ message, onConfirm, onCancel }) {
  const modalRef = useRef(null);
  useFocusTrap(modalRef);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onCancel]);

  return (
    <div className="modal-overlay" onClick={onCancel} role="dialog" aria-modal="true" aria-label="確認對話框">
      <div className="confirm-modal" onClick={e => e.stopPropagation()} ref={modalRef}>
        <div className="confirm-icon">⚠️</div>
        <div className="confirm-msg">{message || '確認刪除此紀錄？此操作無法復原。'}</div>
        <div className="confirm-actions">
          <button className="btn btn-outline" onClick={onCancel}>取消</button>
          <button className="btn btn-red" onClick={onConfirm}>確認刪除</button>
        </div>
      </div>
    </div>
  );
}
