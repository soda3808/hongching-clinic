import { useEffect, useRef } from 'react';

export default function ConfirmModal({ message, onConfirm, onCancel }) {
  const cancelRef = useRef(null);
  useEffect(() => { cancelRef.current?.focus(); }, []);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onCancel]);

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="confirm-modal" onClick={e => e.stopPropagation()}>
        <div className="confirm-icon">⚠️</div>
        <div className="confirm-msg">{message || '確認刪除此紀錄？此操作無法復原。'}</div>
        <div className="confirm-actions">
          <button ref={cancelRef} className="btn btn-outline" onClick={onCancel}>取消</button>
          <button className="btn btn-red" onClick={onConfirm}>確認刪除</button>
        </div>
      </div>
    </div>
  );
}
