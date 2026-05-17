/**
 * Settings Module Components
 *
 * This folder contains extracted components from the main Settings.tsx
 * Each tab should be its own component for better maintainability.
 *
 * Extracted:
 * - AccountSettings: User account, profile, GDPR, MFA
 * - AppearanceSettings: Dark mode, accent colors, time format
 * - NotificationSettings: Push notifications, reminders
 *
 * TODO - Still in Settings.tsx:
 * - CompanySettings: Company info, logo, address
 * - TeamSettings: Organization, members, invitations
 * - CustomersSettings: Customer management
 * - ProjectsSettings: Project management
 * - ActivitiesSettings: Activity management
 */

export { AccountSettings } from './AccountSettings';
export { AppearanceSettings } from './AppearanceSettings';
export { NotificationSettings } from './NotificationSettings';
