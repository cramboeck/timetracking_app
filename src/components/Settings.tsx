import { useState, useEffect, useRef } from 'react';
import { Plus, Edit2, Trash2, Users, FolderOpen, Palette, ListChecks, LogOut, Contrast, Building, Upload, X, Users2, Copy, Shield, UserPlus, Bell, User as UserIcon, Clock, ChevronRight, ChevronDown, Check, FileDown, Key, Save, XCircle, Activity as ActivityIcon, UserCog, Ticket, Book, Server, Bot, Database, Cloud, Globe, Search } from 'lucide-react';
import { Customer, Project, Activity, GrayTone, TimeEntry } from '../types';
import { Modal } from './Modal';
import { Button, IconButton } from './ui/Button';
import { ConfirmDialog } from './ConfirmDialog';
import { CustomerContacts } from './CustomerContacts';
import { CustomerEmailDomains } from './CustomerEmailDomains';
import { TicketSettings } from './TicketSettings';
import { KnowledgeBaseSettings } from './KnowledgeBaseSettings';
import { NinjaRMMSettings } from './NinjaRMMSettings';
import { AISettings } from './AISettings';
import { CustomerSevdeskLink } from './CustomerSevdeskLink';
import { CustomerNinjaRMMLink } from './CustomerNinjaRMMLink';
import { CustomerDetailModal } from './CustomerDetailModal';
import { MFASettings } from './MFASettings';
import { ClockodoImport } from './ClockodoImport';
import { Microsoft365Settings } from './Microsoft365Settings';
import { Link2 } from 'lucide-react';
import { AccountSettings } from './settings/AccountSettings';
import { AppearanceSettings } from './settings/AppearanceSettings';
import { NotificationSettings } from './settings/NotificationSettings';
import { CompanySettings } from './settings/CompanySettings';
import { TeamSettings } from './settings/TeamSettings';
import { TeamProvider } from '../contexts/TeamContext';
import { useAuth } from '../contexts/AuthContext';
import { getRoundingIntervalLabel } from '../utils/timeRounding';
import { gdprService } from '../utils/gdpr';
import { authApi, userApi, sevdeskApi, organizationsApi, customersApi, contractsApi, Organization } from '../services/api';
import Papa from 'papaparse';
import { getTemplatesByCategory, ActivityTemplate } from '../data/activityTemplates';
import { generateUUID } from '../utils/uuid';
import { storage } from '../utils/storage';
import { useToast, useConfirm } from '../contexts/UIContext';

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
  onRefreshEntries?: () => void;
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
  onDeleteActivity,
  onRefreshEntries
}: SettingsProps) => {
  const { currentUser, logout, updateAccentColor, updateGrayTone, updateTimeRoundingInterval, updateTimeFormat } = useAuth();
  const showToast = useToast();
  const confirm = useConfirm();
  const [activeTab, setActiveTab] = useState<'account' | 'appearance' | 'notifications' | 'company' | 'team' | 'customers' | 'projects' | 'activities' | 'tickets' | 'portal' | 'ninjarmm' | 'microsoft365' | 'ai'>('account');
  const [billingEnabled, setBillingEnabled] = useState(false);
  const [sevdeskLinkCustomer, setSevdeskLinkCustomer] = useState<Customer | null>(null);
  const [ninjaRMMLinkCustomer, setNinjaRMMLinkCustomer] = useState<Customer | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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

  // Customer Email Domains Modal
  const [emailDomainsCustomer, setEmailDomainsCustomer] = useState<Customer | null>(null);

  // Customer Detail Modal (CRM view)
  const [detailCustomer, setDetailCustomer] = useState<Customer | null>(null);

  // Pending domain from navigation (shown as hint when creating customer)
  const [pendingDomain, setPendingDomain] = useState<string | null>(null);

  // Check for navigation params on mount (e.g., from SupportInbox)
  useEffect(() => {
    const navParams = sessionStorage.getItem('navigation_params');
    if (navParams) {
      try {
        const params = JSON.parse(navParams);
        // If we were navigated to customers tab
        if (params.tab === 'customers') {
          setActiveTab('customers');
          // Store the domain for later use
          if (params.domain) {
            setPendingDomain(params.domain);
          }
          // Open customer creation modal automatically
          setTimeout(() => {
            setCustomerModalOpen(true);
          }, 100);
        }
      } catch (e) {
        console.error('Failed to parse navigation params:', e);
      } finally {
        // Clear the params so they don't persist
        sessionStorage.removeItem('navigation_params');
      }
    }
  }, []);

  const [customerName, setCustomerName] = useState('');
  const [customerColor, setCustomerColor] = useState(COLORS[0]);
  const [customerNumber, setCustomerNumber] = useState('');
  const [customerContactPerson, setCustomerContactPerson] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerReportTitle, setCustomerReportTitle] = useState('');
  const [customerHourlyRate, setCustomerHourlyRate] = useState('');
  const [customerTimeRoundingInterval, setCustomerTimeRoundingInterval] = useState('15');
  const [customerPaymentTermsDays, setCustomerPaymentTermsDays] = useState('14');
  const [customerNinjarmmOrgId, setCustomerNinjarmmOrgId] = useState('');
  const [customerDisplayName, setCustomerDisplayName] = useState('');
  const [customerImportAliases, setCustomerImportAliases] = useState('');
  const [customerType, setCustomerType] = useState<'company' | 'individual'>('company');
  const [customerDefaultProjectId, setCustomerDefaultProjectId] = useState('');
  // sevdesk position template (per-customer text appended under each invoice
  // position; supports {placeholders} resolved server-side)
  const [customerSevdeskPositionTemplate, setCustomerSevdeskPositionTemplate] = useState('');
  const [customerDefaultContractId, setCustomerDefaultContractId] = useState('');
  const [customerContracts, setCustomerContracts] = useState<Array<{ id: string; contractNumber: string; name: string }>>([]);

  // CSV Import
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importResult, setImportResult] = useState<{ success: number; failed: number; errors: string[] } | null>(null);

  // Contact Migration
  const [migrating, setMigrating] = useState(false);
  const [migrationResult, setMigrationResult] = useState<{
    contactsFromEmail: number;
    contactsFromTickets: number;
    domainsFromWebsite: number;
    domainsFromEmail: number;
    skippedExisting: number;
    errors: string[];
  } | null>(null);
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

  // Project List View State
  const [projectSearchQuery, setProjectSearchQuery] = useState('');
  const [collapsedCustomerGroups, setCollapsedCustomerGroups] = useState<Set<string>>(new Set());

  // Activity Modal
  const [activityModalOpen, setActivityModalOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [activityName, setActivityName] = useState('');
  const [activityDescription, setActivityDescription] = useState('');
  const [activityIsBillable, setActivityIsBillable] = useState(true);
  const [activityPricingType, setActivityPricingType] = useState<'hourly' | 'flat'>('hourly');
  const [activityFlatRate, setActivityFlatRate] = useState('');
  const [templateModalOpen, setTemplateModalOpen] = useState(false);

  // Organization State (needed for role-based permissions)
  const [currentOrganization, setCurrentOrganization] = useState<Organization | null>(null);

  // Delete Confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    type: 'customer' | 'project' | 'activity' | null;
    id: string;
    name: string;
  }>({ isOpen: false, type: null, id: '', name: '' });

  // GDPR Account-Deletion Confirmation
  const [gdprDeleteStep, setGdprDeleteStep] = useState<0 | 1 | 2>(0);

  // Role-based permission helpers
  const userRole = currentOrganization?.user_role;
  const canEdit = userRole !== 'viewer'; // owner, admin, member can edit
  const canDelete = userRole === 'owner' || userRole === 'admin'; // only owner/admin can delete
  const canInvite = userRole === 'owner' || userRole === 'admin'; // only owner/admin can invite

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
      setCustomerHourlyRate(customer.hourlyRate?.toString() || '');
      setCustomerTimeRoundingInterval(customer.timeRoundingInterval?.toString() || '15');
      setCustomerPaymentTermsDays(customer.paymentTermsDays?.toString() || '14');
      setCustomerNinjarmmOrgId(customer.ninjarmmOrganizationId || '');
      setCustomerDisplayName(customer.displayName || '');
      setCustomerImportAliases(customer.importAliases?.join(', ') || '');
      setCustomerType(customer.customerType || 'company');
      setCustomerDefaultProjectId(customer.defaultProjectId || '');
      setCustomerSevdeskPositionTemplate(customer.sevdeskPositionTemplate || '');
      setCustomerDefaultContractId(customer.defaultContractId || '');
      // Load contracts of this customer for the "Standard-Vertrag" dropdown
      (async () => {
        try {
          const res = await contractsApi.getContracts({ customerId: customer.id });
          if (res.success) {
            setCustomerContracts((res.data || []).map((c: any) => ({
              id: c.id,
              contractNumber: c.contractNumber,
              name: c.name,
            })));
          }
        } catch (err) {
          console.error('Failed to load customer contracts:', err);
          setCustomerContracts([]);
        }
      })();
    } else {
      setEditingCustomer(null);
      setCustomerName('');
      setCustomerColor(COLORS[0]);
      setCustomerNumber('');
      setCustomerContactPerson('');
      setCustomerEmail('');
      setCustomerAddress('');
      setCustomerDisplayName('');
      setCustomerImportAliases('');
      setCustomerReportTitle('');
      setCustomerHourlyRate('');
      setCustomerTimeRoundingInterval('15');
      setCustomerPaymentTermsDays('14');
      setCustomerNinjarmmOrgId('');
      setCustomerType('company');
      setCustomerDefaultProjectId('');
      setCustomerSevdeskPositionTemplate('');
      setCustomerDefaultContractId('');
      setCustomerContracts([]);
    }
    setCustomerModalOpen(true);
  };

  // Load billing feature status
  useEffect(() => {
    const loadFeatureStatus = async () => {
      try {
        const response = await sevdeskApi.getFeatureStatus();
        setBillingEnabled(response.data.billingEnabled);
      } catch (err) {
        // Ignore error - billing feature not available
        setBillingEnabled(false);
      }
    };
    loadFeatureStatus();
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

    const hourlyRateValue = customerHourlyRate.trim() ? parseFloat(customerHourlyRate) : undefined;
    const timeRoundingIntervalValue = customerTimeRoundingInterval.trim() ? parseInt(customerTimeRoundingInterval) : 15;
    const paymentTermsDaysValue = customerPaymentTermsDays.trim() ? parseInt(customerPaymentTermsDays) : 14;
    // Parse import aliases from comma-separated string
    const importAliasesValue = customerImportAliases.trim()
      ? customerImportAliases.split(',').map(a => a.trim()).filter(a => a.length > 0)
      : undefined;

    if (editingCustomer) {
      onUpdateCustomer(editingCustomer.id, {
        name: customerName.trim(),
        color: customerColor,
        customerNumber: customerNumber.trim() || undefined,
        contactPerson: customerContactPerson.trim() || undefined,
        email: customerEmail.trim() || undefined,
        address: customerAddress.trim() || undefined,
        reportTitle: customerReportTitle.trim() || undefined,
        hourlyRate: hourlyRateValue,
        timeRoundingInterval: timeRoundingIntervalValue,
        paymentTermsDays: paymentTermsDaysValue,
        ninjarmmOrganizationId: customerNinjarmmOrgId.trim() || undefined,
        displayName: customerDisplayName.trim() || undefined,
        importAliases: importAliasesValue,
        customerType: customerType,
        defaultProjectId: customerDefaultProjectId || undefined,
        sevdeskPositionTemplate: customerSevdeskPositionTemplate.trim() || undefined,
        defaultContractId: customerDefaultContractId || undefined,
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
        hourlyRate: hourlyRateValue,
        timeRoundingInterval: timeRoundingIntervalValue,
        paymentTermsDays: paymentTermsDaysValue,
        ninjarmmOrganizationId: customerNinjarmmOrgId.trim() || undefined,
        displayName: customerDisplayName.trim() || undefined,
        importAliases: importAliasesValue,
        customerType: customerType,
        defaultProjectId: customerDefaultProjectId || undefined,
        createdAt: new Date().toISOString()
      });
    }

    setCustomerModalOpen(false);
  };

  // CSV Import Handler
  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  // Contact Migration Handler
  const handleMigrateContacts = async () => {
    const ok = await confirm({
      title: 'Kontakte automatisch erstellen?',
      message: 'Kontakte und E-Mail-Domains automatisch erstellen?\n\n- Kontakte aus Kunden-E-Mails\n- Kontakte aus Support-Tickets\n- Domains aus Websites\n- Domains aus E-Mail-Adressen\n\nBereits existierende Einträge werden übersprungen.',
      confirmText: 'Erstellen',
      variant: 'warning',
    });
    if (!ok) return;

    setMigrating(true);
    setMigrationResult(null);
    try {
      const response = await customersApi.migrateContacts();
      if (response.success) {
        setMigrationResult(response.stats);
      } else {
        showToast('Fehler bei der Migration', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Fehler bei der Migration', 'error');
    } finally {
      setMigrating(false);
    }
  };

  const handleFileImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check file type
    if (!file.name.endsWith('.csv')) {
      showToast('Bitte wähle eine CSV-Datei aus.', 'warning');
      return;
    }

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (!results.data || results.data.length === 0) {
          showToast('Die CSV-Datei enthält keine Daten.', 'warning');
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
        showToast(`Fehler beim Lesen der Datei: ${error.message}`, 'error');
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
      showToast(`Dieser Kunde kann nicht gelöscht werden, da noch ${customerProjects.length} Projekt(e) zugeordnet sind.`, 'warning', 5000);
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

  // Load organization data on mount (needed for role-based UI)
  useEffect(() => {
    if (currentUser) {
      const loadOrganizationData = async () => {
        try {
          // Load current organization
          const orgResponse = await organizationsApi.getCurrent();
          if (orgResponse.success && orgResponse.data) {
            setCurrentOrganization(orgResponse.data);
          }
        } catch (error) {
          console.error('Error loading organization data:', error);
        }
      };
      loadOrganizationData();
    }
  }, [currentUser]);

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
      showToast('Bitte fülle alle Pflichtfelder aus', 'warning');
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
      showToast('Firmendaten gespeichert!', 'success');
    } catch (error) {
      console.error('Error saving company info:', error);
      showToast('Fehler beim Speichern der Firmendaten', 'error');
    }
  };

  const handleLogoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      showToast('Logo darf maximal 2MB groß sein', 'warning');
      return;
    }

    // Check file type
    if (!file.type.startsWith('image/')) {
      showToast('Nur Bilddateien sind erlaubt', 'warning');
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
        { id: 'team', label: 'Team Management', icon: Users2, desc: 'Mitglieder & Einladungen' }
        // Billing moved to Finanzen in main navigation
      ]
    },
    {
      category: 'Support',
      items: [
        { id: 'tickets', label: 'Ticket-System', icon: Ticket, desc: 'Tags & Textbausteine' },
        { id: 'portal', label: 'Kundenportal', icon: Book, desc: 'KB & Branding' },
        { id: 'ninjarmm', label: 'NinjaRMM', icon: Server, desc: 'Geräte & Alerts' },
        { id: 'microsoft365', label: 'Microsoft 365', icon: Cloud, desc: 'E-Mail & Azure' },
        { id: 'ai', label: 'KI-Assistent', icon: Bot, desc: 'Lösungsvorschläge' }
      ]
    },
    {
      category: 'Daten',
      items: [
        { id: 'import', label: 'Datenimport', icon: Database, desc: 'Clockodo & mehr' }
      ]
    }
  ];

  return (
    <div className="flex h-full bg-gray-50 dark:bg-dark-50">
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
                          : 'text-gray-700 dark:text-dark-500 hover:bg-gray-100 dark:hover:bg-dark-50'
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

      {/* Mobile Header - iOS Style Button */}
      <div className="lg:hidden fixed top-12 left-0 right-0 z-20 bg-white/80 dark:bg-dark-50/80 backdrop-blur-lg border-b border-gray-200/50 dark:border-dark-border/50 px-4 py-2">
        <button
          onClick={() => setMobileMenuOpen(true)}
          className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-100/80 dark:bg-dark-100/80 rounded-xl active:scale-[0.98] transition-transform"
        >
          <div className="flex items-center gap-3">
            {(() => {
              const currentItem = menuItems.flatMap(s => s.items).find(i => i.id === activeTab);
              const Icon = currentItem?.icon || UserIcon;
              return (
                <>
                  <div className="w-8 h-8 rounded-lg bg-accent-primary/15 flex items-center justify-center">
                    <Icon size={18} className="text-accent-primary" />
                  </div>
                  <span className="font-semibold text-gray-900 dark:text-white">{currentItem?.label}</span>
                </>
              );
            })()}
          </div>
          <ChevronDown size={20} className="text-gray-400" />
        </button>
      </div>

      {/* iOS Style Bottom Sheet Menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />

          {/* Sheet */}
          <div className="absolute bottom-0 left-0 right-0 bg-gray-100 dark:bg-dark-50 rounded-t-3xl max-h-[70vh] overflow-hidden animate-slide-up">
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 bg-gray-300 dark:bg-dark-300 rounded-full" />
            </div>

            {/* Menu Items */}
            <div className="overflow-y-auto max-h-[calc(70vh-60px)] pb-8 px-4">
              {menuItems.map((section, idx) => (
                <div key={section.category} className={idx > 0 ? 'mt-6' : ''}>
                  {/* Section Header */}
                  <h3 className="text-xs font-semibold text-gray-500 dark:text-dark-400 uppercase tracking-wider px-4 mb-2">
                    {section.category}
                  </h3>

                  {/* Section Items - iOS grouped style */}
                  <div className="bg-white dark:bg-dark-100 rounded-xl overflow-hidden">
                    {section.items.map((item, itemIdx) => {
                      const Icon = item.icon;
                      const isActive = activeTab === item.id;
                      const isLast = itemIdx === section.items.length - 1;

                      return (
                        <button
                          key={item.id}
                          onClick={() => {
                            setActiveTab(item.id as any);
                            setMobileMenuOpen(false);
                          }}
                          className={`w-full flex items-center gap-3 px-4 py-3 active:bg-gray-100 dark:active:bg-dark-200 transition-colors ${
                            !isLast ? 'border-b border-gray-100 dark:border-dark-border' : ''
                          }`}
                        >
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                            isActive ? 'bg-accent-primary/15' : 'bg-gray-100 dark:bg-dark-200'
                          }`}>
                            <Icon size={18} className={isActive ? 'text-accent-primary' : 'text-gray-500 dark:text-dark-400'} />
                          </div>
                          <div className="flex-1 text-left">
                            <div className={`text-sm ${isActive ? 'font-semibold text-accent-primary' : 'font-medium text-gray-900 dark:text-white'}`}>
                              {item.label}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-dark-400">
                              {item.desc}
                            </div>
                          </div>
                          {isActive && (
                            <Check size={20} className="text-accent-primary" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="lg:hidden h-14"></div> {/* Spacer for mobile settings header */}
        <div className="p-4 sm:p-6 lg:p-8">
        {/* Account Tab */}
        {activeTab === 'account' && (
          <div className="max-w-5xl mx-auto space-y-6">
            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-gradient-to-br from-accent-light to-accent-lighter dark:from-accent-primary/20 dark:to-accent-primary/20 rounded-xl border border-accent-primary/30 dark:border-accent-primary/40 p-5 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-accent-primary rounded-lg">
                    <ActivityIcon size={20} className="text-white" />
                  </div>
                  <p className="text-sm font-medium text-accent-dark dark:text-accent-primary">Zeiteinträge</p>
                </div>
                <p className="text-3xl font-bold text-accent-dark dark:text-accent-primary">
                  {entries.length}
                </p>
                <p className="text-xs text-accent-dark dark:text-accent-primary mt-1">Gesamt erfasst</p>
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
                    <Button
                      variant="primary"
                      onClick={handleOpenEditProfile}
                      icon={<Edit2 size={18} />}
                    >
                      Profil bearbeiten
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={handleOpenChangePassword}
                      icon={<Key size={18} />}
                    >
                      Passwort ändern
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* Two-Factor Authentication */}
            <MFASettings />

            {/* GDPR / Data Protection */}
            <div className="bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-200 p-6 shadow-md">
                <div className="flex items-center gap-3 mb-5">
                  <div className="p-3 bg-accent-light dark:bg-accent-primary/20 rounded-xl">
                    <Shield size={24} className="text-accent-primary dark:text-accent-primary" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">Datenschutz (DSGVO)</h3>
                    <p className="text-sm text-gray-500 dark:text-dark-400">Deine Daten verwalten</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <Button
                    variant="primary"
                    size="lg"
                    fullWidth
                    onClick={() => {

                      if (!currentUser) return;
                      const json = gdprService.exportUserDataAsJSON(currentUser.id);
                      gdprService.downloadDataAsFile(
                        json,
                        `timetrack-data-${currentUser.username}-${new Date().toISOString().split('T')[0]}.json`,
                        'application/json'
                      );
                    }}
                    className="flex items-center justify-between"
                    icon={<span className="text-2xl">📄</span>}
                  >
                    <div className="flex-1 text-left">
                      <div className="text-sm font-medium">Daten exportieren (JSON)</div>
                      <div className="text-xs opacity-80">Alle deine Daten herunterladen</div>
                    </div>
                    <ChevronRight size={18} />
                  </Button>

                  <Button
                    variant="success"
                    size="lg"
                    fullWidth
                    onClick={() => {

                      if (!currentUser) return;
                      const csv = gdprService.exportUserDataAsCSV(currentUser.id);
                      gdprService.downloadDataAsFile(
                        csv,
                        `timetrack-data-${currentUser.username}-${new Date().toISOString().split('T')[0]}.csv`,
                        'text/csv'
                      );
                    }}
                    className="flex items-center justify-between"
                    icon={<span className="text-2xl">📊</span>}
                  >
                    <div className="flex-1 text-left">
                      <div className="text-sm font-medium">Daten exportieren (CSV)</div>
                      <div className="text-xs opacity-80">Excel-kompatibles Format</div>
                    </div>
                    <ChevronRight size={18} />
                  </Button>

                  <Button
                    variant="danger"
                    size="lg"
                    fullWidth
                    onClick={() => {
                      if (!currentUser) return;
                      setGdprDeleteStep(1);
                    }}
                    className="flex items-center justify-between"
                    icon={<span className="text-2xl">🗑️</span>}
                  >
                    <div className="flex-1 text-left">
                      <div className="text-sm font-medium">Account löschen</div>
                      <div className="text-xs opacity-80">Recht auf Vergessen (DSGVO Art. 17)</div>
                    </div>
                    <ChevronRight size={18} />
                  </Button>
                </div>

                <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                  <p className="text-xs text-yellow-900 dark:text-yellow-200">
                    ℹ️ Alle Exporte enthalten <strong>keine Passwörter</strong> und werden gemäß DSGVO erstellt.
                  </p>
                </div>
            </div>

            {/* Logout Button */}
            <div className="bg-white dark:bg-dark-100 rounded-xl border border-red-200 dark:border-red-800 p-6 shadow-md">
              <Button
                variant="danger"
                onClick={logout}
                icon={<LogOut size={20} />}
                fullWidth
                size="lg"
              >
                Abmelden
              </Button>
            </div>
          </div>
        )}

        {/* Notifications Tab */}
        {activeTab === 'notifications' && (
          <NotificationSettings />
        )}

        {/* Customers Tab */}
        {activeTab === 'customers' && (
          <div className="w-full">
            <div>
                <div className="flex justify-between items-center mb-6">
                  <div className="flex items-center gap-3">
                    <p className="text-gray-600 dark:text-dark-400">{customers.length} Kunde(n)</p>
                    {userRole === 'viewer' && (
                      <span className="text-xs px-2 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 rounded">Nur Ansicht</span>
                    )}
                  </div>
                  {canEdit && (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={handleMigrateContacts}
                        disabled={migrating}
                        icon={migrating ? <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Database size={20} />}
                        title="Kontakte und Domains automatisch aus Kundendaten erstellen"
                      >
                        {migrating ? 'Migriere...' : 'Kontakte migrieren'}
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={handleImportClick}
                        icon={<FileDown size={20} />}
                      >
                        Importieren
                      </Button>
                      <Button
                        variant="primary"
                        onClick={() => openCustomerModal()}
                        icon={<Plus size={20} />}
                      >
                        Kunde hinzufügen
                      </Button>
                    </div>
                  )}
                </div>

                {/* Hidden file input for CSV import */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileImport}
                  className="hidden"
                />

                {/* Migration result notification */}
                {migrationResult && (
                  <div className="mb-4 p-4 rounded-lg bg-accent-light dark:bg-accent-primary/20 border border-accent-primary/30 dark:border-accent-primary/40">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-semibold text-accent-dark dark:text-accent-primary">
                          Migration abgeschlossen
                        </p>
                        <div className="text-sm mt-2 text-gray-700 dark:text-dark-500 space-y-1">
                          <p>Kontakte aus Kunden-E-Mails: <strong>{migrationResult.contactsFromEmail}</strong></p>
                          <p>Kontakte aus Support-Tickets: <strong>{migrationResult.contactsFromTickets}</strong></p>
                          <p>Domains aus Websites: <strong>{migrationResult.domainsFromWebsite}</strong></p>
                          <p>Domains aus E-Mail-Adressen: <strong>{migrationResult.domainsFromEmail}</strong></p>
                          {migrationResult.skippedExisting > 0 && (
                            <p className="text-gray-500">Übersprungen (existiert bereits): {migrationResult.skippedExisting}</p>
                          )}
                        </div>
                      </div>
                      <IconButton
                        icon={<X size={18} />}
                        onClick={() => setMigrationResult(null)}
                        tooltip="Schließen"
                        size="sm"
                      />
                    </div>
                    {migrationResult.errors.length > 0 && (
                      <div className="mt-2 text-sm text-red-600 dark:text-red-400">
                        <p className="font-medium mb-1">Fehler:</p>
                        <ul className="list-disc list-inside space-y-1">
                          {migrationResult.errors.slice(0, 5).map((error, idx) => (
                            <li key={idx}>{error}</li>
                          ))}
                          {migrationResult.errors.length > 5 && (
                            <li>... und {migrationResult.errors.length - 5} weitere</li>
                          )}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

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
                        <p className="text-sm mt-1 text-gray-700 dark:text-dark-500">
                          {importResult.success} erfolgreich, {importResult.failed} fehlgeschlagen
                        </p>
                      </div>
                      <IconButton
                        icon={<X size={18} />}
                        onClick={() => setImportResult(null)}
                        tooltip="Schließen"
                        size="sm"
                      />
                    </div>
                    {importResult.errors.length > 0 && (
                      <div className="mt-2 text-sm text-gray-600 dark:text-dark-400">
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
                  <div className="grid gap-4 2xl:grid-cols-2">
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
                                {customer.customerType === 'individual' ? (
                                  <span className="text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 px-2 py-0.5 rounded-full whitespace-nowrap flex items-center gap-1">
                                    <UserIcon className="w-3 h-3" />
                                    Privat
                                  </span>
                                ) : customer.customerType === 'company' ? (
                                  <span className="text-xs bg-accent-lighter dark:bg-accent-primary/30 text-accent-dark dark:text-accent-primary px-2 py-0.5 rounded-full whitespace-nowrap flex items-center gap-1">
                                    <Building className="w-3 h-3" />
                                    Firma
                                  </span>
                                ) : null}
                                {customer.customerNumber && (
                                  <span className="text-xs bg-gray-100 dark:bg-dark-50 text-gray-600 dark:text-dark-500 px-2 py-0.5 rounded-full whitespace-nowrap">
                                    #{customer.customerNumber}
                                  </span>
                                )}
                              </div>
                              {customer.reportTitle && (
                                <p className="text-sm text-gray-600 dark:text-dark-500 mt-0.5 truncate">
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
                              <div className="flex flex-wrap items-center gap-2 mt-2">
                                <span className="text-xs text-gray-500 dark:text-dark-400">
                                  {projects.filter(p => p.customerId === customer.id).length} Projekt(e)
                                </span>
                                {billingEnabled && customer.hourlyRate && (
                                  <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full">
                                    {customer.hourlyRate.toFixed(2)} €/h
                                  </span>
                                )}
                                {customer.sevdeskCustomerId && (
                                  <span className="text-xs bg-accent-lighter dark:bg-accent-primary/30 text-accent-dark dark:text-accent-primary px-2 py-0.5 rounded-full">
                                    sevDesk
                                  </span>
                                )}
                                {customer.ninjarmmOrganizationId && (
                                  <span className="text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 px-2 py-0.5 rounded-full">
                                    NinjaRMM
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-2 ml-2">
                            <IconButton
                              icon={<Building size={18} />}
                              onClick={() => setDetailCustomer(customer)}
                              variant="primary"
                              tooltip="Kundendetails anzeigen"
                            />
                            {billingEnabled && (
                              <IconButton
                                icon={<Link2 size={18} />}
                                onClick={() => setSevdeskLinkCustomer(customer)}
                                variant={customer.sevdeskCustomerId ? 'success' : 'default'}
                                tooltip={customer.sevdeskCustomerId ? 'sevDesk verknüpft' : 'Mit sevDesk verknüpfen'}
                              />
                            )}
                            <IconButton
                              icon={<Server size={18} />}
                              onClick={() => setNinjaRMMLinkCustomer(customer)}
                              variant={customer.ninjarmmOrganizationId ? 'success' : 'default'}
                              tooltip={customer.ninjarmmOrganizationId ? 'NinjaRMM verknüpft' : 'Mit NinjaRMM verknüpfen'}
                            />
                            {currentUser?.hasTicketAccess && (
                              <>
                                <IconButton
                                  icon={<UserCog size={18} />}
                                  onClick={() => setContactsCustomer(customer)}
                                  tooltip="Kontakte verwalten"
                                />
                                <IconButton
                                  icon={<Globe size={18} />}
                                  onClick={() => setEmailDomainsCustomer(customer)}
                                  tooltip="E-Mail Domains verwalten"
                                />
                              </>
                            )}
                            {canEdit && (
                              <IconButton
                                icon={<Edit2 size={18} />}
                                onClick={() => openCustomerModal(customer)}
                                tooltip="Bearbeiten"
                              />
                            )}
                            {canDelete && (
                              <IconButton
                                icon={<Trash2 size={18} />}
                                onClick={() => handleDeleteCustomer(customer)}
                                variant="danger"
                                tooltip="Löschen"
                              />
                            )}
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
                <div className="flex justify-between items-center mb-4">
                  <div className="flex items-center gap-3">
                    <p className="text-gray-600 dark:text-dark-400">{projects.length} Projekt(e)</p>
                    {userRole === 'viewer' && (
                      <span className="text-xs px-2 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 rounded">Nur Ansicht</span>
                    )}
                  </div>
                  {canEdit && (
                    <Button
                      variant="primary"
                      onClick={() => openProjectModal()}
                      disabled={customers.length === 0}
                      icon={<Plus size={20} />}
                    >
                      Projekt hinzufügen
                    </Button>
                  )}
                </div>

                {/* Search and Filter Bar */}
                {projects.length > 0 && (
                  <div className="mb-6">
                    <div className="relative">
                      <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-dark-400" />
                      <input
                        type="text"
                        placeholder="Projekte oder Kunden suchen..."
                        value={projectSearchQuery}
                        onChange={(e) => setProjectSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 border border-gray-200 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-800 text-gray-900 dark:text-dark-100 placeholder-gray-400 dark:placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-accent-primary dark:focus:ring-accent-primary"
                      />
                      {projectSearchQuery && (
                        <button
                          onClick={() => setProjectSearchQuery('')}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-dark-400 dark:hover:text-dark-200"
                        >
                          <X size={16} />
                        </button>
                      )}
                    </div>
                    <div className="flex justify-between items-center mt-2">
                      <p className="text-xs text-gray-500 dark:text-dark-400">
                        Gruppiert nach Kunden (A-Z), Projekte alphabetisch sortiert
                      </p>
                      {collapsedCustomerGroups.size > 0 && (
                        <button
                          onClick={() => setCollapsedCustomerGroups(new Set())}
                          className="text-xs text-accent-primary dark:text-accent-primary hover:underline"
                        >
                          Alle aufklappen
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {customers.length === 0 ? (
                  <div className="text-center py-12 text-gray-500 dark:text-dark-400">
                    <Users size={48} className="mx-auto mb-4 opacity-50" />
                    <p>Bitte füge zuerst einen Kunden hinzu</p>
                  </div>
                ) : projects.length === 0 ? (
                  <div className="text-center py-12 text-gray-500 dark:text-dark-400">
                    <FolderOpen size={48} className="mx-auto mb-4 opacity-50" />
                    <p>Noch keine Projekte vorhanden</p>
                    <p className="text-sm mt-2">Füge dein erstes Projekt hinzu</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {(() => {
                      // Filter projects by search query
                      const filteredProjects = projects.filter(project => {
                        if (!projectSearchQuery.trim()) return true;
                        const query = projectSearchQuery.toLowerCase();
                        const customer = getCustomerById(project.customerId);
                        return (
                          project.name.toLowerCase().includes(query) ||
                          customer?.name.toLowerCase().includes(query)
                        );
                      });

                      // Group projects by customer and sort
                      const customerProjectGroups = customers
                        .map(customer => ({
                          customer,
                          projects: filteredProjects
                            .filter(p => p.customerId === customer.id)
                            .sort((a, b) => a.name.localeCompare(b.name, 'de'))
                        }))
                        .filter(group => group.projects.length > 0)
                        .sort((a, b) => a.customer.name.localeCompare(b.customer.name, 'de'));

                      if (customerProjectGroups.length === 0) {
                        return (
                          <div className="text-center py-8 text-gray-500 dark:text-dark-400">
                            <Search size={32} className="mx-auto mb-3 opacity-50" />
                            <p>Keine Projekte gefunden für "{projectSearchQuery}"</p>
                            <button
                              onClick={() => setProjectSearchQuery('')}
                              className="text-sm text-accent-primary dark:text-accent-primary hover:underline mt-2"
                            >
                              Suche zurücksetzen
                            </button>
                          </div>
                        );
                      }

                      return customerProjectGroups.map(({ customer, projects: customerProjects }) => {
                        const isCollapsed = collapsedCustomerGroups.has(customer.id);

                        return (
                          <div key={customer.id} className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-600 overflow-hidden">
                            {/* Customer Group Header */}
                            <button
                              onClick={() => {
                                const newCollapsed = new Set(collapsedCustomerGroups);
                                if (isCollapsed) {
                                  newCollapsed.delete(customer.id);
                                } else {
                                  newCollapsed.add(customer.id);
                                }
                                setCollapsedCustomerGroups(newCollapsed);
                              }}
                              className="w-full flex items-center gap-3 p-4 hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors"
                            >
                              <div
                                className="w-8 h-8 rounded-lg flex-shrink-0"
                                style={{ backgroundColor: customer.color }}
                              />
                              <div className="flex-1 text-left">
                                <h3 className="font-semibold text-gray-900 dark:text-dark-100">{customer.name}</h3>
                                <p className="text-xs text-gray-500 dark:text-dark-400">
                                  {customerProjects.length} Projekt{customerProjects.length !== 1 ? 'e' : ''}
                                </p>
                              </div>
                              {isCollapsed ? (
                                <ChevronRight size={20} className="text-gray-400 dark:text-dark-400" />
                              ) : (
                                <ChevronDown size={20} className="text-gray-400 dark:text-dark-400" />
                              )}
                            </button>

                            {/* Projects List */}
                            {!isCollapsed && (
                              <div className="border-t border-gray-100 dark:border-dark-700">
                                {customerProjects.map((project, index) => (
                                  <div
                                    key={project.id}
                                    className={`flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-dark-700 ${
                                      index !== customerProjects.length - 1 ? 'border-b border-gray-100 dark:border-dark-700' : ''
                                    }`}
                                  >
                                    <div className="flex items-center gap-3 pl-11">
                                      <FolderOpen size={16} className="text-gray-400 dark:text-dark-400" />
                                      <div>
                                        <p className="font-medium text-gray-900 dark:text-dark-100">{project.name}</p>
                                        <p className="text-sm text-accent-primary dark:text-accent-primary">
                                          {(project.hourlyRate || 0).toFixed(2)} € / {project.rateType === 'daily' ? 'Tag' : 'Stunde'}
                                        </p>
                                      </div>
                                    </div>
                                    <div className="flex gap-1">
                                      {canEdit && (
                                        <IconButton
                                          icon={<Edit2 size={16} />}
                                          onClick={() => openProjectModal(project)}
                                          tooltip="Bearbeiten"
                                        />
                                      )}
                                      {canDelete && (
                                        <IconButton
                                          icon={<Trash2 size={16} />}
                                          onClick={() => handleDeleteProject(project)}
                                          variant="danger"
                                          tooltip="Löschen"
                                        />
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      });
                    })()}
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
                  <div className="flex items-center gap-3">
                    <p className="text-gray-600 dark:text-dark-400">{activities.length} Tätigkeit(en)</p>
                    {userRole === 'viewer' && (
                      <span className="text-xs px-2 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 rounded">Nur Ansicht</span>
                    )}
                  </div>
                  {canEdit && (
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        onClick={() => setTemplateModalOpen(true)}
                        icon={<ListChecks size={20} />}
                      >
                        Aus Vorlage
                      </Button>
                      <Button
                        variant="primary"
                        onClick={() => openActivityModal()}
                        icon={<Plus size={20} />}
                      >
                        Neu erstellen
                      </Button>
                    </div>
                  )}
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
                            {canEdit && (
                              <IconButton
                                icon={<Edit2 size={18} />}
                                onClick={() => openActivityModal(activity)}
                                tooltip="Bearbeiten"
                              />
                            )}
                            {canDelete && (
                              <IconButton
                                icon={<Trash2 size={18} />}
                                onClick={() => handleDeleteActivity(activity)}
                                variant="danger"
                                tooltip="Löschen"
                              />
                            )}
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
          <CompanySettings
            companyName={companyName}
            companyAddress={companyAddress}
            companyCity={companyCity}
            companyZipCode={companyZipCode}
            companyCountry={companyCountry}
            companyEmail={companyEmail}
            companyPhone={companyPhone}
            companyWebsite={companyWebsite}
            companyTaxId={companyTaxId}
            companyCustomerNumber={companyCustomerNumber}
            companyLogo={companyLogo}
            onCompanyNameChange={setCompanyName}
            onCompanyAddressChange={setCompanyAddress}
            onCompanyCityChange={setCompanyCity}
            onCompanyZipCodeChange={setCompanyZipCode}
            onCompanyCountryChange={setCompanyCountry}
            onCompanyEmailChange={setCompanyEmail}
            onCompanyPhoneChange={setCompanyPhone}
            onCompanyWebsiteChange={setCompanyWebsite}
            onCompanyTaxIdChange={setCompanyTaxId}
            onCompanyCustomerNumberChange={setCompanyCustomerNumber}
            onLogoUpload={handleLogoUpload}
            onRemoveLogo={handleRemoveLogo}
            onSave={handleSaveCompanyInfo}
          />
        )}

        {activeTab === 'team' && (
          <TeamProvider>
            <TeamSettings />
          </TeamProvider>
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

        {activeTab === 'ninjarmm' && (
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Header */}
            <div className="bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-200 p-6 shadow-md">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-accent-light dark:bg-accent-lighter/10 rounded-xl">
                  <Server size={28} className="text-accent-primary" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white">NinjaRMM Integration</h2>
                  <p className="text-sm text-gray-500 dark:text-dark-400">
                    Geräte, Organisationen und Alerts synchronisieren
                  </p>
                </div>
              </div>
            </div>

            {/* NinjaRMM Settings Component */}
            <NinjaRMMSettings />
          </div>
        )}

        {activeTab === 'microsoft365' && (
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Microsoft 365 Settings Component */}
            <div className="bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-200 p-6 shadow-md">
              <Microsoft365Settings />
            </div>
          </div>
        )}

        {activeTab === 'ai' && (
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Header */}
            <div className="bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-200 p-6 shadow-md">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-xl">
                  <Bot size={28} className="text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white">KI-Assistent</h2>
                  <p className="text-sm text-gray-500 dark:text-dark-400">
                    Konfiguriere OpenAI oder Anthropic für automatische Lösungsvorschläge
                  </p>
                </div>
              </div>
            </div>

            {/* AI Settings Component */}
            <div className="bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-200 p-6 shadow-md">
              <AISettings />
            </div>
          </div>
        )}

        {/* Data Import Tab */}
        {activeTab === 'import' && (
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Header */}
            <div className="bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-200 p-6 shadow-md">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-accent-lighter dark:bg-accent-primary/30 rounded-xl">
                  <Database size={28} className="text-accent-primary dark:text-accent-primary" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Datenimport</h2>
                  <p className="text-sm text-gray-500 dark:text-dark-400">
                    Importiere Zeiteinträge aus anderen Systemen
                  </p>
                </div>
              </div>
            </div>

            {/* Clockodo Import */}
            <ClockodoImport onImportComplete={onRefreshEntries} />
          </div>
        )}

        {/* Billing tab removed - now in Finanzen section */}

        {activeTab === 'appearance' && (
          <AppearanceSettings
            darkMode={darkMode}
            onToggleDarkMode={onToggleDarkMode}
          />
        )}
        </div>
      </div>

      {/* Customer Modal */}
      <Modal
        isOpen={customerModalOpen}
        onClose={() => {
          setCustomerModalOpen(false);
          setPendingDomain(null); // Clear pending domain when closing
        }}
        title={editingCustomer ? 'Kunde bearbeiten' : 'Neuer Kunde'}
        maxWidth="3xl"
      >
        <div className="space-y-6">
          {/* Hint from Support Inbox navigation */}
          {pendingDomain && !editingCustomer && (
            <div className="bg-accent-light dark:bg-accent-primary/20 border border-accent-primary/30 dark:border-accent-primary/40 rounded-lg p-4">
              <div className="flex gap-3">
                <Globe className="w-5 h-5 text-accent-primary dark:text-accent-primary flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-accent-dark dark:text-accent-primary">
                    Domain @{pendingDomain} zuordnen
                  </p>
                  <p className="text-sm text-accent-primary dark:text-accent-primary mt-1">
                    Nach dem Anlegen des Kunden können Sie die Domain über das <Globe className="w-3.5 h-3.5 inline" />-Symbol in der Kundenliste zuordnen.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Two-column grid for desktop */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left column */}
            <div className="space-y-6">
              {/* Section: Stammdaten */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2 pb-2 border-b border-gray-200 dark:border-dark-border">
                  <span className="text-base">📋</span> Stammdaten
                </h3>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
                    Kundenname *
                  </label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="z.B. Musterfirma GmbH"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-primary bg-white dark:bg-dark-100 text-gray-900 dark:text-white text-sm"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
                    Kundentyp
                  </label>
                  <div className="flex gap-3">
                    <label className={`flex-1 flex items-center justify-center gap-2 cursor-pointer px-3 py-2 rounded-lg border transition-colors ${
                      customerType === 'company'
                        ? 'border-accent-primary bg-accent-light dark:bg-accent-primary/20 text-accent-dark dark:text-accent-primary'
                        : 'border-gray-200 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-200 text-gray-700 dark:text-dark-500'
                    }`}>
                      <input
                        type="radio"
                        name="customerType"
                        checked={customerType === 'company'}
                        onChange={() => setCustomerType('company')}
                        className="sr-only"
                      />
                      <Building className="w-4 h-4" />
                      <span className="text-sm font-medium">Firma</span>
                    </label>
                    <label className={`flex-1 flex items-center justify-center gap-2 cursor-pointer px-3 py-2 rounded-lg border transition-colors ${
                      customerType === 'individual'
                        ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300'
                        : 'border-gray-200 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-200 text-gray-700 dark:text-dark-500'
                    }`}>
                      <input
                        type="radio"
                        name="customerType"
                        checked={customerType === 'individual'}
                        onChange={() => setCustomerType('individual')}
                        className="sr-only"
                      />
                      <UserIcon className="w-4 h-4" />
                      <span className="text-sm font-medium">Privatperson</span>
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
                      Kundennummer
                    </label>
                    <input
                      type="text"
                      value={customerNumber}
                      onChange={(e) => setCustomerNumber(e.target.value)}
                      placeholder="z.B. K-12345"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-primary bg-white dark:bg-dark-100 text-gray-900 dark:text-white text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
                      Ansprechpartner
                    </label>
                    <input
                      type="text"
                      value={customerContactPerson}
                      onChange={(e) => setCustomerContactPerson(e.target.value)}
                      placeholder="Max Mustermann"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-primary bg-white dark:bg-dark-100 text-gray-900 dark:text-white text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
                    E-Mail
                  </label>
                  <input
                    type="email"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    placeholder="kontakt@musterfirma.de"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-primary bg-white dark:bg-dark-100 text-gray-900 dark:text-white text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
                    Adresse
                  </label>
                  <textarea
                    value={customerAddress}
                    onChange={(e) => setCustomerAddress(e.target.value)}
                    placeholder="Musterstraße 123&#10;12345 Musterstadt"
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-primary bg-white dark:bg-dark-100 text-gray-900 dark:text-white text-sm resize-none"
                  />
                </div>
              </div>

              {/* Section: Darstellung */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2 pb-2 border-b border-gray-200 dark:border-dark-border">
                  <span className="text-base">🎨</span> Darstellung
                </h3>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
                    Farbe
                  </label>
                  <div className="grid grid-cols-5 gap-2">
                    {COLORS.map(color => (
                      <button
                        key={color}
                        onClick={() => setCustomerColor(color)}
                        className={`w-full h-8 rounded-lg transition-all ${
                          customerColor === color ? 'ring-2 ring-gray-900 dark:ring-white ring-offset-2 scale-105' : 'hover:scale-105'
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
                    Anzeigename (für PDF)
                  </label>
                  <input
                    type="text"
                    value={customerDisplayName}
                    onChange={(e) => setCustomerDisplayName(e.target.value)}
                    placeholder="z.B. IHE (statt langer Firmenname)"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-primary bg-white dark:bg-dark-100 text-gray-900 dark:text-white text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Right column */}
            <div className="space-y-6">
              {/* Section: PDF-Export */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2 pb-2 border-b border-gray-200 dark:border-dark-border">
                  <span className="text-base">📄</span> PDF-Export
                </h3>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
                    Report-Titel
                  </label>
                  <input
                    type="text"
                    value={customerReportTitle}
                    onChange={(e) => setCustomerReportTitle(e.target.value)}
                    placeholder="z.B. Stundenzettel, Tätigkeitsnachweis"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-primary bg-white dark:bg-dark-100 text-gray-900 dark:text-white text-sm"
                  />
                  <p className="text-xs text-gray-500 dark:text-dark-400 mt-1">
                    Standard: "Stundenbericht"
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
                    Import-Aliase
                  </label>
                  <input
                    type="text"
                    value={customerImportAliases}
                    onChange={(e) => setCustomerImportAliases(e.target.value)}
                    placeholder="z.B. IHE, IHE GmbH, IHE Planung"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-primary bg-white dark:bg-dark-100 text-gray-900 dark:text-white text-sm"
                  />
                  <p className="text-xs text-gray-500 dark:text-dark-400 mt-1">
                    Komma-getrennte Namen für CSV-Import
                  </p>
                </div>

                {/* Default Project - only show when editing existing customer */}
                {editingCustomer && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
                      Standard-Projekt
                    </label>
                    <select
                      value={customerDefaultProjectId}
                      onChange={(e) => setCustomerDefaultProjectId(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-primary bg-white dark:bg-dark-100 text-gray-900 dark:text-white text-sm"
                    >
                      <option value="">— Kein Standard-Projekt —</option>
                      {projects
                        .filter(p => p.customerId === editingCustomer.id)
                        .map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))
                      }
                    </select>
                    <p className="text-xs text-gray-500 dark:text-dark-400 mt-1">
                      Fallback-Projekt für Import ohne Projektzuordnung
                    </p>
                  </div>
                )}
              </div>

              {/* Section: Abrechnung - only show if billing is enabled */}
              {billingEnabled && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2 pb-2 border-b border-gray-200 dark:border-dark-border">
                    <span className="text-base">💰</span> Abrechnung
                  </h3>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
                        Stundensatz (€)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={customerHourlyRate}
                        onChange={(e) => setCustomerHourlyRate(e.target.value)}
                        placeholder="95.00"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-primary bg-white dark:bg-dark-100 text-gray-900 dark:text-white text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
                        Zahlungsziel (Tage)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="365"
                        value={customerPaymentTermsDays}
                        onChange={(e) => setCustomerPaymentTermsDays(e.target.value)}
                        placeholder="14"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-primary bg-white dark:bg-dark-100 text-gray-900 dark:text-white text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
                      Zeitaufrundung
                    </label>
                    <select
                      value={customerTimeRoundingInterval}
                      onChange={(e) => setCustomerTimeRoundingInterval(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-primary bg-white dark:bg-dark-100 text-gray-900 dark:text-white text-sm"
                    >
                      <option value="1">1 Min. (keine Rundung)</option>
                      <option value="5">5 Minuten</option>
                      <option value="6">6 Min. (0,1h)</option>
                      <option value="10">10 Minuten</option>
                      <option value="15">15 Min. (0,25h)</option>
                      <option value="30">30 Min. (0,5h)</option>
                      <option value="60">60 Min. (1h)</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Section: Integrationen */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2 pb-2 border-b border-gray-200 dark:border-dark-border">
                  <span className="text-base">🔗</span> Integrationen
                </h3>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
                    NinjaRMM Organisation ID
                  </label>
                  <input
                    type="text"
                    value={customerNinjarmmOrgId}
                    onChange={(e) => setCustomerNinjarmmOrgId(e.target.value)}
                    placeholder="z.B. org-12345"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-primary bg-white dark:bg-dark-100 text-gray-900 dark:text-white text-sm"
                  />
                </div>
              </div>

              {/* Section: sevdesk-Rechnungs-Zusatztext (only shown when editing
                  an existing customer because we need to load contracts) */}
              {editingCustomer && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2 pb-2 border-b border-gray-200 dark:border-dark-border">
                    <span className="text-base">📄</span> Rechnungs-Zusatztext (sevdesk)
                  </h3>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
                      Standard-Vertrag
                    </label>
                    <select
                      value={customerDefaultContractId}
                      onChange={(e) => setCustomerDefaultContractId(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-primary bg-white dark:bg-dark-100 text-gray-900 dark:text-white text-sm"
                    >
                      <option value="">— Kein Vertrag —</option>
                      {customerContracts.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.contractNumber} · {c.name}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-500 dark:text-dark-400 mt-1">
                      Quelle für die Platzhalter <code>{'{contractNumber}'}</code> und <code>{'{contractTitle}'}</code>.
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
                      Zusatztext pro Position
                    </label>
                    <textarea
                      value={customerSevdeskPositionTemplate}
                      onChange={(e) => setCustomerSevdeskPositionTemplate(e.target.value)}
                      rows={6}
                      placeholder={'Abrechnung erfolgt nach tatsächlichem Aufwand gemäß Vertrag\nNr. {contractNumber}\n\nsiehe {reportFilename}'}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-primary bg-white dark:bg-dark-100 text-gray-900 dark:text-white text-sm font-mono"
                    />
                    <div className="text-xs text-gray-500 dark:text-dark-400 mt-1 space-y-1">
                      <p>Wird unter jeder Position auf der Rechnung in sevdesk ergänzt.</p>
                      <p>
                        Platzhalter:{' '}
                        <code>{'{contractNumber}'}</code>,{' '}
                        <code>{'{contractTitle}'}</code>,{' '}
                        <code>{'{customerName}'}</code>,{' '}
                        <code>{'{projectName}'}</code>,{' '}
                        <code>{'{periodLabel}'}</code>,{' '}
                        <code>{'{periodMonth}'}</code>,{' '}
                        <code>{'{periodYear}'}</code>,{' '}
                        <code>{'{reportFilename}'}</code>
                      </p>
                      <p>Unbekannte Platzhalter bleiben als Text erhalten — Tippfehler werden sofort sichtbar.</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Buttons - full width */}
          <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-dark-border">
            <Button
              variant="secondary"
              onClick={() => setCustomerModalOpen(false)}
              fullWidth
            >
              Abbrechen
            </Button>
            <Button
              variant="primary"
              onClick={handleSaveCustomer}
              disabled={!customerName.trim()}
              fullWidth
            >
              Speichern
            </Button>
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
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-primary"
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
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-primary"
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
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-primary"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              variant="secondary"
              onClick={() => setProjectModalOpen(false)}
              fullWidth
            >
              Abbrechen
            </Button>
            <Button
              variant="primary"
              onClick={handleSaveProject}
              disabled={!projectName.trim() || !projectCustomerId || !projectHourlyRate}
              fullWidth
            >
              Speichern
            </Button>
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
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-primary"
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
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-primary resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-3">
              Abrechnungsart *
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setActivityPricingType('hourly')}
                className={`p-3 rounded-lg border-2 transition-all text-center ${
                  activityPricingType === 'hourly'
                    ? 'border-accent-primary bg-accent-light dark:bg-accent-lighter/10 text-accent-primary font-semibold'
                    : 'border-gray-300 dark:border-dark-border hover:border-gray-400 text-gray-700 dark:text-dark-500'
                }`}
              >
                <div className="text-sm font-medium">Stundenabrechnung</div>
                <div className="text-xs text-gray-500 dark:text-dark-400 mt-1">Nach Projektsatz</div>
              </button>
              <button
                type="button"
                onClick={() => setActivityPricingType('flat')}
                className={`p-3 rounded-lg border-2 transition-all text-center ${
                  activityPricingType === 'flat'
                    ? 'border-accent-primary bg-accent-light dark:bg-accent-lighter/10 text-accent-primary font-semibold'
                    : 'border-gray-300 dark:border-dark-border hover:border-gray-400 text-gray-700 dark:text-dark-500'
                }`}
              >
                <div className="text-sm font-medium">Pauschalpreis</div>
                <div className="text-xs text-gray-500 dark:text-dark-400 mt-1">Fester Betrag</div>
              </button>
            </div>
          </div>

          {activityPricingType === 'flat' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">
                Pauschalbetrag * (€)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={activityFlatRate}
                onChange={(e) => setActivityFlatRate(e.target.value)}
                placeholder="z.B. 2500"
                className="w-full px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-primary dark:bg-dark-200 dark:text-white"
              />
              <p className="text-xs text-gray-500 dark:text-dark-400 mt-1">
                💡 Dieser Betrag wird unabhängig von der erfassten Zeit abgerechnet
              </p>
            </div>
          )}

          <div className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-dark-100 rounded-lg">
            <input
              type="checkbox"
              id="activity-billable"
              checked={activityIsBillable}
              onChange={(e) => setActivityIsBillable(e.target.checked)}
              className="w-4 h-4 text-accent-primary border-gray-300 rounded focus:ring-2 focus:ring-accent-primary"
            />
            <label htmlFor="activity-billable" className="flex-1 text-sm font-medium text-gray-700 dark:text-dark-500 cursor-pointer">
              Abrechenbar
              <span className="block text-xs text-gray-500 dark:text-dark-400 mt-1">
                Nicht abrechenbare Tätigkeiten werden nicht in Reports berücksichtigt
              </span>
            </label>
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              variant="secondary"
              onClick={() => setActivityModalOpen(false)}
              fullWidth
            >
              Abbrechen
            </Button>
            <Button
              variant="primary"
              onClick={handleSaveActivity}
              disabled={!activityName.trim()}
              fullWidth
            >
              Speichern
            </Button>
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
          <p className="text-base text-gray-700 dark:text-dark-500">
            Wähle eine vorgefertigte Tätigkeit aus und passe sie nach Bedarf an.
          </p>

          <div className="space-y-5 max-h-[60vh] overflow-y-auto pr-2">
            {Object.entries(getTemplatesByCategory()).map(([category, templates]) => (
              <div key={category}>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-3 pb-2 border-b-2 border-gray-200 dark:border-dark-border">
                  {category}
                </h3>
                <div className="space-y-2">
                  {templates.map((template, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleUseTemplate(template)}
                      className="w-full text-left p-4 rounded-lg border-2 border-gray-300 dark:border-dark-border bg-white dark:bg-dark-100 hover:border-accent-primary dark:hover:border-accent-primary hover:bg-accent-light dark:hover:bg-accent-primary/30 transition-all group shadow-sm hover:shadow-md"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-base font-semibold text-gray-900 dark:text-white group-hover:text-accent-primary dark:group-hover:text-accent-primary mb-1">
                            {template.name}
                          </p>
                          <p className="text-sm text-gray-600 dark:text-dark-400 group-hover:text-gray-700 dark:group-hover:text-dark-500">
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

          <div className="flex justify-end pt-4 border-t-2 border-gray-200 dark:border-dark-border">
            <Button
              variant="secondary"
              onClick={() => setTemplateModalOpen(false)}
            >
              Abbrechen
            </Button>
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
          <p className="text-sm text-gray-700 dark:text-dark-500">
            Ordne die Spalten aus deiner CSV-Datei den entsprechenden Feldern zu.
            Vorschläge wurden automatisch erkannt. Du kannst diese anpassen oder Spalten ignorieren.
          </p>

          {csvPreviewData && (
            <>
              {/* Column Mapping Table */}
              <div className="border border-gray-300 dark:border-dark-border rounded-lg overflow-hidden">
                <div className="max-h-[400px] overflow-y-auto">
                  <table className="min-w-full divide-y divide-gray-300 dark:divide-dark-border">
                    <thead className="bg-gray-50 dark:bg-dark-100 sticky top-0">
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
                    <tbody className="bg-white dark:bg-dark-50 divide-y divide-gray-200 dark:divide-dark-border">
                      {csvPreviewData.headers.map((header, idx) => (
                        <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-dark-100">
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
                              className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-dark-border rounded-md bg-white dark:bg-dark-100 text-gray-900 dark:text-white focus:ring-2 focus:ring-accent-primary"
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
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-dark-400">
                            <div className="max-w-xs truncate">
                              {csvPreviewData.rows[0]?.[header] || <span className="text-gray-400 dark:text-dark-400 italic">leer</span>}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Preview Section */}
              <div className="bg-accent-light dark:bg-accent-primary/20 border border-accent-primary/30 dark:border-accent-primary/40 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-accent-dark dark:text-accent-primary mb-2">
                  Datenvorschau ({csvPreviewData.allData.length} Zeilen)
                </h4>
                <div className="text-xs text-accent-dark dark:text-accent-primary space-y-1">
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
                        {email && <span className="text-accent-primary dark:text-accent-primary">• {email}</span>}
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
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-dark-border">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setMappingModalOpen(false);
                    setCsvPreviewData(null);
                    setColumnMappings({});
                  }}
                >
                  Abbrechen
                </Button>
                <Button
                  variant="primary"
                  onClick={processImportWithMappings}
                  disabled={!Object.values(columnMappings).includes('name')}
                >
                  {csvPreviewData.allData.length} {csvPreviewData.allData.length === 1 ? 'Kunde' : 'Kunden'} importieren
                </Button>
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
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">
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
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">
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
            <Button
              variant="primary"
              onClick={handleSaveProfile}
              disabled={!!profileSuccess}
              icon={<Save size={18} />}
              fullWidth
            >
              Speichern
            </Button>
            <Button
              variant="secondary"
              onClick={() => setEditProfileOpen(false)}
            >
              Abbrechen
            </Button>
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
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">
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
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">
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
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">
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
            <Button
              variant="primary"
              onClick={handleChangePassword}
              disabled={!!passwordSuccess}
              icon={<Key size={18} />}
              fullWidth
            >
              Passwort ändern
            </Button>
            <Button
              variant="secondary"
              onClick={() => setChangePasswordOpen(false)}
            >
              Abbrechen
            </Button>
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

      {/* GDPR Account-Deletion – Step 1: First warning */}
      <ConfirmDialog
        isOpen={gdprDeleteStep === 1}
        onClose={() => setGdprDeleteStep(0)}
        onConfirm={() => setGdprDeleteStep(2)}
        title="Account unwiderruflich löschen?"
        message={`⚠️ Diese Aktion kann NICHT rückgängig gemacht werden!\n\nFolgende Daten werden gelöscht:\n\u2022 Dein Account\n\u2022 Alle Zeiterfassungen\n\u2022 Kunden & Projekte\n\u2022 Firmeninformationen\n\nMöchtest du wirklich fortfahren?`}
        confirmText="Ja, weiter"
        cancelText="Abbrechen"
        variant="danger"
      />

      {/* GDPR Account-Deletion – Step 2: Double-confirm */}
      <ConfirmDialog
        isOpen={gdprDeleteStep === 2}
        onClose={() => setGdprDeleteStep(0)}
        onConfirm={async () => {
          setGdprDeleteStep(0);
          if (!currentUser) return;
          try {
            await gdprService.deleteUserData(currentUser.id);
            window.location.reload();
          } catch {
            // Error is silently swallowed; user sees nothing change
          }
        }}
        title="Letzte Bestätigung"
        message={`Bitte bestätige ein letztes Mal: Du möchtest den Account "${currentUser?.username}" und alle zugehörigen Daten dauerhaft löschen.`}
        confirmText="Account endgültig löschen"
        cancelText="Abbrechen"
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

      {/* Customer Email Domains Modal */}
      {emailDomainsCustomer && (
        <CustomerEmailDomains
          isOpen={!!emailDomainsCustomer}
          customer={emailDomainsCustomer}
          onClose={() => setEmailDomainsCustomer(null)}
        />
      )}

      {/* sevDesk Customer Link Modal */}
      {sevdeskLinkCustomer && (
        <CustomerSevdeskLink
          isOpen={!!sevdeskLinkCustomer}
          customer={sevdeskLinkCustomer}
          onClose={() => setSevdeskLinkCustomer(null)}
          onLinked={() => {
            // Reload customers to get updated sevdeskCustomerId
            // This will trigger a refresh in the parent component
            window.location.reload();
          }}
        />
      )}

      {/* NinjaRMM Customer Link Modal */}
      {ninjaRMMLinkCustomer && (
        <CustomerNinjaRMMLink
          isOpen={!!ninjaRMMLinkCustomer}
          customer={ninjaRMMLinkCustomer}
          onClose={() => setNinjaRMMLinkCustomer(null)}
          onLinked={() => {
            // Reload customers to get updated ninjarmmOrganizationId
            window.location.reload();
          }}
        />
      )}

      {/* Customer Detail Modal (CRM) */}
      {detailCustomer && (
        <CustomerDetailModal
          isOpen={!!detailCustomer}
          customer={detailCustomer}
          projects={projects}
          onClose={() => setDetailCustomer(null)}
          onEdit={() => {
            openCustomerModal(detailCustomer);
            setDetailCustomer(null);
          }}
        />
      )}
    </div>
  );
};
