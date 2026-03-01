import { useState, useEffect, useCallback, useRef } from 'react';

// Session manager: idle timeout warning + token refresh
export default function useSessionManager({ user, onLogout, showToast, idleMinutes = 30, warningMinutes = 5 }) {
  const [showIdleWarning, setShowIdleWarning] = useState(false);
  const idleTimerRef = useRef(null);
  const warningTimerRef = useRef(null);
  const lastActivityRef = useRef(Date.now());

  const resetTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
    setShowIdleWarning(false);

    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);

    if (!user) return;

    // Warning at (idle - warning) minutes
    warningTimerRef.current = setTimeout(() => {
      setShowIdleWarning(true);
    }, (idleMinutes - warningMinutes) * 60000);

    // Logout at idle minutes
    idleTimerRef.current = setTimeout(() => {
      showToast('\u56E0\u9592\u7F6E\u904E\u4E45\u5DF2\u81EA\u52D5\u767B\u51FA', 'warning');
      onLogout();
    }, idleMinutes * 60000);
  }, [user, onLogout, showToast, idleMinutes, warningMinutes]);

  // Track user activity
  useEffect(() => {
    if (!user) return;

    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    const handler = () => resetTimer();
    events.forEach(e => document.addEventListener(e, handler, { passive: true }));
    resetTimer();

    return () => {
      events.forEach(e => document.removeEventListener(e, handler));
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    };
  }, [user, resetTimer]);

  // Token refresh check (every 5 minutes)
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      try {
        const token = sessionStorage.getItem('hcmc_jwt');
        if (!token) return;
        // Check if token expires within 2 hours — refresh
        const payload = JSON.parse(atob(token.split('.')[1]));
        const expiresIn = payload.exp * 1000 - Date.now();
        if (expiresIn < 2 * 60 * 60 * 1000 && expiresIn > 0) {
          // Token expires in < 2 hours, attempt refresh
          fetch('/api/auth?action=verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          }).then(r => r.json()).then(data => {
            if (data.token) sessionStorage.setItem('hcmc_jwt', data.token);
          }).catch(() => {}); // Silent fail
        }
      } catch {}
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [user]);

  return { showIdleWarning, dismissWarning: () => { setShowIdleWarning(false); resetTimer(); } };
}

// Idle warning overlay component
export function IdleWarning({ minutes, onDismiss, onLogout }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 24, maxWidth: 340, textAlign: 'center', boxShadow: '0 20px 40px rgba(0,0,0,.2)' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>{'\u23F0'}</div>
        <h3 style={{ margin: '0 0 8px', fontSize: 16 }}>{'\u9592\u7F6E\u63D0\u9192'}</h3>
        <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 20 }}>
          {'\u4F60\u5DF2\u7D93'} {minutes} {'\u5206\u9418\u5192\u64CD\u4F5C\uFF0C'}{5} {'\u5206\u9418\u5F8C\u6703\u81EA\u52D5\u767B\u51FA\u3002'}
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <button onClick={onDismiss} style={{ padding: '8px 20px', background: '#0e7490', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>{'\u7E7C\u7E8C\u4F7F\u7528'}</button>
          <button onClick={onLogout} style={{ padding: '8px 20px', background: '#e5e7eb', color: '#374151', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>{'\u767B\u51FA'}</button>
        </div>
      </div>
    </div>
  );
}
