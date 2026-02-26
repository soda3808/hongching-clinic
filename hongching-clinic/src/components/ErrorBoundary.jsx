import { Component } from 'react';
import { captureException } from '../utils/errorTracking';
import { getTenantId } from '../auth';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    captureException(error, {
      tags: { component: 'ErrorBoundary' },
      extra: { componentStack: errorInfo.componentStack },
      tenantId: getTenantId(),
      user: this.props.user,
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '40px',
          textAlign: 'center',
          maxWidth: '500px',
          margin: '80px auto',
          background: '#fff',
          borderRadius: '12px',
          boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>&#9888;&#65039;</div>
          <h2 style={{ color: '#1a202c', marginBottom: '8px' }}>系統發生錯誤</h2>
          <p style={{ color: '#718096', marginBottom: '24px' }}>
            發生了意外錯誤。請嘗試重新載入頁面。
            <br />
            <small>An unexpected error occurred. Please try reloading the page.</small>
          </p>
          <button
            onClick={() => { this.setState({ hasError: false, error: null }); }}
            style={{
              padding: '10px 24px',
              background: '#0d9488',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              marginRight: '8px',
            }}
          >
            重試 Retry
          </button>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 24px',
              background: '#e2e8f0',
              color: '#4a5568',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            重新載入 Reload
          </button>
          {this.state.error && (
            <details style={{ marginTop: '20px', textAlign: 'left', fontSize: '12px', color: '#a0aec0' }}>
              <summary>錯誤詳情 Error Details</summary>
              <pre style={{ overflow: 'auto', padding: '8px', background: '#f7fafc', borderRadius: '4px', marginTop: '8px' }}>
                {this.state.error.message}
                {'\n'}
                {this.state.error.stack}
              </pre>
            </details>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}
