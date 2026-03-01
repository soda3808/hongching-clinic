import { useEffect, useCallback } from 'react';

// Global keyboard shortcuts for power users
// All shortcuts use Ctrl/Cmd + key
export default function useKeyboardShortcuts(handlers) {
  // handlers = { onNavigate, onSearch, onReload, onSave, showToast }

  useEffect(() => {
    function handleKeyDown(e) {
      const isMac = navigator.platform.includes('Mac');
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (!mod) return;

      switch (e.key.toLowerCase()) {
        case 'k': // Cmd+K = Open search
          e.preventDefault();
          handlers.onSearch?.();
          break;
        case 'b': // Cmd+B = New booking
          e.preventDefault();
          handlers.onNavigate?.('booking');
          break;
        case 'p': // Cmd+P = Patients (override print)
          if (e.shiftKey) { // Cmd+Shift+P = Patients
            e.preventDefault();
            handlers.onNavigate?.('patient');
          }
          break;
        case 'e': // Cmd+E = EMR
          e.preventDefault();
          handlers.onNavigate?.('emr');
          break;
        case 'd': // Cmd+D = Dashboard
          e.preventDefault();
          handlers.onNavigate?.('dash');
          break;
        case 'r': // Cmd+R = Revenue (if shift)
          if (e.shiftKey) {
            e.preventDefault();
            handlers.onNavigate?.('rev');
          }
          break;
        case 's': // Cmd+S = Save (prevent default, trigger save if handler exists)
          e.preventDefault();
          handlers.onSave?.();
          break;
        case '/': // Cmd+/ = Show shortcuts help
          e.preventDefault();
          handlers.onShowHelp?.();
          break;
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handlers]);
}

// Shortcuts help overlay component
export function ShortcutsHelp({ onClose }) {
  const isMac = typeof navigator !== 'undefined' && navigator.platform.includes('Mac');
  const mod = isMac ? '\u2318' : 'Ctrl';

  const shortcuts = [
    { keys: `${mod}+K`, action: '\u641C\u5C0B' },
    { keys: `${mod}+D`, action: '\u4E3B\u9801/Dashboard' },
    { keys: `${mod}+B`, action: '\u9810\u7D04' },
    { keys: `${mod}+E`, action: '\u8A3A\u75C7/EMR' },
    { keys: `${mod}+\u21E7+P`, action: '\u75C5\u4EBA\u5217\u8868' },
    { keys: `${mod}+\u21E7+R`, action: '\u71DF\u696D\u984D' },
    { keys: `${mod}+S`, action: '\u5132\u5B58' },
    { keys: `${mod}+/`, action: '\u5FEB\u6377\u9375\u8AAA\u660E' },
    { keys: 'Esc', action: '\u95DC\u9589\u5F48\u7A97' },
  ];

  // Render a modal overlay with the shortcuts list, styled inline
  // Background: semi-transparent black
  // Card: white, rounded, centered, max-width 360px
  // Each shortcut: flex row with key badge + description
  // Close button or click outside to close

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 24, maxWidth: 360, width: '90%', boxShadow: '0 20px 40px rgba(0,0,0,.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>{'\u2328\uFE0F'} {'\u5FEB\u6377\u9375'}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#999' }}>{'\u2715'}</button>
        </div>
        {shortcuts.map(s => (
          <div key={s.keys} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}>
            <span style={{ fontSize: 13, color: '#374151' }}>{s.action}</span>
            <kbd style={{ fontSize: 11, background: '#f3f4f6', padding: '2px 8px', borderRadius: 4, border: '1px solid #d1d5db', fontFamily: 'monospace', color: '#4b5563' }}>{s.keys}</kbd>
          </div>
        ))}
      </div>
    </div>
  );
}
