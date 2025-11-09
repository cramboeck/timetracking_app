import { TimeEntry, Project, Customer, Activity } from '../types';
import { entriesApi, projectsApi, customersApi, activitiesApi } from '../services/api';

// Keys used in localStorage
const STORAGE_KEY_ENTRIES = 'timetracking_entries';
const STORAGE_KEY_PROJECTS = 'timetracking_projects';
const STORAGE_KEY_CUSTOMERS = 'timetracking_customers';
const STORAGE_KEY_ACTIVITIES = 'timetracking_activities';
const MIGRATION_STATUS_KEY = 'timetracking_migration_status';

export interface MigrationStatus {
  completed: boolean;
  timestamp?: string;
  customerCount?: number;
  projectCount?: number;
  activityCount?: number;
  entryCount?: number;
  errors?: string[];
}

export const getMigrationStatus = (): MigrationStatus | null => {
  const status = localStorage.getItem(MIGRATION_STATUS_KEY);
  return status ? JSON.parse(status) : null;
};

export const hasLocalStorageData = (): boolean => {
  return !!(
    localStorage.getItem(STORAGE_KEY_CUSTOMERS) ||
    localStorage.getItem(STORAGE_KEY_PROJECTS) ||
    localStorage.getItem(STORAGE_KEY_ACTIVITIES) ||
    localStorage.getItem(STORAGE_KEY_ENTRIES)
  );
};

export const migrateLocalStorageToBackend = async (): Promise<MigrationStatus> => {
  const errors: string[] = [];
  let customerCount = 0;
  let projectCount = 0;
  let activityCount = 0;
  let entryCount = 0;

  try {
    // Step 1: Migrate Customers
    const customersData = localStorage.getItem(STORAGE_KEY_CUSTOMERS);
    if (customersData) {
      const customers: Customer[] = JSON.parse(customersData);
      for (const customer of customers) {
        try {
          // Create customer without id, userId, createdAt
          const { id, userId, createdAt, ...customerData } = customer;
          await customersApi.create(customerData);
          customerCount++;
        } catch (error) {
          errors.push(`Customer "${customer.name}": ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    }

    // Step 2: Migrate Projects
    const projectsData = localStorage.getItem(STORAGE_KEY_PROJECTS);
    if (projectsData) {
      const projects: Project[] = JSON.parse(projectsData);
      for (const project of projects) {
        try {
          const { id, userId, createdAt, ...projectData } = project;
          await projectsApi.create(projectData);
          projectCount++;
        } catch (error) {
          errors.push(`Project "${project.name}": ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    }

    // Step 3: Migrate Activities
    const activitiesData = localStorage.getItem(STORAGE_KEY_ACTIVITIES);
    if (activitiesData) {
      const activities: Activity[] = JSON.parse(activitiesData);
      for (const activity of activities) {
        try {
          const { id, userId, createdAt, ...activityData } = activity;
          await activitiesApi.create(activityData);
          activityCount++;
        } catch (error) {
          errors.push(`Activity "${activity.name}": ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    }

    // Step 4: Migrate Time Entries
    const entriesData = localStorage.getItem(STORAGE_KEY_ENTRIES);
    if (entriesData) {
      const entries: TimeEntry[] = JSON.parse(entriesData);
      for (const entry of entries) {
        try {
          const { id, userId, createdAt, ...entryData } = entry;
          await entriesApi.create(entryData);
          entryCount++;
        } catch (error) {
          errors.push(`Time entry: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    }

    // Save migration status
    const status: MigrationStatus = {
      completed: true,
      timestamp: new Date().toISOString(),
      customerCount,
      projectCount,
      activityCount,
      entryCount,
      errors: errors.length > 0 ? errors : undefined,
    };

    localStorage.setItem(MIGRATION_STATUS_KEY, JSON.stringify(status));
    return status;
  } catch (error) {
    const status: MigrationStatus = {
      completed: false,
      timestamp: new Date().toISOString(),
      customerCount,
      projectCount,
      activityCount,
      entryCount,
      errors: [...errors, error instanceof Error ? error.message : 'Unknown migration error'],
    };

    localStorage.setItem(MIGRATION_STATUS_KEY, JSON.stringify(status));
    throw new Error(`Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export const clearLocalStorageData = () => {
  localStorage.removeItem(STORAGE_KEY_CUSTOMERS);
  localStorage.removeItem(STORAGE_KEY_PROJECTS);
  localStorage.removeItem(STORAGE_KEY_ACTIVITIES);
  localStorage.removeItem(STORAGE_KEY_ENTRIES);
};

export const resetMigrationStatus = () => {
  localStorage.removeItem(MIGRATION_STATUS_KEY);
};
