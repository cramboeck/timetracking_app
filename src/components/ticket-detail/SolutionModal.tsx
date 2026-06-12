import { Lightbulb, CheckSquare } from 'lucide-react';
import { Button } from '../ui/Button';
import { TicketResolutionType, resolutionTypeConfig } from './types';

interface SolutionModalProps {
  isOpen: boolean;
  solutionText: string;
  resolutionType: TicketResolutionType;
  saving: boolean;
  onSolutionTextChange: (value: string) => void;
  onResolutionTypeChange: (value: TicketResolutionType) => void;
  onSave: () => void;
  onClose: () => void;
}

export const SolutionModal = ({
  isOpen,
  solutionText,
  resolutionType,
  saving,
  onSolutionTextChange,
  onResolutionTypeChange,
  onSave,
  onClose,
}: SolutionModalProps) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-dark-100 rounded-lg shadow-xl max-w-lg w-full">
        <div className="p-4 border-b border-gray-200 dark:border-dark-border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <Lightbulb className="text-green-600 dark:text-green-400" size={20} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Ticket schliessen
              </h3>
              <p className="text-sm text-gray-500 dark:text-dark-400">
                Bitte dokumentiere die Losung fur dieses Ticket
              </p>
            </div>
          </div>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">
              Losungstyp *
            </label>
            <select
              value={resolutionType}
              onChange={(e) => onResolutionTypeChange(e.target.value as TicketResolutionType)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-200 text-gray-900 dark:text-white"
            >
              {Object.entries(resolutionTypeConfig).map(([key, { label, description }]) => (
                <option key={key} value={key}>
                  {label} - {description}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">
              Losung / Beschreibung *
            </label>
            <textarea
              value={solutionText}
              onChange={(e) => onSolutionTextChange(e.target.value)}
              rows={5}
              placeholder="Beschreibe, wie das Problem gelost wurde oder warum es geschlossen wird..."
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-100 text-gray-900 dark:text-white resize-none"
            />
          </div>
        </div>
        <div className="p-4 border-t border-gray-200 dark:border-dark-border flex justify-end gap-3">
          <Button
            onClick={onClose}
            variant="secondary"
          >
            Abbrechen
          </Button>
          <Button
            onClick={onSave}
            disabled={!solutionText.trim() || saving}
            variant="primary"
            loading={saving}
            icon={<CheckSquare size={16} />}
          >
            Ticket schliessen
          </Button>
        </div>
      </div>
    </div>
  );
};
