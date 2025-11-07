import { useState } from 'react';
import { Plus, Edit2, Trash2, Users, FolderOpen, Palette, ListChecks, LogOut } from 'lucide-react';
import { Customer, Project, Activity } from '../types';
import { Modal } from './Modal';
import { ConfirmDialog } from './ConfirmDialog';
import { useAuth } from '../contexts/AuthContext';

interface SettingsProps {
  customers: Customer[];
  projects: Project[];
  activities: Activity[];
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
  const { currentUser, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<'customers' | 'projects' | 'activities' | 'appearance'>('customers');

  // Customer Modal
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerColor, setCustomerColor] = useState(COLORS[0]);
  const [customerNumber, setCustomerNumber] = useState('');
  const [customerContactPerson, setCustomerContactPerson] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');

  // Project Modal
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [projectName, setProjectName] = useState('');
  const [projectCustomerId, setProjectCustomerId] = useState('');
  const [projectHourlyRate, setProjectHourlyRate] = useState('');

  // Activity Modal
  const [activityModalOpen, setActivityModalOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [activityName, setActivityName] = useState('');
  const [activityDescription, setActivityDescription] = useState('');

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
    } else {
      setEditingCustomer(null);
      setCustomerName('');
      setCustomerColor(COLORS[0]);
      setCustomerNumber('');
      setCustomerContactPerson('');
      setCustomerEmail('');
      setCustomerAddress('');
    }
    setCustomerModalOpen(true);
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
        address: customerAddress.trim() || undefined
      });
    } else {
      onAddCustomer({
        id: crypto.randomUUID(),
        userId: currentUser!.id,
        name: customerName.trim(),
        color: customerColor,
        customerNumber: customerNumber.trim() || undefined,
        contactPerson: customerContactPerson.trim() || undefined,
        email: customerEmail.trim() || undefined,
        address: customerAddress.trim() || undefined,
        createdAt: new Date().toISOString()
      });
    }

    setCustomerModalOpen(false);
  };

  const openProjectModal = (project?: Project) => {
    if (project) {
      setEditingProject(project);
      setProjectName(project.name);
      setProjectCustomerId(project.customerId);
      setProjectHourlyRate(project.hourlyRate.toString());
    } else {
      setEditingProject(null);
      setProjectName('');
      setProjectCustomerId(customers[0]?.id || '');
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
        hourlyRate: parseFloat(projectHourlyRate)
      });
    } else {
      onAddProject({
        id: crypto.randomUUID(),
        userId: currentUser!.id,
        name: projectName.trim(),
        customerId: projectCustomerId,
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
    } else {
      setEditingActivity(null);
      setActivityName('');
      setActivityDescription('');
    }
    setActivityModalOpen(true);
  };

  const handleSaveActivity = () => {
    if (!activityName.trim()) return;

    if (editingActivity) {
      onUpdateActivity(editingActivity.id, {
        name: activityName.trim(),
        description: activityDescription.trim() || undefined
      });
    } else {
      onAddActivity({
        id: crypto.randomUUID(),
        userId: currentUser!.id,
        name: activityName.trim(),
        description: activityDescription.trim() || undefined,
        createdAt: new Date().toISOString()
      });
    }

    setActivityModalOpen(false);
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

  const getCustomerById = (id: string) => customers.find(c => c.id === id);

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <h1 className="text-2xl font-bold">Einstellungen</h1>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 px-6">
        <div className="flex gap-4">
          <button
            onClick={() => setActiveTab('customers')}
            className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
              activeTab === 'customers'
                ? 'border-blue-600 text-blue-600 font-semibold'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            <Users size={20} />
            Kunden
          </button>
          <button
            onClick={() => setActiveTab('projects')}
            className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
              activeTab === 'projects'
                ? 'border-blue-600 text-blue-600 font-semibold'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            <FolderOpen size={20} />
            Projekte
          </button>
          <button
            onClick={() => setActiveTab('activities')}
            className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
              activeTab === 'activities'
                ? 'border-blue-600 text-blue-600 font-semibold'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            <ListChecks size={20} />
            Tätigkeiten
          </button>
          <button
            onClick={() => setActiveTab('appearance')}
            className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
              activeTab === 'appearance'
                ? 'border-blue-600 text-blue-600 font-semibold'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            <Palette size={20} />
            Darstellung
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'customers' && (
          <div className="max-w-4xl mx-auto">
            <div className="flex justify-between items-center mb-6">
              <p className="text-gray-600">{customers.length} Kunde(n)</p>
              <button
                onClick={() => openCustomerModal()}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus size={20} />
                Kunde hinzufügen
              </button>
            </div>

            {customers.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <Users size={48} className="mx-auto mb-4 opacity-50" />
                <p>Noch keine Kunden vorhanden</p>
                <p className="text-sm mt-2">Füge deinen ersten Kunden hinzu</p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {customers.map(customer => (
                  <div
                    key={customer.id}
                    className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3 flex-1">
                        <div
                          className="w-10 h-10 rounded-lg flex-shrink-0"
                          style={{ backgroundColor: customer.color }}
                        />
                        <div className="min-w-0">
                          <h3 className="font-semibold text-gray-900 truncate">{customer.name}</h3>
                          <p className="text-sm text-gray-500">
                            {projects.filter(p => p.customerId === customer.id).length} Projekt(e)
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => openCustomerModal(customer)}
                          className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button
                          onClick={() => handleDeleteCustomer(customer)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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
        )}

        {activeTab === 'projects' && (
          <div className="max-w-4xl mx-auto">
            <div className="flex justify-between items-center mb-6">
              <p className="text-gray-600">{projects.length} Projekt(e)</p>
              <button
                onClick={() => openProjectModal()}
                disabled={customers.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                <Plus size={20} />
                Projekt hinzufügen
              </button>
            </div>

            {customers.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
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
                              {project.hourlyRate.toFixed(2)} € / Stunde
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
        )}

        {activeTab === 'activities' && (
          <div className="max-w-4xl mx-auto">
            <div className="flex justify-between items-center mb-6">
              <p className="text-gray-600">{activities.length} Tätigkeit(en)</p>
              <button
                onClick={() => openActivityModal()}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus size={20} />
                Tätigkeit hinzufügen
              </button>
            </div>

            {activities.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <ListChecks size={48} className="mx-auto mb-4 opacity-50" />
                <p>Noch keine Tätigkeiten vorhanden</p>
                <p className="text-sm mt-2">Füge vorgefertigte Tätigkeiten hinzu (z.B. "Meeting", "Entwicklung", "Beratung")</p>
              </div>
            ) : (
              <div className="space-y-4">
                {activities.map(activity => (
                  <div
                    key={activity.id}
                    className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900">{activity.name}</h3>
                        {activity.description && (
                          <p className="text-sm text-gray-500 mt-1">{activity.description}</p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => openActivityModal(activity)}
                          className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Bearbeiten"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button
                          onClick={() => handleDeleteActivity(activity)}
                          className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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
        )}

        {activeTab === 'appearance' && (
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Account Info */}
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Account</h2>

              <div className="space-y-3">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Benutzername</p>
                  <p className="font-medium text-gray-900 dark:text-white">{currentUser?.username}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">E-Mail</p>
                  <p className="font-medium text-gray-900 dark:text-white">{currentUser?.email}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Mitglied seit</p>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {currentUser?.createdAt && new Date(currentUser.createdAt).toLocaleDateString('de-DE')}
                  </p>
                </div>
              </div>

              <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={logout}
                  className="flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors font-medium"
                >
                  <LogOut size={18} />
                  Abmelden
                </button>
              </div>
            </div>

            {/* Appearance Settings */}
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Design & Aussehen</h2>

              <div className="space-y-4">
                <div className="flex items-center justify-between py-3">
                  <div>
                    <h3 className="font-medium text-gray-900 dark:text-white">Dark Mode</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      Dunkles Farbschema für bessere Lesbarkeit bei Nacht
                    </p>
                  </div>
                  <button
                    onClick={onToggleDarkMode}
                    className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                      darkMode ? 'bg-blue-600' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                        darkMode ? 'translate-x-7' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
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
              Stundensatz (€) *
            </label>
            <input
              type="number"
              value={projectHourlyRate}
              onChange={(e) => setProjectHourlyRate(e.target.value)}
              placeholder="z.B. 85.00"
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
    </div>
  );
};
