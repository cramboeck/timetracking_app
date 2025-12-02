import { haptics } from '../utils/haptics';

interface IOSSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  description?: string;
}

export const IOSSwitch = ({
  checked,
  onChange,
  disabled = false,
  label,
  description,
}: IOSSwitchProps) => {
  const handleToggle = () => {
    if (disabled) return;
    haptics.light();
    onChange(!checked);
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={handleToggle}
      className={`
        group flex items-center justify-between w-full min-h-[44px] py-2
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer active:bg-gray-50 dark:active:bg-gray-800'}
        transition-colors rounded-lg -mx-2 px-2
      `}
    >
      {(label || description) && (
        <div className="flex-1 text-left mr-4">
          {label && (
            <div className="text-sm font-medium text-gray-900 dark:text-white">
              {label}
            </div>
          )}
          {description && (
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {description}
            </div>
          )}
        </div>
      )}

      {/* iOS-style switch track */}
      <div
        className={`
          relative w-[51px] h-[31px] rounded-full
          transition-colors duration-200 ease-in-out
          ${checked
            ? 'bg-accent-primary'
            : 'bg-gray-200 dark:bg-gray-600'
          }
        `}
      >
        {/* Switch knob */}
        <div
          className={`
            absolute top-[2px] w-[27px] h-[27px]
            bg-white rounded-full shadow-md
            transition-transform duration-200 ease-in-out
            ${checked ? 'translate-x-[22px]' : 'translate-x-[2px]'}
          `}
        />
      </div>
    </button>
  );
};
