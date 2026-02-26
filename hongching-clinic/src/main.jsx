import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { initTenant } from './tenant'

// Initialize tenant detection before rendering the app
// This detects tenant from URL subdomain / query param / localStorage
// and pre-loads tenant config from Supabase if available
initTenant().then(() => {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}).catch(() => {
  // If tenant init fails, render app anyway (fallback to defaults)
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
})
