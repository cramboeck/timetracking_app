import { useState, useEffect, useRef } from 'react';
import { Plus, Edit2, Trash2, Users, FolderOpen, Palette, ListChecks, LogOut, Contrast, Building, Upload, X, Users2, Copy, Shield, UserPlus, Bell, User as UserIcon, Clock, Timer, ChevronRight, FileDown, Key, Save, XCircle, TrendingUp, Calendar, Activity as ActivityIcon, UserCog, Ticket, Book } from 'lucide-react';
import { Customer, Project, Activity, GrayTone, TeamInvitation, User, TimeRoundingInterval } from '../types';
import { Modal } from './Modal';
import { ConfirmDialog } from './ConfirmDialog';
import { CustomerContacts } from './CustomerContacts';
import { TicketSettings } from './TicketSettings';
import { KnowledgeBaseSettings } from './KnowledgeBaseSettings';
import { PushNotificationSettings } from './PushNotificationSettings';
import { SevdeskSettings } from './SevdeskSettings';
import { CreditCard } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getRoundingIntervalLabel } from '../utils/timeRounding';
import { gdprService } from '../utils/gdpr';
import { notificationService } from '../utils/notifications';
import { authApi, userApi, teamsApi, sevdeskApi } from '../services/api';
import Papa from 'papaparse';
import { getTemplatesByCategory, ActivityTemplate } from '../data/activityTemplates';
import { generateUUID } from '../utils/uuid';
import { storage } from '../utils/storage';

interface SettingsProps {
  customers: Customer[];
  projects: Project[];
  activities: Activity[];
  entries: TimeEntry[];
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onAddCustomer: (customer: Customer) => void;
  onUpdateCustomer: (id: string, updates: Partial<Customer>) => void;
  onDeleteCustomer: (id: string) => void;
  onAddProject: (project: Project) => void;
  onUpdateProject: (id: string, updates: Partial<Project>) => void;
  onDeleteProject: (id: string) => void;
  onAddActivity: (activity: Activity) => void;
  onUpdateActivity: (id: string, updates: Partial<Activity>) => void;
  onDeleteActivity: (id: string) => void;
}

const COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16'
];

export const Settings = ({
  customers,
  projects,
  activities,
  entries,
  darkMode,
  onToggleDarkMode,
  onAddCustomer,
  onUpdateCustomer,
  onDeleteCustomer,
  onAddProject,
  onUpdateProject,
  onDeleteProject,
  onAddActivity,
  onUpdateActivity,
  onDeleteActivity
}: SettingsProps) => {
  const { currentUser, logout, updateAccentColor, updateGrayTone, updateTimeRoundingInterval, updateTimeFormat } = useAuth();
  const [activeTab, setActiveTab] = useState<'account' | 'appearance' | 'notifications' | 'company' | 'team' | 'customers' | 'projects' | 'activities' | 'tickets' | 'portal' | 'billing'>('account');
  const [billingEnabled, setBillingEnabled] = useState(false);

  // Company Info State
  const [companyName, setCompanyName] = useState('');
  const [companyAddress, setCompanyAddress] = useState('');
  const [companyCity, setCompanyCity] = useState('');
  const [companyZipCode, setCompanyZipCode] = useState('');
  const [companyCountry, setCompanyCountry] = useState('Deutschland');
  const [companyEmail, setCompanyEmail] = useState('');
  const [companyPhone, setCompanyPhone] = useState('');
  const [companyWebsite, setCompanyWebsite] = useState('');
  const [companyTaxId, setCompanyTaxId] = useState('');
  const [companyCustomerNumber, setCompanyCustomerNumber] = useState('');
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);

  // Customer Modal
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  // Customer Contacts Modal
  const [contactsCustomer, setContactsCustomer] = useState<Customer | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerColor, setCustomerColor] = useState(COLORS[0]);
  const [customerNumber, setCustomerNumber] = useState('');
  const [customerContactPerson, setCustomerContactPerson] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerReportTitle, setCustomerReportTitle] = useState('');

  // CSV Import
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importResult, setImportResult] = useState<{ success: number; failed: number; errors: string[] } | null>(null);
  const [csvPreviewData, setCsvPreviewData] = useState<{ headers: string[]; rows: any[]; allData: any[] } | null>(null);
  const [columnMappings, setColumnMappings] = useState<Record<string, string>>({});
  const [mappingModalOpen, setMappingModalOpen] = useState(false);

  // Profile Edit State
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');

  // Password Change State
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');

  // Project Modal
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [projectName, setProjectName] = useState('');
  const [projectCustomerId, setProjectCustomerId] = useState('');
  const [projectRateType, setProjectRateType] = useState<'hourly' | 'daily'>('hourly');
  const [projectHourlyRate, setProjectHourlyRate] = useState('');

  // Activity Modal
  const [activityModalOpen, setActivityModalOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [activityName, setActivityName] = useState('');
  const [activityDescription, setActivityDescription] = useState('');
  const [activityIsBillable, setActivityIsBillable] = useState(true);
  const [activityPricingType, setActivityPricingType] = useState<'hourly' | 'flat'>('hourly');
  const [activityFlatRate, setActivityFlatRate] = useState('');
  const [templateModalOpen, setTemplateModalOpen] = useState(false);

  // Team State
  const [teamMembers, setTeamMembers] = useState<User[]>([]);
  const [teamInvitations, setTeamInvitations] = useState<TeamInvitation[]>([]);
  const [newInvitationRole, setNewInvitationRole] = useState<'admin' | 'member'>('member');

  // Delete Confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    type: 'customer' | 'project' | 'activity' | null;
    id: string;
    name: string;
  }>({ isOpen: false, type: null, id: '', name: '' });

  const openCustomerModal = (customer?: Customer) => {
    if (customer) {
      setEditingCustomer(customer);
      setCustomerName(customer.name);
      setCustomerColor(customer.color);
      setCustomerNumber(customer.customerNumber || '');
      setCustomerContactPerson(customer.contactPerson || '');
      setCustomerEmail(customer.email || '');
      setCustomerAddress(customer.address || '');
      setCustomerReportTitle(customer.reportTitle || '');
    } else {
      setEditingCustomer(null);
      setCustomerName('');
      setCustomerColor(COLORS[0]);
      setCustomerNumber('');
      setCustomerContactPerson('');
      setCustomerEmail('');
      setCustomerAddress('');
      setCustomerReportTitle('');
    }
    setCustomerModalOpen(true);
  };

  // Load billing feature status
  useEffect(() => {
    const loadBillingStatus = async () => {
      try {
        const response = await sevdeskApi.getFeatureStatus();
        setBillingEnabled(response.data.billingEnabled);
      } catch (err) {
        // Ignore error - billing feature not available
        setBillingEnabled(false);
      }
    };
    loadBillingStatus();
  }, []);

  // Profile Edit Handlers
  const handleOpenEditProfile = () => {
    setNewUsername(currentUser?.username || '');
    setNewEmail(currentUser?.email || '');
    setProfileError('');
    setProfileSuccess('');
    setEditProfileOpen(true);
  };

  const handleSaveProfile = async () => {
    try {
      setProfileError('');
      setProfileSuccess('');

      if (!newUsername.trim() && !newEmail.trim()) {
        setProfileError('Bitte gib einen Benutzernamen oder eine E-Mail ein');
        return;
      }

      const updates: { username?: string; email?: string } = {};

      if (newUsername.trim() && newUsername !== currentUser?.username) {
        updates.username = newUsername.trim();
      }

      if (newEmail.trim() && newEmail !== currentUser?.email) {
        updates.email = newEmail.trim();
      }

      if (Object.keys(updates).length === 0) {
        setProfileError('Keine Änderungen vorgenommen');
        return;
      }

      const result = await authApi.updateProfile(updates);

      // Update user in context
      if (result.user) {
        // Trigger a re-fetch of user data
        window.location.reload();
      }

      setProfileSuccess('Profil erfolgreich aktualisiert!');
      setTimeout(() => {
        setEditProfileOpen(false);
      }, 1500);
    } catch (error: any) {
      setProfileError(error.message || 'Fehler beim Aktualisieren des Profils');
    }
  };

  // Password Change Handlers
  const handleOpenChangePassword = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError('');
    setPasswordSuccess('');
    setChangePasswordOpen(true);
  };

  const handleChangePassword = async () => {
    try {
      setPasswordError('');
      setPasswordSuccess('');

      if (!currentPassword || !newPassword || !confirmPassword) {
        setPasswordError('Bitte fülle alle Felder aus');
        return;
      }

      if (newPassword.length < 6) {
        setPasswordError('Das neue Passwort muss mindestens 6 Zeichen lang sein');
        return;
      }

      if (newPassword !== confirmPassword) {
        setPasswordError('Die neuen Passwörter stimmen nicht überein');
        return;
      }

      await authApi.changePassword(currentPassword, newPassword);

      setPasswordSuccess('Passwort erfolgreich geändert!');
      setTimeout(() => {
        setChangePasswordOpen(false);
      }, 1500);
    } catch (error: any) {
      setPasswordError(error.message || 'Fehler beim Ändern des Passworts');
    }
  };

  const handleSaveCustomer = () => {
    if (!customerName.trim()) return;

    if (editingCustomer) {
      onUpdateCustomer(editingCustomer.id, {
        name: customerName.trim(),
        color: customerColor,
        customerNumber: customerNumber.trim() || undefined,
        contactPerson: customerContactPerson.trim() || undefined,
        email: customerEmail.trim() || undefined,
        address: customerAddress.trim() || undefined,
        reportTitle: customerReportTitle.trim() || undefined
      });
    } else {
      onAddCustomer({
        id: generateUUID(),
        userId: currentUser!.id,
        name: customerName.trim(),
        color: customerColor,
        customerNumber: customerNumber.trim() || undefined,
        contactPerson: customerContactPerson.trim() || undefined,
        email: customerEmail.trim() || undefined,
        address: customerAddress.trim() || undefined,
        reportTitle: customerReportTitle.trim() || undefined,
        createdAt: new Date().toISOString()
      });
    }

    setCustomerModalOpen(false);
  };

  // CSV Import Handler
  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check file type
    if (!file.name.endsWith('.csv')) {
      alert('Bitte wähle eine CSV-Datei aus.');
      return;
    }

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (!results.data || results.data.length === 0) {
          alert('Die CSV-Datei enthält keine Daten.');
          return;
        }

        // Extract headers from the first row
        const headers = Object.keys(results.data[0] as object);

        // Get preview rows (first 3 rows)
        const previewRows = results.data.slice(0, 3);

        // Store all data for later processing
        const allData = results.data;

        // Generate intelligent mapping suggestions
        const suggestedMappings: Record<string, string> = {};

        // Field definitions with their possible column name variants
        const fieldMappings = {
          name: ['name', 'Name', 'Firmenname', 'Firma', 'Kundenname', 'company', 'Company', 'customer', 'Customer'],
          customerNumber: ['customerNumber', 'number', 'Kundennummer', 'Debitorennummer', 'Kunden-Nr', 'customer_number', 'Nummer'],
          contactPerson: ['Ansprechpartner', 'contactPerson', 'contact', 'Contact', 'Kontaktperson'],
          firstName: ['Vorname', 'firstname', 'first_name', 'FirstName'],
          lastName: ['Nachname', 'lastname', 'last_name', 'LastName'],
          email: ['email', 'Email', 'E-Mail', 'e-mail', 'mail', 'Mail', 'emailAddress'],
          street: ['Straße', 'Strasse', 'street', 'Street'],
          address: ['Adresse', 'address', 'Address'],
          zip: ['PLZ', 'Postleitzahl', 'zip', 'Zip', 'zipcode', 'postal_code'],
          city: ['Stadt', 'Ort', 'city', 'City', 'place'],
          country: ['Land', 'country', 'Country'],
          phone: ['Telefon', 'Tel', 'Telefonnummer', 'phone', 'Phone', 'telephone', 'mobile', 'Mobil'],
          taxId: ['USt-IdNr', 'Steuernummer', 'taxId', 'tax_id', 'vat_id', 'vatId', 'UStID']
        };

        // For each CSV column, suggest the best matching field
        headers.forEach(header => {
          for (const [field, variants] of Object.entries(fieldMappings)) {
            if (variants.some(variant => variant.toLowerCase() === header.toLowerCase())) {
              suggestedMappings[header] = field;
              break;
            }
          }
          // If no match found, leave unmapped (empty string)
          if (!suggestedMappings[header]) {
            suggestedMappings[header] = '';
          }
        });

        // Set state and show mapping modal
        setCsvPreviewData({ headers, rows: previewRows, allData });
        setColumnMappings(suggestedMappings);
        setMappingModalOpen(true);

        // Clear file input
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      },
      error: (error) => {
        alert(`Fehler beim Lesen der Datei: ${error.message}`);
      }
    });
  };

  const processImportWithMappings = () => {
    if (!csvPreviewData) return;

    const errors: string[] = [];
    let successCount = 0;
    let failedCount = 0;

    // Create a reverse mapping from field names to CSV columns
    const fieldToColumn: Record<string, string> = {};
    Object.entries(columnMappings).forEach(([csvColumn, fieldName]) => {
      if (fieldName) {
        fieldToColumn[fieldName] = csvColumn;
      }
    });

    csvPreviewData.allData.forEach((row: any, index) => {
      try {
        // Get name (required field)
        const name = row[fieldToColumn['name']]?.trim();

        if (!name) {
          errors.push(`Zeile ${index + 2}: Name/Firmenname fehlt`);
          failedCount++;
          return;
        }

        // Get customer number
        const customerNumber = row[fieldToColumn['customerNumber']]?.trim();

        // Get contact person (can be from separate fields or combined)
        let contactPerson = row[fieldToColumn['contactPerson']]?.trim();
        if (!contactPerson) {
          const firstName = row[fieldToColumn['firstName']]?.trim();
          const lastName = row[fieldToColumn['lastName']]?.trim();
          if (firstName || lastName) {
            contactPerson = [firstName, lastName].filter(Boolean).join(' ');
          }
        }

        // Get email
        const email = row[fieldToColumn['email']]?.trim();

        // Build address from separate fields or use combined field
        let address = row[fieldToColumn['address']]?.trim() || '';
        if (!address) {
          const street = row[fieldToColumn['street']]?.trim();
          const zip = row[fieldToColumn['zip']]?.trim();
          const city = row[fieldToColumn['city']]?.trim();
          const country = row[fieldToColumn['country']]?.trim();

          address = street || '';
          if (zip || city) {
            const cityLine = [zip, city].filter(Boolean).join(' ');
            address = [address, cityLine].filter(Boolean).join(', ');
          }
          if (country && country !== 'Deutschland' && country !== 'Germany' && country !== 'DE') {
            address = [address, country].filter(Boolean).join(', ');
          }
        }

        // Create customer
        const customer: Customer = {
          id: generateUUID(),
          userId: currentUser!.id,
          name: name,
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
          customerNumber: customerNumber || undefined,
          contactPerson: contactPerson || undefined,
          email: email || undefined,
          address: address || undefined,
          reportTitle: undefined,
          createdAt: new Date().toISOString()
        };

        onAddCustomer(customer);
        successCount++;
      } catch (error) {
        errors.push(`Zeile ${index + 2}: ${error}`);
        failedCount++;
      }
    });

    setImportResult({ success: successCount, failed: failedCount, errors });
    setMappingModalOpen(false);
    setCsvPreviewData(null);
    setColumnMappings({});
  };

  const openProjectModal = (project?: Project) => {
    if (project) {
      setEditingProject(project);
      setProjectName(project.name);
      setProjectCustomerId(project.customerId);
      setProjectRateType(project.rateType || 'hourly');
      setProjectHourlyRate(project.hourlyRate.toString());
    } else {
      setEditingProject(null);
      setProjectName('');
      setProjectCustomerId(customers[0]?.id || '');
      setProjectRateType('hourly');
      setProjectHourlyRate('');
    }
    setProjectModalOpen(true);
  };

  const handleSaveProject = () => {
    if (!projectName.trim() || !projectCustomerId || !projectHourlyRate) return;

    if (editingProject) {
      onUpdateProject(editingProject.id, {
        name: projectName.trim(),
        customerId: projectCustomerId,
        rateType: projectRateType,
        hourlyRate: parseFloat(projectHourlyRate)
      });
    } else {
      onAddProject({
        id: generateUUID(),
        userId: currentUser!.id,
        name: projectName.trim(),
        customerId: projectCustomerId,
        rateType: projectRateType,
        hourlyRate: parseFloat(projectHourlyRate),
        isActive: true,
        createdAt: new Date().toISOString()
      });
    }

    setProjectModalOpen(false);
  };

  const openActivityModal = (activity?: Activity) => {
    if (activity) {
      setEditingActivity(activity);
      setActivityName(activity.name);
      setActivityDescription(activity.description || '');
      setActivityIsBillable(activity.isBillable ?? true);
      setActivityPricingType(activity.pricingType || 'hourly');
      setActivityFlatRate(activity.flatRate?.toString() || '');
    } else {
      setEditingActivity(null);
      setActivityName('');
      setActivityDescription('');
      setActivityIsBillable(true);
      setActivityPricingType('hourly');
      setActivityFlatRate('');
    }
    setActivityModalOpen(true);
  };

  const handleSaveActivity = () => {
    if (!activityName.trim()) return;

    const flatRateValue = activityPricingType === 'flat' && activityFlatRate
      ? parseFloat(activityFlatRate)
      : undefined;

    if (editingActivity) {
      onUpdateActivity(editingActivity.id, {
        name: activityName.trim(),
        description: activityDescription.trim() || undefined,
        isBillable: activityIsBillable,
        pricingType: activityPricingType,
        flatRate: flatRateValue
      });
    } else {
      onAddActivity({
        id: generateUUID(),
        userId: currentUser!.id,
        name: activityName.trim(),
        description: activityDescription.trim() || undefined,
        isBillable: activityIsBillable,
        pricingType: activityPricingType,
        flatRate: flatRateValue,
        createdAt: new Date().toISOString()
      });
    }

    setActivityModalOpen(false);
  };

  const handleUseTemplate = (template: ActivityTemplate) => {
    setActivityName(template.name);
    setActivityDescription(template.description);
    setActivityIsBillable(template.isBillable);
    setActivityPricingType(template.pricingType);
    setActivityFlatRate('');
    setTemplateModalOpen(false);
    setActivityModalOpen(true);
  };

  const handleDeleteCustomer = (customer: Customer) => {
    const customerProjects = projects.filter(p => p.customerId === customer.id);
    if (customerProjects.length > 0) {
      alert(`Dieser Kunde kann nicht gelöscht werden, da noch ${customerProjects.length} Projekt(e) zugeordnet sind.`);
      return;
    }
    setDeleteConfirm({
      isOpen: true,
      type: 'customer',
      id: customer.id,
      name: customer.name
    });
  };

  const handleDeleteProject = (project: Project) => {
    setDeleteConfirm({
      isOpen: true,
      type: 'project',
      id: project.id,
      name: project.name
    });
  };

  const handleDeleteActivity = (activity: Activity) => {
    setDeleteConfirm({
      isOpen: true,
      type: 'activity',
      id: activity.id,
      name: activity.name
    });
  };

  const confirmDelete = () => {
    if (deleteConfirm.type === 'customer') {
      onDeleteCustomer(deleteConfirm.id);
    } else if (deleteConfirm.type === 'project') {
      onDeleteProject(deleteConfirm.id);
    } else if (deleteConfirm.type === 'activity') {
      onDeleteActivity(deleteConfirm.id);
    }
  };

  // Load company info on mount
  useEffect(() => {
    if (currentUser) {
      const loadCompanyInfo = async () => {
        try {
          const info = await userApi.getCompany();
          if (info) {
            setCompanyName(info.name || '');
            setCompanyAddress(info.address || '');
            setCompanyCity(info.city || '');
            setCompanyZipCode(info.zipCode || '');
            setCompanyCountry(info.country || 'Deutschland');
            setCompanyEmail(info.email || '');
            setCompanyPhone(info.phone || '');
            setCompanyWebsite(info.website || '');
            setCompanyTaxId(info.taxId || '');
            setCompanyCustomerNumber(info.customerNumber || '');
            setCompanyLogo(info.logo || null);
          }
        } catch (error) {
          console.error('Error loading company info:', error);
        }
      };
      loadCompanyInfo();
    }
  }, [currentUser]);

  // Load team data
  useEffect(() => {
    if (currentUser && currentUser.teamId && (currentUser.accountType === 'business' || currentUser.accountType === 'team')) {
      const loadTeamData = async () => {
        try {
          // Load team and members
          const team = await teamsApi.getMyTeam();
          if (team && team.members) {
            setTeamMembers(team.members as any);
          }

          // Load team invitations (only for owners/admins)
          if ((currentUser.teamRole === 'owner' || currentUser.teamRole === 'admin') && currentUser.teamId) {
            const invitations = await teamsApi.getInvitations(currentUser.teamId);
            setTeamInvitations(invitations);
          }
        } catch (error) {
          console.error('Error loading team data:', error);
        }
      };
      loadTeamData();
    }
  }, [currentUser, activeTab]);

  const handleCreateInvitation = async () => {
    if (!currentUser || !currentUser.teamId) return;

    try {
      const invitation = await teamsApi.createInvitation(
        currentUser.teamId,
        newInvitationRole,
        7 * 24 // 7 days in hours
      );
      setTeamInvitations([...teamInvitations, invitation]);
    } catch (error) {
      console.error('Error creating invitation:', error);
      alert('Fehler beim Erstellen der Einladung');
    }
  };

  const handleCopyInvitationCode = (code: string) => {
    navigator.clipboard.writeText(code);
    alert('Einladungscode kopiert!');
  };

  const handleDeleteInvitation = async (id: string) => {
    try {
      await teamsApi.deleteInvitation(id);
      setTeamInvitations(teamInvitations.filter(inv => inv.id !== id));
    } catch (error) {
      console.error('Error deleting invitation:', error);
      alert('Fehler beim Löschen der Einladung');
    }
  };

  const handleSaveCompanyInfo = async () => {
    if (!currentUser) return;

    // Validation - Ensure all values are strings first
    const nameStr = String(companyName || '');
    const addressStr = String(companyAddress || '');
    const cityStr = String(companyCity || '');
    const zipCodeStr = String(companyZipCode || '');
    const countryStr = String(companyCountry || '');
    const emailStr = String(companyEmail || '');

    if (!nameStr.trim() || !addressStr.trim() || !cityStr.trim() ||
        !zipCodeStr.trim() || !countryStr.trim() || !emailStr.trim()) {
      alert('Bitte fülle alle Pflichtfelder aus');
      return;
    }

    try {
      await userApi.updateCompany({
        name: nameStr.trim(),
        address: addressStr.trim(),
        city: cityStr.trim(),
        zipCode: zipCodeStr.trim(),
        country: countryStr.trim(),
        email: emailStr.trim(),
        phone: companyPhone ? String(companyPhone).trim() : undefined,
        website: companyWebsite ? String(companyWebsite).trim() : undefined,
        taxId: companyTaxId ? String(companyTaxId).trim() : undefined,
        customerNumber: companyCustomerNumber ? String(companyCustomerNumber).trim() : undefined,
        logo: companyLogo || undefined,
      });
      alert('Firmendaten gespeichert!');
    } catch (error) {
      console.error('Error saving company info:', error);
      alert('Fehler beim Speichern der Firmendaten');
    }
  };

  const handleLogoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      alert('Logo darf maximal 2MB groß sein');
      return;
    }

    // Check file type
    if (!file.type.startsWith('image/')) {
      alert('Nur Bilddateien sind erlaubt');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      setCompanyLogo(result);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    setCompanyLogo(null);
  };

  const getCustomerById = (id: string) => customers.find(c => c.id === id);

  // Sidebar menu items
  const menuItems = [
    {
      category: 'Persönlich',
      items: [
        { id: 'account', label: 'Mein Account', icon: UserIcon, desc: 'Profil & Logout' },
        { id: 'appearance', label: 'Darstellung', icon: Palette, desc: 'Theme & Farben' },
        { id: 'notifications', label: 'Benachrichtigungen', icon: Bell, desc: 'E-Mail & Browser' }
      ]
    },
    {
      category: 'Zeiterfassung',
      items: [
        { id: 'customers', label: 'Kunden', icon: Users, desc: 'Kunden verwalten' },
        { id: 'projects', label: 'Projekte', icon: FolderOpen, desc: 'Projekte verwalten' },
        { id: 'activities', label: 'Tätigkeiten', icon: ListChecks, desc: 'Tätigkeiten verwalten' }
      ]
    },
    {
      category: 'Geschäftlich',
      items: [
        { id: 'company', label: 'Firma & Branding', icon: Building, desc: 'Logo & Kontaktdaten' },
        ...(currentUser?.accountType === 'business' || currentUser?.accountType === 'team'
          ? [{ id: 'team', label: 'Team Management', icon: Users2, desc: 'Mitglieder & Einladungen' }]
          : []
        ),
        ...(billingEnabled
          ? [{ id: 'billing', label: 'Abrechnung', icon: CreditCard, desc: 'sevDesk Integration' }]
          : []
        )
      ]
    },
    {
      category: 'Support',
      items: [
        { id: 'tickets', label: 'Ticket-System', icon: Ticket, desc: 'Tags & Textbausteine' },
        { id: 'portal', label: 'Kundenportal', icon: Book, desc: 'KB & Branding' }
      ]
    }
  ];

  return (
    <div className="flex h-full bg-gray-50 dark:bg-gray-900">
      {/* Sidebar */}
      <div className="w-64 bg-white dark:bg-dark-100 border-r border-gray-200 dark:border-dark-200 flex-shrink-0 hidden lg:flex flex-col">
        {/* Sidebar Header */}
        <div className="px-6 py-6 border-b border-gray-200 dark:border-dark-200">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Einstellungen</h1>
          <p className="text-sm text-gray-500 dark:text-dark-400 mt-1">Verwalte deinen Account</p>
        </div>

        {/* Sidebar Navigation */}
        <nav className="flex-1 overflow-y-auto p-4">
          {menuItems.map((section, idx) => (
            <div key={idx} className={idx > 0 ? 'mt-6' : ''}>
              <h3 className="px-3 mb-2 text-xs font-semibold text-gray-500 dark:text-dark-400 uppercase tracking-wider">
                {section.category}
              </h3>
              <div className="space-y-1">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveTab(item.id as any)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${
                        isActive
                          ? 'bg-accent-light dark:bg-accent-lighter/10 text-accent-primary font-medium'
                          : 'text-gray-700 dark:text-dark-300 hover:bg-gray-100 dark:hover:bg-dark-50'
                      }`}
                    >
                      <Icon size={20} className={isActive ? 'text-accent-primary' : 'text-gray-400'} />
                      <div className="flex-1 text-left">
                        <div className={`text-sm ${isActive ? 'font-semibold' : 'font-medium'}`}>
                          {item.label}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-dark-400">
                          {item.desc}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </div>

      {/* Mobile Header with Dropdown */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-10 bg-white dark:bg-dark-100 border-b border-gray-200 dark:border-dark-200 px-4 py-3">
        <select
          value={activeTab}
          onChange={(e) => setActiveTab(e.target.value as any)}
          className="w-full px-4 py-2 border border-gray-300 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-accent-primary"
        >
          {menuItems.map((section) => (
            <optgroup key={section.category} label={section.category}>
              {section.items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="lg:hidden h-16"></div> {/* Spacer for mobile header */}
        <div className="p-4 sm:p-6 lg:p-8">
        {/* Account Tab */}
        {activeTab === 'account' && (
          <div className="max-w-5xl mx-auto space-y-6">
            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 rounded-xl border border-blue-200 dark:border-blue-800 p-5 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-blue-500 rounded-lg">
                    <ActivityIcon size={20} className="text-white" />
                  </div>
                  <p className="text-sm font-medium text-blue-900 dark:text-blue-200">Zeiteinträge</p>
                </div>
                <p className="text-3xl font-bold text-blue-900 dark:text-blue-100">
                  {entries.length}
                </p>
                <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">Gesamt erfasst</p>
              </div>

              <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 rounded-xl border border-green-200 dark:border-green-800 p-5 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-green-500 rounded-lg">
                    <Clock size={20} className="text-white" />
                  </div>
                  <p className="text-sm font-medium text-green-900 dark:text-green-200">Projekte</p>
                </div>
                <p className="text-3xl font-bold text-green-900 dark:text-green-100">
                  {projects.length}
                </p>
                <p className="text-xs text-green-700 dark:text-green-300 mt-1">Aktive Projekte</p>
              </div>

              <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 rounded-xl border border-purple-200 dark:border-purple-800 p-5 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-purple-500 rounded-lg">
                    <Users size={20} className="text-white" />
                  </div>
                  <p className="text-sm font-medium text-purple-900 dark:text-purple-200">Kunden</p>
                </div>
                <p className="text-3xl font-bold text-purple-900 dark:text-purple-100">
                  {customers.length}
                </p>
                <p className="text-xs text-purple-700 dark:text-purple-300 mt-1">Registrierte Kunden</p>
              </div>
            </div>

            {/* Account Details */}
            <div className="bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-200 p-6 shadow-md">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-accent-light dark:bg-accent-lighter/10 rounded-xl">
                  <UserIcon size={24} className="text-accent-primary" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">Mein Account</h3>
                  <p className="text-sm text-gray-500 dark:text-dark-400">Persönliche Informationen und Einstellungen</p>
                </div>
              </div>

              <div className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="p-4 bg-gray-50 dark:bg-dark-50 rounded-lg border border-gray-200 dark:border-dark-200">
                    <p className="text-xs font-semibold text-gray-500 dark:text-dark-400 uppercase tracking-wider mb-1">Account-Typ</p>
                    <p className="text-lg font-bold text-gray-900 dark:text-white">
                      {currentUser?.accountType === 'personal' && '🚀 Freelancer'}
                      {currentUser?.accountType === 'freelancer' && '🚀 Freelancer'}
                      {currentUser?.accountType === 'business' && '🏢 Unternehmen'}
                      {currentUser?.accountType === 'team' && '👥 Team'}
                    </p>
                  </div>
                  {currentUser?.organizationName && (
                    <div className="p-4 bg-gray-50 dark:bg-dark-50 rounded-lg border border-gray-200 dark:border-dark-200">
                      <p className="text-xs font-semibold text-gray-500 dark:text-dark-400 uppercase tracking-wider mb-1">
                        {currentUser?.accountType === 'business' ? 'Firmenname' : 'Team-Name'}
                      </p>
                      <p className="text-lg font-bold text-gray-900 dark:text-white">{currentUser.organizationName}</p>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="p-4 bg-gray-50 dark:bg-dark-50 rounded-lg border border-gray-200 dark:border-dark-200">
                    <p className="text-xs font-semibold text-gray-500 dark:text-dark-400 uppercase tracking-wider mb-1">Benutzername</p>
                    <p className="text-lg font-bold text-gray-900 dark:text-white">{currentUser?.username}</p>
                  </div>
                  <div className="p-4 bg-gray-50 dark:bg-dark-50 rounded-lg border border-gray-200 dark:border-dark-200">
                    <p className="text-xs font-semibold text-gray-500 dark:text-dark-400 uppercase tracking-wider mb-1">E-Mail</p>
                    <p className="text-lg font-bold text-gray-900 dark:text-white">{currentUser?.email}</p>
                  </div>
                </div>

                {(currentUser?.customerNumber || currentUser?.displayName) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {currentUser?.customerNumber && (
                      <div className="p-4 bg-gray-50 dark:bg-dark-50 rounded-lg border border-gray-200 dark:border-dark-200">
                        <p className="text-xs font-semibold text-gray-500 dark:text-dark-400 uppercase tracking-wider mb-1">Kundennummer</p>
                        <p className="text-lg font-bold text-gray-900 dark:text-white">{currentUser.customerNumber}</p>
                      </div>
                    )}
                    {currentUser?.displayName && (
                      <div className="p-4 bg-gray-50 dark:bg-dark-50 rounded-lg border border-gray-200 dark:border-dark-200">
                        <p className="text-xs font-semibold text-gray-500 dark:text-dark-400 uppercase tracking-wider mb-1">Anzeigename</p>
                        <p className="text-lg font-bold text-gray-900 dark:text-white">{currentUser.displayName}</p>
                      </div>
                    )}
                  </div>
                )}

                <div className="p-4 bg-gradient-to-r from-accent-light to-accent-lighter/50 dark:from-accent-lighter/10 dark:to-accent-lighter/5 rounded-lg border border-accent-primary/20">
                  <p className="text-xs font-semibold text-accent-primary uppercase tracking-wider mb-1">Mitglied seit</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">
                    {currentUser?.createdAt && new Date(currentUser.createdAt).toLocaleDateString('de-DE', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric'
                    })}
                  </p>
                </div>

                {/* Action Buttons */}
                <div className="pt-5 border-t border-gray-200 dark:border-dark-200">
                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={handleOpenEditProfile}
                      className="flex items-center gap-2 px-5 py-2.5 bg-accent-primary hover:bg-accent-darker text-white rounded-lg font-medium transition-all shadow-sm hover:shadow-md"
                    >
                      <Edit2 size={18} />
                      Profil bearbeiten
                    </button>
                    <button
                      onClick={handleOpenChangePassword}
                      className="flex items-center gap-2 px-5 py-2.5 bg-gray-100 dark:bg-dark-200 hover:bg-gray-200 dark:hover:bg-dark-300 text-gray-900 dark:text-white rounded-lg font-medium transition-all shadow-sm hover:shadow-md"
                    >
                      <Key size={18} />
                      Passwort ändern
                    </button>
                  </div>
                </div>
              </div>
            </div>


            {/* GDPR / Data Protection */}
            <div className="bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-200 p-6 shadow-md">
                <div className="flex items-center gap-3 mb-5">
                  <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                    <Shield size={24} className="text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">Datenschutz (DSGVO)</h3>
                    <p className="text-sm text-gray-500 dark:text-dark-400">Deine Daten verwalten</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <button
                    onClick={() => {
                      
                      if (!currentUser) return;
                      const json = gdprService.exportUserDataAsJSON(currentUser.id);
                      gdprService.downloadDataAsFile(
                        json,
                        `timetrack-data-${currentUser.username}-${new Date().toISOString().split('T')[0]}.json`,
                        'application/json'
                      );
                    }}
                    className="w-full flex items-center justify-between px-4 py-3 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="text-2xl">📄</div>
                      <div className="text-left">
                        <div className="text-sm font-medium text-gray-900 dark:text-white">Daten exportieren (JSON)</div>
                        <div className="text-xs text-gray-600 dark:text-gray-400">Alle deine Daten herunterladen</div>
                      </div>
                    </div>
                    <ChevronRight size={18} className="text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300" />
                  </button>

                  <button
                    onClick={() => {
                      
                      if (!currentUser) return;
                      const csv = gdprService.exportUserDataAsCSV(currentUser.id);
                      gdprService.downloadDataAsFile(
                        csv,
                        `timetrack-data-${currentUser.username}-${new Date().toISOString().split('T')[0]}.csv`,
                        'text/csv'
                      );
                    }}
                    className="w-full flex items-center justify-between px-4 py-3 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="text-2xl">📊</div>
                      <div className="text-left">
                        <div className="text-sm font-medium text-gray-900 dark:text-white">Daten exportieren (CSV)</div>
                        <div className="text-xs text-gray-600 dark:text-gray-400">Excel-kompatibles Format</div>
                      </div>
                    </div>
                    <ChevronRight size={18} className="text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300" />
                  </button>

                  <button
                    onClick={() => {
                      if (!currentUser) return;
                      const confirmed = window.confirm(
                        '⚠️ WARNUNG: Diese Aktion kann nicht rückgängig gemacht werden!\n\n' +
                        'Alle deine Daten werden unwiderruflich gelöscht:\n' +
                        '- Dein Account\n' +
                        '- Alle Zeiterfassungen\n' +
                        '- Kunden & Projekte\n' +
                        '- Firmeninformationen\n\n' +
                        'Möchtest du wirklich fortfahren?'
                      );

                      if (confirmed) {
                        const doubleConfirm = window.confirm(
                          `Bitte bestätige nochmals:\n\nGib "${currentUser.username}" ein, um zu bestätigen.`
                        );

                        if (doubleConfirm) {
                          
                          const success = gdprService.deleteUserData(currentUser.id);

                          if (success) {
                            alert('✅ Dein Account und alle Daten wurden erfolgreich gelöscht.');
                            window.location.reload();
                          } else {
                            alert('❌ Fehler beim Löschen der Daten. Bitte kontaktiere den Support.');
                          }
                        }
                      }
                    }}
                    className="w-full flex items-center justify-between px-4 py-3 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="text-2xl">🗑️</div>
                      <div className="text-left">
                        <div className="text-sm font-medium text-red-600 dark:text-red-400">Account löschen</div>
                        <div className="text-xs text-red-500 dark:text-red-400">Recht auf Vergessen (DSGVO Art. 17)</div>
                      </div>
                    </div>
                    <ChevronRight size={18} className="text-red-400 group-hover:text-red-600" />
                  </button>
                </div>

                <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                  <p className="text-xs text-yellow-900 dark:text-yellow-200">
                    ℹ️ Alle Exporte enthalten <strong>keine Passwörter</strong> und werden gemäß DSGVO erstellt.
                  </p>
                </div>
            </div>

            {/* Logout Button */}
            <div className="bg-white dark:bg-dark-100 rounded-xl border border-red-200 dark:border-red-800 p-6 shadow-md">
              <button
                onClick={logout}
                className="w-full flex items-center justify-center gap-2 px-5 py-3.5 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 border-2 border-red-200 dark:border-red-800 rounded-xl transition-all text-red-600 dark:text-red-400 font-bold shadow-sm hover:shadow-md"
              >
                <LogOut size={20} />
                Abmelden
              </button>
            </div>
          </div>
        )}

        {/* Notifications Tab */}
        {activeTab === 'notifications' && (
          <div className="max-w-4xl mx-auto">
            <div className="bg-white dark:bg-dark-100 rounded-lg border border-gray-200 dark:border-dark-200 p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-6">
                <Bell size={24} className="text-accent-primary" />
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Benachrichtigungen</h2>
                  <p className="text-sm text-gray-500 dark:text-dark-400">Verwalte deine Benachrichtigungseinstellungen</p>
                </div>
              </div>

              <div className="space-y-6">
                {/* Browser Permission */}
                {!notificationService.hasPermission() && notificationService.isSupported() && (
                  <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-medium text-yellow-900 dark:text-yellow-200 mb-1">
                          Browser-Benachrichtigungen aktivieren
                        </p>
                        <p className="text-sm text-yellow-800 dark:text-yellow-300">
                          Erlaube Browser-Benachrichtigungen, um wichtige Erinnerungen zu erhalten.
                        </p>
                      </div>
                      <button
                        onClick={async () => {
                          const granted = await notificationService.requestPermission();
                          if (granted) {
                            window.location.reload(); // Reload to update UI
                          }
                        }}
                        className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
                      >
                        Aktivieren
                      </button>
                    </div>
                  </div>
                )}

                {/* Notification Settings */}
                <div className="space-y-4">
                  <h3 className="font-medium text-gray-900 dark:text-white">Browser-Benachrichtigungen</h3>

                  <div className="space-y-3">
                    <label className="flex items-start justify-between p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-900 transition-colors">
                      <div className="flex-1">
                        <div className="font-medium text-gray-900 dark:text-white mb-1">Monatserinnerung</div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          Benachrichtigung 3 Tage vor Monatsende zur Prüfung deiner Zeiteinträge
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={localStorage.getItem('notification_month_end') !== 'false'}
                        onChange={(e) => {
                          localStorage.setItem('notification_month_end', e.target.checked ? 'true' : 'false');
                        }}
                        className="mt-1 ml-4 w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                        disabled={!notificationService.hasPermission()}
                      />
                    </label>

                    <label className="flex items-start justify-between p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-900 transition-colors">
                      <div className="flex-1">
                        <div className="font-medium text-gray-900 dark:text-white mb-1">Fehlende Einträge</div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          Tägliche Erinnerung um 18:00 Uhr, wenn noch keine Stunden eingetragen wurden
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={localStorage.getItem('notification_missing_entries') !== 'false'}
                        onChange={(e) => {
                          localStorage.setItem('notification_missing_entries', e.target.checked ? 'true' : 'false');
                        }}
                        className="mt-1 ml-4 w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                        disabled={!notificationService.hasPermission()}
                      />
                    </label>

                    <label className="flex items-start justify-between p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-900 transition-colors">
                      <div className="flex-1">
                        <div className="font-medium text-gray-900 dark:text-white mb-1">Qualitätsprüfung</div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          Warnung bei Zeiteinträgen ohne Beschreibung oder Projekt
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={localStorage.getItem('notification_quality_check') !== 'false'}
                        onChange={(e) => {
                          localStorage.setItem('notification_quality_check', e.target.checked ? 'true' : 'false');
                        }}
                        className="mt-1 ml-4 w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                        disabled={!notificationService.hasPermission()}
                      />
                    </label>

                    <label className="flex items-start justify-between p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-900 transition-colors">
                      <div className="flex-1">
                        <div className="font-medium text-gray-900 dark:text-white mb-1">Wochenreport</div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          Jeden Freitag um 16:00 Uhr eine Zusammenfassung deiner Arbeitswoche
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={localStorage.getItem('notification_weekly_report') !== 'false'}
                        onChange={(e) => {
                          localStorage.setItem('notification_weekly_report', e.target.checked ? 'true' : 'false');
                        }}
                        className="mt-1 ml-4 w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                        disabled={!notificationService.hasPermission()}
                      />
                    </label>
                  </div>
                </div>

                {/* Push Notifications for Tickets */}
                <div className="space-y-4 pt-6 border-t border-gray-200 dark:border-gray-700">
                  <h3 className="font-medium text-gray-900 dark:text-white">Push-Benachrichtigungen (Tickets)</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    Erhalte sofortige Benachrichtigungen auf deinem Gerät, wenn Kunden Tickets erstellen oder kommentieren.
                  </p>
                  <PushNotificationSettings />
                </div>

                {/* Email Notifications (Coming Soon) */}
                <div className="space-y-4 pt-6 border-t border-gray-200 dark:border-gray-700">
                  <h3 className="font-medium text-gray-900 dark:text-white">E-Mail-Benachrichtigungen</h3>
                  <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                    <p className="text-sm text-blue-900 dark:text-blue-200">
                      📧 E-Mail-Benachrichtigungen werden in Kürze verfügbar sein!
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Customers Tab */}
        {activeTab === 'customers' && (
          <div className="max-w-4xl mx-auto">
            <div>
                <div className="flex justify-between items-center mb-6">
                  <p className="text-gray-600 dark:text-dark-400">{customers.length} Kunde(n)</p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleImportClick}
                      className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                      title="CSV importieren"
                    >
                      <FileDown size={20} />
                      Importieren
                    </button>
                    <button
                      onClick={() => openCustomerModal()}
                      className="flex items-center gap-2 px-4 py-2 btn-accent"
                    >
                      <Plus size={20} />
                      Kunde hinzufügen
                    </button>
                  </div>
                </div>

                {/* Hidden file input for CSV import */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileImport}
                  className="hidden"
                />

                {/* Import result notification */}
                {importResult && (
                  <div className={`mb-4 p-4 rounded-lg ${
                    importResult.failed === 0 ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' :
                    importResult.success === 0 ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800' :
                    'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800'
                  }`}>
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className={`font-semibold ${
                          importResult.failed === 0 ? 'text-green-800 dark:text-green-200' :
                          importResult.success === 0 ? 'text-red-800 dark:text-red-200' :
                          'text-yellow-800 dark:text-yellow-200'
                        }`}>
                          Import abgeschlossen
                        </p>
                        <p className="text-sm mt-1 text-gray-700 dark:text-gray-300">
                          {importResult.success} erfolgreich, {importResult.failed} fehlgeschlagen
                        </p>
                      </div>
                      <button
                        onClick={() => setImportResult(null)}
                        className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                      >
                        <X size={18} />
                      </button>
                    </div>
                    {importResult.errors.length > 0 && (
                      <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                        <p className="font-medium mb-1">Fehler:</p>
                        <ul className="list-disc list-inside space-y-1">
                          {importResult.errors.slice(0, 5).map((error, idx) => (
                            <li key={idx}>{error}</li>
                          ))}
                          {importResult.errors.length > 5 && (
                            <li>... und {importResult.errors.length - 5} weitere</li>
                          )}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {customers.length === 0 ? (
                  <div className="text-center py-12 text-gray-500 dark:text-dark-400">
                    <Users size={48} className="mx-auto mb-4 opacity-50" />
                    <p>Noch keine Kunden vorhanden</p>
                    <p className="text-sm mt-2">Füge deinen ersten Kunden hinzu</p>
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2">
                    {customers.map(customer => (
                      <div
                        key={customer.id}
                        className="bg-white dark:bg-dark-100 rounded-lg border border-gray-200 dark:border-dark-200 p-4 hover:shadow-md transition-shadow"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3 flex-1">
                            <div
                              className="w-10 h-10 rounded-lg flex-shrink-0"
                              style={{ backgroundColor: customer.color }}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <h3 className="font-semibold text-gray-900 dark:text-white truncate">{customer.name}</h3>
                                {customer.customerNumber && (
                                  <span className="text-xs bg-gray-100 dark:bg-dark-50 text-gray-600 dark:text-dark-300 px-2 py-0.5 rounded-full whitespace-nowrap">
                                    #{customer.customerNumber}
                                  </span>
                                )}
                              </div>
                              {customer.reportTitle && (
                                <p className="text-sm text-gray-600 dark:text-dark-300 mt-0.5 truncate">
                                  {customer.reportTitle}
                                </p>
                              )}
                              <div className="mt-1 space-y-0.5">
                                {customer.contactPerson && (
                                  <p className="text-xs text-gray-500 dark:text-dark-400 truncate">
                                    👤 {customer.contactPerson}
                                  </p>
                                )}
                                {customer.email && (
                                  <p className="text-xs text-gray-500 dark:text-dark-400 truncate">
                                    ✉️ {customer.email}
                                  </p>
                                )}
                              </div>
                              <p className="text-sm text-gray-500 dark:text-dark-400 mt-1">
                                {projects.filter(p => p.customerId === customer.id).length} Projekt(e)
                              </p>
                            </div>
                          </div>
                          <div className="flex gap-2 ml-2">
                            {currentUser?.hasTicketAccess && (
                              <button
                                onClick={() => setContactsCustomer(customer)}
                                className="p-2 text-gray-600 dark:text-dark-300 hover:bg-gray-100 dark:hover:bg-dark-50 rounded-lg transition-colors"
                                title="Kontakte verwalten"
                              >
                                <UserCog size={18} />
                              </button>
                            )}
                            <button
                              onClick={() => openCustomerModal(customer)}
                              className="p-2 text-gray-600 dark:text-dark-300 hover:bg-gray-100 dark:hover:bg-dark-50 rounded-lg transition-colors"
                              title="Bearbeiten"
                            >
                              <Edit2 size={18} />
                            </button>
                            <button
                              onClick={() => handleDeleteCustomer(customer)}
                              className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                              title="Löschen"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
            </div>
          </div>
        )}

        {/* Projects Tab */}
        {activeTab === 'projects' && (
          <div className="max-w-4xl mx-auto">
            <div>
                <div className="flex justify-between items-center mb-6">
                  <p className="text-gray-600 dark:text-dark-400">{projects.length} Projekt(e)</p>
                  <button
                    onClick={() => openProjectModal()}
                    disabled={customers.length === 0}
                    className="flex items-center gap-2 px-4 py-2 btn-accent disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Plus size={20} />
                    Projekt hinzufügen
                  </button>
                </div>

                {customers.length === 0 ? (
                  <div className="text-center py-12 text-gray-500 dark:text-dark-400">
                    <Users size={48} className="mx-auto mb-4 opacity-50" />
                <p>Bitte füge zuerst einen Kunden hinzu</p>
              </div>
            ) : projects.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <FolderOpen size={48} className="mx-auto mb-4 opacity-50" />
                <p>Noch keine Projekte vorhanden</p>
                <p className="text-sm mt-2">Füge dein erstes Projekt hinzu</p>
              </div>
            ) : (
              <div className="space-y-4">
                {projects.map(project => {
                  const customer = getCustomerById(project.customerId);
                  return (
                    <div
                      key={project.id}
                      className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3 flex-1">
                          {customer && (
                            <div
                              className="w-10 h-10 rounded-lg flex-shrink-0"
                              style={{ backgroundColor: customer.color }}
                            />
                          )}
                          <div className="min-w-0 flex-1">
                            <h3 className="font-semibold text-gray-900">{project.name}</h3>
                            <p className="text-sm text-gray-500">{customer?.name}</p>
                            <p className="text-sm font-medium text-blue-600 mt-1">
                              {(project.hourlyRate || 0).toFixed(2)} € / Stunde
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => openProjectModal(project)}
                            className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                          >
                            <Edit2 size={18} />
                          </button>
                          <button
                            onClick={() => handleDeleteProject(project)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            </div>
          </div>
        )}

        {/* Activities Tab */}
        {activeTab === 'activities' && (
          <div className="max-w-4xl mx-auto">
            <div>
                <div className="flex justify-between items-center mb-6">
                  <p className="text-gray-600 dark:text-dark-400">{activities.length} Tätigkeit(en)</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setTemplateModalOpen(true)}
                      className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                      title="Aus Vorlage wählen"
                    >
                      <ListChecks size={20} />
                      Aus Vorlage
                    </button>
                    <button
                      onClick={() => openActivityModal()}
                      className="flex items-center gap-2 px-4 py-2 btn-accent"
                    >
                      <Plus size={20} />
                      Neu erstellen
                    </button>
                  </div>
                </div>

                {activities.length === 0 ? (
                  <div className="text-center py-12 text-gray-500 dark:text-dark-400">
                    <ListChecks size={48} className="mx-auto mb-4 opacity-50" />
                    <p>Noch keine Tätigkeiten vorhanden</p>
                    <p className="text-sm mt-2">Füge vorgefertigte Tätigkeiten hinzu (z.B. "Meeting", "Entwicklung", "Beratung")</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {activities.map(activity => (
                      <div
                        key={activity.id}
                        className="bg-white dark:bg-dark-100 rounded-lg border border-gray-200 dark:border-dark-200 p-4 hover:shadow-md transition-shadow"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h3 className="font-semibold text-gray-900 dark:text-white">{activity.name}</h3>
                            {activity.description && (
                              <p className="text-sm text-gray-500 dark:text-dark-400 mt-1">{activity.description}</p>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => openActivityModal(activity)}
                              className="p-2 text-gray-600 dark:text-dark-300 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                              title="Bearbeiten"
                            >
                              <Edit2 size={18} />
                            </button>
                            <button
                              onClick={() => handleDeleteActivity(activity)}
                              className="p-2 text-gray-600 dark:text-dark-300 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                              title="Löschen"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
            </div>
          </div>
        )}

        {activeTab === 'company' && (
          <div className="max-w-6xl mx-auto space-y-6">
            {/* Header */}
            <div className="bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-200 p-6 shadow-md">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-accent-light dark:bg-accent-lighter/10 rounded-xl">
                  <Building size={28} className="text-accent-primary" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Firma & Branding</h2>
                  <p className="text-sm text-gray-500 dark:text-dark-400">
                    Diese Informationen erscheinen in deinen PDF-Reports und Dokumenten
                  </p>
                </div>
              </div>
            </div>

            {/* Two Column Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left Column - Branding */}
              <div className="space-y-6">
                {/* Logo Upload Card */}
                <div className="bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-200 p-6 shadow-md">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <Upload size={20} className="text-accent-primary" />
                    Firmenlogo
                  </h3>

                  {companyLogo ? (
                    <div className="space-y-4">
                      <div className="relative inline-block">
                        <img
                          src={companyLogo}
                          alt="Company Logo"
                          className="h-32 w-auto object-contain border-2 border-gray-200 dark:border-dark-200 rounded-xl p-4 bg-gray-50 dark:bg-dark-50"
                        />
                        <button
                          onClick={handleRemoveLogo}
                          className="absolute -top-2 -right-2 p-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition-all shadow-md hover:shadow-lg"
                          title="Logo entfernen"
                        >
                          <X size={18} />
                        </button>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        💡 Das Logo wird automatisch skaliert (max. 30mm × 20mm) ohne Verzerrung
                      </p>
                    </div>
                  ) : (
                    <div>
                      <label
                        htmlFor="logo-upload"
                        className="flex flex-col items-center gap-3 px-6 py-8 border-3 border-dashed border-gray-300 dark:border-dark-200 rounded-xl cursor-pointer hover:border-accent-primary hover:bg-accent-light/30 dark:hover:bg-accent-lighter/5 transition-all"
                      >
                        <div className="p-4 bg-gray-100 dark:bg-dark-50 rounded-full">
                          <Upload size={28} className="text-gray-500" />
                        </div>
                        <div className="text-center">
                          <span className="text-base font-semibold text-gray-900 dark:text-white block mb-1">
                            Logo hochladen
                          </span>
                          <span className="text-sm text-gray-500 dark:text-gray-400">
                            PNG, JPG oder SVG • Max. 2MB
                          </span>
                        </div>
                      </label>
                      <input
                        id="logo-upload"
                        type="file"
                        accept="image/*"
                        onChange={handleLogoUpload}
                        className="hidden"
                      />
                    </div>
                  )}
                </div>

                {/* Company Name */}
                <div className="bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-200 p-6 shadow-md">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Grundinformationen</h3>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      Firmenname <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={companyName || ''}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="z.B. Musterfirma GmbH"
                      className="w-full px-4 py-3 border-2 border-gray-300 dark:border-dark-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-transparent bg-white dark:bg-dark-50 text-gray-900 dark:text-white transition-all"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                      Dieser Name erscheint auf allen PDF-Dokumenten
                    </p>
                  </div>
                </div>
              </div>

              {/* Right Column - Address & Contact */}
              <div className="space-y-6">
                {/* Address Card */}
                <div className="bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-200 p-6 shadow-md">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Adresse</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        Straße & Hausnummer <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={companyAddress || ''}
                        onChange={(e) => setCompanyAddress(e.target.value)}
                        placeholder="z.B. Musterstraße 123"
                        className="w-full px-4 py-3 border-2 border-gray-300 dark:border-dark-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-transparent bg-white dark:bg-dark-50 text-gray-900 dark:text-white transition-all"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                          PLZ <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={companyZipCode || ''}
                          onChange={(e) => setCompanyZipCode(e.target.value)}
                          placeholder="12345"
                          className="w-full px-4 py-3 border-2 border-gray-300 dark:border-dark-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-transparent bg-white dark:bg-dark-50 text-gray-900 dark:text-white transition-all"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                          Stadt <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={companyCity || ''}
                          onChange={(e) => setCompanyCity(e.target.value)}
                          placeholder="Berlin"
                          className="w-full px-4 py-3 border-2 border-gray-300 dark:border-dark-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-transparent bg-white dark:bg-dark-50 text-gray-900 dark:text-white transition-all"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        Land <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={companyCountry || ''}
                        onChange={(e) => setCompanyCountry(e.target.value)}
                        placeholder="Deutschland"
                        className="w-full px-4 py-3 border-2 border-gray-300 dark:border-dark-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-transparent bg-white dark:bg-dark-50 text-gray-900 dark:text-white transition-all"
                      />
                    </div>
                  </div>
                </div>

                {/* Contact Card */}
                <div className="bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-200 p-6 shadow-md">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Kontaktdaten</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        E-Mail <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="email"
                        value={companyEmail || ''}
                        onChange={(e) => setCompanyEmail(e.target.value)}
                        placeholder="kontakt@musterfirma.de"
                        className="w-full px-4 py-3 border-2 border-gray-300 dark:border-dark-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-transparent bg-white dark:bg-dark-50 text-gray-900 dark:text-white transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        Telefon
                      </label>
                      <input
                        type="tel"
                        value={companyPhone || ''}
                        onChange={(e) => setCompanyPhone(e.target.value)}
                        placeholder="+49 30 12345678"
                        className="w-full px-4 py-3 border-2 border-gray-300 dark:border-dark-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-transparent bg-white dark:bg-dark-50 text-gray-900 dark:text-white transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        Website
                      </label>
                      <input
                        type="url"
                        value={companyWebsite || ''}
                        onChange={(e) => setCompanyWebsite(e.target.value)}
                        placeholder="https://musterfirma.de"
                        className="w-full px-4 py-3 border-2 border-gray-300 dark:border-dark-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-transparent bg-white dark:bg-dark-50 text-gray-900 dark:text-white transition-all"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Tax ID & Customer Number - Full Width */}
            <div className="bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-200 p-6 shadow-md">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Steuer- & Buchhaltungsinformationen</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Kundennummer
                  </label>
                  <input
                    type="text"
                    value={companyCustomerNumber || ''}
                    onChange={(e) => setCompanyCustomerNumber(e.target.value)}
                    placeholder="z.B. K-12345"
                    className="w-full px-4 py-3 border-2 border-gray-300 dark:border-dark-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-transparent bg-white dark:bg-dark-50 text-gray-900 dark:text-white transition-all"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    Optional: Deine Kundennummer (z.B. bei sevDesk)
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Steuernummer / USt-IdNr.
                  </label>
                  <input
                    type="text"
                    value={companyTaxId || ''}
                    onChange={(e) => setCompanyTaxId(e.target.value)}
                    placeholder="z.B. DE123456789"
                    className="w-full px-4 py-3 border-2 border-gray-300 dark:border-dark-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-transparent bg-white dark:bg-dark-50 text-gray-900 dark:text-white transition-all"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    Optional: Für Rechnungen und offizielle Dokumente
                  </p>
                </div>
              </div>
            </div>

            {/* Save Button */}
            <div className="bg-gradient-to-r from-accent-light to-accent-lighter/50 dark:from-accent-lighter/10 dark:to-accent-lighter/5 rounded-xl border border-accent-primary/30 p-6 shadow-md">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
                    Änderungen speichern
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    <span className="text-red-500">*</span> Pflichtfelder müssen ausgefüllt sein
                  </p>
                </div>
                <button
                  onClick={handleSaveCompanyInfo}
                  disabled={
                    !String(companyName || '').trim() ||
                    !String(companyAddress || '').trim() ||
                    !String(companyCity || '').trim() ||
                    !String(companyZipCode || '').trim() ||
                    !String(companyCountry || '').trim() ||
                    !String(companyEmail || '').trim()
                  }
                  className="flex items-center gap-2 px-6 py-3 bg-accent-primary hover:bg-accent-darker text-white rounded-lg font-bold transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-md"
                >
                  <Save size={20} />
                  Firmendaten speichern
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'team' && (
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Team Members */}
            <div className="bg-white dark:bg-dark-100 rounded-lg border border-gray-200 dark:border-dark-200 p-6">
              <div className="flex items-center gap-3 mb-6">
                <Users2 size={24} className="text-accent-primary" />
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Team-Mitglieder</h2>
                  <p className="text-sm text-gray-500 dark:text-dark-400">
                    {teamMembers.length} Mitglied(er) im Team
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {teamMembers.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 dark:text-dark-400">
                    <Users2 size={48} className="mx-auto mb-4 opacity-50" />
                    <p>Keine Team-Mitglieder</p>
                  </div>
                ) : (
                  teamMembers.map(member => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between p-4 bg-gray-50 dark:bg-dark-50 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-accent-primary flex items-center justify-center text-white font-semibold">
                          {member.username.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900 dark:text-white">{member.username}</span>
                            {member.id === currentUser?.id && (
                              <span className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded">Du</span>
                            )}
                          </div>
                          <p className="text-sm text-gray-500 dark:text-dark-400">{member.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${
                          member.teamRole === 'owner'
                            ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400'
                            : member.teamRole === 'admin'
                            ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                            : 'bg-gray-100 dark:bg-dark-200 text-gray-600 dark:text-dark-400'
                        }`}>
                          <Shield size={12} />
                          {member.teamRole === 'owner' ? 'Owner' : member.teamRole === 'admin' ? 'Admin' : 'Mitglied'}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Team Invitations (only for owners/admins) */}
            {(currentUser?.teamRole === 'owner' || currentUser?.teamRole === 'admin') && (
              <div className="bg-white dark:bg-dark-100 rounded-lg border border-gray-200 dark:border-dark-200 p-6">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <UserPlus size={24} className="text-accent-primary" />
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Team-Einladungen</h2>
                      <p className="text-sm text-gray-500 dark:text-dark-400">
                        Lade neue Mitglieder zu deinem Team ein
                      </p>
                    </div>
                  </div>
                </div>

                {/* Create New Invitation */}
                <div className="mb-6 p-4 bg-gray-50 dark:bg-dark-50 rounded-lg">
                  <h3 className="font-medium text-gray-900 dark:text-white mb-3">Neue Einladung erstellen</h3>
                  <div className="flex gap-3">
                    <select
                      value={newInvitationRole}
                      onChange={(e) => setNewInvitationRole(e.target.value as 'admin' | 'member')}
                      className="px-4 py-2 border border-gray-300 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary"
                    >
                      <option value="member">Mitglied</option>
                      <option value="admin">Admin</option>
                    </select>
                    <button
                      onClick={handleCreateInvitation}
                      className="flex items-center gap-2 px-4 py-2 btn-accent"
                    >
                      <Plus size={18} />
                      Einladung erstellen
                    </button>
                  </div>
                </div>

                {/* Active Invitations */}
                <div className="space-y-3">
                  <h3 className="font-medium text-gray-900 dark:text-white text-sm">
                    Aktive Einladungen ({teamInvitations.length})
                  </h3>
                  {teamInvitations.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-dark-400 text-center py-4">
                      Keine aktiven Einladungen
                    </p>
                  ) : (
                    teamInvitations.map(invitation => (
                      <div
                        key={invitation.id}
                        className="flex items-center justify-between p-4 bg-gray-50 dark:bg-dark-50 rounded-lg"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <code className="px-3 py-1 bg-white dark:bg-dark-100 border border-gray-300 dark:border-dark-200 rounded font-mono text-sm font-semibold text-gray-900 dark:text-white">
                              {invitation.invitationCode}
                            </code>
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                              invitation.role === 'admin'
                                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                                : 'bg-gray-100 dark:bg-dark-200 text-gray-600 dark:text-dark-400'
                            }`}>
                              {invitation.role === 'admin' ? 'Admin' : 'Mitglied'}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 dark:text-dark-400">
                            Gültig bis {new Date(invitation.expiresAt).toLocaleDateString('de-DE')}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleCopyInvitationCode(invitation.invitationCode)}
                            className="p-2 text-accent-primary hover:bg-accent-light dark:hover:bg-accent-lighter/10 rounded-lg transition-colors"
                            title="Code kopieren"
                          >
                            <Copy size={18} />
                          </button>
                          <button
                            onClick={() => handleDeleteInvitation(invitation.id)}
                            className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                            title="Einladung löschen"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'tickets' && (
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Header */}
            <div className="bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-200 p-6 shadow-md">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-accent-light dark:bg-accent-lighter/10 rounded-xl">
                  <Ticket size={28} className="text-accent-primary" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Ticket-System</h2>
                  <p className="text-sm text-gray-500 dark:text-dark-400">
                    Verwalte Tags und Textbausteine für dein Ticket-System
                  </p>
                </div>
              </div>
            </div>

            {/* Ticket Settings Component */}
            <div className="bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-200 p-6 shadow-md">
              <TicketSettings />
            </div>
          </div>
        )}

        {activeTab === 'portal' && (
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Header */}
            <div className="bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-200 p-6 shadow-md">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-accent-light dark:bg-accent-lighter/10 rounded-xl">
                  <Book size={28} className="text-accent-primary" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Kundenportal</h2>
                  <p className="text-sm text-gray-500 dark:text-dark-400">
                    Wissensdatenbank und Portal-Branding verwalten
                  </p>
                </div>
              </div>
            </div>

            {/* Knowledge Base Settings Component */}
            <div className="bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-200 p-6 shadow-md">
              <KnowledgeBaseSettings />
            </div>
          </div>
        )}

        {activeTab === 'billing' && billingEnabled && (
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Header */}
            <div className="bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-200 p-6 shadow-md">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-accent-light dark:bg-accent-lighter/10 rounded-xl">
                  <CreditCard size={28} className="text-accent-primary" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Abrechnung</h2>
                  <p className="text-sm text-gray-500 dark:text-dark-400">
                    sevDesk-Integration und Rechnungseinstellungen
                  </p>
                </div>
              </div>
            </div>

            {/* sevDesk Settings Component */}
            <div className="bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-200 p-6 shadow-md">
              <SevdeskSettings />
            </div>
          </div>
        )}

        {activeTab === 'appearance' && (
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Account Info */}
            <div className="bg-white dark:bg-dark-100 rounded-lg border border-gray-200 dark:border-dark-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Account</h2>

              <div className="space-y-3">
                <div>
                  <p className="text-sm text-gray-500 dark:text-dark-400">Account-Typ</p>
                  <p className="font-medium text-gray-900 dark:text-white capitalize">
                    {currentUser?.accountType === 'personal' && '🚀 Freelancer'}
                    {currentUser?.accountType === 'freelancer' && '🚀 Freelancer'}
                    {currentUser?.accountType === 'business' && '🏢 Unternehmen'}
                    {currentUser?.accountType === 'team' && '👥 Team'}
                  </p>
                </div>
                {currentUser?.organizationName && (
                  <div>
                    <p className="text-sm text-gray-500 dark:text-dark-400">
                      {currentUser?.accountType === 'business' ? 'Firmenname' : 'Team-Name'}
                    </p>
                    <p className="font-medium text-gray-900 dark:text-white">{currentUser?.organizationName}</p>
                  </div>
                )}
                <div>
                  <p className="text-sm text-gray-500 dark:text-dark-400">Benutzername</p>
                  <p className="font-medium text-gray-900 dark:text-white">{currentUser?.username}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-dark-400">E-Mail</p>
                  <p className="font-medium text-gray-900 dark:text-white">{currentUser?.email}</p>
                </div>
                {currentUser?.customerNumber && (
                  <div>
                    <p className="text-sm text-gray-500 dark:text-dark-400">Kundennummer</p>
                    <p className="font-medium text-gray-900 dark:text-white">{currentUser.customerNumber}</p>
                  </div>
                )}
                {currentUser?.displayName && (
                  <div>
                    <p className="text-sm text-gray-500 dark:text-dark-400">Anzeigename</p>
                    <p className="font-medium text-gray-900 dark:text-white">{currentUser.displayName}</p>
                  </div>
                )}
                <div>
                  <p className="text-sm text-gray-500 dark:text-dark-400">Mitglied seit</p>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {currentUser?.createdAt && new Date(currentUser.createdAt).toLocaleDateString('de-DE')}
                  </p>
                </div>
              </div>

              <div className="mt-6 pt-6 border-t border-gray-200 dark:border-dark-200">
                <button
                  onClick={logout}
                  className="flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors font-medium"
                >
                  <LogOut size={18} />
                  Abmelden
                </button>
              </div>
            </div>

            {/* Time Format Settings */}
            <div className="bg-white dark:bg-dark-100 rounded-lg border border-gray-200 dark:border-dark-200 p-6 mb-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Zeitformat</h2>
              <div className="space-y-3">
                <button
                  onClick={() => updateTimeFormat('24h')}
                  className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                    (currentUser?.timeFormat || '24h') === '24h'
                      ? 'border-accent-primary bg-accent-light dark:bg-accent-lighter/10 shadow-sm'
                      : 'border-gray-200 dark:border-dark-200 hover:border-gray-300 dark:hover:border-dark-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h3 className="font-medium text-gray-900 dark:text-white">24-Stunden-Format</h3>
                      <p className="text-sm text-gray-500 dark:text-dark-400 mt-1">
                        Beispiel: 14:30, 23:45
                      </p>
                    </div>
                    {(currentUser?.timeFormat || '24h') === '24h' && (
                      <div className="w-6 h-6 rounded-full bg-accent-primary flex items-center justify-center flex-shrink-0 ml-3">
                        <span className="text-white text-sm font-bold">✓</span>
                      </div>
                    )}
                  </div>
                </button>
                <button
                  onClick={() => updateTimeFormat('12h')}
                  className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                    currentUser?.timeFormat === '12h'
                      ? 'border-accent-primary bg-accent-light dark:bg-accent-lighter/10 shadow-sm'
                      : 'border-gray-200 dark:border-dark-200 hover:border-gray-300 dark:hover:border-dark-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h3 className="font-medium text-gray-900 dark:text-white">12-Stunden-Format (AM/PM)</h3>
                      <p className="text-sm text-gray-500 dark:text-dark-400 mt-1">
                        Beispiel: 2:30 PM, 11:45 PM
                      </p>
                    </div>
                    {currentUser?.timeFormat === '12h' && (
                      <div className="w-6 h-6 rounded-full bg-accent-primary flex items-center justify-center flex-shrink-0 ml-3">
                        <span className="text-white text-sm font-bold">✓</span>
                      </div>
                    )}
                  </div>
                </button>
              </div>
            </div>

            {/* Appearance Settings */}
            <div className="bg-white dark:bg-dark-100 rounded-lg border border-gray-200 dark:border-dark-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Design & Aussehen</h2>

              <div className="space-y-6">
                {/* Dark Mode Toggle */}
                <div className="flex items-center justify-between py-3">
                  <div>
                    <h3 className="font-medium text-gray-900 dark:text-white">Dark Mode</h3>
                    <p className="text-sm text-gray-500 dark:text-dark-400 mt-1">
                      Dunkles Farbschema mit tiefen Grautönen
                    </p>
                  </div>
                  <button
                    onClick={onToggleDarkMode}
                    className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-accent-${currentUser?.accentColor || 'blue'}-500 focus:ring-offset-2 ${
                      darkMode ? `bg-accent-${currentUser?.accentColor || 'blue'}-600` : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                        darkMode ? 'translate-x-7' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                {/* Accent Color Selection */}
                <div className="pt-3 border-t border-gray-200 dark:border-dark-200">
                  <h3 className="font-medium text-gray-900 dark:text-white mb-2">Akzentfarbe</h3>
                  <p className="text-sm text-gray-500 dark:text-dark-400 mb-4">
                    Wähle deine bevorzugte Akzentfarbe für Buttons und Highlights
                  </p>
                  <div className="grid grid-cols-6 gap-3">
                    {[
                      { name: 'blue', label: 'Blau', class: 'bg-accent-blue-600' },
                      { name: 'green', label: 'Grün', class: 'bg-accent-green-600' },
                      { name: 'orange', label: 'Orange', class: 'bg-accent-orange-600' },
                      { name: 'purple', label: 'Lila', class: 'bg-accent-purple-600' },
                      { name: 'red', label: 'Rot', class: 'bg-accent-red-600' },
                      { name: 'pink', label: 'Pink', class: 'bg-accent-pink-600' },
                    ].map((color) => (
                      <button
                        key={color.name}
                        onClick={() => updateAccentColor(color.name as any)}
                        className={`relative flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all hover:scale-105 ${
                          currentUser?.accentColor === color.name
                            ? `border-accent-${color.name}-600 bg-accent-${color.name}-50 dark:bg-accent-${color.name}-900/20`
                            : 'border-gray-300 dark:border-dark-200 hover:border-gray-400'
                        }`}
                        title={color.label}
                      >
                        <div className={`w-8 h-8 rounded-full ${color.class}`} />
                        <span className={`text-xs font-medium ${
                          currentUser?.accentColor === color.name
                            ? `text-accent-${color.name}-600`
                            : 'text-gray-600 dark:text-dark-400'
                        }`}>
                          {color.label}
                        </span>
                        {currentUser?.accentColor === color.name && (
                          <div className="absolute -top-1 -right-1 w-5 h-5 bg-white dark:bg-dark-100 rounded-full flex items-center justify-center">
                            <div className={`w-3 h-3 bg-accent-${color.name}-600 rounded-full`} />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Gray Tone Selection */}
                <div className="pt-3 border-t border-gray-200 dark:border-dark-200">
                  <h3 className="font-medium text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                    <Contrast size={18} />
                    Grauton-Intensität
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-dark-400 mb-4">
                    Wähle die Dunkelheit des Dark Modes (nur im Dark Mode sichtbar)
                  </p>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { name: 'light' as GrayTone, label: 'Hell', desc: 'Weiche Grautöne' },
                      { name: 'medium' as GrayTone, label: 'Mittel', desc: 'Ausgewogen' },
                      { name: 'dark' as GrayTone, label: 'Dunkel', desc: 'Tiefe Schwarztöne' },
                    ].map((tone) => (
                      <button
                        key={tone.name}
                        onClick={() => updateGrayTone(tone.name)}
                        className={`relative flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all hover:scale-105 ${
                          currentUser?.grayTone === tone.name
                            ? `border-accent-${currentUser?.accentColor || 'blue'}-600 bg-accent-${currentUser?.accentColor || 'blue'}-50 dark:bg-accent-${currentUser?.accentColor || 'blue'}-900/20`
                            : 'border-gray-300 dark:border-dark-200 hover:border-gray-400'
                        }`}
                        title={tone.desc}
                      >
                        <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                          tone.name === 'light' ? 'bg-gray-700' :
                          tone.name === 'medium' ? 'bg-gray-800' :
                          'bg-gray-950'
                        }`}>
                          <div className={`w-6 h-6 rounded ${
                            tone.name === 'light' ? 'bg-gray-500' :
                            tone.name === 'medium' ? 'bg-gray-600' :
                            'bg-gray-800'
                          }`} />
                        </div>
                        <div className="text-center">
                          <span className={`text-sm font-medium block ${
                            currentUser?.grayTone === tone.name
                              ? `text-accent-${currentUser?.accentColor || 'blue'}-600`
                              : 'text-gray-900 dark:text-white'
                          }`}>
                            {tone.label}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-dark-400">
                            {tone.desc}
                          </span>
                        </div>
                        {currentUser?.grayTone === tone.name && (
                          <div className="absolute -top-1 -right-1 w-5 h-5 bg-white dark:bg-dark-100 rounded-full flex items-center justify-center">
                            <div className={`w-3 h-3 bg-accent-${currentUser?.accentColor || 'blue'}-600 rounded-full`} />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        </div>
      </div>

      {/* Customer Modal */}
      <Modal
        isOpen={customerModalOpen}
        onClose={() => setCustomerModalOpen(false)}
        title={editingCustomer ? 'Kunde bearbeiten' : 'Neuer Kunde'}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Kundenname *
            </label>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="z.B. Musterfirma GmbH"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Kundennummer (für sevDesk)
            </label>
            <input
              type="text"
              value={customerNumber}
              onChange={(e) => setCustomerNumber(e.target.value)}
              placeholder="z.B. K-12345"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Ansprechpartner
            </label>
            <input
              type="text"
              value={customerContactPerson}
              onChange={(e) => setCustomerContactPerson(e.target.value)}
              placeholder="z.B. Max Mustermann"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              E-Mail
            </label>
            <input
              type="email"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
              placeholder="z.B. kontakt@musterfirma.de"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Adresse
            </label>
            <textarea
              value={customerAddress}
              onChange={(e) => setCustomerAddress(e.target.value)}
              placeholder="Musterstraße 123&#10;12345 Musterstadt"
              rows={2}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Report-Titel (für PDF)
            </label>
            <input
              type="text"
              value={customerReportTitle}
              onChange={(e) => setCustomerReportTitle(e.target.value)}
              placeholder="z.B. Stundenzettel, Tätigkeitsnachweis, Arbeitszeitnachweis"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              Optional: Individueller Titel für PDF-Reports dieses Kunden (Standard: "Stundenbericht")
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Farbe
            </label>
            <div className="grid grid-cols-5 gap-2">
              {COLORS.map(color => (
                <button
                  key={color}
                  onClick={() => setCustomerColor(color)}
                  className={`w-full h-12 rounded-lg transition-transform ${
                    customerColor === color ? 'ring-2 ring-gray-900 ring-offset-2 scale-110' : ''
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              onClick={() => setCustomerModalOpen(false)}
              className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors"
            >
              Abbrechen
            </button>
            <button
              onClick={handleSaveCustomer}
              disabled={!customerName.trim()}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              Speichern
            </button>
          </div>
        </div>
      </Modal>

      {/* Project Modal */}
      <Modal
        isOpen={projectModalOpen}
        onClose={() => setProjectModalOpen(false)}
        title={editingProject ? 'Projekt bearbeiten' : 'Neues Projekt'}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Projektname *
            </label>
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="z.B. Website Redesign"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Kunde *
            </label>
            <select
              value={projectCustomerId}
              onChange={(e) => setProjectCustomerId(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {customers.map(customer => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Abrechnungsart *
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setProjectRateType('hourly')}
                className={`flex flex-col items-center gap-2 p-4 border-2 rounded-lg transition-all ${
                  projectRateType === 'hourly'
                    ? 'border-accent-primary bg-accent-light dark:bg-accent-lighter/10 text-accent-primary'
                    : 'border-gray-300 text-gray-600 hover:border-gray-400'
                }`}
              >
                <span className="text-2xl">⏱️</span>
                <span className="font-medium text-sm">Stundensatz</span>
                <span className="text-xs text-gray-500">Pro Stunde</span>
              </button>
              <button
                type="button"
                onClick={() => setProjectRateType('daily')}
                className={`flex flex-col items-center gap-2 p-4 border-2 rounded-lg transition-all ${
                  projectRateType === 'daily'
                    ? 'border-accent-primary bg-accent-light dark:bg-accent-lighter/10 text-accent-primary'
                    : 'border-gray-300 text-gray-600 hover:border-gray-400'
                }`}
              >
                <span className="text-2xl">📅</span>
                <span className="font-medium text-sm">Tagessatz</span>
                <span className="text-xs text-gray-500">Pro Tag (8h)</span>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {projectRateType === 'hourly' ? 'Stundensatz (€)' : 'Tagessatz (€)'} *
            </label>
            <input
              type="number"
              value={projectHourlyRate}
              onChange={(e) => setProjectHourlyRate(e.target.value)}
              placeholder={projectRateType === 'hourly' ? 'z.B. 85.00' : 'z.B. 680.00'}
              step="0.01"
              min="0"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              onClick={() => setProjectModalOpen(false)}
              className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors"
            >
              Abbrechen
            </button>
            <button
              onClick={handleSaveProject}
              disabled={!projectName.trim() || !projectCustomerId || !projectHourlyRate}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              Speichern
            </button>
          </div>
        </div>
      </Modal>

      {/* Activity Modal */}
      <Modal
        isOpen={activityModalOpen}
        onClose={() => setActivityModalOpen(false)}
        title={editingActivity ? 'Tätigkeit bearbeiten' : 'Neue Tätigkeit'}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tätigkeitsname *
            </label>
            <input
              type="text"
              value={activityName}
              onChange={(e) => setActivityName(e.target.value)}
              placeholder="z.B. Meeting, Entwicklung, Beratung"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Beschreibung (optional)
            </label>
            <textarea
              value={activityDescription}
              onChange={(e) => setActivityDescription(e.target.value)}
              placeholder="Weitere Details zur Tätigkeit..."
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Abrechnungsart *
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setActivityPricingType('hourly')}
                className={`p-3 rounded-lg border-2 transition-all text-center ${
                  activityPricingType === 'hourly'
                    ? 'border-accent-primary bg-accent-light dark:bg-accent-lighter/10 text-accent-primary font-semibold'
                    : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 text-gray-700 dark:text-gray-300'
                }`}
              >
                <div className="text-sm font-medium">Stundenabrechnung</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Nach Projektsatz</div>
              </button>
              <button
                type="button"
                onClick={() => setActivityPricingType('flat')}
                className={`p-3 rounded-lg border-2 transition-all text-center ${
                  activityPricingType === 'flat'
                    ? 'border-accent-primary bg-accent-light dark:bg-accent-lighter/10 text-accent-primary font-semibold'
                    : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 text-gray-700 dark:text-gray-300'
                }`}
              >
                <div className="text-sm font-medium">Pauschalpreis</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Fester Betrag</div>
              </button>
            </div>
          </div>

          {activityPricingType === 'flat' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Pauschalbetrag * (€)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={activityFlatRate}
                onChange={(e) => setActivityFlatRate(e.target.value)}
                placeholder="z.B. 2500"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                💡 Dieser Betrag wird unabhängig von der erfassten Zeit abgerechnet
              </p>
            </div>
          )}

          <div className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <input
              type="checkbox"
              id="activity-billable"
              checked={activityIsBillable}
              onChange={(e) => setActivityIsBillable(e.target.checked)}
              className="w-4 h-4 text-accent-primary border-gray-300 rounded focus:ring-2 focus:ring-accent-primary"
            />
            <label htmlFor="activity-billable" className="flex-1 text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
              Abrechenbar
              <span className="block text-xs text-gray-500 dark:text-gray-400 mt-1">
                Nicht abrechenbare Tätigkeiten werden nicht in Reports berücksichtigt
              </span>
            </label>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              onClick={() => setActivityModalOpen(false)}
              className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors"
            >
              Abbrechen
            </button>
            <button
              onClick={handleSaveActivity}
              disabled={!activityName.trim()}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              Speichern
            </button>
          </div>
        </div>
      </Modal>

      {/* Activity Templates Modal */}
      <Modal
        isOpen={templateModalOpen}
        onClose={() => setTemplateModalOpen(false)}
        title="Tätigkeit aus Vorlage wählen"
      >
        <div className="space-y-6">
          <p className="text-base text-gray-700 dark:text-gray-300">
            Wähle eine vorgefertigte Tätigkeit aus und passe sie nach Bedarf an.
          </p>

          <div className="space-y-5 max-h-[60vh] overflow-y-auto pr-2">
            {Object.entries(getTemplatesByCategory()).map(([category, templates]) => (
              <div key={category}>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-3 pb-2 border-b-2 border-gray-200 dark:border-gray-700">
                  {category}
                </h3>
                <div className="space-y-2">
                  {templates.map((template, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleUseTemplate(template)}
                      className="w-full text-left p-4 rounded-lg border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:border-blue-500 dark:hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-all group shadow-sm hover:shadow-md"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-base font-semibold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-300 mb-1">
                            {template.name}
                          </p>
                          <p className="text-sm text-gray-600 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-300">
                            {template.description}
                          </p>
                        </div>
                        {template.isBillable && (
                          <div className="flex-shrink-0">
                            <span className="inline-block text-xs font-semibold px-3 py-1.5 bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 rounded-md border border-green-200 dark:border-green-800">
                              ✓ Abrechenbar
                            </span>
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end pt-4 border-t-2 border-gray-200 dark:border-gray-700">
            <button
              onClick={() => setTemplateModalOpen(false)}
              className="px-6 py-2.5 text-base font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              Abbrechen
            </button>
          </div>
        </div>
      </Modal>

      {/* CSV Column Mapping Modal */}
      <Modal
        isOpen={mappingModalOpen}
        onClose={() => {
          setMappingModalOpen(false);
          setCsvPreviewData(null);
          setColumnMappings({});
        }}
        title="CSV Spalten zuordnen"
      >
        <div className="space-y-6">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Ordne die Spalten aus deiner CSV-Datei den entsprechenden Feldern zu.
            Vorschläge wurden automatisch erkannt. Du kannst diese anpassen oder Spalten ignorieren.
          </p>

          {csvPreviewData && (
            <>
              {/* Column Mapping Table */}
              <div className="border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
                <div className="max-h-[400px] overflow-y-auto">
                  <table className="min-w-full divide-y divide-gray-300 dark:divide-gray-600">
                    <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-900 dark:text-white uppercase tracking-wider">
                          CSV Spalte
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-900 dark:text-white uppercase tracking-wider">
                          Zuordnung
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-900 dark:text-white uppercase tracking-wider">
                          Vorschau
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                      {csvPreviewData.headers.map((header, idx) => (
                        <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                          <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap">
                            {header}
                          </td>
                          <td className="px-4 py-3">
                            <select
                              value={columnMappings[header] || ''}
                              onChange={(e) => setColumnMappings(prev => ({
                                ...prev,
                                [header]: e.target.value
                              }))}
                              className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                            >
                              <option value="">Ignorieren</option>
                              <option value="name">Name / Firmenname (Pflicht)</option>
                              <option value="customerNumber">Kundennummer</option>
                              <option value="contactPerson">Ansprechpartner</option>
                              <option value="firstName">Vorname</option>
                              <option value="lastName">Nachname</option>
                              <option value="email">E-Mail</option>
                              <option value="address">Adresse (komplett)</option>
                              <option value="street">Straße</option>
                              <option value="zip">PLZ</option>
                              <option value="city">Stadt/Ort</option>
                              <option value="country">Land</option>
                              <option value="phone">Telefon</option>
                              <option value="taxId">Steuernummer/USt-IdNr</option>
                            </select>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                            <div className="max-w-xs truncate">
                              {csvPreviewData.rows[0]?.[header] || <span className="text-gray-400 dark:text-gray-500 italic">leer</span>}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Preview Section */}
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-300 mb-2">
                  Datenvorschau ({csvPreviewData.allData.length} Zeilen)
                </h4>
                <div className="text-xs text-blue-800 dark:text-blue-400 space-y-1">
                  {csvPreviewData.rows.slice(0, 2).map((row, idx) => {
                    const fieldToColumn: Record<string, string> = {};
                    Object.entries(columnMappings).forEach(([csvCol, field]) => {
                      if (field) fieldToColumn[field] = csvCol;
                    });

                    const name = row[fieldToColumn['name']];
                    const email = row[fieldToColumn['email']];

                    return (
                      <div key={idx} className="flex items-center gap-2">
                        <span className="font-mono">#{idx + 1}:</span>
                        <span className="font-semibold">{name || '(kein Name)'}</span>
                        {email && <span className="text-blue-600 dark:text-blue-400">• {email}</span>}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Warning if no name field mapped */}
              {!Object.values(columnMappings).includes('name') && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                  <p className="text-sm font-semibold text-red-800 dark:text-red-300">
                    ⚠ Achtung: Das Feld "Name / Firmenname" muss zugeordnet werden!
                  </p>
                  <p className="text-xs text-red-700 dark:text-red-400 mt-1">
                    Ohne Namen können keine Kunden importiert werden.
                  </p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => {
                    setMappingModalOpen(false);
                    setCsvPreviewData(null);
                    setColumnMappings({});
                  }}
                  className="px-6 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  Abbrechen
                </button>
                <button
                  onClick={processImportWithMappings}
                  disabled={!Object.values(columnMappings).includes('name')}
                  className="px-6 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed rounded-lg transition-colors"
                >
                  {csvPreviewData.allData.length} {csvPreviewData.allData.length === 1 ? 'Kunde' : 'Kunden'} importieren
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* Edit Profile Modal */}
      <Modal
        isOpen={editProfileOpen}
        onClose={() => setEditProfileOpen(false)}
        title="Profil bearbeiten"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-300 mb-2">
              Benutzername
            </label>
            <input
              type="text"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary"
              placeholder="Benutzername"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-300 mb-2">
              E-Mail
            </label>
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary"
              placeholder="E-Mail"
            />
          </div>

          {profileError && (
            <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <XCircle size={18} className="text-red-600 dark:text-red-400 flex-shrink-0" />
              <p className="text-sm text-red-600 dark:text-red-400">{profileError}</p>
            </div>
          )}

          {profileSuccess && (
            <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <Save size={18} className="text-green-600 dark:text-green-400 flex-shrink-0" />
              <p className="text-sm text-green-600 dark:text-green-400">{profileSuccess}</p>
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <button
              onClick={handleSaveProfile}
              disabled={!!profileSuccess}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-accent-primary hover:bg-accent-darker disabled:bg-gray-400 text-white rounded-lg transition-colors"
            >
              <Save size={18} />
              Speichern
            </button>
            <button
              onClick={() => setEditProfileOpen(false)}
              className="px-4 py-2 bg-gray-100 dark:bg-dark-200 hover:bg-gray-200 dark:hover:bg-dark-300 text-gray-900 dark:text-white rounded-lg transition-colors"
            >
              Abbrechen
            </button>
          </div>
        </div>
      </Modal>

      {/* Change Password Modal */}
      <Modal
        isOpen={changePasswordOpen}
        onClose={() => setChangePasswordOpen(false)}
        title="Passwort ändern"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-300 mb-2">
              Aktuelles Passwort
            </label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary"
              placeholder="Aktuelles Passwort"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-300 mb-2">
              Neues Passwort
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary"
              placeholder="Neues Passwort (min. 6 Zeichen)"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-300 mb-2">
              Passwort bestätigen
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary"
              placeholder="Passwort wiederholen"
            />
          </div>

          {passwordError && (
            <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <XCircle size={18} className="text-red-600 dark:text-red-400 flex-shrink-0" />
              <p className="text-sm text-red-600 dark:text-red-400">{passwordError}</p>
            </div>
          )}

          {passwordSuccess && (
            <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <Key size={18} className="text-green-600 dark:text-green-400 flex-shrink-0" />
              <p className="text-sm text-green-600 dark:text-green-400">{passwordSuccess}</p>
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <button
              onClick={handleChangePassword}
              disabled={!!passwordSuccess}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-accent-primary hover:bg-accent-darker disabled:bg-gray-400 text-white rounded-lg transition-colors"
            >
              <Key size={18} />
              Passwort ändern
            </button>
            <button
              onClick={() => setChangePasswordOpen(false)}
              className="px-4 py-2 bg-gray-100 dark:bg-dark-200 hover:bg-gray-200 dark:hover:bg-dark-300 text-gray-900 dark:text-white rounded-lg transition-colors"
            >
              Abbrechen
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        onClose={() => setDeleteConfirm({ isOpen: false, type: null, id: '', name: '' })}
        onConfirm={confirmDelete}
        title={`${deleteConfirm.type === 'customer' ? 'Kunde' : deleteConfirm.type === 'activity' ? 'Tätigkeit' : 'Projekt'} löschen?`}
        message={`Möchtest du "${deleteConfirm.name}" wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`}
        confirmText="Löschen"
        variant="danger"
      />

      {/* Customer Contacts Modal */}
      {contactsCustomer && (
        <CustomerContacts
          isOpen={!!contactsCustomer}
          customer={contactsCustomer}
          onClose={() => setContactsCustomer(null)}
        />
      )}
    </div>
  );
};
