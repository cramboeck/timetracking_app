/**
 * Business API
 * Handles maintenance, contracts, import, AI, and social media
 */

import { API_BASE_URL, authFetch, handleResponse } from './base';

// ============================================
// Maintenance Announcements API
// ============================================

export type MaintenanceType = 'patch' | 'reboot' | 'security_update' | 'firmware' | 'general';
export type MaintenanceStatus = 'draft' | 'scheduled' | 'sent' | 'in_progress' | 'completed' | 'cancelled';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'no_response';

export interface MaintenanceAnnouncement {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  maintenance_type: MaintenanceType;
  affected_systems: string | null;
  scheduled_start: string;
  scheduled_end: string | null;
  status: MaintenanceStatus;
  require_approval: boolean;
  approval_deadline: string | null;
  auto_proceed_on_no_response: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  customer_count?: number;
  approved_count?: number;
  rejected_count?: number;
  pending_count?: number;
}

export interface MaintenanceAnnouncementCustomer {
  id: string;
  announcement_id: string;
  customer_id: string;
  customer_name: string;
  customer_email: string | null;
  approval_token: string;
  status: ApprovalStatus;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  notification_sent_at: string | null;
  reminder_sent_at: string | null;
  created_at: string;
}

export interface MaintenanceAnnouncementDevice {
  id: string;
  announcement_id: string;
  device_id: string;
  system_name: string;
  display_name: string | null;
  node_class: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'skipped' | 'failed';
  started_at: string | null;
  completed_at: string | null;
  notes: string | null;
}

export interface MaintenanceActivityLog {
  id: string;
  announcement_id: string;
  action: string;
  actor_type: 'admin' | 'customer' | 'system';
  actor_id: string | null;
  actor_name: string | null;
  details: any;
  created_at: string;
  announcement_title?: string;
}

export interface MaintenanceTemplate {
  id: string;
  user_id: string;
  name: string;
  title: string;
  description: string | null;
  maintenance_type: MaintenanceType;
  affected_systems: string | null;
  estimated_duration_minutes: number | null;
  require_approval: boolean;
  auto_proceed_on_no_response: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MaintenanceDashboard {
  upcoming: MaintenanceAnnouncement[];
  pendingApprovals: number;
  recentActivity: MaintenanceActivityLog[];
  statistics: {
    completed_count: number;
    scheduled_count: number;
    in_progress_count: number;
  };
}

export interface MaintenanceApprovalDetails {
  customerName: string;
  companyName: string;
  title: string;
  description: string | null;
  maintenanceType: MaintenanceType;
  affectedSystems: string | null;
  scheduledStart: string;
  scheduledEnd: string | null;
  approvalDeadline: string | null;
  requireApproval: boolean;
  status: ApprovalStatus;
  alreadyResponded?: boolean;
  respondedAt?: string;
  rejectionReason?: string | null;
}

export const maintenanceApi = {
  getDashboard: async (): Promise<MaintenanceDashboard> => {
    return authFetch('/maintenance/dashboard');
  },

  getAnnouncements: async (options?: {
    status?: MaintenanceStatus;
    limit?: number;
    offset?: number;
  }): Promise<{ announcements: MaintenanceAnnouncement[] }> => {
    const params = new URLSearchParams();
    if (options?.status) params.append('status', options.status);
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.offset) params.append('offset', options.offset.toString());
    const queryString = params.toString();
    return authFetch(`/maintenance/announcements${queryString ? `?${queryString}` : ''}`);
  },

  getAnnouncement: async (id: string): Promise<{
    announcement: MaintenanceAnnouncement;
    customers: MaintenanceAnnouncementCustomer[];
    devices: MaintenanceAnnouncementDevice[];
    activityLog: MaintenanceActivityLog[];
  }> => {
    return authFetch(`/maintenance/announcements/${id}`);
  },

  createAnnouncement: async (data: {
    title: string;
    description?: string;
    maintenanceType: MaintenanceType;
    affectedSystems?: string;
    scheduledStart: string;
    scheduledEnd?: string;
    requireApproval?: boolean;
    approvalDeadline?: string;
    autoProceedOnNoResponse?: boolean;
    notes?: string;
    customerIds?: string[];
    deviceIds?: string[];
  }): Promise<{ success: boolean; announcementId: string; message: string }> => {
    return authFetch('/maintenance/announcements', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateAnnouncement: async (id: string, data: Partial<{
    title: string;
    description: string;
    maintenanceType: MaintenanceType;
    affectedSystems: string;
    scheduledStart: string;
    scheduledEnd: string;
    requireApproval: boolean;
    approvalDeadline: string;
    autoProceedOnNoResponse: boolean;
    notes: string;
    customerIds: string[];
    deviceIds: string[];
  }>): Promise<{ success: boolean; message: string }> => {
    return authFetch(`/maintenance/announcements/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  deleteAnnouncement: async (id: string): Promise<{ success: boolean; message: string }> => {
    return authFetch(`/maintenance/announcements/${id}`, {
      method: 'DELETE',
    });
  },

  sendNotifications: async (id: string, customerIds: string[]): Promise<{
    success: boolean;
    sentCount: number;
    failedCount: number;
    message: string;
  }> => {
    return authFetch(`/maintenance/announcements/${id}/send`, {
      method: 'POST',
      body: JSON.stringify({ customerIds }),
    });
  },

  sendReminders: async (id: string): Promise<{
    success: boolean;
    sentCount: number;
    message: string;
  }> => {
    return authFetch(`/maintenance/announcements/${id}/remind`, {
      method: 'POST',
    });
  },

  updateStatus: async (id: string, status: MaintenanceStatus): Promise<{ success: boolean; message: string }> => {
    return authFetch(`/maintenance/announcements/${id}/status`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    });
  },

  getTemplates: async (): Promise<{ templates: MaintenanceTemplate[] }> => {
    return authFetch('/maintenance/templates');
  },

  createTemplate: async (data: {
    name: string;
    title: string;
    description?: string;
    maintenanceType: MaintenanceType;
    affectedSystems?: string;
    estimatedDurationMinutes?: number;
    requireApproval?: boolean;
    autoProceedOnNoResponse?: boolean;
  }): Promise<{ success: boolean; templateId: string; message: string }> => {
    return authFetch('/maintenance/templates', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  deleteTemplate: async (id: string): Promise<{ success: boolean; message: string }> => {
    return authFetch(`/maintenance/templates/${id}`, {
      method: 'DELETE',
    });
  },

  // PUBLIC: Get approval details (no auth required)
  getApprovalDetails: async (token: string): Promise<MaintenanceApprovalDetails> => {
    const response = await fetch(`${API_BASE_URL}/maintenance/approve/${token}`);
    return handleResponse(response);
  },

  // PUBLIC: Submit approval/rejection (no auth required)
  submitApproval: async (token: string, data: {
    action: 'approve' | 'reject';
    reason?: string;
    approverName?: string;
  }): Promise<{ success: boolean; message: string; status: ApprovalStatus }> => {
    const response = await fetch(`${API_BASE_URL}/maintenance/approve/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse(response);
  },
};

// ============================================
// Contracts API
// ============================================

export interface Contract {
  id: string;
  organizationId: string;
  customerId: string;
  contractNumber: string;
  name: string;
  description: string | null;
  contractType: 'service' | 'support' | 'maintenance' | 'project' | 'subscription' | 'framework' | 'other';
  status: 'draft' | 'active' | 'paused' | 'expiring' | 'expired' | 'cancelled' | 'terminated';
  startDate: string;
  endDate: string | null;
  isIndefinite: boolean;
  noticePeriodDays: number;
  autoRenew: boolean;
  renewalPeriodMonths: number;
  billingCycle: 'monthly' | 'quarterly' | 'semi_annual' | 'annual' | 'one_time' | 'per_call';
  basePrice: number | null;
  currency: string;
  includedHoursMonthly: number | null;
  hourlyRate: number | null;
  overageRate: number | null;
  slaResponseHours: number | null;
  slaResolutionHours: number | null;
  supportHours: string | null;
  documentUrl: string | null;
  internalNotes: string | null;
  projectId: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  customerName?: string;
  projectName?: string;
}

export interface ContractPosition {
  id: string;
  contractId: string;
  positionNumber: number;
  name: string;
  description: string | null;
  quantity: number;
  unit: string;
  unitPrice: number | null;
  totalPrice: number | null;
  positionType: 'service' | 'product' | 'license' | 'hours' | 'flat_fee' | 'other';
  isRecurring: boolean;
  billingCycle: 'monthly' | 'quarterly' | 'semi_annual' | 'annual' | 'one_time';
  sortOrder: number;
  createdAt: string;
}

export interface ContractHourlyTracking {
  id: string;
  contractId: string;
  year: number;
  month: number;
  includedHours: number;
  usedHours: number;
  overageHours: number;
  rolloverHours: number;
  overageAmount: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContractSummary {
  totalContracts: number;
  activeContracts: number;
  expiringContracts: number;
  totalMonthlyRevenue: number;
  totalIncludedHours: number;
}

export const contractsApi = {
  getContracts: async (filters?: {
    customerId?: string;
    status?: string;
    contractType?: string;
    search?: string;
  }): Promise<{ success: boolean; data: Contract[] }> => {
    const params = new URLSearchParams();
    if (filters?.customerId) params.append('customerId', filters.customerId);
    if (filters?.status) params.append('status', filters.status);
    if (filters?.contractType) params.append('contractType', filters.contractType);
    if (filters?.search) params.append('search', filters.search);

    const queryString = params.toString();
    return authFetch(`/contracts${queryString ? `?${queryString}` : ''}`);
  },

  getContract: async (id: string): Promise<{ success: boolean; data: Contract }> => {
    return authFetch(`/contracts/${id}`);
  },

  // Get contracts for a specific customer
  getByCustomer: async (customerId: string): Promise<Contract[]> => {
    const result = await authFetch(`/contracts?customerId=${customerId}`);
    return result.data || [];
  },

  getSummary: async (): Promise<{ success: boolean; data: ContractSummary }> => {
    return authFetch('/contracts/summary');
  },

  getExpiringContracts: async (days?: number): Promise<{ success: boolean; data: Contract[] }> => {
    return authFetch(`/contracts/expiring${days ? `?days=${days}` : ''}`);
  },

  getNextContractNumber: async (): Promise<{ success: boolean; data: string }> => {
    return authFetch('/contracts/next-number');
  },

  getContractsByCustomer: async (customerId: string): Promise<{ success: boolean; data: Contract[] }> => {
    return authFetch(`/contracts/customer/${customerId}`);
  },

  createContract: async (data: Partial<Contract>): Promise<{ success: boolean; data: Contract }> => {
    return authFetch('/contracts', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateContract: async (id: string, data: Partial<Contract>): Promise<{ success: boolean; data: Contract }> => {
    return authFetch(`/contracts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  deleteContract: async (id: string): Promise<{ success: boolean }> => {
    return authFetch(`/contracts/${id}`, {
      method: 'DELETE',
    });
  },

  getPositions: async (contractId: string): Promise<{ success: boolean; data: ContractPosition[] }> => {
    return authFetch(`/contracts/${contractId}/positions`);
  },

  createPosition: async (contractId: string, data: Partial<ContractPosition>): Promise<{ success: boolean; data: ContractPosition }> => {
    return authFetch(`/contracts/${contractId}/positions`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updatePosition: async (contractId: string, positionId: string, data: Partial<ContractPosition>): Promise<{ success: boolean; data: ContractPosition }> => {
    return authFetch(`/contracts/${contractId}/positions/${positionId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  deletePosition: async (contractId: string, positionId: string): Promise<{ success: boolean }> => {
    return authFetch(`/contracts/${contractId}/positions/${positionId}`, {
      method: 'DELETE',
    });
  },

  getHourlyTracking: async (contractId: string, year?: number, month?: number): Promise<{ success: boolean; data: ContractHourlyTracking[] }> => {
    const params = new URLSearchParams();
    if (year) params.append('year', year.toString());
    if (month) params.append('month', month.toString());

    const queryString = params.toString();
    return authFetch(`/contracts/${contractId}/hours${queryString ? `?${queryString}` : ''}`);
  },

  updateHourlyTracking: async (contractId: string, year: number, month: number, usedHours: number): Promise<{ success: boolean; data: ContractHourlyTracking }> => {
    return authFetch(`/contracts/${contractId}/hours`, {
      method: 'PUT',
      body: JSON.stringify({ year, month, usedHours }),
    });
  },

  getActivityLog: async (contractId: string): Promise<{ success: boolean; data: Array<{ id: string; userId: string; action: string; details: any; createdAt: string }> }> => {
    return authFetch(`/contracts/${contractId}/activity`);
  },
};

// ============================================
// Import API (Clockodo, etc.)
// ============================================

export const importApi = {
  previewClockodo: async (csvContent: string): Promise<{
    success: boolean;
    data: {
      rowCount: number;
      totalDuration: number;
      totalHours: string;
      customers: Array<{ name: string; nummer: string; matchedId?: string }>;
      projects: Array<{ name: string; customerName: string; matchedId?: string }>;
      sampleRows: Array<any>;
      existingCustomers: Array<{ id: string; name: string }>;
      existingProjects: Array<{ id: string; name: string; customerName: string; customerId: string }>;
    };
  }> => {
    return authFetch('/import/clockodo/preview', {
      method: 'POST',
      body: JSON.stringify({ csvContent }),
    });
  },

  executeClockodo: async (data: {
    csvContent: string;
    customerMapping?: Record<string, string>;
    projectMapping?: Record<string, string>;
    defaultProjectId?: string;
    createMissingProjects?: boolean;
    skipDuplicates?: boolean;
  }): Promise<{
    success: boolean;
    data: {
      importedCount: number;
      skippedCount: number;
      duplicateCount: number;
      totalRows: number;
      createdCustomers: number;
      createdProjects: number;
      errors: string[];
    };
  }> => {
    return authFetch('/import/clockodo/execute', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Clockodo API Import (direct API access)
  getClockodoApiConfig: async (): Promise<{
    success: boolean;
    data: {
      configured: boolean;
      apiEmail?: string;
      hasApiKey?: boolean;
      lastSyncAt?: string;
    };
  }> => {
    return authFetch('/import/clockodo/api/config');
  },

  saveClockodoApiConfig: async (data: {
    apiEmail: string;
    apiKey?: string;
  }): Promise<{
    success: boolean;
    data: { configured: boolean; apiEmail: string; hasApiKey: boolean };
  }> => {
    return authFetch('/import/clockodo/api/config', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  testClockodoApiConnection: async (data: {
    apiEmail: string;
    apiKey: string;
  }): Promise<{
    success: boolean;
    data?: { userName: string; companyName: string };
    error?: string;
  }> => {
    return authFetch('/import/clockodo/api/test', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  previewClockodoApi: async (data: {
    apiEmail: string;
    apiKey: string;
    timeSince: string;
    timeUntil: string;
  }): Promise<{
    success: boolean;
    data: {
      rowCount: number;
      skippedCount: number;
      totalDuration: number;
      totalHours: string;
      dateRange: { from: string; to: string };
      customers: Array<{
        clockodoId: number;
        name: string;
        nummer: string | null;
        matchedId?: string;
        matchedName?: string;
        matchedBy?: string;
      }>;
      projects: Array<{
        clockodoId: number;
        name: string;
        customerName: string;
        matchedId?: string;
      }>;
      sampleRows: Array<{
        tag: string;
        kunde: string;
        projekt: string | null;
        beschreibung: string | null;
        stunden: string;
      }>;
      existingCustomers: Array<{ id: string; name: string; customerNumber?: string; importAliases?: string[] }>;
      existingProjects: Array<{ id: string; name: string; customerName: string; customerId: string }>;
    };
  }> => {
    return authFetch('/import/clockodo/api/preview', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  executeClockodoApi: async (data: {
    apiEmail: string;
    apiKey: string;
    timeSince: string;
    timeUntil: string;
    projectMapping?: Record<string, string>;
    defaultProjectId?: string;
    createMissingProjects?: boolean;
    skipDuplicates?: boolean;
  }): Promise<{
    success: boolean;
    data: {
      importedCount: number;
      skippedCount: number;
      duplicateCount: number;
      totalRows: number;
      createdCustomers: number;
      createdProjects: number;
      errors: string[];
    };
  }> => {
    return authFetch('/import/clockodo/api/execute', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Create default "Standard" projects for all customers
  createDefaultProjects: async (): Promise<{
    success: boolean;
    created: number;
    updated: number;
    results: Array<{
      customerId: string;
      customerName: string;
      projectId: string;
      projectName: string;
    }>;
  }> => {
    return authFetch('/import/create-default-projects', {
      method: 'POST',
    });
  },
};

// ============================================
// AI Assistant API
// ============================================

export interface AIConfig {
  id: string;
  userId: string;
  provider: 'openai' | 'anthropic';
  apiKey: string | null;
  hasApiKey: boolean;
  model: string;
  enabled: boolean;
  maxTokens: number;
  temperature: number;
  systemPrompt: string | null;
  promptTemplates: Record<string, string>;
}

export const DEFAULT_SYSTEM_PROMPTS: Record<string, string> = {
  default: 'Du bist ein hilfreicher IT-Support-Assistent, der Technikern bei der Lösung von Problemen hilft. Antworte immer auf Deutsch.',
  solution: 'Du bist ein erfahrener IT-Support-Spezialist. Analysiere Support-Tickets und schlage konkrete, praxiserprobte Lösungsschritte vor. Antworte immer auf Deutsch.',
  category: 'Du bist ein IT-Ticket-Klassifizierer. Analysiere Tickets und ordne sie der passendsten Kategorie zu. Antworte nur mit dem Kategorienamen, ohne weitere Erklärung.',
  priority: 'Du bist ein IT-Support-Experte für Priorisierung. Bewerte die Dringlichkeit von Tickets basierend auf Geschäftsauswirkungen und technischer Komplexität. Antworte auf Deutsch.',
  response: 'Du bist ein freundlicher IT-Support-Mitarbeiter. Verfasse professionelle, kundenfreundliche Antworten auf Support-Anfragen. Antworte immer auf Deutsch.',
};

export interface AISuggestion {
  id: string;
  ticketId: string;
  suggestionType: 'solution' | 'category' | 'priority' | 'response';
  content: string;
  confidence: number | null;
  modelUsed: string;
  tokensUsed: number | null;
  createdAt: string;
}

export const aiApi = {
  getConfig: async (): Promise<{ success: boolean; data: AIConfig | null }> => {
    return authFetch('/ai/config');
  },

  saveConfig: async (config: {
    provider?: 'openai' | 'anthropic';
    apiKey?: string;
    model?: string;
    enabled?: boolean;
    maxTokens?: number;
    temperature?: number;
  }): Promise<{ success: boolean; data: AIConfig }> => {
    return authFetch('/ai/config', {
      method: 'PUT',
      body: JSON.stringify(config),
    });
  },

  testConnection: async (
    provider: 'openai' | 'anthropic',
    apiKey: string
  ): Promise<{ success: boolean; error?: string }> => {
    return authFetch('/ai/test-connection', {
      method: 'POST',
      body: JSON.stringify({ provider, apiKey }),
    });
  },

  generateSuggestion: async (
    ticketId: string,
    suggestionType: 'solution' | 'category' | 'priority' | 'response' = 'solution'
  ): Promise<{ success: boolean; data: AISuggestion }> => {
    return authFetch(`/ai/tickets/${ticketId}/suggest`, {
      method: 'POST',
      body: JSON.stringify({ suggestionType }),
    });
  },

  getSuggestions: async (ticketId: string): Promise<{ success: boolean; data: AISuggestion[] }> => {
    return authFetch(`/ai/tickets/${ticketId}/suggestions`);
  },

  markSuggestionFeedback: async (
    suggestionId: string,
    isHelpful: boolean
  ): Promise<{ success: boolean }> => {
    return authFetch(`/ai/suggestions/${suggestionId}/feedback`, {
      method: 'POST',
      body: JSON.stringify({ isHelpful }),
    });
  },

  markSuggestionApplied: async (suggestionId: string): Promise<{ success: boolean }> => {
    return authFetch(`/ai/suggestions/${suggestionId}/apply`, {
      method: 'POST',
    });
  },

  generateQuoteText: async (
    type: 'head' | 'foot',
    context: {
      customerName?: string;
      header?: string;
      positions?: Array<{ name: string; price: number }>;
    }
  ): Promise<{ success: boolean; data: { text: string } }> => {
    return authFetch('/ai/quote/generate-text', {
      method: 'POST',
      body: JSON.stringify({ type, context }),
    });
  },

  researchPrice: async (
    productName: string,
    context?: string
  ): Promise<{ success: boolean; data: { result: string; suggestedPrice?: number; marketRange?: { min: number; max: number } } }> => {
    return authFetch('/ai/quote/research-price', {
      method: 'POST',
      body: JSON.stringify({ productName, context }),
    });
  },

  generatePositionDescription: async (
    positionName: string,
    context?: {
      customerName?: string;
      quoteHeader?: string;
      otherPositions?: string[];
    }
  ): Promise<{ success: boolean; data: { description: string } }> => {
    return authFetch('/ai/quote/generate-position-description', {
      method: 'POST',
      body: JSON.stringify({ positionName, context }),
    });
  },

  suggestTimeEntryDescription: async (
    context: {
      projectName?: string;
      customerName?: string;
      activityName?: string;
      ticketTitle?: string;
      ticketDescription?: string;
      existingDescription?: string;
    }
  ): Promise<{ success: boolean; data: { suggestion: string } }> => {
    return authFetch('/ai/time-entry/suggest-description', {
      method: 'POST',
      body: JSON.stringify(context),
    });
  },

  generateKBArticleFromTicket: async (
    ticketId: string
  ): Promise<{
    success: boolean;
    data: {
      title: string;
      content: string;
      excerpt: string;
      suggestedCategory?: string;
    };
  }> => {
    return authFetch('/ai/kb/generate-from-ticket', {
      method: 'POST',
      body: JSON.stringify({ ticketId }),
    });
  },
};

// ============================================
// Social Media API
// ============================================

export interface SocialMediaPost {
  id: string;
  userId: string;
  organizationId: string;
  customerId?: string;
  customerName?: string;
  title?: string;
  content: string;
  mediaUrls: string[];
  hashtags: string[];
  status: 'draft' | 'scheduled' | 'published' | 'failed';
  scheduledAt?: string;
  publishedAt?: string;
  aiGenerated: boolean;
  aiPrompt?: string;
  platforms?: SocialMediaPostPlatform[];
  contentCategory?: string;
  evergreen?: boolean;
  recycleCount?: number;
  lastRecycledAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SocialMediaPostPlatform {
  id: string;
  postId: string;
  accountId: string;
  platform: string;
  accountName: string;
  platformPostId?: string;
  platformContent?: string;
  status: 'pending' | 'published' | 'failed';
  errorMessage?: string;
  publishedAt?: string;
  engagementLikes: number;
  engagementComments: number;
  engagementShares: number;
}

export interface SocialMediaAccount {
  id: string;
  platform: 'linkedin' | 'twitter' | 'facebook' | 'instagram';
  accountName: string;
  accountId?: string;
  isActive: boolean;
  tokenExpired: boolean;
  createdAt: string;
}

export interface SocialMediaTemplate {
  id: string;
  name: string;
  content: string;
  platform: 'linkedin' | 'twitter' | 'facebook' | 'instagram' | 'all';
  category?: string;
  hashtags: string[];
  createdAt: string;
}

export interface SocialMediaHashtagGroup {
  id: string;
  name: string;
  hashtags: string[];
  category?: string;
  createdAt: string;
}

export interface SocialMediaStory {
  id: string;
  title?: string;
  contentType: 'image' | 'video' | 'carousel' | 'poll' | 'quiz' | 'countdown' | 'link';
  mediaUrls: string[];
  textOverlays: Array<{
    text: string;
    position: 'top' | 'center' | 'bottom';
    style?: 'bold' | 'normal' | 'highlight';
  }>;
  backgroundColor?: string;
  backgroundGradient?: string;
  musicSuggestion?: string;
  stickers: string[];
  linkUrl?: string;
  linkText?: string;
  pollQuestion?: string;
  pollOptions: string[];
  scheduledAt?: string;
  platforms: string[];
  status: 'draft' | 'scheduled' | 'published' | 'failed' | 'expired';
  durationSeconds: number;
  aiGenerated: boolean;
  aiPrompt?: string;
  templateId?: string;
  engagementData?: Record<string, any>;
  expiresAt?: string;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GeneratedStoryContent {
  title: string;
  textOverlays: Array<{
    text: string;
    position: 'top' | 'center' | 'bottom';
    style: 'bold' | 'normal' | 'highlight';
  }>;
  imagePrompt: string;
  imageSuggestions: string[];
  backgroundColor: string;
  callToAction?: string;
  hashtags: string[];
  musicSuggestion?: string;
  stickers: string[];
}

export interface GeneratedImage {
  url: string;
  revisedPrompt?: string;
  provider: string;
  model: string;
  costCents: number;
}

export interface StoryTemplate {
  id: string;
  name: string;
  description?: string;
  category?: string;
  contentType: 'image' | 'video' | 'carousel' | 'poll' | 'quiz';
  layout: Record<string, any>;
  textStyles: Record<string, any>;
  colorScheme: Record<string, any>;
  isSystem: boolean;
  previewUrl?: string;
  usageCount: number;
  createdAt: string;
}

export interface MarketingAnalysis {
  overallScore: number;
  strengths: string[];
  weaknesses: string[];
  improvements: Array<{
    area: string;
    suggestion: string;
    priority: 'high' | 'medium' | 'low';
    improvedExample?: string;
  }>;
  platformFit: {
    score: number;
    feedback: string;
  };
  audienceAlignment: {
    score: number;
    feedback: string;
  };
  callToActionEffectiveness: {
    score: number;
    feedback: string;
    suggestions: string[];
  };
  emotionalTone: string;
  readabilityScore: number;
  viralPotential: number;
}

export interface ThemeSelectionOutput {
  selectedTheme: {
    category: string;
    subtopic: string;
    angle: string;
  };
  priorityScore: number;
  reasoning: {
    platformReason: string;
    goalReason: string;
    journeyReason: string;
    audienceReason: string;
    summary: string;
  };
  alternatives: Array<{
    category: string;
    score: number;
    whyNot: string;
  }>;
  contentDirectives: {
    hookStyle: string;
    ctaStyle: string;
    avoidTopics: string[];
    emphasize: string[];
    toneGuidance: string;
  };
}

export interface WizardContentGeneration {
  post: {
    content: string;
    hashtags: string[];
    callToAction: string;
  };
  alternatives: Array<{
    content: string;
    style: string;
  }>;
  imagePrompt?: {
    prompt: string;
    style: string;
    description: string;
  };
  bestPostingTime: {
    day: string;
    time: string;
    reason: string;
  };
  contentAnalysis: {
    emotionalTone: string;
    expectedEngagement: 'low' | 'medium' | 'high';
    targetAudienceMatch: number;
  };
  themeSelection?: {
    category: string;
    subtopic: string;
    angle: string;
    priorityScore: number;
    reasoning: string;
    alternatives: Array<{
      category: string;
      score: number;
      whyNot: string;
    }>;
  };
}

export interface ContentImprovement {
  improvedContent: string;
  alternativeHooks: string[];
  ctaSuggestions: string[];
  changes: string[];
  reasoning: string;
}

export interface AutoImprovementIteration {
  iteration: number;
  focus: string;
  beforeScore: number;
  afterScore: number;
  changes: string[];
}

export interface AutoImprovementResult {
  finalContent: string;
  finalScore: number;
  initialScore: number;
  iterations: AutoImprovementIteration[];
  alternativeHooks: string[];
  ctaSuggestions: string[];
  totalImprovementTime: number;
}

export interface CarouselSlide {
  slideNumber: number;
  type: 'hook' | 'content' | 'tip' | 'example' | 'cta';
  headline: string;
  body: string;
  bulletPoints?: string[];
  emoji?: string;
  designNote?: string;
}

export interface CarouselContent {
  title: string;
  topic: string;
  platform: 'instagram' | 'linkedin';
  slides: CarouselSlide[];
  hashtags: string[];
  caption: string;
  colorScheme: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
  };
  designTips: string[];
  canvaInstructions: string;
  totalSlides: number;
}

export const socialMediaApi = {
  // Posts
  getPosts: async (filters?: { status?: string; customerId?: string; startDate?: string; endDate?: string }): Promise<SocialMediaPost[]> => {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.customerId) params.append('customerId', filters.customerId);
    if (filters?.startDate) params.append('startDate', filters.startDate);
    if (filters?.endDate) params.append('endDate', filters.endDate);
    const query = params.toString() ? `?${params.toString()}` : '';
    return authFetch(`/social-media/posts${query}`);
  },

  getPost: async (id: string): Promise<SocialMediaPost> => {
    return authFetch(`/social-media/posts/${id}`);
  },

  createPost: async (data: {
    title?: string;
    content: string;
    mediaUrls?: string[];
    hashtags?: string[];
    scheduledAt?: string;
    customerId?: string;
    platforms?: string[];
    aiGenerated?: boolean;
    aiPrompt?: string;
  }): Promise<SocialMediaPost> => {
    return authFetch('/social-media/posts', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updatePost: async (id: string, data: {
    title?: string;
    content?: string;
    mediaUrls?: string[];
    hashtags?: string[];
    scheduledAt?: string | null;
    status?: 'draft' | 'scheduled' | 'published' | 'failed';
  }): Promise<SocialMediaPost> => {
    return authFetch(`/social-media/posts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  deletePost: async (id: string): Promise<{ success: boolean }> => {
    return authFetch(`/social-media/posts/${id}`, { method: 'DELETE' });
  },

  // Templates
  getTemplates: async (): Promise<SocialMediaTemplate[]> => {
    return authFetch('/social-media/templates');
  },

  createTemplate: async (data: {
    name: string;
    content: string;
    platform?: 'linkedin' | 'twitter' | 'facebook' | 'instagram' | 'all';
    category?: string;
    hashtags?: string[];
  }): Promise<SocialMediaTemplate> => {
    return authFetch('/social-media/templates', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  deleteTemplate: async (id: string): Promise<{ success: boolean }> => {
    return authFetch(`/social-media/templates/${id}`, { method: 'DELETE' });
  },

  // Hashtag Groups
  getHashtagGroups: async (): Promise<SocialMediaHashtagGroup[]> => {
    return authFetch('/social-media/hashtags');
  },

  createHashtagGroup: async (data: {
    name: string;
    hashtags: string[];
    category?: string;
  }): Promise<SocialMediaHashtagGroup> => {
    return authFetch('/social-media/hashtags', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  deleteHashtagGroup: async (id: string): Promise<{ success: boolean }> => {
    return authFetch(`/social-media/hashtags/${id}`, { method: 'DELETE' });
  },

  // Accounts
  getAccounts: async (): Promise<SocialMediaAccount[]> => {
    return authFetch('/social-media/accounts');
  },

  createAccount: async (data: {
    platform: string;
    accountName: string;
    accountId?: string;
    accessToken?: string;
    refreshToken?: string;
    tokenExpiresAt?: string;
  }): Promise<SocialMediaAccount> => {
    return authFetch('/social-media/accounts', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  deleteAccount: async (id: string): Promise<{ success: boolean }> => {
    return authFetch(`/social-media/accounts/${id}`, { method: 'DELETE' });
  },

  // AI Generation
  generateContent: async (data: {
    topic: string;
    platform: 'linkedin' | 'twitter' | 'facebook' | 'instagram' | 'all';
    tone?: 'professional' | 'casual' | 'humorous' | 'informative';
    includeHashtags?: boolean;
    includeEmoji?: boolean;
    customerId?: string;
    contentCategory?: string;
  }): Promise<{ content: string; hashtags: string[]; platform: string; characterCount: number; prompt: string }> => {
    return authFetch('/social-media/generate', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  generateBatch: async (data: {
    topics: string[];
    platform: 'linkedin' | 'twitter' | 'facebook' | 'instagram' | 'all';
    tone?: 'professional' | 'casual' | 'humorous' | 'informative';
    includeHashtags?: boolean;
    includeEmoji?: boolean;
    contentCategory?: string;
    autoSchedule?: boolean;
    startDate?: string;
    postsPerDay?: number;
  }): Promise<{
    success: boolean;
    posts: Array<{ id?: string; content: string; hashtags: string[]; platform?: string; characterCount?: number; topic: string; scheduledAt?: string }>;
    message?: string;
  }> => {
    return authFetch('/social-media/generate-batch', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  generateIdeas: async (data: {
    category: string;
    count?: number;
  }): Promise<{ success: boolean; ideas: string[]; category: string }> => {
    return authFetch('/social-media/generate-ideas', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Queue Management
  getQueue: async (): Promise<SocialMediaPost[]> => {
    return authFetch('/social-media/queue');
  },

  addToQueue: async (data: {
    content: string;
    hashtags?: string[];
    title?: string;
    contentCategory?: string;
  }): Promise<{ success: boolean; post: SocialMediaPost; scheduledAt: string }> => {
    return authFetch('/social-media/queue/add', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  getQueueSettings: async (): Promise<{
    enabled: boolean;
    postsPerDay: number;
    preferredTimes: string[];
    weekendPosting: boolean;
    contentMix: { educational?: number; promotional?: number; behindTheScenes?: number; news?: number };
  }> => {
    return authFetch('/social-media/queue/settings');
  },

  updateQueueSettings: async (data: {
    enabled: boolean;
    postsPerDay: number;
    preferredTimes?: string[];
    weekendPosting?: boolean;
    contentMix?: { educational?: number; promotional?: number; behindTheScenes?: number; news?: number };
  }): Promise<{ success: boolean }> => {
    return authFetch('/social-media/queue/settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  reorderQueue: async (postIds: string[]): Promise<{ success: boolean }> => {
    return authFetch('/social-media/queue/reorder', {
      method: 'POST',
      body: JSON.stringify({ postIds }),
    });
  },

  // Calendar
  getCalendar: async (month: number, year: number): Promise<SocialMediaPost[]> => {
    return authFetch(`/social-media/calendar?month=${month}&year=${year}`);
  },

  // Statistics
  getStats: async (): Promise<{
    posts: { drafts: number; scheduled: number; published: number; total: number };
    platforms: Array<{ platform: string; postCount: number }>;
    upcomingScheduled: number;
  }> => {
    return authFetch('/social-media/stats');
  },

  // CSV/Bulk Import
  importPosts: async (posts: Array<{
    content: string;
    title?: string;
    scheduledAt?: string;
    hashtags?: string[];
    platform?: string;
    contentCategory?: string;
  }>): Promise<{ success: boolean; imported: number; posts: Array<{ id: string; content: string; status: string }> }> => {
    return authFetch('/social-media/import', {
      method: 'POST',
      body: JSON.stringify({ posts }),
    });
  },

  // Analytics - Best Times
  getBestTimes: async (): Promise<{
    recommendedTimes: Array<{ dayOfWeek: number; dayName: string; hour: number; timeString: string; postCount: number; avgEngagement: number }>;
    heatmap: number[][];
    totalAnalyzedPosts: number;
  }> => {
    return authFetch('/social-media/analytics/best-times');
  },

  // Analytics - Hashtags
  getHashtagAnalytics: async (): Promise<{
    allHashtags: Array<{ hashtag: string; usageCount: number; avgEngagement: number }>;
    topPerforming: Array<{ hashtag: string; usageCount: number; avgEngagement: number }>;
    totalUniqueHashtags: number;
  }> => {
    return authFetch('/social-media/analytics/hashtags');
  },

  researchHashtags: async (topic: string, platform?: string, count?: number): Promise<{
    success: boolean;
    topic: string;
    platform: string;
    hashtags: Array<{ tag: string; reach: string; description: string }>;
  }> => {
    return authFetch('/social-media/analytics/hashtags/research', {
      method: 'POST',
      body: JSON.stringify({ topic, platform, count }),
    });
  },

  // Evergreen Content
  getEvergreenPosts: async (): Promise<SocialMediaPost[]> => {
    return authFetch('/social-media/evergreen');
  },

  setEvergreen: async (postId: string, evergreen: boolean): Promise<{ success: boolean }> => {
    return authFetch(`/social-media/posts/${postId}/evergreen`, {
      method: 'PUT',
      body: JSON.stringify({ evergreen }),
    });
  },

  recycleEvergreen: async (postId: string, scheduledAt: string, modifyContent?: boolean): Promise<{
    success: boolean;
    newPostId: string;
    scheduledAt: string;
  }> => {
    return authFetch('/social-media/evergreen/recycle', {
      method: 'POST',
      body: JSON.stringify({ postId, scheduledAt, modifyContent }),
    });
  },

  // Analytics - Content Mix
  getContentMix: async (): Promise<{
    distribution: Array<{ category: string; count: number; percentage: number; publishedCount: number; avgEngagement: number }>;
    targetMix: Record<string, number>;
    totalPosts: number;
    recommendations: string[];
  }> => {
    return authFetch('/social-media/analytics/content-mix');
  },

  // Analytics - Performance
  getPerformance: async (period?: number): Promise<{
    period: number;
    metrics: {
      totalPosts: number;
      publishedPosts: number;
      totalLikes: number;
      totalComments: number;
      totalShares: number;
      totalEngagement: number;
    };
    topPosts: Array<{ id: string; title: string; content: string; publishedAt: string; engagement: number }>;
    dailyTrend: Array<{ date: string; posts: number }>;
  }> => {
    return authFetch(`/social-media/analytics/performance${period ? `?period=${period}` : ''}`);
  },

  // Autopilot Mode
  getAutopilotSettings: async (): Promise<{
    enabled: boolean;
    postsPerWeek: number;
    contentThemes: string[];
    targetAudience: string;
    brandVoice: string;
    approvalMode: 'auto' | 'review';
    platforms: string[];
    contentMix: { educational: number; promotional: number; behindTheScenes: number; trending: number };
    lastGenerated: string | null;
  }> => {
    return authFetch('/social-media/autopilot/settings');
  },

  updateAutopilotSettings: async (settings: {
    enabled: boolean;
    postsPerWeek: number;
    contentThemes: string[];
    targetAudience?: string;
    brandVoice?: string;
    approvalMode: 'auto' | 'review';
    platforms: string[];
    contentMix?: { educational: number; promotional: number; behindTheScenes: number; trending: number };
  }): Promise<any> => {
    return authFetch('/social-media/autopilot/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  },

  generateAutopilotContent: async (): Promise<{
    success: boolean;
    generated: number;
    posts: SocialMediaPost[];
    message: string;
  }> => {
    return authFetch('/social-media/autopilot/generate', { method: 'POST' });
  },

  getAutopilotPending: async (): Promise<SocialMediaPost[]> => {
    return authFetch('/social-media/autopilot/pending');
  },

  approveAutopilotPosts: async (postIds: string[], action: 'approve' | 'reject'): Promise<{ success: boolean; action: string; count: number }> => {
    return authFetch('/social-media/autopilot/approve', {
      method: 'POST',
      body: JSON.stringify({ postIds, action }),
    });
  },

  // Trend-Surfer
  getTrends: async (industry?: string): Promise<{
    trends: Array<{
      topic: string;
      description: string;
      relevance: 'high' | 'medium' | 'low';
      suggestedAngles: string[];
    }>;
  }> => {
    return authFetch(`/social-media/trends${industry ? `?industry=${encodeURIComponent(industry)}` : ''}`);
  },

  generateTrendContent: async (options: {
    trend: string;
    platform?: string;
    tone?: string;
    angle?: string;
  }): Promise<{ content: string; hashtags: string[] }> => {
    return authFetch('/social-media/trends/generate', {
      method: 'POST',
      body: JSON.stringify(options),
    });
  },

  // Content-Remix-Engine
  remixContent: async (options: {
    sourceContent: string;
    sourceType: 'blog' | 'transcript' | 'article' | 'newsletter';
    outputFormats: Array<{ platform: string; count: number }>;
    preserveLinks?: boolean;
    includeHashtags?: boolean;
  }): Promise<{
    success: boolean;
    sourceLength: number;
    sourceType: string;
    outputs: Array<{
      platform: string;
      posts: Array<{ content: string; hashtags: string[] }>;
    }>;
  }> => {
    return authFetch('/social-media/remix', {
      method: 'POST',
      body: JSON.stringify(options),
    });
  },

  saveRemixedPosts: async (options: {
    posts: Array<{ content: string; hashtags?: string[] }>;
    autoSchedule?: boolean;
    startDate?: string;
    postsPerDay?: number;
  }): Promise<{ success: boolean; created: number; posts: SocialMediaPost[] }> => {
    return authFetch('/social-media/remix/save', {
      method: 'POST',
      body: JSON.stringify(options),
    });
  },

  // Competitor Analysis
  getCompetitors: async (): Promise<Array<{
    id: string;
    name: string;
    profiles: { linkedin?: string; twitter?: string; instagram?: string; facebook?: string; website?: string };
    notes?: string;
    lastAnalyzed?: string;
    analysisData?: any;
    createdAt: string;
  }>> => {
    return authFetch('/social-media/competitors');
  },

  addCompetitor: async (data: {
    name: string;
    profiles: { linkedin?: string; twitter?: string; instagram?: string; facebook?: string; website?: string };
    notes?: string;
  }): Promise<any> => {
    return authFetch('/social-media/competitors', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  deleteCompetitor: async (id: string): Promise<{ success: boolean }> => {
    return authFetch(`/social-media/competitors/${id}`, { method: 'DELETE' });
  },

  analyzeCompetitor: async (id: string, options: {
    samplePosts: string[];
    platform?: string;
  }): Promise<{
    insights: {
      postingFrequency: string;
      contentTypes: string[];
      topTopics: string[];
      engagementTactics: string[];
      strengths: string[];
      opportunities: string[];
    };
    generatedPosts: Array<{ content: string; hashtags: string[]; inspiration: string }>;
  }> => {
    return authFetch(`/social-media/competitors/${id}/analyze`, {
      method: 'POST',
      body: JSON.stringify(options),
    });
  },

  // Smart Engagement Bot
  getEngagementSettings: async (): Promise<{
    enabled: boolean;
    platforms: string[];
    targetKeywords: string[];
    targetAccounts: string[];
    responseStyle: 'thoughtful' | 'supportive' | 'inquisitive' | 'expert';
    dailyLimit: number;
    excludeKeywords: string[];
  }> => {
    return authFetch('/social-media/engagement/settings');
  },

  updateEngagementSettings: async (settings: {
    enabled: boolean;
    platforms: string[];
    targetKeywords: string[];
    targetAccounts?: string[];
    responseStyle: 'thoughtful' | 'supportive' | 'inquisitive' | 'expert';
    dailyLimit: number;
    excludeKeywords?: string[];
  }): Promise<any> => {
    return authFetch('/social-media/engagement/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  },

  generateEngagementResponses: async (posts: Array<{ author: string; content: string; platform: string }>): Promise<{
    responses: Array<{
      originalPost: string;
      author: string;
      response: string;
      responseType: 'comment' | 'compliment' | 'question' | 'insight';
    }>;
  }> => {
    return authFetch('/social-media/engagement/generate', {
      method: 'POST',
      body: JSON.stringify({ posts }),
    });
  },

  getEngagementHistory: async (): Promise<Array<{
    id: string;
    platform: string;
    postUrl?: string;
    authorName?: string;
    originalContent?: string;
    responseContent?: string;
    responseType: string;
    createdAt: string;
  }>> => {
    return authFetch('/social-media/engagement/history');
  },

  logEngagement: async (data: {
    platform: string;
    postUrl?: string;
    authorName?: string;
    originalContent?: string;
    responseContent?: string;
    responseType: string;
  }): Promise<any> => {
    return authFetch('/social-media/engagement/log', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Carousel Generator
  generateCarousel: async (options: {
    topic: string;
    platform: 'instagram' | 'linkedin';
    slideCount?: number;
    style: 'educational' | 'storytelling' | 'listicle' | 'how-to' | 'tips' | 'myth-busting';
    tone: 'professional' | 'casual' | 'inspirational' | 'bold';
    targetAudience?: string;
    brandColors?: { primary?: string; secondary?: string };
    includeEmojis?: boolean;
  }): Promise<CarouselContent> => {
    return authFetch('/social-media/carousel/generate', {
      method: 'POST',
      body: JSON.stringify({
        ...options,
        slideCount: options.slideCount || 7,
        includeEmojis: options.includeEmojis ?? true
      }),
    });
  },

  generateCarouselImages: async (data: {
    slides: CarouselSlide[];
    style?: 'modern' | 'minimalist' | 'vibrant' | 'professional';
    colorScheme?: { primary: string; secondary: string };
  }): Promise<{ images: Array<{ slideNumber: number; imageUrl: string; prompt: string }> }> => {
    return authFetch('/social-media/carousel/generate-images', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  saveCarousel: async (data: {
    carousel: CarouselContent;
    scheduleAt?: string;
  }): Promise<SocialMediaPost> => {
    return authFetch('/social-media/carousel/save', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  exportCarousel: (carousel: CarouselContent, format: 'json' | 'text'): void => {
    if (format === 'json') {
      const blob = new Blob([JSON.stringify(carousel, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `carousel-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      let textContent = `# ${carousel.title}\n\n`;
      textContent += `Platform: ${carousel.platform}\n`;
      textContent += `Total Slides: ${carousel.totalSlides}\n\n`;
      textContent += `## Farbschema\n`;
      textContent += `Primär: ${carousel.colorScheme?.primary}\n`;
      textContent += `Sekundär: ${carousel.colorScheme?.secondary}\n`;
      textContent += `Akzent: ${carousel.colorScheme?.accent}\n`;
      textContent += `Hintergrund: ${carousel.colorScheme?.background}\n`;
      textContent += `Text: ${carousel.colorScheme?.text}\n\n`;
      textContent += `---\n\n`;

      carousel.slides?.forEach((slide) => {
        textContent += `## Slide ${slide.slideNumber} (${slide.type})\n`;
        if (slide.emoji) textContent += `Emoji: ${slide.emoji}\n`;
        textContent += `### ${slide.headline}\n`;
        textContent += `${slide.body}\n`;
        if (slide.bulletPoints?.length) {
          textContent += `\nBullet Points:\n`;
          slide.bulletPoints.forEach((bp) => {
            textContent += `• ${bp}\n`;
          });
        }
        if (slide.designNote) textContent += `\nDesign-Hinweis: ${slide.designNote}\n`;
        textContent += `\n---\n\n`;
      });

      textContent += `## Caption\n${carousel.caption}\n\n`;
      textContent += `## Hashtags\n${carousel.hashtags?.map((h) => `#${h}`).join(' ')}\n\n`;
      textContent += `## Canva-Anleitung\n${carousel.canvaInstructions}\n\n`;
      textContent += `## Design-Tipps\n`;
      carousel.designTips?.forEach((tip) => {
        textContent += `• ${tip}\n`;
      });

      const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `carousel-${Date.now()}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    }
  },

  // Stories API
  getStories: async (filters?: { status?: string; platform?: string }): Promise<SocialMediaStory[]> => {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.platform) params.append('platform', filters.platform);
    const query = params.toString() ? `?${params.toString()}` : '';
    return authFetch(`/social-media/stories${query}`);
  },

  createStory: async (data: Partial<SocialMediaStory>): Promise<SocialMediaStory> => {
    return authFetch('/social-media/stories', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateStory: async (id: string, data: Partial<SocialMediaStory>): Promise<SocialMediaStory> => {
    return authFetch(`/social-media/stories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  deleteStory: async (id: string): Promise<{ success: boolean }> => {
    return authFetch(`/social-media/stories/${id}`, {
      method: 'DELETE',
    });
  },

  generateStoryContent: async (options: {
    topic: string;
    platform: 'instagram' | 'facebook' | 'linkedin';
    storyType: 'promotional' | 'educational' | 'behind-the-scenes' | 'announcement' | 'poll' | 'quote';
    brandVoice?: string;
    targetAudience?: string;
    includeCallToAction?: boolean;
  }): Promise<GeneratedStoryContent> => {
    return authFetch('/social-media/stories/generate', {
      method: 'POST',
      body: JSON.stringify(options),
    });
  },

  // AI Image Generation API
  generateImage: async (options: {
    prompt: string;
    provider?: 'openai' | 'stability';
    style?: 'modern' | 'minimalist' | 'vibrant' | 'professional' | 'artistic' | 'photorealistic';
    aspectRatio: '1:1' | '9:16' | '16:9' | '4:5';
    quality?: 'standard' | 'hd';
  }): Promise<GeneratedImage> => {
    return authFetch('/social-media/images/generate', {
      method: 'POST',
      body: JSON.stringify(options),
    });
  },

  getImagePromptSuggestions: async (options: {
    topic: string;
    style?: string;
    count?: number;
  }): Promise<{ suggestions: Array<{ prompt: string; description: string }> }> => {
    return authFetch('/social-media/images/suggestions', {
      method: 'POST',
      body: JSON.stringify(options),
    });
  },

  getImageHistory: async (limit?: number): Promise<GeneratedImage[]> => {
    const query = limit ? `?limit=${limit}` : '';
    return authFetch(`/social-media/images/history${query}`);
  },

  // Story Templates API
  getStoryTemplates: async (filters?: { category?: string; contentType?: string }): Promise<StoryTemplate[]> => {
    const params = new URLSearchParams();
    if (filters?.category) params.append('category', filters.category);
    if (filters?.contentType) params.append('contentType', filters.contentType);
    const query = params.toString() ? `?${params.toString()}` : '';
    return authFetch(`/social-media/story-templates${query}`);
  },

  createStoryTemplate: async (data: Partial<StoryTemplate>): Promise<StoryTemplate> => {
    return authFetch('/social-media/story-templates', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Content Wizard API (Marketing Expert AI)
  analyzeContent: async (options: {
    content: string;
    platform: string;
    goal: string;
    targetAudience?: string;
  }): Promise<MarketingAnalysis> => {
    return authFetch('/social-media/wizard/analyze', {
      method: 'POST',
      body: JSON.stringify(options),
    });
  },

  generateWizardContent: async (options: {
    topic: string;
    platform: string;
    goal: string;
    targetAudience?: string;
    journeyStage?: 'awareness' | 'consideration' | 'decision';
    tone?: string;
    includeImage?: boolean;
    includeHashtags?: boolean;
    contentLength?: 'short' | 'medium' | 'long';
    previousThemes?: string[];
  }): Promise<WizardContentGeneration> => {
    return authFetch('/social-media/wizard/generate', {
      method: 'POST',
      body: JSON.stringify(options),
    });
  },

  improveContent: async (options: {
    content: string;
    platform: string;
    improvementFocus: string;
    targetAudience?: string;
    goal?: string;
  }): Promise<ContentImprovement> => {
    return authFetch('/social-media/wizard/improve', {
      method: 'POST',
      body: JSON.stringify(options),
    });
  },

  autoImproveContent: async (options: {
    content: string;
    platform: string;
    goal: string;
    targetAudience?: string;
    minScore?: number;
    maxIterations?: number;
  }): Promise<AutoImprovementResult> => {
    return authFetch('/social-media/wizard/auto-improve', {
      method: 'POST',
      body: JSON.stringify(options),
    });
  },

  generateWizardImage: async (options: {
    prompt: string;
    aspectRatio?: '1:1' | '9:16' | '16:9' | '4:5';
    style?: string;
    quality?: 'standard' | 'hd';
  }): Promise<GeneratedImage> => {
    return authFetch('/social-media/wizard/generate-image', {
      method: 'POST',
      body: JSON.stringify(options),
    });
  },

  // Theme Selection Engine
  selectTheme: async (options: {
    platform: 'linkedin' | 'instagram';
    goal: 'lead' | 'branding' | 'engagement' | 'traffic' | 'reach' | 'leads';
    journeyStage?: 'awareness' | 'consideration' | 'decision';
    targetAudience?: string;
    previousThemes?: string[];
    topicHint?: string;
  }): Promise<ThemeSelectionOutput> => {
    return authFetch('/social-media/wizard/select-theme', {
      method: 'POST',
      body: JSON.stringify(options),
    });
  },

  getThemeCategories: async (): Promise<{
    categories: Array<{
      id: string;
      nameDE: string;
      emotion: string;
      subtopics: Array<{
        id: string;
        de: string;
        description: string;
      }>;
    }>;
  }> => {
    return authFetch('/social-media/wizard/theme-categories');
  },
};
