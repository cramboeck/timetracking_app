import { Contrast } from 'lucide-react';
import { GrayTone } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { IOSSwitch } from '../IOSSwitch';

interface AppearanceSettingsProps {
  darkMode: boolean;
  onToggleDarkMode: () => void;
}

export const AppearanceSettings = ({
  darkMode,
  onToggleDarkMode,
}: AppearanceSettingsProps) => {
  const { currentUser, updateAccentColor, updateGrayTone, updateTimeFormat } = useAuth();

  const accentColors = [
    { name: 'blue', label: 'Blau', hex: '#3b82f6' },
    { name: 'green', label: 'Grün', hex: '#22c55e' },
    { name: 'orange', label: 'Orange', hex: '#f97316' },
    { name: 'purple', label: 'Lila', hex: '#a855f7' },
    { name: 'red', label: 'Rot', hex: '#ef4444' },
    { name: 'pink', label: 'Pink', hex: '#ec4899' },
    { name: 'ramboeck', label: 'RamboFlow', hex: '#FF6A00' },
  ];

  const grayTones: { name: GrayTone; label: string; desc: string; previewBg: string; previewCard: string }[] = [
    { name: 'light', label: 'Hell', desc: 'Weiche Grautöne', previewBg: 'bg-gray-700', previewCard: 'bg-gray-500' },
    { name: 'medium', label: 'Mittel', desc: 'Ausgewogen', previewBg: 'bg-zinc-900', previewCard: 'bg-zinc-700' },
    { name: 'dark', label: 'Dunkel', desc: 'Tiefe Schwarztöne', previewBg: 'bg-zinc-950', previewCard: 'bg-zinc-800' },
    { name: 'ramboeck', label: 'RamboFlow', desc: 'Dunkles Lila', previewBg: 'bg-[#0e0e18]', previewCard: 'bg-[#211c38]' },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Time Format Settings */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Zeitformat</h2>
        <div className="space-y-3">
          <button
            onClick={() => updateTimeFormat('24h')}
            className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
              (currentUser?.timeFormat || '24h') === '24h'
                ? 'border-accent-primary bg-accent-light dark:bg-accent-primary/20 shadow-sm'
                : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <h3 className="font-medium text-gray-900 dark:text-white">24-Stunden-Format</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Beispiel: 14:30, 23:45
                </p>
              </div>
              {(currentUser?.timeFormat || '24h') === '24h' && (
                <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0 ml-3">
                  <span className="text-white text-sm font-bold">✓</span>
                </div>
              )}
            </div>
          </button>
          <button
            onClick={() => updateTimeFormat('12h')}
            className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
              currentUser?.timeFormat === '12h'
                ? 'border-accent-primary bg-accent-light dark:bg-accent-primary/20 shadow-sm'
                : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <h3 className="font-medium text-gray-900 dark:text-white">12-Stunden-Format (AM/PM)</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Beispiel: 2:30 PM, 11:45 PM
                </p>
              </div>
              {currentUser?.timeFormat === '12h' && (
                <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0 ml-3">
                  <span className="text-white text-sm font-bold">✓</span>
                </div>
              )}
            </div>
          </button>
        </div>
      </div>

      {/* Appearance Settings */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Design & Aussehen</h2>

        <div className="space-y-6">
          {/* Dark Mode Toggle */}
          <IOSSwitch
            label="Dark Mode"
            description="Dunkles Farbschema mit tiefen Grautönen"
            checked={darkMode}
            onChange={onToggleDarkMode}
          />

          {/* Accent Color Selection */}
          <div className="pt-3 border-t border-gray-200 dark:border-gray-600">
            <h3 className="font-medium text-gray-900 dark:text-white mb-2">Akzentfarbe</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Wähle deine bevorzugte Akzentfarbe für Buttons und Highlights
            </p>
            <div className="grid grid-cols-6 gap-3">
              {accentColors.map((color) => (
                <button
                  key={color.name}
                  onClick={() => updateAccentColor(color.name as any)}
                  className={`relative flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all hover:scale-105 ${
                    currentUser?.accentColor === color.name
                      ? 'border-accent-primary bg-accent-light dark:bg-accent-primary/20'
                      : 'border-gray-200 dark:border-gray-600 hover:border-gray-300'
                  }`}
                  title={color.label}
                >
                  <div
                    className="w-8 h-8 rounded-full"
                    style={{ backgroundColor: color.hex }}
                  />
                  <span className={`text-xs font-medium ${
                    currentUser?.accentColor === color.name
                      ? 'text-accent-primary dark:text-accent-primary'
                      : 'text-gray-600 dark:text-gray-400'
                  }`}>
                    {color.label}
                  </span>
                  {currentUser?.accentColor === color.name && (
                    <div className="absolute -top-1 -right-1 w-5 h-5 bg-white dark:bg-gray-800 rounded-full flex items-center justify-center border border-gray-200 dark:border-gray-600">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: color.hex }}
                      />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Gray Tone Selection */}
          <div className="pt-3 border-t border-gray-200 dark:border-gray-600">
            <h3 className="font-medium text-gray-900 dark:text-white mb-2 flex items-center gap-2">
              <Contrast size={18} />
              Grauton-Intensität
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Wähle die Dunkelheit des Dark Modes (nur im Dark Mode sichtbar)
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {grayTones.map((tone) => (
                <button
                  key={tone.name}
                  onClick={() => updateGrayTone(tone.name)}
                  className={`relative flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all hover:scale-105 ${
                    currentUser?.grayTone === tone.name
                      ? 'border-accent-primary bg-accent-light dark:bg-accent-primary/20'
                      : 'border-gray-200 dark:border-gray-600 hover:border-gray-300'
                  }`}
                  title={tone.desc}
                >
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${tone.previewBg}`}>
                    <div className={`w-6 h-6 rounded ${tone.previewCard}`} />
                  </div>
                  <div className="text-center">
                    <span className={`text-sm font-medium block ${
                      currentUser?.grayTone === tone.name
                        ? 'text-accent-primary dark:text-accent-primary'
                        : 'text-gray-900 dark:text-white'
                    }`}>
                      {tone.label}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {tone.desc}
                    </span>
                  </div>
                  {currentUser?.grayTone === tone.name && (
                    <div className="absolute -top-1 -right-1 w-5 h-5 bg-white dark:bg-gray-800 rounded-full flex items-center justify-center border border-gray-200 dark:border-gray-600">
                      <div className="w-3 h-3 bg-blue-500 rounded-full" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
