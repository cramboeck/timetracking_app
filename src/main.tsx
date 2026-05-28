import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import { ReportApprovalReview } from './components/ReportApprovalReview.tsx'
import { CustomerPortal } from './components/portal/CustomerPortal.tsx'
import MaintenanceApproval from './components/MaintenanceApproval.tsx'
import AdminPortal from './components/AdminPortal.tsx'
import AdminRoute from './components/AdminRoute.tsx'
import { AuthProvider } from './contexts/AuthContext.tsx'
import { FeaturesProvider } from './contexts/FeaturesContext.tsx'
import { UIProvider } from './contexts/UIContext.tsx'
import { queryClient } from './lib/queryClient.ts'
import { accentColor } from './utils/accentColor.ts'
import { grayTone } from './utils/theme.ts'
import { darkMode } from './utils/darkMode.ts'
import './index.css'

// Initialize theme on app startup (before React renders to prevent FOUC)
const initializeTheme = () => {
  const color = accentColor.get();
  const tone = grayTone.get();

  // Apply accent color class to root
  document.documentElement.classList.add(`accent-${color}`);

  // Apply gray tone class to root
  document.documentElement.classList.add(`tone-${tone}`);

  // Initialize dark mode early to prevent flash
  darkMode.initialize();
};

// Initialize before rendering
initializeTheme();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <FeaturesProvider>
              <UIProvider>
                <Routes>
                  {/* Public route for report approval */}
                  <Route path="/approve/:token" element={<ReportApprovalReview />} />

                  {/* Public route for maintenance approval */}
                  <Route path="/maintenance/approve/:token" element={<MaintenanceApproval />} />

                  {/* Customer Portal (separate from main app) */}
                  <Route path="/portal" element={<CustomerPortal />} />
                  <Route path="/portal/activate" element={<CustomerPortal />} />

                  {/* Admin Portal (separate from main app, with auth) */}
                  <Route path="/admin" element={<AdminRoute />} />

                  {/* Main app */}
                  <Route path="/*" element={<App />} />
                </Routes>
              </UIProvider>
            </FeaturesProvider>
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)
