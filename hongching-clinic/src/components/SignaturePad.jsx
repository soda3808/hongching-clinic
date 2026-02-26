import { useState, useRef, useEffect, useCallback } from 'react';

/**
 * Reusable electronic signature pad component.
 * - Canvas-based, supports touch + mouse + stylus
 * - Returns base64 PNG via onConfirm callback
 * - Modal overlay follows existing app patterns
 * - "Remember for session" caches doctor signature in sessionStorage
 */
export default function SignaturePad({ onConfirm, onCancel, title = '電子簽名', label = '請在下方簽名', cacheKey = null }) {
  const canvasRef = useRef(null);
  const modalRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const lastPoint = useRef(null);

  // Check cache on mount
  useEffect(() => {
    if (cacheKey) {
      const cached = sessionStorage.getItem(`hcmc_sig_${cacheKey}`);
      if (cached) {
        // Draw cached signature onto canvas
        const img = new Image();
        img.onload = () => {
          const canvas = canvasRef.current;
          if (!canvas) return;
          const ctx = canvas.getContext('2d');
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          setHasDrawn(true);
        };
        img.src = cached;
      }
    }
  }, [cacheKey]);

  // Escape key handler
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onCancel]);

  // Set up canvas with correct DPI scaling
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 2.5;

    // Re-draw cached if exists
    if (cacheKey) {
      const cached = sessionStorage.getItem(`hcmc_sig_${cacheKey}`);
      if (cached) {
        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, 0, 0, rect.width, rect.height);
          setHasDrawn(true);
        };
        img.src = cached;
      }
    }
  }, [cacheKey]);

  const getPoint = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (e.touches && e.touches.length > 0) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const startDraw = useCallback((e) => {
    e.preventDefault();
    const point = getPoint(e);
    if (!point) return;
    setIsDrawing(true);
    setHasDrawn(true);
    lastPoint.current = point;
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) {
      ctx.beginPath();
      ctx.moveTo(point.x, point.y);
    }
  }, [getPoint]);

  const draw = useCallback((e) => {
    e.preventDefault();
    if (!isDrawing) return;
    const point = getPoint(e);
    if (!point) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx && lastPoint.current) {
      // Smooth line using quadratic curve
      const mid = {
        x: (lastPoint.current.x + point.x) / 2,
        y: (lastPoint.current.y + point.y) / 2,
      };
      ctx.quadraticCurveTo(lastPoint.current.x, lastPoint.current.y, mid.x, mid.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(mid.x, mid.y);
    }
    lastPoint.current = point;
  }, [isDrawing, getPoint]);

  const endDraw = useCallback((e) => {
    e.preventDefault();
    if (isDrawing) {
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) ctx.stroke();
    }
    setIsDrawing(false);
    lastPoint.current = null;
  }, [isDrawing]);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width * (window.devicePixelRatio || 1), rect.height * (window.devicePixelRatio || 1));
    setHasDrawn(false);
    if (cacheKey) sessionStorage.removeItem(`hcmc_sig_${cacheKey}`);
  };

  const handleConfirm = () => {
    if (!hasDrawn) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Export as trimmed PNG
    const dataUrl = trimCanvas(canvas);
    if (cacheKey) sessionStorage.setItem(`hcmc_sig_${cacheKey}`, dataUrl);
    onConfirm(dataUrl);
  };

  return (
    <div className="modal-overlay" onClick={onCancel} role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal" onClick={e => e.stopPropagation()} ref={modalRef} style={{ maxWidth: 500, width: '95vw' }}>
        <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--gray-200)' }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{title}</h3>
          <button className="btn btn-outline btn-sm" onClick={onCancel} aria-label="關閉" style={{ minWidth: 'auto', padding: '4px 8px' }}>✕</button>
        </div>
        <div style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: 13, color: 'var(--gray-500)', marginBottom: 12 }}>{label}</div>
          <div style={{
            border: '2px dashed var(--gray-300)',
            borderRadius: 8,
            background: '#fff',
            position: 'relative',
            touchAction: 'none',
            cursor: 'crosshair',
          }}>
            <canvas
              ref={canvasRef}
              style={{ width: '100%', height: 200, display: 'block', borderRadius: 6 }}
              onMouseDown={startDraw}
              onMouseMove={draw}
              onMouseUp={endDraw}
              onMouseLeave={endDraw}
              onTouchStart={startDraw}
              onTouchMove={draw}
              onTouchEnd={endDraw}
            />
            {!hasDrawn && (
              <div style={{
                position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                color: 'var(--gray-300)', fontSize: 14, pointerEvents: 'none', userSelect: 'none',
              }}>
                在此處簽名 Sign Here
              </div>
            )}
          </div>
          {cacheKey && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: 12, color: 'var(--gray-500)', cursor: 'pointer' }}>
              <input type="checkbox" defaultChecked style={{ margin: 0 }} />
              記住簽名（此登入期間有效）
            </label>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 20px', borderTop: '1px solid var(--gray-200)' }}>
          <button className="btn btn-outline btn-sm" onClick={clearCanvas}>清除</button>
          <button className="btn btn-outline btn-sm" onClick={onCancel}>取消</button>
          <button className="btn btn-teal btn-sm" onClick={handleConfirm} disabled={!hasDrawn} style={{ opacity: hasDrawn ? 1 : 0.5 }}>確認簽名</button>
        </div>
      </div>
    </div>
  );
}

// Signature preview (read-only inline display)
export function SignaturePreview({ src, label, height = 60 }) {
  if (!src) return null;
  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <img src={src} alt={label || '簽名'} style={{ height, objectFit: 'contain', borderBottom: '1px solid var(--gray-300)' }} />
      {label && <span style={{ fontSize: 10, color: 'var(--gray-400)' }}>{label}</span>}
    </div>
  );
}

// Trim whitespace around signature
function trimCanvas(canvas) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const imageData = ctx.getImageData(0, 0, w, h);
  const { data } = imageData;

  let top = h, bottom = 0, left = w, right = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const alpha = data[(y * w + x) * 4 + 3];
      if (alpha > 0) {
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }

  if (top >= bottom || left >= right) return canvas.toDataURL('image/png');

  // Add padding
  const pad = 10;
  top = Math.max(0, top - pad);
  bottom = Math.min(h - 1, bottom + pad);
  left = Math.max(0, left - pad);
  right = Math.min(w - 1, right + pad);

  const trimW = right - left + 1;
  const trimH = bottom - top + 1;
  const trimmed = document.createElement('canvas');
  trimmed.width = trimW;
  trimmed.height = trimH;
  const tCtx = trimmed.getContext('2d');
  tCtx.putImageData(ctx.getImageData(left, top, trimW, trimH), 0, 0);
  return trimmed.toDataURL('image/png');
}
