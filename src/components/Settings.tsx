import { useState } from 'react';
import { Plus, Edit2, Trash2, Users, FolderOpen } from 'lucide-react';
import { Customer, Project } from '../types';
import { Modal } from './Modal';
import { ConfirmDialog } from './ConfirmDialog';

interface SettingsProps {
  customers: Customer[];
  projects: Project[];
  onAddCustomer: (customer: Customer) => void;
  onUpdateCustomer: (id: string, updates: Partial<Customer>) => void;
  onDeleteCustomer: (id: string) => void;
  onAddProject: (project: Project) => void;
  onUpdateProject: (id: string, updates: Partial<Project>) => void;
  onDeleteProject: (id: string) => void;
}

const COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16'
];

export const Settings = ({
  customers,
  projects,
  onAddCustomer,
  onUpdateCustomer,
  onDeleteCustomer,
  onAddProject,
  onUpdateProject,
  onDeleteProject
}: SettingsProps) => {
  const [activeTab, setActiveTab] = useState<'customers' | 'projects'>('customers');

  // Customer Modal
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerColor, setCustomerColor] = useState(COLORS[0]);

  // Project Modal
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [projectName, setProjectName] = useState('');
  const [projectCustomerId, setProjectCustomerId] = useState('');
  const [projectHourlyRate, setProjectHourlyRate] = useState('');

  // Delete Confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    type: 'customer' | 'project' | null;
    id: string;
    name: string;
  }>({ isOpen: false, type: null, id: '', name: '' });

  const openCustomerModal = (customer?: Customer) => {
    if (customer) {
      setEditingCustomer(customer);
      setCustomerName(customer.name);
      setCustomerColor(customer.color);
    } else {
      setEditingCustomer(null);
      setCustomerName('');
      setCustomerColor(COLORS[0]);
    }
    setCustomerModalOpen(true);
  };

  const handleSaveCustomer = () => {
    if (!customerName.trim()) return;

    if (editingCustomer) {
      onUpdateCustomer(editingCustomer.id, {
        name: customerName.trim(),
        color: customerColor
      });
    } else {
      onAddCustomer({
        id: crypto.randomUUID(),
        name: customerName.trim(),
        color: customerColor,
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
        name: projectName.trim(),
        customerId: projectCustomerId,
        hourlyRate: parseFloat(projectHourlyRate),
        isActive: true,
        createdAt: new Date().toISOString()
      });
    }

    setProjectModalOpen(false);
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

  const confirmDelete = () => {
    if (deleteConfirm.type === 'customer') {
      onDeleteCustomer(deleteConfirm.id);
    } else if (deleteConfirm.type === 'project') {
      onDeleteProject(deleteConfirm.id);
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

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        onClose={() => setDeleteConfirm({ isOpen: false, type: null, id: '', name: '' })}
        onConfirm={confirmDelete}
        title={`${deleteConfirm.type === 'customer' ? 'Kunde' : 'Projekt'} löschen?`}
        message={`Möchtest du "${deleteConfirm.name}" wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`}
        confirmText="Löschen"
        variant="danger"
      />
    </div>
  );
};
