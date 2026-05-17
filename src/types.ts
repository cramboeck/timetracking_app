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
  sevdeskCustomerId?: string; // Link to sevDesk contact
  hourlyRate?: number; // Customer-specific hourly rate (Business feature)
  timeRoundingInterval?: number; // Time rounding interval in minutes for billing (e.g., 15 = round up to nearest 15 min)
  paymentTermsDays?: number; // Payment terms in days for invoices (default: 14)
  ninjarmmOrganizationId?: string; // Link to NinjaRMM organization (Support feature)
  displayName?: string; // Short display name for PDFs (instead of full name)
  importAliases?: string[]; // Alternative names for CSV import matching (e.g., ["IHE", "IHE GmbH"])
  customerType?: 'company' | 'individual'; // Type of customer (company = Firma, individual = Privatperson)
  defaultProjectId?: string; // Default project for imports when no project is specified
  // Vendor/Supplier Hub fields
  isVendor?: boolean; // Mark as vendor/supplier
  vendorDomain?: string; // Email domain for matching (e.g., "elovade.com")
  vendorNotes?: string; // Notes about vendor relationship
  vendorApiConfig?: Record<string, any>; // Configuration for external API connections
  invoiceCount?: number; // Computed: number of processed invoices (from vendor list endpoint)
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

export type AccentColor = 'blue' | 'green' | 'orange' | 'purple' | 'red' | 'pink' | 'ramboeck';

export type GrayTone = 'light' | 'medium' | 'dark' | 'ramboeck';

export type TimeRoundingInterval = 1 | 5 | 10 | 15 | 30 | 60; // minutes

export type TimeFormat = '12h' | '24h'; // Time display format

export type HeartbeatInterval = 1 | 5 | 15; // How often the running timer is persisted server-side, in minutes

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

export type UserRole = 'user' | 'admin';

export interface User {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  accountType: AccountType;
  role: UserRole; // Admin or regular user
  organizationName?: string; // For business/team accounts
  customerNumber?: string; // User's customer number (e.g., RBF-000001)
  displayName?: string; // User's display name
  teamId?: string; // For team members - which team they belong to
  teamRole?: TeamRole; // Role within the team
  mfaEnabled: boolean;
  mfaSecret?: string; // For future TOTP implementation
  accentColor: AccentColor; // User's chosen accent color
  grayTone: GrayTone; // User's chosen gray tone intensity
  darkMode: boolean; // User's dark mode preference
  timeRoundingInterval: TimeRoundingInterval; // Minimum time unit for rounding (default: 15)
  timeFormat: TimeFormat; // Time display format (12h/24h, default: 24h)
  heartbeatIntervalMinutes: HeartbeatInterval; // How often the running timer is persisted to server (default: 5)
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
  isBillable: boolean; // Whether this entry should be included in billing/reports
  createdAt: string;
}

// ============================================================================
// Ticket System Types
// ============================================================================

export type TicketStatus = 'open' | 'in_progress' | 'waiting' | 'resolved' | 'closed' | 'archived';
export type TicketPriority = 'low' | 'normal' | 'high' | 'critical';
export type TicketResolutionType = 'solved' | 'not_reproducible' | 'duplicate' | 'wont_fix' | 'resolved_itself' | 'workaround';

export type TicketSource = 'manual' | 'portal' | 'email' | 'ninja_alert';

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
  // Solution fields
  solution?: string;
  resolutionType?: TicketResolutionType;
  // SLA fields
  slaPolicyId?: string;
  firstResponseDueAt?: string;
  resolutionDueAt?: string;
  firstResponseAt?: string;
  slaFirstResponseBreached?: boolean;
  slaResolutionBreached?: boolean;
  // Source & Email tracking
  source?: TicketSource;
  emailConversationId?: string;
  emailFrom?: string;
  contactId?: string; // Customer contact linked to ticket
  // Related names (from joins)
  customerName?: string;
  projectName?: string;
  creatorName?: string;
  assigneeName?: string;
}

export interface TicketTask {
  id: string;
  ticketId: string;
  title: string;
  completed: boolean;
  sortOrder: number;
  visibleToCustomer: boolean;
  createdAt: string;
  completedAt?: string;
}

// Extended task with ticket info for overview
export interface TicketTaskWithInfo extends TicketTask {
  ticketNumber: string;
  ticketTitle: string;
  ticketStatus: TicketStatus;
  ticketPriority: TicketPriority;
  customerId: string;
  customerName?: string;
}

// ============================================================================
// Unified Task Hub Types (Standalone Tasks)
// ============================================================================

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';
export type RecurrencePattern = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';

export interface Task {
  id: string;
  organizationId: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;

  // Optional linking
  ticketId?: string;
  projectId?: string;
  customerId?: string;

  // Assignment
  assignedTo?: string;
  assignedToName?: string;
  assignedToDisplayName?: string;
  createdBy: string;
  createdByName?: string;

  // Time management
  dueDate?: string;
  dueTime?: string;
  reminderAt?: string;
  estimatedMinutes?: number;

  // Recurrence
  isRecurring: boolean;
  recurrencePattern?: RecurrencePattern;
  recurrenceInterval?: number;
  recurrenceDays?: string[];
  recurrenceEndDate?: string;
  parentTaskId?: string;

  // Categorization
  category?: string;
  tags?: string[];
  color?: string;

  // Completion
  completedAt?: string;
  completedBy?: string;
  completedByName?: string;

  // Ordering
  sortOrder: number;

  // Timestamps
  createdAt: string;
  updatedAt: string;

  // Computed/joined fields
  customerName?: string;
  projectName?: string;
  ticketNumber?: string;
  ticketTitle?: string;
  checklistCount?: number;
  checklistCompleted?: number;
  totalTrackedTime?: number;
}

export interface TaskChecklistItem {
  id: string;
  taskId: string;
  title: string;
  completed: boolean;
  sortOrder: number;
  completedAt?: string;
  createdAt: string;
}

export interface TaskComment {
  id: string;
  taskId: string;
  userId: string;
  username?: string;
  displayName?: string;
  comment: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskActivityLog {
  id: string;
  taskId: string;
  userId?: string;
  username?: string;
  action: string;
  oldValue?: string;
  newValue?: string;
  details?: Record<string, unknown>;
  createdAt: string;
}

export interface TaskTemplate {
  id: string;
  organizationId: string;
  name: string;
  title: string;
  description?: string;
  priority: TaskPriority;
  estimatedMinutes?: number;
  category?: string;
  tags?: string[];
  checklistItems?: { title: string; completed?: boolean }[];
  isActive: boolean;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskWithDetails extends Task {
  checklistItems: TaskChecklistItem[];
  comments: TaskComment[];
  timeEntries: TimeEntry[];
  activityLog: TaskActivityLog[];
}

export interface TaskDashboardData {
  statusCounts: { status: string; count: number }[];
  myTasks: {
    my_pending: number;
    my_in_progress: number;
    my_overdue: number;
    my_today: number;
  };
  overdueTasks: Task[];
  todayTasks: Task[];
  timeInsights: {
    category: string;
    task_count: number;
    avg_completion_minutes: number;
    avg_tracked_minutes: number;
  }[];
}

export interface TaskFilters {
  status?: TaskStatus;
  priority?: TaskPriority;
  assignedTo?: string;
  customerId?: string;
  projectId?: string;
  ticketId?: string;
  view?: 'my' | 'all' | 'today' | 'week' | 'overdue';
  includeCompleted?: boolean;
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
  canViewDevices: boolean; // View NinjaRMM devices (Support feature)
  canViewInvoices: boolean; // View sevDesk invoices (Business feature)
  canViewQuotes: boolean; // View sevDesk quotes (Business feature)
  notifyTicketCreated?: boolean; // Email on ticket created
  notifyTicketStatusChanged?: boolean; // Email on status change
  notifyTicketReply?: boolean; // Email on new reply
  isActivated?: boolean; // Computed: has set password
  lastLogin?: string;
  createdAt: string;
}

// Customer Email Domain - For automatic ticket assignment from support inbox
export interface CustomerEmailDomain {
  id: string;
  customerId: string;
  organizationId: string;
  domain: string;
  isPrimary: boolean;
  notes?: string;
  createdAt: string;
  createdByName?: string;
}

export type ViewMode = 'stopwatch' | 'manual' | 'list' | 'calendar' | 'dashboard' | 'settings' | 'tickets' | 'billing' | 'tasks';
