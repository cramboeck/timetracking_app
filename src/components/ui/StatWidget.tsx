import { LucideIcon } from 'lucide-react';

interface StatWidgetProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  trend?: {
    value: number;
    label: string;
    positive?: boolean;
  };
  color?: 'blue' | 'green' | 'orange' | 'purple' | 'red' | 'gray';
  onClick?: () => void;
  size?: 'sm' | 'md' | 'lg';
}

const colorStyles = {
  blue: {
    bg: 'bg-accent-light dark:bg-accent-primary/20',
    icon: 'text-accent-primary dark:text-accent-primary',
    ring: 'ring-accent-primary/20',
  },
  green: {
    bg: 'bg-green-50 dark:bg-green-900/20',
    icon: 'text-green-600 dark:text-green-400',
    ring: 'ring-green-500/20',
  },
  orange: {
    bg: 'bg-orange-50 dark:bg-orange-900/20',
    icon: 'text-orange-600 dark:text-orange-400',
    ring: 'ring-orange-500/20',
  },
  purple: {
    bg: 'bg-accent-light dark:bg-accent-primary/20',
    icon: 'text-accent-primary dark:text-accent-primary',
    ring: 'ring-accent-primary/20',
  },
  red: {
    bg: 'bg-red-50 dark:bg-red-900/20',
    icon: 'text-red-600 dark:text-red-400',
    ring: 'ring-red-500/20',
  },
  gray: {
    bg: 'bg-gray-50 dark:bg-dark-100/50',
    icon: 'text-gray-600 dark:text-dark-400',
    ring: 'ring-gray-500/20',
  },
};

const sizeStyles = {
  sm: {
    container: 'p-3',
    iconContainer: 'w-8 h-8',
    iconSize: 16,
    value: 'text-lg',
    label: 'text-xs',
  },
  md: {
    container: 'p-4',
    iconContainer: 'w-10 h-10',
    iconSize: 20,
    value: 'text-2xl',
    label: 'text-sm',
  },
  lg: {
    container: 'p-5',
    iconContainer: 'w-12 h-12',
    iconSize: 24,
    value: 'text-3xl',
    label: 'text-base',
  },
};

export const StatWidget = ({
  label,
  value,
  icon: Icon,
  trend,
  color = 'blue',
  onClick,
  size = 'md',
}: StatWidgetProps) => {
  const colors = colorStyles[color] || colorStyles.blue;
  const sizes = sizeStyles[size] || sizeStyles.md;

  return (
    <div
      className={`
        ${sizes.container}
        bg-white dark:bg-dark-100
        rounded-xl border border-gray-200 dark:border-dark-border
        ${onClick ? 'cursor-pointer hover:shadow-md hover:border-gray-300 dark:hover:border-dark-border active:scale-[0.98]' : ''}
        transition-all duration-200
      `}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className={`${sizes.label} text-gray-500 dark:text-dark-400 font-medium mb-1`}>
            {label}
          </p>
          <p className={`${sizes.value} font-bold text-gray-900 dark:text-white`}>
            {value}
          </p>
          {trend && (
            <div className="flex items-center gap-1 mt-1">
              <span className={`text-xs font-medium ${
                trend.positive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
              }`}>
                {trend.positive ? '+' : ''}{trend.value}%
              </span>
              <span className="text-xs text-gray-400 dark:text-dark-400">
                {trend.label}
              </span>
            </div>
          )}
        </div>
        <div className={`
          ${sizes.iconContainer} rounded-lg ${colors.bg}
          flex items-center justify-center
        `}>
          <Icon size={sizes.iconSize} className={colors.icon} />
        </div>
      </div>
    </div>
  );
};

// Quick Action Button variant
interface QuickActionProps {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  color?: 'blue' | 'green' | 'orange' | 'purple' | 'red' | 'gray';
  disabled?: boolean;
}

export const QuickAction = ({
  label,
  icon: Icon,
  onClick,
  color = 'blue',
  disabled = false,
}: QuickActionProps) => {
  const colors = colorStyles[color] || colorStyles.blue;

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        flex flex-col items-center justify-center gap-2 p-4
        bg-white dark:bg-dark-100
        rounded-xl border border-gray-200 dark:border-dark-border
        hover:shadow-md hover:border-gray-300 dark:hover:border-dark-border
        active:scale-[0.98]
        disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none
        transition-all duration-200
        min-w-[100px]
      `}
    >
      <div className={`
        w-12 h-12 rounded-xl ${colors.bg}
        flex items-center justify-center
      `}>
        <Icon size={24} className={colors.icon} />
      </div>
      <span className="text-sm font-medium text-gray-700 dark:text-dark-500">
        {label}
      </span>
    </button>
  );
};
