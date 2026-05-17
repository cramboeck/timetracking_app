import {
  BarChart3,
  TrendingUp,
  Users,
} from 'lucide-react';
import { useSocialMedia } from '../../context';
import type { InsightsTab } from '../../types';
import AnalyticsTab from './AnalyticsTab';
import TrendsTab from './TrendsTab';
import CompetitorsTab from './CompetitorsTab';

const tabs: { id: InsightsTab; label: string; icon: React.ReactNode }[] = [
  { id: 'analytics', label: 'Analytics', icon: <BarChart3 size={18} /> },
  { id: 'trends', label: 'Trends', icon: <TrendingUp size={18} /> },
  { id: 'competitors', label: 'Wettbewerber', icon: <Users size={18} /> },
];

export default function InsightsPage() {
  const { insightsTab, setInsightsTab } = useSocialMedia();

  const renderContent = () => {
    switch (insightsTab) {
      case 'analytics':
        return <AnalyticsTab />;
      case 'trends':
        return <TrendsTab />;
      case 'competitors':
        return <CompetitorsTab />;
      default:
        return <AnalyticsTab />;
    }
  };

  return (
    <div className="space-y-4">
      {/* Tab Navigation */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setInsightsTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${
              insightsTab === tab.id
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
