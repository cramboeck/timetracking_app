import { useState, useEffect } from 'react';
import { customerPortalApi, PortalContact, PortalTicket, publicKbApi, PortalSettings } from '../../services/api';
import { PortalLogin } from './PortalLogin';
import { PortalLayout } from './PortalLayout';
import { PortalTicketList } from './PortalTicketList';
import { PortalTicketDetail } from './PortalTicketDetail';
import { PortalCreateTicket } from './PortalCreateTicket';
import { PortalActivate } from './PortalActivate';
import { PortalProfile } from './PortalProfile';
import { PortalKnowledgeBase } from './PortalKnowledgeBase';

type PortalView = 'tickets' | 'ticket-detail' | 'profile' | 'kb';

export const CustomerPortal = () => {
  const [contact, setContact] = useState<PortalContact | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [currentView, setCurrentView] = useState<PortalView>('tickets');
  const [portalSettings, setPortalSettings] = useState<PortalSettings | null>(null);

  // Check for activation token in URL
  const urlParams = new URLSearchParams(window.location.search);
  const activationToken = urlParams.get('token');
  const isActivation = window.location.pathname.includes('/portal/activate');

  useEffect(() => {
    // Don't check session if on activation page
    if (isActivation && activationToken) {
      setLoading(false);
      return;
    }

    // Check if already logged in
    checkSession();
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
    // Load portal settings for branding
    try {
      const settingsRes = await publicKbApi.getSettings(contactData.userId);
      setPortalSettings(settingsRes.data);
    } catch (err) {
      console.error('Failed to load portal settings:', err);
    }
  };

  const handleLogout = () => {
    setContact(null);
    setSelectedTicketId(null);
    setCurrentView('tickets');
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

  const handleTicketCreated = (ticket: PortalTicket) => {
    // Navigate to the new ticket
    setSelectedTicketId(ticket.id);
    setCurrentView('ticket-detail');
  };

  const handleActivated = () => {
    // Clear URL params and redirect to login
    window.history.replaceState({}, '', '/portal');
    setLoading(true);
    setTimeout(() => setLoading(false), 100);
  };

  // Show loading spinner
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
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

  // Show login page
  if (!contact) {
    return <PortalLogin onLoginSuccess={handleLoginSuccess} />;
  }

  // Show portal
  return (
    <PortalLayout
      contact={contact}
      onLogout={handleLogout}
      onShowProfile={handleShowProfile}
      onShowKnowledgeBase={portalSettings?.showKnowledgeBase !== false ? handleShowKnowledgeBase : undefined}
      currentView={currentView}
      portalSettings={portalSettings}
    >
      {currentView === 'kb' ? (
        <PortalKnowledgeBase userId={contact.userId} onBack={handleBack} />
      ) : currentView === 'profile' ? (
        <PortalProfile contact={contact} onBack={handleBack} />
      ) : currentView === 'ticket-detail' && selectedTicketId ? (
        <PortalTicketDetail
          ticketId={selectedTicketId}
          onBack={handleBack}
        />
      ) : (
        <PortalTicketList
          contact={contact}
          onTicketSelect={handleTicketSelect}
          onCreateTicket={() => setShowCreateDialog(true)}
        />
      )}

      <PortalCreateTicket
        isOpen={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onCreated={handleTicketCreated}
      />
    </PortalLayout>
  );
};

export default CustomerPortal;
