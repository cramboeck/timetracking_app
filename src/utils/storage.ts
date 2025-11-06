import { TimeEntry, Customer, Project } from '../types';

const STORAGE_KEY_ENTRIES = 'timetracking_entries';
const STORAGE_KEY_CUSTOMERS = 'timetracking_customers';
const STORAGE_KEY_PROJECTS = 'timetracking_projects';

export const storage = {
  // Time Entries
  getEntries: (): TimeEntry[] => {
    try {
      const data = localStorage.getItem(STORAGE_KEY_ENTRIES);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Error loading entries:', error);
      return [];
    }
  },

  saveEntries: (entries: TimeEntry[]): void => {
    try {
      localStorage.setItem(STORAGE_KEY_ENTRIES, JSON.stringify(entries));
    } catch (error) {
      console.error('Error saving entries:', error);
    }
  },

  addEntry: (entry: TimeEntry): void => {
    const entries = storage.getEntries();
    entries.push(entry);
    storage.saveEntries(entries);
  },

  updateEntry: (id: string, updates: Partial<TimeEntry>): void => {
    const entries = storage.getEntries();
    const index = entries.findIndex(e => e.id === id);
    if (index !== -1) {
      entries[index] = { ...entries[index], ...updates };
      storage.saveEntries(entries);
    }
  },

  deleteEntry: (id: string): void => {
    const entries = storage.getEntries();
    const filtered = entries.filter(e => e.id !== id);
    storage.saveEntries(filtered);
  },

  // Customers
  getCustomers: (): Customer[] => {
    try {
      const data = localStorage.getItem(STORAGE_KEY_CUSTOMERS);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Error loading customers:', error);
      return [];
    }
  },

  saveCustomers: (customers: Customer[]): void => {
    try {
      localStorage.setItem(STORAGE_KEY_CUSTOMERS, JSON.stringify(customers));
    } catch (error) {
      console.error('Error saving customers:', error);
    }
  },

  addCustomer: (customer: Customer): void => {
    const customers = storage.getCustomers();
    customers.push(customer);
    storage.saveCustomers(customers);
  },

  updateCustomer: (id: string, updates: Partial<Customer>): void => {
    const customers = storage.getCustomers();
    const index = customers.findIndex(c => c.id === id);
    if (index !== -1) {
      customers[index] = { ...customers[index], ...updates };
      storage.saveCustomers(customers);
    }
  },

  deleteCustomer: (id: string): void => {
    const customers = storage.getCustomers();
    const filtered = customers.filter(c => c.id !== id);
    storage.saveCustomers(filtered);
  },

  // Projects
  getProjects: (): Project[] => {
    try {
      const data = localStorage.getItem(STORAGE_KEY_PROJECTS);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Error loading projects:', error);
      return [];
    }
  },

  saveProjects: (projects: Project[]): void => {
    try {
      localStorage.setItem(STORAGE_KEY_PROJECTS, JSON.stringify(projects));
    } catch (error) {
      console.error('Error saving projects:', error);
    }
  },

  addProject: (project: Project): void => {
    const projects = storage.getProjects();
    projects.push(project);
    storage.saveProjects(projects);
  },

  updateProject: (id: string, updates: Partial<Project>): void => {
    const projects = storage.getProjects();
    const index = projects.findIndex(p => p.id === id);
    if (index !== -1) {
      projects[index] = { ...projects[index], ...updates };
      storage.saveProjects(projects);
    }
  },

  deleteProject: (id: string): void => {
    const projects = storage.getProjects();
    const filtered = projects.filter(p => p.id !== id);
    storage.saveProjects(filtered);
  }
};
