import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App.tsx'
import { ReportApprovalReview } from './components/ReportApprovalReview.tsx'
import { CustomerPortal } from './components/portal/CustomerPortal.tsx'
import MaintenanceApproval from './components/MaintenanceApproval.tsx'
import { AuthProvider } from './contexts/AuthContext.tsx'
import { FeaturesProvider } from './contexts/FeaturesContext.tsx'
import { accentColor } from './utils/accentColor.ts'
import { grayTone } from './utils/theme.ts'
import './index.css'

// Initialize theme on app startup
const initializeTheme = () => {
  const color = accentColor.get();
  const tone = grayTone.get();

  // Apply accent color class to root
  document.documentElement.classList.add(`accent-${color}`);

  // Apply gray tone class to root
  document.documentElement.classList.add(`tone-${tone}`);
};

// Initialize before rendering
initializeTheme();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <FeaturesProvider>
          <Routes>
            {/* Public route for report approval */}
            <Route path="/approve/:token" element={<ReportApprovalReview />} />

            {/* Public route for maintenance approval */}
            <Route path="/maintenance/approve/:token" element={<MaintenanceApproval />} />

            {/* Customer Portal (separate from main app) */}
            <Route path="/portal" element={<CustomerPortal />} />
            <Route path="/portal/activate" element={<CustomerPortal />} />

            {/* Main app */}
            <Route path="/*" element={<App />} />
          </Routes>
        </FeaturesProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
