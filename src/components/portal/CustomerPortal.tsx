import { useState, useEffect } from 'react';
import { customerPortalApi, PortalContact, PortalTicket } from '../../services/api';
import { PortalLogin } from './PortalLogin';
import { PortalLayout } from './PortalLayout';
import { PortalTicketList } from './PortalTicketList';
import { PortalTicketDetail } from './PortalTicketDetail';
import { PortalCreateTicket } from './PortalCreateTicket';
import { PortalActivate } from './PortalActivate';

export const CustomerPortal = () => {
  const [contact, setContact] = useState<PortalContact | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

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
    } catch (err) {
      console.error('Session check failed:', err);
      localStorage.removeItem('portal_auth_token');
    } finally {
      setLoading(false);
    }
  };

  const handleLoginSuccess = (contactData: PortalContact) => {
    setContact(contactData);
  };

  const handleLogout = () => {
    setContact(null);
    setSelectedTicketId(null);
  };

  const handleTicketSelect = (ticket: PortalTicket) => {
    setSelectedTicketId(ticket.id);
  };

  const handleBack = () => {
    setSelectedTicketId(null);
  };

  const handleTicketCreated = (ticket: PortalTicket) => {
    // Navigate to the new ticket
    setSelectedTicketId(ticket.id);
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
    <PortalLayout contact={contact} onLogout={handleLogout}>
      {selectedTicketId ? (
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
