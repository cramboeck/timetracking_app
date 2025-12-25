/**
 * API Service Module
 *
 * This file re-exports everything from the modular API structure.
 * The actual implementations are now in the api/ folder:
 * - api/base.ts     - Base utilities (authFetch, etc.)
 * - api/auth.ts     - Authentication, MFA, password reset
 * - api/user.ts     - User settings, teams, organizations, features
 * - api/core.ts     - Entries, projects, customers, activities, tasks
 * - api/tickets.ts  - Tickets, knowledge base
 * - api/portal.ts   - Portal settings, customer portal, push notifications
 * - api/integrations.ts - sevDesk, NinjaRMM
 * - api/business.ts - Maintenance, contracts, import, AI, social media
 */

// Re-export everything from the modular structure
export * from './api/index';

// Default export for backwards compatibility
export { default } from './api/index';
