export interface Customer {
  id: string;
  userId: string; // Multi-user support
  name: string;
  color: string;
  customerNumber?: string; // For sevDesk integration
  contactPerson?: string;
  email?: string;
  address?: string;
  reportTitle?: string; // Custom report title for this customer (e.g., "Stundenzettel" or "Tätigkeitsnachweis")
  createdAt: string;
}

export interface CompanyInfo {
  id: string;
  userId: string; // User-specific company info
  name: string;
  address: string;
  city: string;
  zipCode: string;
  country: string;
  email: string;
  phone?: string;
  website?: string;
  taxId?: string;
  customerNumber?: string; // Company's own customer number (e.g. for sevDesk)
  logo?: string; // Base64 encoded image or URL
  createdAt: string;
  updatedAt: string;
}

export type PricingType = 'hourly' | 'flat';

export interface Activity {
  id: string;
  userId: string; // Multi-user support
  name: string;
  description?: string;
  isBillable: boolean; // Abrechenbar oder nicht
  pricingType: PricingType; // Stunden- oder Pauschalabrechnung
  flatRate?: number; // Pauschalbetrag (nur bei pricingType='flat')
  createdAt: string;
}

export type AccountType = 'personal' | 'business' | 'team';

export type AccentColor = 'blue' | 'green' | 'orange' | 'purple' | 'red' | 'pink';

export type GrayTone = 'light' | 'medium' | 'dark';

export type TimeRoundingInterval = 1 | 5 | 10 | 15 | 30 | 60; // minutes

export type TimeFormat = '12h' | '24h'; // Time display format

export type TeamRole = 'owner' | 'admin' | 'member';

export interface TeamMembership {
  id: string;
  teamId: string;
  userId: string;
  role: TeamRole;
  joinedAt: string;
}

export interface Team {
  id: string;
  name: string;
  ownerId: string; // User who created the team
  createdAt: string;
}

export interface TeamInvitation {
  id: string;
  teamId: string;
  invitationCode: string;
  role: TeamRole;
  createdBy: string; // User ID who created the invitation
  expiresAt: string;
  usedBy?: string; // User ID who used the invitation
  usedAt?: string;
  createdAt: string;
}

export interface User {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  accountType: AccountType;
  organizationName?: string; // For business/team accounts
  customerNumber?: string; // User's customer number (e.g., RBF-000001)
  displayName?: string; // User's display name
  teamId?: string; // For team members - which team they belong to
  teamRole?: TeamRole; // Role within the team
  mfaEnabled: boolean;
  mfaSecret?: string; // For future TOTP implementation
  accentColor: AccentColor; // User's chosen accent color
  grayTone: GrayTone; // User's chosen gray tone intensity
  timeRoundingInterval: TimeRoundingInterval; // Minimum time unit for rounding (default: 15)
  timeFormat: TimeFormat; // Time display format (12h/24h, default: 24h)
  hasTicketAccess: boolean; // Ticket system add-on (default: false)
  createdAt: string;
  lastLogin?: string;
}

export interface AuthState {
  currentUser: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface LoginCredentials {
  username: string;
  password: string;
  mfaCode?: string; // For future MFA
}

export interface RegisterData {
  username: string;
  email: string;
  password: string;
  accountType: AccountType;
  organizationName?: string;
  inviteCode?: string; // Optional invite code to join existing team
}

export type RateType = 'hourly' | 'daily';

export interface Project {
  id: string;
  userId: string; // Multi-user support
  customerId: string;
  name: string;
  rateType: RateType; // Stundensatz oder Tagessatz
  hourlyRate: number; // in EUR (wird für Tagessatz auch verwendet)
  isActive: boolean;
  createdAt: string;
}

export interface TimeEntry {
  id: string;
  userId: string; // Multi-user support
  startTime: string;
  endTime?: string;
  duration: number; // in seconds
  projectId: string; // Changed from project string to projectId
  activityId?: string; // Optional: link to activity for flat-rate pricing
  ticketId?: string; // Optional: link to ticket
  description: string;
  isRunning: boolean;
  createdAt: string;
}

// ============================================================================
// Ticket System Types
// ============================================================================

export type TicketStatus = 'open' | 'in_progress' | 'waiting' | 'resolved' | 'closed' | 'archived';
export type TicketPriority = 'low' | 'normal' | 'high' | 'critical';

export interface Ticket {
  id: string;
  ticketNumber: string; // e.g., TKT-000001
  userId: string; // Technician/Admin who owns/handles the ticket
  customerId: string; // Which customer this ticket belongs to
  projectId?: string; // Optional: link to project
  createdByContactId?: string; // If created by customer contact
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  assignedToUserId?: string; // For teams: who is working on it
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  closedAt?: string;
  // SLA fields
  slaPolicyId?: string;
  firstResponseDueAt?: string;
  resolutionDueAt?: string;
  firstResponseAt?: string;
  slaFirstResponseBreached?: boolean;
  slaResolutionBreached?: boolean;
}

// SLA Policy
export type SlaPriority = 'low' | 'normal' | 'high' | 'critical' | 'all';

export interface SlaPolicy {
  id: string;
  userId: string;
  name: string;
  description?: string;
  priority: SlaPriority;
  firstResponseMinutes: number;
  resolutionMinutes: number;
  businessHoursOnly: boolean;
  isActive: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TicketComment {
  id: string;
  ticketId: string;
  userId?: string; // If posted by technician
  customerContactId?: string; // If posted by customer
  isInternal: boolean; // Internal notes not visible to customer
  content: string;
  createdAt: string;
}

export interface TicketAttachment {
  id: string;
  ticketId: string;
  commentId?: string; // Optional: attached to a comment
  filename: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  uploadedByUserId?: string;
  uploadedByContactId?: string;
  createdAt: string;
}

// Customer Portal - Contact/Login for customers
export interface CustomerContact {
  id: string;
  customerId: string;
  name: string;
  email: string;
  passwordHash?: string; // Only on server
  isPrimary: boolean;
  canCreateTickets: boolean;
  canViewAllTickets: boolean; // Or only their own
  isActivated?: boolean; // Computed: has set password
  lastLogin?: string;
  createdAt: string;
}

export type ViewMode = 'stopwatch' | 'manual' | 'list' | 'calendar' | 'dashboard' | 'settings' | 'tickets';
