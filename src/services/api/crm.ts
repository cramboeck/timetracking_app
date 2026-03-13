/**
 * CRM API
 * Handles customer interactions, opportunities, and sales pipeline
 */

import { authFetch } from './base';

// ============================================
// Types
// ============================================

export type InteractionType = 'call' | 'email' | 'meeting' | 'note' | 'demo' | 'support' | 'followup';
export type InteractionDirection = 'inbound' | 'outbound';
export type InteractionOutcome = 'positive' | 'neutral' | 'negative';

export interface Interaction {
  id: string;
  organization_id: string;
  customer_id: string;
  contact_id?: string;
  user_id: string;
  type: InteractionType;
  direction?: InteractionDirection;
  subject?: string;
  content?: string;
  summary?: string;
  ticket_id?: string;
  lead_id?: string;
  contract_id?: string;
  duration_minutes?: number;
  scheduled_at?: string;
  occurred_at: string;
  follow_up_required: boolean;
  follow_up_date?: string;
  follow_up_assigned_to?: string;
  follow_up_notes?: string;
  follow_up_completed: boolean;
  outcome?: InteractionOutcome;
  tags?: string[];
  created_at: string;
  // Joined fields
  customer_name?: string;
  customer_color?: string;
  contact_first_name?: string;
  contact_last_name?: string;
  user_name?: string;
  ticket_number?: string;
  ticket_title?: string;
  follow_up_assigned_to_name?: string;
}

export interface InteractionFilters {
  customer_id?: string;
  contact_id?: string;
  type?: InteractionType;
  follow_up_pending?: boolean;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
}

export interface FollowUpGrouped {
  overdue: Interaction[];
  today: Interaction[];
  upcoming: Interaction[];
}

export interface InteractionStats {
  by_type: { type: string; count: number }[];
  by_user: { username: string; count: number }[];
  follow_ups: { total: number; overdue: number; today: number };
  totals: { current_period: number; previous_period: number };
  period_days: number;
}

export interface TimelineItem {
  id: string;
  item_type: 'interaction' | 'ticket' | 'time_entry';
  sub_type: string;
  title: string;
  description?: string;
  timestamp: string;
  outcome?: string;
  user_name?: string;
  contact_name?: string;
}

// Opportunities / Pipeline

export type OpportunityStatus = 'open' | 'won' | 'lost';

export interface PipelineStage {
  id: string;
  organization_id: string;
  name: string;
  description?: string;
  color: string;
  probability: number;
  sort_order: number;
  is_won: boolean;
  is_lost: boolean;
  // Computed in pipeline view
  opportunities?: Opportunity[];
  total_value?: number;
  weighted_value?: number;
}

export interface Opportunity {
  id: string;
  organization_id: string;
  customer_id?: string;
  lead_id?: string;
  contact_id?: string;
  name: string;
  description?: string;
  stage_id: string;
  value?: number;
  currency: string;
  probability: number;
  weighted_value?: number;
  expected_close_date?: string;
  actual_close_date?: string;
  assigned_to?: string;
  created_by: string;
  status: OpportunityStatus;
  source?: string;
  campaign?: string;
  lost_reason?: string;
  lost_to_competitor?: string;
  next_step?: string;
  next_step_date?: string;
  notes?: string;
  tags?: string[];
  created_at: string;
  updated_at: string;
  // Joined fields
  stage_name?: string;
  stage_color?: string;
  stage_probability?: number;
  customer_name?: string;
  customer_color?: string;
  lead_name?: string;
  contact_name?: string;
  contact_email?: string;
  assigned_to_name?: string;
  created_by_name?: string;
  activities?: OpportunityActivity[];
}

export interface OpportunityActivity {
  id: string;
  opportunity_id: string;
  user_id: string;
  activity_type: 'note' | 'call' | 'email' | 'meeting' | 'stage_change' | 'value_change';
  title: string;
  description?: string;
  scheduled_at?: string;
  is_completed: boolean;
  completed_at?: string;
  old_stage_id?: string;
  new_stage_id?: string;
  old_value?: number;
  new_value?: number;
  created_at: string;
  // Joined
  user_name?: string;
  old_stage_name?: string;
  new_stage_name?: string;
}

export interface PipelineView {
  pipeline: PipelineStage[];
  totals: {
    total_opportunities: number;
    total_value: number;
    weighted_value: number;
  };
}

export interface OpportunityForecast {
  forecast: {
    month: string;
    opportunity_count: number;
    total_value: number;
    weighted_value: number;
  }[];
  historical: {
    status: string;
    month: string;
    count: number;
    value: number;
  }[];
  period_months: number;
}

export interface OpportunityStats {
  summary: {
    open_count: number;
    won_count: number;
    lost_count: number;
    open_value: number;
    weighted_value: number;
    won_this_month: number;
    lost_this_month: number;
  };
  win_rate: number;
  avg_deal_value: number;
  closing_soon: {
    count: number;
    value: number;
  };
}

// ============================================
// Interactions API
// ============================================

export const interactionsApi = {
  // List interactions
  getAll: async (filters?: InteractionFilters): Promise<{ interactions: Interaction[]; total: number }> => {
    const params = new URLSearchParams();
    if (filters?.customer_id) params.append('customer_id', filters.customer_id);
    if (filters?.contact_id) params.append('contact_id', filters.contact_id);
    if (filters?.type) params.append('type', filters.type);
    if (filters?.follow_up_pending) params.append('follow_up_pending', 'true');
    if (filters?.date_from) params.append('date_from', filters.date_from);
    if (filters?.date_to) params.append('date_to', filters.date_to);
    if (filters?.limit) params.append('limit', String(filters.limit));
    if (filters?.offset) params.append('offset', String(filters.offset));

    return authFetch(`/interactions?${params.toString()}`);
  },

  // Get single interaction
  getById: async (id: string): Promise<Interaction> => {
    return authFetch(`/interactions/${id}`);
  },

  // Get pending follow-ups
  getFollowUps: async (assignedToMe?: boolean, overdueOnly?: boolean): Promise<{
    follow_ups: Interaction[];
    grouped: FollowUpGrouped;
    total: number;
  }> => {
    const params = new URLSearchParams();
    if (assignedToMe) params.append('assigned_to_me', 'true');
    if (overdueOnly) params.append('overdue_only', 'true');
    return authFetch(`/interactions/follow-ups?${params.toString()}`);
  },

  // Get customer timeline
  getCustomerTimeline: async (customerId: string, limit?: number): Promise<{
    timeline: TimelineItem[];
    total: number;
  }> => {
    const params = limit ? `?limit=${limit}` : '';
    return authFetch(`/interactions/customer/${customerId}/timeline${params}`);
  },

  // Get stats
  getStats: async (periodDays?: number): Promise<InteractionStats> => {
    const params = periodDays ? `?period=${periodDays}` : '';
    return authFetch(`/interactions/stats/overview${params}`);
  },

  // Create interaction
  create: async (data: Partial<Interaction>): Promise<Interaction> => {
    return authFetch(`/interactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },

  // Update interaction
  update: async (id: string, data: Partial<Interaction>): Promise<Interaction> => {
    return authFetch(`/interactions/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },

  // Complete follow-up
  completeFollowUp: async (id: string, createNew?: boolean, newDate?: string, newNotes?: string): Promise<{
    success: boolean;
    interaction: Interaction;
  }> => {
    return authFetch(`/interactions/${id}/complete-follow-up`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        create_new_follow_up: createNew,
        new_follow_up_date: newDate,
        new_follow_up_notes: newNotes,
      }),
    });
  },

  // Delete interaction
  delete: async (id: string): Promise<{ success: boolean }> => {
    return authFetch(`/interactions/${id}`, {
      method: 'DELETE',
    });
  },
};

// ============================================
// Pipeline Stages API
// ============================================

export const pipelineStagesApi = {
  // Get all stages
  getAll: async (): Promise<PipelineStage[]> => {
    return authFetch(`/opportunities/stages`);
  },

  // Create stage
  create: async (data: Partial<PipelineStage>): Promise<PipelineStage> => {
    return authFetch(`/opportunities/stages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },

  // Update stage
  update: async (id: string, data: Partial<PipelineStage>): Promise<PipelineStage> => {
    return authFetch(`/opportunities/stages/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },

  // Reorder stages
  reorder: async (stageIds: string[]): Promise<PipelineStage[]> => {
    return authFetch(`/opportunities/stages/reorder`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage_ids: stageIds }),
    });
  },

  // Delete stage
  delete: async (id: string, moveToStageId?: string): Promise<{ success: boolean }> => {
    const params = moveToStageId ? `?move_opportunities_to=${moveToStageId}` : '';
    return authFetch(`/opportunities/stages/${id}${params}`, {
      method: 'DELETE',
    });
  },
};

// ============================================
// Opportunities API
// ============================================

export const opportunitiesApi = {
  // List opportunities
  getAll: async (filters?: {
    status?: OpportunityStatus;
    stage_id?: string;
    customer_id?: string;
    assigned_to?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ opportunities: Opportunity[]; total: number }> => {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.stage_id) params.append('stage_id', filters.stage_id);
    if (filters?.customer_id) params.append('customer_id', filters.customer_id);
    if (filters?.assigned_to) params.append('assigned_to', filters.assigned_to);
    if (filters?.search) params.append('search', filters.search);
    if (filters?.limit) params.append('limit', String(filters.limit));
    if (filters?.offset) params.append('offset', String(filters.offset));

    return authFetch(`/opportunities?${params.toString()}`);
  },

  // Get pipeline view (grouped by stage)
  getPipeline: async (): Promise<PipelineView> => {
    return authFetch(`/opportunities/pipeline`);
  },

  // Get forecast
  getForecast: async (months?: number): Promise<OpportunityForecast> => {
    const params = months ? `?months=${months}` : '';
    return authFetch(`/opportunities/forecast${params}`);
  },

  // Get stats
  getStats: async (): Promise<OpportunityStats> => {
    return authFetch(`/opportunities/stats/overview`);
  },

  // Get single opportunity
  getById: async (id: string): Promise<Opportunity> => {
    return authFetch(`/opportunities/${id}`);
  },

  // Create opportunity
  create: async (data: Partial<Opportunity>): Promise<Opportunity> => {
    return authFetch(`/opportunities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },

  // Update opportunity
  update: async (id: string, data: Partial<Opportunity>): Promise<Opportunity> => {
    return authFetch(`/opportunities/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },

  // Move to different stage
  move: async (id: string, stageId: string, note?: string): Promise<Opportunity> => {
    return authFetch(`/opportunities/${id}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage_id: stageId, note }),
    });
  },

  // Add activity
  addActivity: async (
    opportunityId: string,
    data: Partial<OpportunityActivity>
  ): Promise<OpportunityActivity> => {
    return authFetch(`/opportunities/${opportunityId}/activities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },

  // Delete opportunity
  delete: async (id: string): Promise<{ success: boolean }> => {
    return authFetch(`/opportunities/${id}`, {
      method: 'DELETE',
    });
  },
};
