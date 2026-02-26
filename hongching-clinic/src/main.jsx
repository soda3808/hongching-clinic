import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { initTenant } from './tenant'
import { initErrorTracking } from './utils/errorTracking'
import ErrorBoundary from './components/ErrorBoundary'

// Initialize error tracking before anything else
initErrorTracking()

// Initialize tenant detection before rendering the app
// This detects tenant from URL subdomain / query param / localStorage
// and pre-loads tenant config from Supabase if available
initTenant().then(() => {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  )
}).catch(() => {
  // If tenant init fails, render app anyway (fallback to defaults)
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  )
})
