import { useState, useEffect } from 'react';
import { onSyncChange, getSyncStatus, flushOfflineQueue } from '../api';

const STATUS_CONFIG = {
  idle: { icon: '●', color: '#22c55e', label: '已同步' },
  syncing: { icon: '↻', color: '#f59e0b', label: '同步中...' },
  offline: { icon: '○', color: '#9ca3af', label: '離線模式' },
  error: { icon: '!', color: '#ef4444', label: '同步失敗' },
};

export default function SyncIndicator() {
  const [sync, setSync] = useState(getSyncStatus);

  useEffect(() => {
    const unsub = onSyncChange(setSync);
    return unsub;
  }, []);

  // Also listen for online/offline events
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  useEffect(() => {
    const onOn = () => setOnline(true);
    const onOff = () => setOnline(false);
    window.addEventListener('online', onOn);
    window.addEventListener('offline', onOff);
    return () => { window.removeEventListener('online', onOn); window.removeEventListener('offline', onOff); };
  }, []);

  const effectiveStatus = !online ? 'offline' : sync.status;
  const cfg = STATUS_CONFIG[effectiveStatus] || STATUS_CONFIG.idle;

  return (
    <div
      onClick={sync.pending > 0 && online ? () => flushOfflineQueue() : undefined}
      title={sync.pending > 0 ? `${sync.pending} 筆待同步 — 點擊重試` : cfg.label}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        fontSize: 10, color: cfg.color, cursor: sync.pending > 0 && online ? 'pointer' : 'default',
        padding: '2px 8px', borderRadius: 10,
        background: effectiveStatus === 'error' ? '#fef2f2' : effectiveStatus === 'offline' ? '#f3f4f6' : 'transparent',
        animation: effectiveStatus === 'syncing' ? 'pulse 1.5s infinite' : 'none',
        transition: 'all .3s',
      }}
    >
      <span style={{
        display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
        background: cfg.color,
        animation: effectiveStatus === 'syncing' ? 'pulse 1.5s infinite' : 'none',
      }} />
      <span style={{ fontWeight: 600 }}>{cfg.label}</span>
      {sync.pending > 0 && <span style={{ fontWeight: 700 }}>({sync.pending})</span>}
    </div>
  );
}
