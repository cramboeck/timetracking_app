import { useState, useRef, useEffect } from 'react';
import { Clock, ChevronUp, ChevronDown } from 'lucide-react';
import { Button, IconButton } from './ui';

interface ModernTimePickerProps {
  value: string; // Format: "HH:MM" (24h)
  onChange: (value: string) => void;
  label?: string;
  min?: string;
  max?: string;
}

export const ModernTimePicker = ({
  value,
  onChange,
  label,
  min,
  max,
}: ModernTimePickerProps) => {
  const [hours, minutes] = value.split(':').map(Number);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const updateTime = (newHours: number, newMinutes: number) => {
    // Clamp values
    newHours = Math.max(0, Math.min(23, newHours));
    newMinutes = Math.max(0, Math.min(59, newMinutes));

    const timeString = `${String(newHours).padStart(2, '0')}:${String(newMinutes).padStart(2, '0')}`;
    onChange(timeString);
  };

  const incrementHour = () => updateTime(hours + 1, minutes);
  const decrementHour = () => updateTime(hours - 1, minutes);
  const incrementMinute = () => updateTime(hours, minutes + 5);
  const decrementMinute = () => updateTime(hours, minutes - 5);

  // Quick time presets
  const presets = [
    '08:00', '09:00', '10:00', '11:00', '12:00',
    '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'
  ];

  return (
    <div ref={containerRef} className="relative">
      {label && (
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          {label}
        </label>
      )}

      {/* Main Input Display */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`
          w-full flex items-center justify-between gap-3 px-4 py-3
          bg-white dark:bg-gray-800
          border-2 rounded-xl
          transition-all duration-200
          ${isOpen
            ? 'border-accent-primary ring-2 ring-accent-primary/20'
            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
          }
        `}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-accent-light dark:bg-blue-900/20 flex items-center justify-center">
            <Clock size={20} className="text-accent-primary dark:text-blue-400" />
          </div>
          <span className="text-2xl font-bold text-gray-900 dark:text-white tabular-nums">
            {String(hours).padStart(2, '0')}:{String(minutes).padStart(2, '0')}
          </span>
        </div>
      </button>

      {/* Dropdown Picker */}
      {isOpen && (
        <div className="absolute z-50 mt-2 w-full bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xl p-4">
          {/* Spinner Controls */}
          <div className="flex justify-center items-center gap-4 mb-4">
            {/* Hours */}
            <div className="flex flex-col items-center">
              <IconButton
                icon={<ChevronUp size={24} />}
                size="lg"
                onClick={incrementHour}
              />
              <div className="text-4xl font-bold text-gray-900 dark:text-white tabular-nums py-2 px-4 bg-gray-50 dark:bg-gray-700 rounded-lg min-w-[80px] text-center">
                {String(hours).padStart(2, '0')}
              </div>
              <IconButton
                icon={<ChevronDown size={24} />}
                size="lg"
                onClick={decrementHour}
              />
            </div>

            <span className="text-4xl font-bold text-gray-400 dark:text-gray-500">:</span>

            {/* Minutes */}
            <div className="flex flex-col items-center">
              <IconButton
                icon={<ChevronUp size={24} />}
                size="lg"
                onClick={incrementMinute}
              />
              <div className="text-4xl font-bold text-gray-900 dark:text-white tabular-nums py-2 px-4 bg-gray-50 dark:bg-gray-700 rounded-lg min-w-[80px] text-center">
                {String(minutes).padStart(2, '0')}
              </div>
              <IconButton
                icon={<ChevronDown size={24} />}
                size="lg"
                onClick={decrementMinute}
              />
            </div>
          </div>

          {/* Quick Presets */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 text-center">Schnellauswahl</p>
            <div className="flex flex-wrap gap-1 justify-center">
              {presets.map(preset => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    onChange(preset);
                    setIsOpen(false);
                  }}
                  className={`
                    px-2 py-1 text-sm rounded-md transition-colors
                    ${value === preset
                      ? 'bg-accent-primary text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }
                  `}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          {/* Done Button */}
          <Button
            variant="primary"
            fullWidth
            className="mt-4"
            onClick={() => setIsOpen(false)}
          >
            Fertig
          </Button>
        </div>
      )}
    </div>
  );
};
