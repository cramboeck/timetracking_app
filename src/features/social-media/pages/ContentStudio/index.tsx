import {
  Edit,
  Wand2,
  Layers,
  LayoutGrid,
  Film,
} from 'lucide-react';
import { useSocialMedia } from '../../context';
import type { ContentStudioTab } from '../../types';
import PostEditor from './PostEditor';
import ContentWizard from './ContentWizard';
import BatchGenerator from './BatchGenerator';

const tabs: { id: ContentStudioTab; label: string; icon: React.ReactNode }[] = [
  { id: 'editor', label: 'Post Editor', icon: <Edit size={18} /> },
  { id: 'wizard', label: 'Content Wizard', icon: <Wand2 size={18} /> },
  { id: 'batch', label: 'Batch Generator', icon: <Layers size={18} /> },
  { id: 'carousel', label: 'Carousel', icon: <LayoutGrid size={18} /> },
  { id: 'stories', label: 'Stories', icon: <Film size={18} /> },
];

export default function ContentStudioPage() {
  const { contentStudioTab, setContentStudioTab } = useSocialMedia();

  const renderContent = () => {
    switch (contentStudioTab) {
      case 'editor':
        return <PostEditor />;
      case 'wizard':
        return <ContentWizard />;
      case 'batch':
        return <BatchGenerator />;
      case 'carousel':
        return (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-400 dark:text-gray-500">
            <LayoutGrid size={48} className="opacity-40" />
            <h3 className="text-lg font-semibold text-gray-600 dark:text-gray-400">Carousel Creator</h3>
            <p className="text-sm text-center max-w-xs">Dieser Bereich befindet sich in Entwicklung und wird in Kürze verfügbar sein.</p>
          </div>
        );
      case 'stories':
        return (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-400 dark:text-gray-500">
            <Film size={48} className="opacity-40" />
            <h3 className="text-lg font-semibold text-gray-600 dark:text-gray-400">Story Creator</h3>
            <p className="text-sm text-center max-w-xs">Dieser Bereich befindet sich in Entwicklung und wird in Kürze verfügbar sein.</p>
          </div>
        );
      default:
        return <PostEditor />;
    }
  };

  return (
    <div className="space-y-4">
      {/* Tab Navigation */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setContentStudioTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${
              contentStudioTab === tab.id
                ? 'bg-pink-600 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700'
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
