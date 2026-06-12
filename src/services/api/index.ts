/**
 * API Module Index
 * Re-exports all API modules for easy imports
 */

// Import APIs used in default export
import { authApi, mfaApi, passwordResetApi } from './auth';
import { userApi, teamsApi, organizationsApi, featuresApi } from './user';
import { entriesApi, projectsApi, customersApi, activitiesApi, tasksApi } from './core';
import { ticketsApi } from './tickets';
import { customerPortalApi } from './portal';
import { contractsApi, importApi, socialMediaApi } from './business';
import { interactionsApi, opportunitiesApi, contactsApi } from './crm';
import { leadsApi } from './leads';

// Base utilities
export { API_BASE_URL, getApiBaseUrl, getAuthToken, handleResponse, authFetch, authFetchMultipart, SESSION_EXPIRED_EVENT } from './base';

// Authentication API
export { authApi, mfaApi, passwordResetApi };
export type { TrustedDevice } from './auth';

// User API
export { userApi, teamsApi, organizationsApi, featuresApi };
export type {
  Organization,
  OrganizationMember,
  OrganizationInvitation,
  UserFeatures,
  AvailablePackage,
} from './user';

// Core API (entries, projects, customers, activities, tasks)
export { entriesApi, projectsApi, customersApi, activitiesApi, tasksApi };
export type { CreateTaskInput, UpdateTaskInput, SimilarTasksResponse, PaginationMeta, EntryFilters } from './core';

// Tickets API
export { ticketsApi, knowledgeBaseApi, publicKbApi } from './tickets';
export type {
  TicketDashboardData,
  CannedResponse,
  TicketTag,
  TicketActivity,
  TicketAttachment,
  KbCategory,
  KbArticle,
  PortalSettings,
} from './tickets';

// Portal API
export { portalSettingsApi, customerPortalApi, pushApi } from './portal';
export type {
  PortalSettings as PortalSettingsType,
  PortalContact,
  PortalTicket,
  PortalAttachment,
  PortalComment,
  PortalDevice,
  PortalDeviceAlert,
  PortalInvoice,
  PortalQuote,
  PushSubscription,
  NotificationPreferences,
  DeviceSubscription,
} from './portal';

// Integrations API (sevDesk, NinjaRMM, Microsoft 365)
export { sevdeskApi, ninjaApi, microsoft365Api } from './integrations';
export type {
  SevdeskConfig,
  SevdeskCustomer,
  SevdeskInvoice,
  SevdeskQuote,
  SevdeskVoucher,
  DocumentSearchResult,
  PositionSearchResult,
  CreateQuoteInput,
  BillingSummaryItem,
  InvoiceExport,
  NinjaRMMConfig,
  NinjaSyncStatus,
  NinjaOrganization,
  NinjaDevice,
  NinjaDeviceSoftware,
  NinjaDeviceOSPatch,
  NinjaAlert,
  NinjaAlertExclusion,
  Microsoft365Config,
  ProcessedInvoice,
  InvoiceDocument,
  InvoiceLineItem,
  ExtractedInvoiceData,
  SupportEmail,
  TicketEmail,
} from './integrations';

// Business API (maintenance, contracts, import, AI, social media)
export {
  maintenanceApi,
  contractsApi,
  importApi,
  aiApi,
  socialMediaApi,
  DEFAULT_SYSTEM_PROMPTS,
} from './business';

// CRM API (interactions, opportunities, pipeline, contacts)
export { interactionsApi, pipelineStagesApi, opportunitiesApi, contactsApi } from './crm';

// Leads API
export { leadsApi } from './leads';
export type {
  LeadStatus,
  LeadSource,
  LeadPriority,
  LeadActivityType,
  Lead,
  LeadActivity,
  LeadPipelineStats,
  CreateLeadInput,
  UpdateLeadInput,
  CreateLeadActivityInput,
} from './leads';
export type {
  InteractionType,
  InteractionDirection,
  InteractionOutcome,
  Interaction,
  InteractionFilters,
  FollowUpGrouped,
  InteractionStats,
  TimelineItem,
  OpportunityStatus,
  PipelineStage,
  Opportunity,
  OpportunityActivity,
  PipelineView,
  OpportunityForecast,
  OpportunityStats,
  ContactRole,
  PreferredContactMethod,
  CRMContact,
  ContactFilters,
  CreateContactInput,
} from './crm';
export type {
  MaintenanceType,
  MaintenanceStatus,
  ApprovalStatus,
  MaintenanceAnnouncement,
  MaintenanceAnnouncementCustomer,
  MaintenanceAnnouncementDevice,
  MaintenanceActivityLog,
  MaintenanceTemplate,
  MaintenanceDashboard,
  MaintenanceApprovalDetails,
  Contract,
  ContractPosition,
  ContractHourlyTracking,
  ContractSummary,
  AIConfig,
  AISuggestion,
  SocialMediaPost,
  SocialMediaPostPlatform,
  SocialMediaAccount,
  SocialMediaTemplate,
  SocialMediaHashtagGroup,
  SocialMediaStory,
  GeneratedStoryContent,
  GeneratedImage,
  StoryTemplate,
  MarketingAnalysis,
  ThemeSelectionOutput,
  WizardContentGeneration,
  ContentImprovement,
  AutoImprovementIteration,
  AutoImprovementResult,
  CarouselSlide,
  CarouselContent,
} from './business';

// Default export for backwards compatibility
const api = {
  auth: authApi,
  user: userApi,
  entries: entriesApi,
  projects: projectsApi,
  customers: customersApi,
  activities: activitiesApi,
  passwordReset: passwordResetApi,
  teams: teamsApi,
  tickets: ticketsApi,
  customerPortal: customerPortalApi,
  features: featuresApi,
  organizations: organizationsApi,
  tasks: tasksApi,
  contracts: contractsApi,
  import: importApi,
  socialMedia: socialMediaApi,
  interactions: interactionsApi,
  opportunities: opportunitiesApi,
  leads: leadsApi,
  contacts: contactsApi,
};

export default api;
