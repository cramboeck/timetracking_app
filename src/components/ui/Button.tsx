/**
 * Standardized Button Component
 * Provides consistent button styling across the application
 */

import { ReactNode, ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'warning' | 'success' | 'ghost' | 'outline';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
  loading?: boolean;
  icon?: ReactNode;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: `
    bg-accent-primary hover:bg-accent-primary/90 active:bg-accent-primary/80
    text-white font-medium
    disabled:bg-accent-primary/50 disabled:cursor-not-allowed
  `,
  secondary: `
    bg-gray-100 hover:bg-gray-200 active:bg-gray-300
    text-gray-700 font-medium
    disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed
    dark:bg-gray-700 dark:hover:bg-gray-600 dark:active:bg-gray-500
    dark:text-gray-200 dark:disabled:bg-gray-700/50 dark:disabled:text-gray-500
  `,
  danger: `
    bg-red-600 hover:bg-red-700 active:bg-red-800
    text-white font-medium
    disabled:bg-red-400 disabled:cursor-not-allowed
    dark:bg-red-600 dark:hover:bg-red-700 dark:active:bg-red-800
    dark:disabled:bg-red-500/50
  `,
  warning: `
    bg-orange-500 hover:bg-orange-600 active:bg-orange-700
    text-white font-medium
    disabled:bg-orange-400 disabled:cursor-not-allowed
    dark:bg-orange-500 dark:hover:bg-orange-600 dark:active:bg-orange-700
    dark:disabled:bg-orange-400/50
  `,
  success: `
    bg-green-600 hover:bg-green-700 active:bg-green-800
    text-white font-medium
    disabled:bg-green-400 disabled:cursor-not-allowed
    dark:bg-green-600 dark:hover:bg-green-700 dark:active:bg-green-800
    dark:disabled:bg-green-500/50
  `,
  ghost: `
    bg-transparent hover:bg-gray-100 active:bg-gray-200
    text-gray-700 font-medium
    disabled:text-gray-400 disabled:cursor-not-allowed
    dark:hover:bg-gray-700 dark:active:bg-gray-600
    dark:text-gray-300 dark:disabled:text-gray-500
  `,
  outline: `
    bg-transparent hover:bg-gray-50 active:bg-gray-100
    text-gray-700 font-medium
    border border-gray-300
    disabled:text-gray-400 disabled:border-gray-200 disabled:cursor-not-allowed
    dark:hover:bg-gray-800 dark:active:bg-gray-700
    dark:text-gray-300 dark:border-gray-600
    dark:disabled:text-gray-500 dark:disabled:border-gray-700
  `,
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm rounded-md gap-1.5',
  md: 'px-4 py-2 text-sm rounded-lg gap-2',
  lg: 'px-5 py-2.5 text-base rounded-lg gap-2',
};

export const Button = ({
  variant = 'primary',
  size = 'md',
  children,
  loading = false,
  icon,
  iconPosition = 'left',
  fullWidth = false,
  className = '',
  disabled,
  ...props
}: ButtonProps) => {
  const isDisabled = disabled || loading;

  return (
    <button
      className={`
        inline-flex items-center justify-center
        transition-colors duration-150
        focus:outline-none focus:ring-2 focus:ring-accent-primary focus:ring-offset-2
        dark:focus:ring-offset-gray-800
        ${variantClasses[variant]}
        ${sizeClasses[size]}
        ${fullWidth ? 'w-full' : ''}
        ${className}
      `.trim().replace(/\s+/g, ' ')}
      disabled={isDisabled}
      {...props}
    >
      {loading && (
        <svg
          className="animate-spin h-4 w-4"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      )}
      {!loading && icon && iconPosition === 'left' && icon}
      {children}
      {!loading && icon && iconPosition === 'right' && icon}
    </button>
  );
};

// Icon button variant for toolbar actions
export type IconButtonVariant = 'default' | 'danger' | 'success' | 'warning' | 'primary';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  variant?: IconButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  tooltip?: string;
}

export const IconButton = ({
  icon,
  variant = 'default',
  size = 'md',
  tooltip,
  className = '',
  ...props
}: IconButtonProps) => {
  const variantStyles: Record<IconButtonVariant, string> = {
    default: `
      text-gray-500 hover:text-gray-700 hover:bg-gray-100
      dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-700
    `,
    primary: `
      text-accent-primary hover:bg-accent-primary/10
      dark:text-accent-primary dark:hover:bg-accent-primary/20
    `,
    danger: `
      text-gray-500 hover:text-red-600 hover:bg-red-50
      dark:text-gray-400 dark:hover:text-red-400 dark:hover:bg-red-900/30
    `,
    success: `
      text-gray-500 hover:text-green-600 hover:bg-green-50
      dark:text-gray-400 dark:hover:text-green-400 dark:hover:bg-green-900/30
    `,
    warning: `
      text-gray-500 hover:text-orange-600 hover:bg-orange-50
      dark:text-gray-400 dark:hover:text-orange-400 dark:hover:bg-orange-900/30
    `,
  };

  const sizeStyles = {
    sm: 'p-1 rounded',
    md: 'p-1.5 rounded-md',
    lg: 'p-2 rounded-lg',
  };

  return (
    <button
      className={`
        transition-colors duration-150
        focus:outline-none focus:ring-2 focus:ring-accent-primary focus:ring-offset-1
        dark:focus:ring-offset-gray-800
        disabled:opacity-50 disabled:cursor-not-allowed
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${className}
      `.trim().replace(/\s+/g, ' ')}
      title={tooltip}
      {...props}
    >
      {icon}
    </button>
  );
};

export default Button;
