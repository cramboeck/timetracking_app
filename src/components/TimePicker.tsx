import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

interface TimePickerProps {
  value: string; // Format: "HH:MM" (24h)
  onChange: (value: string) => void;
  className?: string;
  required?: boolean;
}

export const TimePicker = ({ value, onChange, className = '', required = false }: TimePickerProps) => {
  const { currentUser } = useAuth();
  const use24Hour = (currentUser?.timeFormat || '24h') === '24h';

  // Parse the 24h time value
  const [hours24, minutes] = value.split(':').map(Number);

  // Convert to 12h if needed
  const hours12 = hours24 === 0 ? 12 : hours24 > 12 ? hours24 - 12 : hours24;
  const period = hours24 >= 12 ? 'PM' : 'AM';

  const [selectedHours, setSelectedHours] = useState(use24Hour ? hours24 : hours12);
  const [selectedMinutes, setSelectedMinutes] = useState(minutes);
  const [selectedPeriod, setSelectedPeriod] = useState(period);

  // Update local state when value prop changes
  useEffect(() => {
    const [h24, m] = value.split(':').map(Number);
    const h12 = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24;
    const p = h24 >= 12 ? 'PM' : 'AM';

    setSelectedHours(use24Hour ? h24 : h12);
    setSelectedMinutes(m);
    setSelectedPeriod(p);
  }, [value, use24Hour]);

  const handleChange = (hours: number, mins: number, per: string) => {
    setSelectedHours(hours);
    setSelectedMinutes(mins);
    setSelectedPeriod(per);

    // Convert to 24h format for the value
    let hours24 = hours;
    if (!use24Hour) {
      if (per === 'AM') {
        hours24 = hours === 12 ? 0 : hours;
      } else {
        hours24 = hours === 12 ? 12 : hours + 12;
      }
    }

    const timeString = `${String(hours24).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
    onChange(timeString);
  };

  const maxHours = use24Hour ? 23 : 12;
  const minHours = use24Hour ? 0 : 1;

  return (
    <div className={`flex gap-2 ${className}`}>
      {/* Hours */}
      <select
        value={selectedHours}
        onChange={(e) => handleChange(Number(e.target.value), selectedMinutes, selectedPeriod)}
        required={required}
        className="flex-1 px-3 py-3 rounded-lg border border-gray-300 dark:border-dark-200 bg-white dark:bg-dark-100 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary"
      >
        {Array.from({ length: maxHours - minHours + 1 }, (_, i) => minHours + i).map(h => (
          <option key={h} value={h}>
            {String(h).padStart(2, '0')}
          </option>
        ))}
      </select>

      <span className="flex items-center text-gray-500 dark:text-dark-400 font-bold">:</span>

      {/* Minutes */}
      <select
        value={selectedMinutes}
        onChange={(e) => handleChange(selectedHours, Number(e.target.value), selectedPeriod)}
        required={required}
        className="flex-1 px-3 py-3 rounded-lg border border-gray-300 dark:border-dark-200 bg-white dark:bg-dark-100 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary"
      >
        {Array.from({ length: 60 }, (_, i) => i).map(m => (
          <option key={m} value={m}>
            {String(m).padStart(2, '0')}
          </option>
        ))}
      </select>

      {/* AM/PM for 12h format */}
      {!use24Hour && (
        <>
          <span className="flex items-center text-gray-500 dark:text-dark-400 font-bold px-1"></span>
          <select
            value={selectedPeriod}
            onChange={(e) => handleChange(selectedHours, selectedMinutes, e.target.value)}
            required={required}
            className="w-20 px-3 py-3 rounded-lg border border-gray-300 dark:border-dark-200 bg-white dark:bg-dark-100 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary"
          >
            <option value="AM">AM</option>
            <option value="PM">PM</option>
          </select>
        </>
      )}
    </div>
  );
};
