import { TimeEntry, Customer, Project, Activity, User, Team, TeamMembership, TeamRole, CompanyInfo, TeamInvitation } from '../types';

const STORAGE_KEY_ENTRIES = 'timetracking_entries';
const STORAGE_KEY_CUSTOMERS = 'timetracking_customers';
const STORAGE_KEY_PROJECTS = 'timetracking_projects';
const STORAGE_KEY_ACTIVITIES = 'timetracking_activities';
const STORAGE_KEY_USERS = 'timetracking_users';
const STORAGE_KEY_CURRENT_USER = 'timetracking_current_user';
const STORAGE_KEY_TEAMS = 'timetracking_teams';
const STORAGE_KEY_TEAM_MEMBERSHIPS = 'timetracking_team_memberships';
const STORAGE_KEY_COMPANY_INFO = 'timetracking_company_info';
const STORAGE_KEY_TEAM_INVITATIONS = 'timetracking_team_invitations';

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
  },

  // Activities
  getActivities: (): Activity[] => {
    try {
      const data = localStorage.getItem(STORAGE_KEY_ACTIVITIES);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Error loading activities:', error);
      return [];
    }
  },

  saveActivities: (activities: Activity[]): void => {
    try {
      localStorage.setItem(STORAGE_KEY_ACTIVITIES, JSON.stringify(activities));
    } catch (error) {
      console.error('Error saving activities:', error);
    }
  },

  addActivity: (activity: Activity): void => {
    const activities = storage.getActivities();
    activities.push(activity);
    storage.saveActivities(activities);
  },

  updateActivity: (id: string, updates: Partial<Activity>): void => {
    const activities = storage.getActivities();
    const index = activities.findIndex(a => a.id === id);
    if (index !== -1) {
      activities[index] = { ...activities[index], ...updates };
      storage.saveActivities(activities);
    }
  },

  deleteActivity: (id: string): void => {
    const activities = storage.getActivities();
    const filtered = activities.filter(a => a.id !== id);
    storage.saveActivities(filtered);
  },

  // Users
  getUsers: (): User[] => {
    try {
      const data = localStorage.getItem(STORAGE_KEY_USERS);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Error loading users:', error);
      return [];
    }
  },

  saveUsers: (users: User[]): void => {
    try {
      localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(users));
    } catch (error) {
      console.error('Error saving users:', error);
    }
  },

  addUser: (user: User): void => {
    const users = storage.getUsers();
    users.push(user);
    storage.saveUsers(users);
  },

  getUserByUsername: (username: string): User | undefined => {
    const users = storage.getUsers();
    return users.find(u => u.username.toLowerCase() === username.toLowerCase());
  },

  getUserByEmail: (email: string): User | undefined => {
    const users = storage.getUsers();
    return users.find(u => u.email.toLowerCase() === email.toLowerCase());
  },

  updateUser: (id: string, updates: Partial<User>): void => {
    const users = storage.getUsers();
    const index = users.findIndex(u => u.id === id);
    if (index !== -1) {
      users[index] = { ...users[index], ...updates };
      storage.saveUsers(users);
    }
  },

  // Current User Session
  getCurrentUser: (): User | null => {
    try {
      const data = localStorage.getItem(STORAGE_KEY_CURRENT_USER);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Error loading current user:', error);
      return null;
    }
  },

  setCurrentUser: (user: User | null): void => {
    try {
      if (user) {
        localStorage.setItem(STORAGE_KEY_CURRENT_USER, JSON.stringify(user));
      } else {
        localStorage.removeItem(STORAGE_KEY_CURRENT_USER);
      }
    } catch (error) {
      console.error('Error saving current user:', error);
    }
  },

  clearCurrentUser: (): void => {
    localStorage.removeItem(STORAGE_KEY_CURRENT_USER);
  },

  // Teams
  getTeams: (): Team[] => {
    try {
      const data = localStorage.getItem(STORAGE_KEY_TEAMS);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Error loading teams:', error);
      return [];
    }
  },

  saveTeams: (teams: Team[]): void => {
    try {
      localStorage.setItem(STORAGE_KEY_TEAMS, JSON.stringify(teams));
    } catch (error) {
      console.error('Error saving teams:', error);
    }
  },

  addTeam: (team: Team): void => {
    const teams = storage.getTeams();
    teams.push(team);
    storage.saveTeams(teams);
  },

  getTeamById: (id: string): Team | undefined => {
    const teams = storage.getTeams();
    return teams.find(t => t.id === id);
  },

  updateTeam: (id: string, updates: Partial<Team>): void => {
    const teams = storage.getTeams();
    const index = teams.findIndex(t => t.id === id);
    if (index !== -1) {
      teams[index] = { ...teams[index], ...updates };
      storage.saveTeams(teams);
    }
  },

  // Team Memberships
  getTeamMemberships: (): TeamMembership[] => {
    try {
      const data = localStorage.getItem(STORAGE_KEY_TEAM_MEMBERSHIPS);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Error loading team memberships:', error);
      return [];
    }
  },

  saveTeamMemberships: (memberships: TeamMembership[]): void => {
    try {
      localStorage.setItem(STORAGE_KEY_TEAM_MEMBERSHIPS, JSON.stringify(memberships));
    } catch (error) {
      console.error('Error saving team memberships:', error);
    }
  },

  addTeamMembership: (membership: TeamMembership): void => {
    const memberships = storage.getTeamMemberships();
    memberships.push(membership);
    storage.saveTeamMemberships(memberships);
  },

  getTeamMembers: (teamId: string): User[] => {
    const users = storage.getUsers();
    return users.filter(u => u.teamId === teamId);
  },

  getUserRole: (userId: string, teamId: string): TeamRole | undefined => {
    const user = storage.getUsers().find(u => u.id === userId);
    if (user && user.teamId === teamId) {
      return user.teamRole;
    }
    return undefined;
  },

  // Company Info
  getCompanyInfos: (): CompanyInfo[] => {
    try {
      const data = localStorage.getItem(STORAGE_KEY_COMPANY_INFO);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Error loading company infos:', error);
      return [];
    }
  },

  saveCompanyInfos: (infos: CompanyInfo[]): void => {
    try {
      localStorage.setItem(STORAGE_KEY_COMPANY_INFO, JSON.stringify(infos));
    } catch (error) {
      console.error('Error saving company infos:', error);
    }
  },

  getCompanyInfoByUserId: (userId: string): CompanyInfo | undefined => {
    const infos = storage.getCompanyInfos();
    return infos.find(info => info.userId === userId);
  },

  saveCompanyInfo: (info: CompanyInfo): void => {
    const infos = storage.getCompanyInfos();
    const index = infos.findIndex(i => i.userId === info.userId);

    if (index !== -1) {
      infos[index] = { ...info, updatedAt: new Date().toISOString() };
    } else {
      infos.push(info);
    }

    storage.saveCompanyInfos(infos);
  },

  updateCompanyInfo: (userId: string, updates: Partial<CompanyInfo>): void => {
    const infos = storage.getCompanyInfos();
    const index = infos.findIndex(i => i.userId === userId);

    if (index !== -1) {
      infos[index] = {
        ...infos[index],
        ...updates,
        updatedAt: new Date().toISOString()
      };
      storage.saveCompanyInfos(infos);
    }
  },

  // Team Invitations
  getTeamInvitations: (): TeamInvitation[] => {
    try {
      const data = localStorage.getItem(STORAGE_KEY_TEAM_INVITATIONS);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Error loading team invitations:', error);
      return [];
    }
  },

  saveTeamInvitations: (invitations: TeamInvitation[]): void => {
    try {
      localStorage.setItem(STORAGE_KEY_TEAM_INVITATIONS, JSON.stringify(invitations));
    } catch (error) {
      console.error('Error saving team invitations:', error);
    }
  },

  createTeamInvitation: (invitation: TeamInvitation): void => {
    const invitations = storage.getTeamInvitations();
    invitations.push(invitation);
    storage.saveTeamInvitations(invitations);
  },

  getTeamInvitationsByTeamId: (teamId: string): TeamInvitation[] => {
    const invitations = storage.getTeamInvitations();
    return invitations.filter(inv => inv.teamId === teamId && !inv.usedBy);
  },

  getTeamInvitationByCode: (code: string): TeamInvitation | undefined => {
    const invitations = storage.getTeamInvitations();
    return invitations.find(inv => inv.invitationCode === code && !inv.usedBy);
  },

  useTeamInvitation: (code: string, userId: string): void => {
    const invitations = storage.getTeamInvitations();
    const index = invitations.findIndex(inv => inv.invitationCode === code);

    if (index !== -1) {
      invitations[index] = {
        ...invitations[index],
        usedBy: userId,
        usedAt: new Date().toISOString()
      };
      storage.saveTeamInvitations(invitations);
    }
  },

  deleteTeamInvitation: (id: string): void => {
    const invitations = storage.getTeamInvitations();
    const filtered = invitations.filter(inv => inv.id !== id);
    storage.saveTeamInvitations(filtered);
  }
};
