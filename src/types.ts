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
  logo?: string; // Base64 encoded image or URL
  createdAt: string;
  updatedAt: string;
}

export interface Activity {
  id: string;
  userId: string; // Multi-user support
  name: string;
  description?: string;
  isBillable: boolean; // Abrechenbar oder nicht
  createdAt: string;
}

export type AccountType = 'personal' | 'business' | 'team';

export type AccentColor = 'blue' | 'green' | 'orange' | 'purple' | 'red' | 'pink';

export type GrayTone = 'light' | 'medium' | 'dark';

export type TimeRoundingInterval = 1 | 5 | 10 | 15 | 30 | 60; // minutes

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
  teamId?: string; // For team members - which team they belong to
  teamRole?: TeamRole; // Role within the team
  mfaEnabled: boolean;
  mfaSecret?: string; // For future TOTP implementation
  accentColor: AccentColor; // User's chosen accent color
  grayTone: GrayTone; // User's chosen gray tone intensity
  timeRoundingInterval: TimeRoundingInterval; // Minimum time unit for rounding (default: 15)
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
  description: string;
  isRunning: boolean;
  createdAt: string;
}

export type ViewMode = 'stopwatch' | 'manual' | 'list' | 'dashboard' | 'settings';
