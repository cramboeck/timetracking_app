import { User, TimeEntry, Customer, Project, Activity, CompanyInfo } from '../types';
import { storage } from './storage';

export interface UserDataExport {
  exportDate: string;
  user: Omit<User, 'passwordHash' | 'mfaSecret'>;
  timeEntries: TimeEntry[];
  customers: Customer[];
  projects: Project[];
  activities: Activity[];
  companyInfo: CompanyInfo | null;
  statistics: {
    totalEntries: number;
    totalHours: number;
    totalCustomers: number;
    totalProjects: number;
  };
}

export const gdprService = {
  /**
   * Export all user data as JSON
   */
  exportUserDataAsJSON: (userId: string): string => {
    const data = gdprService.getUserData(userId);
    return JSON.stringify(data, null, 2);
  },

  /**
   * Export all user data as CSV
   */
  exportUserDataAsCSV: (userId: string): string => {
    const data = gdprService.getUserData(userId);

    let csv = '';

    // User Info
    csv += 'USER INFORMATION\n';
    csv += 'Field,Value\n';
    csv += `Username,${data.user.username}\n`;
    csv += `Email,${data.user.email}\n`;
    csv += `Account Type,${data.user.accountType}\n`;
    csv += `Created At,${data.user.createdAt}\n`;
    csv += '\n';

    // Time Entries
    csv += 'TIME ENTRIES\n';
    csv += 'ID,Project ID,Start Time,End Time,Duration (hours),Description,Is Running,Created At\n';
    data.timeEntries.forEach(entry => {
      csv += `${entry.id},${entry.projectId},${entry.startTime},${entry.endTime || ''},${(entry.duration / 3600).toFixed(2)},${entry.description},${entry.isRunning},${entry.createdAt}\n`;
    });
    csv += '\n';

    // Customers
    csv += 'CUSTOMERS\n';
    csv += 'ID,Name,Color,Customer Number,Contact Person,Email,Address,Created At\n';
    data.customers.forEach(customer => {
      csv += `${customer.id},${customer.name},${customer.color},${customer.customerNumber || ''},${customer.contactPerson || ''},${customer.email || ''},${customer.address || ''},${customer.createdAt}\n`;
    });
    csv += '\n';

    // Projects
    csv += 'PROJECTS\n';
    csv += 'ID,Customer ID,Name,Is Active,Rate Type,Hourly Rate,Created At\n';
    data.projects.forEach(project => {
      csv += `${project.id},${project.customerId},${project.name},${project.isActive},${project.rateType},${project.hourlyRate || ''},${project.createdAt}\n`;
    });
    csv += '\n';

    // Activities
    csv += 'ACTIVITIES\n';
    csv += 'ID,Name,Description,Is Billable,Pricing Type,Flat Rate,Created At\n';
    data.activities.forEach(activity => {
      csv += `${activity.id},${activity.name},${activity.description || ''},${activity.isBillable},${activity.pricingType},${activity.flatRate || ''},${activity.createdAt}\n`;
    });
    csv += '\n';

    // Statistics
    csv += 'STATISTICS\n';
    csv += 'Metric,Value\n';
    csv += `Total Entries,${data.statistics.totalEntries}\n`;
    csv += `Total Hours,${data.statistics.totalHours.toFixed(2)}\n`;
    csv += `Total Customers,${data.statistics.totalCustomers}\n`;
    csv += `Total Projects,${data.statistics.totalProjects}\n`;

    return csv;
  },

  /**
   * Get all user data
   */
  getUserData: (userId: string): UserDataExport => {
    const allUsers = storage.getUsers();
    const user = allUsers.find(u => u.id === userId);

    if (!user) {
      throw new Error('User not found');
    }

    const timeEntries = storage.getEntries().filter(e => e.userId === userId);
    const customers = storage.getCustomers().filter(c => c.userId === userId);
    const projects = storage.getProjects().filter(p => p.userId === userId);
    const activities = storage.getActivities().filter(a => a.userId === userId);
    const companyInfo = storage.getCompanyInfoByUserId(userId) || null;

    const totalHours = timeEntries.reduce((sum, entry) => sum + (entry.duration / 3600), 0);

    // Remove sensitive data
    const { passwordHash, mfaSecret, ...safeUser } = user;

    return {
      exportDate: new Date().toISOString(),
      user: safeUser,
      timeEntries,
      customers,
      projects,
      activities,
      companyInfo,
      statistics: {
        totalEntries: timeEntries.length,
        totalHours,
        totalCustomers: customers.length,
        totalProjects: projects.length,
      }
    };
  },

  /**
   * Delete all user data (Right to be forgotten)
   */
  deleteUserData: (userId: string): boolean => {
    try {
      // Get all user data
      const allUsers = storage.getUsers();
      const user = allUsers.find(u => u.id === userId);
      if (!user) {
        return false;
      }

      // Delete all related data
      const allEntries = storage.getEntries();
      const filteredEntries = allEntries.filter(e => e.userId !== userId);
      storage.saveEntries(filteredEntries);

      const allCustomers = storage.getCustomers();
      const filteredCustomers = allCustomers.filter(c => c.userId !== userId);
      storage.saveCustomers(filteredCustomers);

      const allProjects = storage.getProjects();
      const filteredProjects = allProjects.filter(p => p.userId !== userId);
      storage.saveProjects(filteredProjects);

      const allActivities = storage.getActivities();
      const filteredActivities = allActivities.filter(a => a.userId !== userId);
      storage.saveActivities(filteredActivities);

      // Delete company info - just filter it from the list
      const allCompanyInfos = storage.getCompanyInfos();
      const filteredCompanyInfos = allCompanyInfos.filter(c => c.userId !== userId);
      storage.saveCompanyInfos(filteredCompanyInfos);

      // Delete team invitations created by user
      const invitations = storage.getTeamInvitations();
      const filteredInvitations = invitations.filter(inv => inv.createdBy !== userId);
      storage.saveTeamInvitations(filteredInvitations);

      // Finally, delete user
      const filteredUsers = allUsers.filter(u => u.id !== userId);
      storage.saveUsers(filteredUsers);

      // Clear current user if it's the deleted user
      const currentUser = storage.getCurrentUser();
      if (currentUser && currentUser.id === userId) {
        storage.clearCurrentUser();
      }

      console.log(`✅ User ${userId} and all associated data deleted`);
      return true;
    } catch (error) {
      console.error('Error deleting user data:', error);
      return false;
    }
  },

  /**
   * Download data as file
   */
  downloadDataAsFile: (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },
};
