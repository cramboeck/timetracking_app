import {
  FileText,
  RefreshCw,
  BookMarked,
  Hash,
} from 'lucide-react';
import { useSocialMedia } from '../../context';
import type { LibraryTab } from '../../types';
import PostsTab from './PostsTab';
import TemplatesTab from './TemplatesTab';
import HashtagsTab from './HashtagsTab';

const tabs: { id: LibraryTab; label: string; icon: React.ReactNode }[] = [
  { id: 'posts', label: 'Posts', icon: <FileText size={18} /> },
  { id: 'evergreen', label: 'Evergreen', icon: <RefreshCw size={18} /> },
  { id: 'templates', label: 'Vorlagen', icon: <BookMarked size={18} /> },
  { id: 'hashtags', label: 'Hashtag-Gruppen', icon: <Hash size={18} /> },
];

export default function LibraryPage() {
  const { libraryTab, setLibraryTab } = useSocialMedia();

  const renderContent = () => {
    switch (libraryTab) {
      case 'posts':
        return <PostsTab />;
      case 'evergreen':
        return (
          <div className="flex items-center justify-center py-20 text-gray-500 dark:text-dark-400">
            <div className="text-center">
              <RefreshCw size={48} className="mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium mb-2">Evergreen Content</p>
              <p className="text-sm">Zeitlose Inhalte, die immer wieder gepostet werden können.</p>
              <p className="text-sm mt-4">Kommt bald...</p>
            </div>
          </div>
        );
      case 'templates':
        return <TemplatesTab />;
      case 'hashtags':
        return <HashtagsTab />;
      default:
        return <PostsTab />;
    }
  };

  return (
    <div className="space-y-4">
      {/* Tab Navigation */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setLibraryTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${
              libraryTab === tab.id
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
