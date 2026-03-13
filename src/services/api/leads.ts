/**
 * Leads API
 * Handles lead management and conversion
 */

import { authFetch } from './base';

// ============================================
// Types
// ============================================

export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'proposal' | 'negotiation' | 'won' | 'lost';
export type LeadSource = 'website' | 'referral' | 'cold_call' | 'email' | 'event' | 'social_media' | 'advertising' | 'other';
export type LeadPriority = 'low' | 'normal' | 'high' | 'hot';
export type LeadActivityType = 'call' | 'email' | 'meeting' | 'note' | 'task' | 'status_change' | 'demo' | 'proposal_sent';

export interface Lead {
  id: string;
  organizationId: string;
  customerId?: string;
  name: string;
  company?: string;
  email?: string;
  phone?: string;
  website?: string;
  status: LeadStatus;
  source?: LeadSource;
  priority: LeadPriority;
  estimatedValue?: number;
  probability?: number;
  assignedTo?: string;
  expectedCloseDate?: string;
  nextFollowUp?: string;
  description?: string;
  notes?: string;
  tags?: string[];
  lostReason?: string;
  convertedAt?: string;
  lastContactDate?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  // Joined fields
  assignedToName?: string;
  createdByName?: string;
  customerName?: string;
  activities?: LeadActivity[];
}

export interface LeadActivity {
  id: string;
  leadId: string;
  userId: string;
  activityType: LeadActivityType;
  title: string;
  description?: string;
  scheduledAt?: string;
  outcome?: string;
  durationMinutes?: number;
  isCompleted: boolean;
  completedAt?: string;
  createdAt: string;
  userName?: string;
}

export interface LeadPipelineStats {
  status: LeadStatus;
  count: number;
  total_value: number;
  avg_probability: number;
}

export interface CreateLeadInput {
  name: string;
  company?: string;
  email?: string;
  phone?: string;
  website?: string;
  status?: LeadStatus;
  source?: LeadSource;
  priority?: LeadPriority;
  estimatedValue?: number;
  probability?: number;
  assignedTo?: string;
  expectedCloseDate?: string;
  nextFollowUp?: string;
  description?: string;
  notes?: string;
  tags?: string[];
  customerId?: string;
}

export interface UpdateLeadInput extends Partial<CreateLeadInput> {
  lostReason?: string;
}

export interface CreateLeadActivityInput {
  activityType: LeadActivityType;
  title: string;
  description?: string;
  scheduledAt?: string;
  outcome?: string;
  durationMinutes?: number;
}

// ============================================
// API
// ============================================

export const leadsApi = {
  // Get all leads
  getAll: async (filters?: {
    status?: LeadStatus;
    assignedTo?: string;
    priority?: LeadPriority;
    source?: LeadSource;
  }): Promise<{ success: boolean; data: Lead[] }> => {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.assignedTo) params.append('assignedTo', filters.assignedTo);
    if (filters?.priority) params.append('priority', filters.priority);
    if (filters?.source) params.append('source', filters.source);

    const url = params.toString() ? `/leads?${params.toString()}` : `/leads`;
    return authFetch(url);
  },

  // Get pipeline statistics
  getPipeline: async (): Promise<{ success: boolean; data: LeadPipelineStats[] }> => {
    return authFetch(`/leads/pipeline`);
  },

  // Get single lead with activities
  getById: async (id: string): Promise<{ success: boolean; data: Lead }> => {
    return authFetch(`/leads/${id}`);
  },

  // Create lead
  create: async (data: CreateLeadInput): Promise<{ success: boolean; data: Lead }> => {
    return authFetch(`/leads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },

  // Update lead
  update: async (id: string, data: UpdateLeadInput): Promise<{ success: boolean; data: Lead }> => {
    return authFetch(`/leads/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },

  // Delete lead
  delete: async (id: string): Promise<{ success: boolean; message: string }> => {
    return authFetch(`/leads/${id}`, {
      method: 'DELETE',
    });
  },

  // Add activity to lead
  addActivity: async (
    leadId: string,
    data: CreateLeadActivityInput
  ): Promise<{ success: boolean; data: LeadActivity }> => {
    return authFetch(`/leads/${leadId}/activities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },

  // Complete activity
  completeActivity: async (
    leadId: string,
    activityId: string,
    outcome?: string
  ): Promise<{ success: boolean; message: string }> => {
    return authFetch(`/leads/${leadId}/activities/${activityId}/complete`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outcome }),
    });
  },

  // Convert lead to customer
  convert: async (
    leadId: string,
    createCustomer: boolean,
    customerColor?: string
  ): Promise<{ success: boolean; message: string; customerId?: string }> => {
    return authFetch(`/leads/${leadId}/convert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ createCustomer, customerColor }),
    });
  },
};
