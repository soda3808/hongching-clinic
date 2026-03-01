import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo);
    // Log to audit if available
    try {
      const logs = JSON.parse(localStorage.getItem('hcmc_error_log') || '[]');
      logs.unshift({
        ts: new Date().toISOString(),
        message: error?.message || String(error),
        stack: error?.stack?.substring(0, 500),
        component: errorInfo?.componentStack?.substring(0, 300),
      });
      if (logs.length > 50) logs.length = 50;
      localStorage.setItem('hcmc_error_log', JSON.stringify(logs));
    } catch {}
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: 40, textAlign: 'center', maxWidth: 500, margin: '80px auto',
          background: '#fff', borderRadius: 14, boxShadow: '0 4px 12px rgba(0,0,0,.08)',
          border: '1px solid #fee2e2',
        }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>⚠️</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1f2937', marginBottom: 8 }}>
            頁面載入失敗
          </h2>
          <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 20, lineHeight: 1.6 }}>
            此頁面發生錯誤，請嘗試重新載入。
            {this.state.error?.message && (
              <span style={{ display: 'block', marginTop: 8, fontSize: 11, color: '#9ca3af', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                {this.state.error.message}
              </span>
            )}
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              style={{
                padding: '10px 24px', background: '#0e7490', color: '#fff',
                border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              重試此頁面
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '10px 24px', background: '#fff', color: '#4b5563',
                border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              重新載入
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
