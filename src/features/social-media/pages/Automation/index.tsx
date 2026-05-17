import {
  Zap,
  MessageCircle,
} from 'lucide-react';
import { useSocialMedia } from '../../context';
import type { AutomationTab } from '../../types';
import AutopilotTab from './AutopilotTab';
import EngagementBotTab from './EngagementBotTab';

const tabs: { id: AutomationTab; label: string; icon: React.ReactNode }[] = [
  { id: 'autopilot', label: 'Content Autopilot', icon: <Zap size={18} /> },
  { id: 'engagement-bot', label: 'Engagement Bot', icon: <MessageCircle size={18} /> },
];

export default function AutomationPage() {
  const { automationTab, setAutomationTab } = useSocialMedia();

  const renderContent = () => {
    switch (automationTab) {
      case 'autopilot':
        return <AutopilotTab />;
      case 'engagement-bot':
        return <EngagementBotTab />;
      default:
        return <AutopilotTab />;
    }
  };

  return (
    <div className="space-y-4">
      {/* Tab Navigation */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setAutomationTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${
              automationTab === tab.id
                ? 'bg-pink-600 text-white'
                : 'bg-white dark:bg-dark-100 text-gray-700 dark:text-dark-500 hover:bg-gray-100 dark:hover:bg-dark-200 border border-gray-200 dark:border-dark-border'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {renderContent()}
    </div>
  );
}
