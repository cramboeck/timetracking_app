import { useState, useEffect } from 'react';
import { customerPortalApi, PortalContact, PortalTicket, publicKbApi, PortalSettings, PORTAL_SESSION_EXPIRED_EVENT } from '../../services/api';
import { PortalLogin } from './PortalLogin';
import { PortalLayout } from './PortalLayout';
import { PortalTicketList } from './PortalTicketList';
import { PortalTicketDetail } from './PortalTicketDetail';
import { PortalCreateTicket } from './PortalCreateTicket';
import { PortalActivate } from './PortalActivate';
import { PortalResetPassword } from './PortalResetPassword';
import { PortalProfile } from './PortalProfile';
import { PortalKnowledgeBase } from './PortalKnowledgeBase';
import { PortalDevices } from './PortalDevices';
import { PortalInvoices } from './PortalInvoices';
import { PortalTimeReport } from './PortalTimeReport';
import { PortalContract } from './PortalContract';
import { PortalLicenses } from './PortalLicenses';
import { PortalWelcomeGuide } from './PortalWelcomeGuide';
import { PortalDashboard } from './PortalDashboard';
import { portalHomePath } from '../../utils/portalHost';

type PortalView = 'dashboard' | 'tickets' | 'ticket-detail' | 'profile' | 'kb' | 'devices' | 'invoices' | 'time-report' | 'contract' | 'licenses';

// LocalStorage key for welcome guide preference
const WELCOME_GUIDE_KEY = 'portal_welcome_guide_seen';

export const CustomerPortal = () => {
  const [contact, setContact] = useState<PortalContact | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [currentView, setCurrentView] = useState<PortalView>('dashboard');
  const [portalSettings, setPortalSettings] = useState<PortalSettings | null>(null);
  const [pendingTicketId, setPendingTicketId] = useState<string | null>(null);
  const [showWelcomeGuide, setShowWelcomeGuide] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);

  // Check for activation token in URL. Works on both hosts: the main app
  // serves the portal under /portal/activate, the dedicated portal host
  // (portal.ramboeck.it) under /activate.
  const urlParams = new URLSearchParams(window.location.search);
  const activationToken = urlParams.get('token');
  const isActivation = window.location.pathname.endsWith('/activate');
  // Passwort-Reset aus der E-Mail: /portal/reset-password (App-Host) bzw.
  // /reset-password (Portal-Host) — gleicher Mechanismus wie /activate
  const isPasswordReset = window.location.pathname.endsWith('/reset-password');

  // Tab-Titel: das Portal heißt auch unter app.ramboeck.it/portal nicht
  // "RamboFlow - Zeiterfassung" (auf dem Portal-Host setzt main.tsx den
  // Titel bereits vor dem Render)
  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Kundenportal | Ramböck IT';
    return () => { document.title = previousTitle; };
  }, []);

  // Check for deep link to ticket: /portal/tickets/{id} (app host) or
  // /tickets/{id} (portal host). The optional /portal prefix covers both.
  useEffect(() => {
    const path = window.location.pathname;
    const ticketMatch = path.match(/(?:\/portal)?\/tickets\/([a-f0-9-]+)/i);
    if (ticketMatch) {
      const ticketId = ticketMatch[1];
      setPendingTicketId(ticketId);
    }
  }, []);

  // Listen for navigation messages from Service Worker (push notification clicks)
  useEffect(() => {
    if (!contact || !('serviceWorker' in navigator)) return;

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'NAVIGATE_TO') {
        const url = event.data.url;
        // Handle portal ticket URLs: /portal/tickets/{id}
        if (url?.startsWith('/portal/tickets/')) {
          const ticketId = url.replace('/portal/tickets/', '').split('?')[0];
          setSelectedTicketId(ticketId);
          setCurrentView('ticket-detail');
        }
      }
    };

    navigator.serviceWorker.addEventListener('message', handleMessage);
    return () => navigator.serviceWorker.removeEventListener('message', handleMessage);
  }, [contact]);

  // Navigate to pending ticket after login
  useEffect(() => {
    if (contact && pendingTicketId) {
      setSelectedTicketId(pendingTicketId);
      setCurrentView('ticket-detail');
      setPendingTicketId(null);
      // Clean up URL
      window.history.replaceState({}, '', portalHomePath());
    }
  }, [contact, pendingTicketId]);

  useEffect(() => {
    // Don't check session if on activation or password-reset page
    if ((isActivation || isPasswordReset) && activationToken) {
      setLoading(false);
      return;
    }

    // Check if already logged in
    checkSession();
  }, []);

  // Mid-Session-Ablauf des 7-Tage-Portal-JWT: sauber zum Login zurueck
  // statt still scheiternder Aktionen (kein Refresh-Token im Portal)
  useEffect(() => {
    const handler = () => {
      setContact(null);
      setSessionExpired(true);
    };
    window.addEventListener(PORTAL_SESSION_EXPIRED_EVENT, handler);
    return () => window.removeEventListener(PORTAL_SESSION_EXPIRED_EVENT, handler);
  }, []);

  const checkSession = async () => {
    const token = localStorage.getItem('portal_auth_token');
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const contactData = await customerPortalApi.getMe();
      setContact(contactData);
      // Load portal settings for branding
      try {
        const settingsRes = await publicKbApi.getSettings(contactData.userId);
        setPortalSettings(settingsRes.data);
      } catch (settingsErr) {
        console.error('Failed to load portal settings:', settingsErr);
      }
    } catch (err) {
      console.error('Session check failed:', err);
      localStorage.removeItem('portal_auth_token');
    } finally {
      setLoading(false);
    }
  };

  const handleLoginSuccess = async (contactData: PortalContact) => {
    setContact(contactData);
    setSessionExpired(false);
    // Load portal settings for branding
    try {
      const settingsRes = await publicKbApi.getSettings(contactData.userId);
      setPortalSettings(settingsRes.data);
    } catch (err) {
      console.error('Failed to load portal settings:', err);
    }

    // Show welcome guide on first login (if not disabled)
    const guideSeen = localStorage.getItem(WELCOME_GUIDE_KEY);
    if (!guideSeen) {
      setShowWelcomeGuide(true);
    }
  };

  const handleCloseWelcomeGuide = () => {
    setShowWelcomeGuide(false);
    // Mark as seen (but can be shown again via profile)
    localStorage.setItem(WELCOME_GUIDE_KEY, 'seen');
  };

  const handleNeverShowWelcomeGuide = () => {
    setShowWelcomeGuide(false);
    // Mark as permanently dismissed
    localStorage.setItem(WELCOME_GUIDE_KEY, 'never');
  };

  const handleShowWelcomeGuide = () => {
    setShowWelcomeGuide(true);
  };

  const handleLogout = () => {
    setContact(null);
    setSelectedTicketId(null);
    setCurrentView('dashboard');
  };

  const handleShowDashboard = () => {
    setCurrentView('dashboard');
    setSelectedTicketId(null);
  };

  const handleDashboardNavigate = (view: string) => {
    if (view === 'create-ticket') {
      setShowCreateDialog(true);
    } else {
      setCurrentView(view as PortalView);
      setSelectedTicketId(null);
    }
  };

  const handleTicketSelect = (ticket: PortalTicket) => {
    setSelectedTicketId(ticket.id);
    setCurrentView('ticket-detail');
  };

  const handleBack = () => {
    setSelectedTicketId(null);
    setCurrentView('tickets');
  };

  const handleShowProfile = () => {
    setCurrentView('profile');
    setSelectedTicketId(null);
  };

  const handleShowKnowledgeBase = () => {
    setCurrentView('kb');
    setSelectedTicketId(null);
  };

  const handleShowDevices = () => {
    setCurrentView('devices');
    setSelectedTicketId(null);
  };

  const handleShowInvoices = () => {
    setCurrentView('invoices');
    setSelectedTicketId(null);
  };

  const handleShowTimeReport = () => {
    setCurrentView('time-report');
    setSelectedTicketId(null);
  };

  const handleShowContract = () => {
    setCurrentView('contract');
    setSelectedTicketId(null);
  };

  const handleShowLicenses = () => {
    setCurrentView('licenses');
    setSelectedTicketId(null);
  };

  const handleShowTickets = () => {
    setCurrentView('tickets');
    setSelectedTicketId(null);
  };

  const handleTicketCreated = (ticket: PortalTicket) => {
    // Navigate to the new ticket
    setSelectedTicketId(ticket.id);
    setCurrentView('ticket-detail');
  };

  const handleActivated = () => {
    // Clear URL params and redirect to login
    window.history.replaceState({}, '', portalHomePath());
    setLoading(true);
    setTimeout(() => setLoading(false), 100);
  };

  // Show loading spinner
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-dark-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-accent-primary"></div>
      </div>
    );
  }

  // Show activation page
  if (isActivation && activationToken) {
    return (
      <PortalActivate
        token={activationToken}
        onActivated={handleActivated}
      />
    );
  }

  // Show password reset page
  if (isPasswordReset && activationToken) {
    return (
      <PortalResetPassword
        token={activationToken}
        onDone={handleActivated}
      />
    );
  }

  // Show login page
  if (!contact) {
    return (
      <>
        {sessionExpired && (
          <div className="fixed top-0 inset-x-0 z-50 bg-amber-500 text-white text-sm text-center px-4 py-2.5 shadow">
            Ihre Sitzung ist abgelaufen — bitte melden Sie sich erneut an.
          </div>
        )}
        <PortalLogin onLoginSuccess={handleLoginSuccess} />
      </>
    );
  }

  // Show portal
  return (
    <PortalLayout
      contact={contact}
      onLogout={handleLogout}
      onShowProfile={handleShowProfile}
      onShowKnowledgeBase={portalSettings?.showKnowledgeBase !== false ? handleShowKnowledgeBase : undefined}
      onShowDevices={contact.canViewDevices ? handleShowDevices : undefined}
      onShowInvoices={(contact.canViewInvoices || contact.canViewQuotes) ? handleShowInvoices : undefined}
      onShowDashboard={handleShowDashboard}
      onShowTimeReport={contact.canViewTimeReport ? handleShowTimeReport : undefined}
      onShowContract={contact.canViewContract ? handleShowContract : undefined}
      onShowLicenses={contact.canViewLicenses ? handleShowLicenses : undefined}
      onShowTickets={handleShowTickets}
      onShowHelp={handleShowWelcomeGuide}
      currentView={currentView}
      portalSettings={portalSettings}
    >
      {currentView === 'dashboard' ? (
        <PortalDashboard
          contact={contact}
          onNavigate={handleDashboardNavigate}
        />
      ) : currentView === 'kb' ? (
        <PortalKnowledgeBase userId={contact.userId} onBack={handleBack} />
      ) : currentView === 'profile' ? (
        <PortalProfile contact={contact} onBack={handleBack} />
      ) : currentView === 'devices' ? (
        <PortalDevices contact={contact} teamviewerLink={portalSettings?.teamviewerLink || undefined} />
      ) : currentView === 'invoices' ? (
        <PortalInvoices contact={contact} />
      ) : currentView === 'time-report' ? (
        <PortalTimeReport />
      ) : currentView === 'contract' ? (
        <PortalContract />
      ) : currentView === 'licenses' ? (
        <PortalLicenses />
      ) : currentView === 'ticket-detail' && selectedTicketId ? (
        <PortalTicketDetail
          ticketId={selectedTicketId}
          onBack={handleBack}
        />
      ) : currentView === 'tickets' ? (
        <PortalTicketList
          contact={contact}
          onTicketSelect={handleTicketSelect}
          onCreateTicket={() => setShowCreateDialog(true)}
        />
      ) : (
        <PortalDashboard
          contact={contact}
          onNavigate={handleDashboardNavigate}
        />
      )}

      <PortalCreateTicket
        isOpen={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onCreated={handleTicketCreated}
      />

      {showWelcomeGuide && (
        <PortalWelcomeGuide
          onClose={handleCloseWelcomeGuide}
          onNeverShowAgain={handleNeverShowWelcomeGuide}
          companyName={portalSettings?.companyName || undefined}
        />
      )}
    </PortalLayout>
  );
};

export default CustomerPortal;
