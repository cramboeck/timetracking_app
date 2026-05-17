/**
 * Standardized Card Components
 * Provides consistent card styling across the application
 */

import { ReactNode, HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  variant?: 'default' | 'elevated' | 'outline';
  interactive?: boolean;
  selected?: boolean;
  draggable?: boolean;
}

export const Card = ({
  children,
  variant = 'default',
  interactive = false,
  selected = false,
  draggable = false,
  className = '',
  ...props
}: CardProps) => {
  const baseStyles = `
    rounded-lg border
    transition-all duration-150
  `;

  const variantStyles = {
    default: `
      bg-white dark:bg-dark-100
      border-gray-200 dark:border-dark-border
    `,
    elevated: `
      bg-white dark:bg-dark-100
      border-gray-200 dark:border-dark-border
      shadow-sm
    `,
    outline: `
      bg-transparent
      border-gray-200 dark:border-dark-border
    `,
  };

  const interactiveStyles = interactive
    ? `
      cursor-pointer
      hover:border-accent-primary/40 dark:hover:border-accent-primary
      hover:shadow-md dark:hover:shadow-dark-50/50
      focus-within:ring-2 focus-within:ring-accent-primary focus-within:ring-offset-2
      dark:focus-within:ring-offset-gray-900
    `
    : '';

  const selectedStyles = selected
    ? `
      border-accent-primary dark:border-accent-primary
      ring-2 ring-accent-primary/20 dark:ring-accent-primary/20
    `
    : '';

  const draggableStyles = draggable
    ? 'cursor-grab active:cursor-grabbing'
    : '';

  return (
    <div
      className={`
        ${baseStyles}
        ${variantStyles[variant]}
        ${interactiveStyles}
        ${selectedStyles}
        ${draggableStyles}
        ${className}
      `.trim().replace(/\s+/g, ' ')}
      {...props}
    >
      {children}
    </div>
  );
};

// Card Header
interface CardHeaderProps {
  children: ReactNode;
  className?: string;
  actions?: ReactNode;
}

export const CardHeader = ({ children, className = '', actions }: CardHeaderProps) => (
  <div className={`flex items-center justify-between p-3 border-b border-gray-200 dark:border-dark-border ${className}`}>
    <div className="font-medium text-gray-900 dark:text-white">{children}</div>
    {actions && <div className="flex items-center gap-2">{actions}</div>}
  </div>
);

// Card Content
interface CardContentProps {
  children: ReactNode;
  className?: string;
  compact?: boolean;
}

export const CardContent = ({ children, className = '', compact = false }: CardContentProps) => (
  <div className={`${compact ? 'p-2' : 'p-3'} ${className}`}>
    {children}
  </div>
);

// Card Footer
interface CardFooterProps {
  children: ReactNode;
  className?: string;
}

export const CardFooter = ({ children, className = '' }: CardFooterProps) => (
  <div className={`p-3 border-t border-gray-200 dark:border-dark-border ${className}`}>
    {children}
  </div>
);

// Kanban Card specifically for drag-and-drop boards
interface KanbanCardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  isDragging?: boolean;
}

export const KanbanCard = ({
  children,
  isDragging = false,
  className = '',
  ...props
}: KanbanCardProps) => (
  <div
    className={`
      group
      bg-white dark:bg-dark-100
      rounded-lg border border-gray-200 dark:border-dark-border
      p-3
      cursor-grab active:cursor-grabbing
      hover:shadow-md dark:hover:shadow-dark-50/50
      hover:border-accent-primary/40 dark:hover:border-accent-primary
      transition-all duration-150
      ${isDragging ? 'opacity-50 shadow-lg' : ''}
      ${className}
    `.trim().replace(/\s+/g, ' ')}
    {...props}
  >
    {children}
  </div>
);

// Stat Card for dashboard metrics
interface StatCardProps {
  label: string;
  value: string | number;
  icon?: ReactNode;
  trend?: {
    value: number;
    positive?: boolean;
  };
  className?: string;
}

export const StatCard = ({ label, value, icon, trend, className = '' }: StatCardProps) => (
  <Card variant="elevated" className={`p-4 ${className}`}>
    <div className="flex items-start justify-between">
      <div>
        <p className="text-sm text-gray-500 dark:text-dark-400">{label}</p>
        <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{value}</p>
        {trend && (
          <p className={`text-sm mt-1 ${trend.positive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {trend.positive ? '+' : ''}{trend.value}%
          </p>
        )}
      </div>
      {icon && (
        <div className="p-2 bg-accent-light dark:bg-accent-primary/30 rounded-lg text-accent-primary dark:text-accent-primary">
          {icon}
        </div>
      )}
    </div>
  </Card>
);

export default Card;
