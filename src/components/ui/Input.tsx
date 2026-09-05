/**
 * Standardized Input Components
 * Provides consistent form element styling across the application
 */

import { InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes, ReactNode } from 'react';

// Base input styles used across all form elements.
// EINE Feldgröße für die ganze App (px-3.5 py-2.5 ≈ 42 px Höhe — auf
// Mobile gut tippbar, auf Desktop nicht klobig). Formulare sollen nicht
// mehr zwischen px-3 py-2 und px-4 py-3 variieren.
//
// Look: „soft filled" — leicht getönte Fläche mit dezentem Rahmen,
// beim Fokus weißer Grund + weicher Accent-Glow (ring/15) statt hartem
// Ring. Ruhiger als der klassische Border-Input, Fokus bleibt deutlich.
const baseInputStyles = `
  w-full px-3.5 py-2.5 rounded-xl
  bg-gray-50 dark:bg-dark-200
  border border-gray-200 dark:border-dark-border
  text-gray-900 dark:text-white
  placeholder:text-gray-400 dark:placeholder:text-dark-400
  transition-all duration-150
  hover:border-gray-300 dark:hover:border-dark-400/40
  focus:outline-none focus:bg-white dark:focus:bg-dark-100
  focus:border-accent-primary focus:ring-4 focus:ring-accent-primary/15
  disabled:bg-gray-100 dark:disabled:bg-dark-100
  disabled:text-gray-500 dark:disabled:text-dark-400
  disabled:border-transparent
  disabled:cursor-not-allowed
`;

const errorStyles = `
  border-red-400 dark:border-red-500 bg-red-50/50 dark:bg-red-900/10
  focus:border-red-500 focus:ring-red-500/15
  dark:focus:border-red-400 dark:focus:ring-red-400/15
`;

// Label component
interface LabelProps {
  htmlFor?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

export const Label = ({ htmlFor, required, children, className = '' }: LabelProps) => (
  <label
    htmlFor={htmlFor}
    className={`block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1 ${className}`}
  >
    {children}
    {required && <span className="text-red-500 ml-1">*</span>}
  </label>
);

// Helper text component
interface HelperTextProps {
  error?: boolean;
  children: ReactNode;
  className?: string;
}

export const HelperText = ({ error, children, className = '' }: HelperTextProps) => (
  <p className={`mt-1 text-sm ${error ? 'text-red-500' : 'text-gray-500 dark:text-dark-400'} ${className}`}>
    {children}
  </p>
);

// Input component
interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
  error?: string;
  helperText?: string;
}

export const Input = ({
  label,
  error,
  helperText,
  required,
  className = '',
  id,
  ...props
}: InputProps) => {
  const inputId = id || props.name;

  return (
    <div>
      {label && <Label htmlFor={inputId} required={required}>{label}</Label>}
      <input
        id={inputId}
        className={`${baseInputStyles} ${error ? errorStyles : ''} ${className}`.trim().replace(/\s+/g, ' ')}
        required={required}
        {...props}
      />
      {error && <HelperText error>{error}</HelperText>}
      {!error && helperText && <HelperText>{helperText}</HelperText>}
    </div>
  );
};

// Textarea component
interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: ReactNode;
  error?: string;
  helperText?: string;
}

export const Textarea = ({
  label,
  error,
  helperText,
  required,
  className = '',
  id,
  rows = 3,
  ...props
}: TextareaProps) => {
  const textareaId = id || props.name;

  return (
    <div>
      {label && <Label htmlFor={textareaId} required={required}>{label}</Label>}
      <textarea
        id={textareaId}
        rows={rows}
        className={`${baseInputStyles} resize-none ${error ? errorStyles : ''} ${className}`.trim().replace(/\s+/g, ' ')}
        required={required}
        {...props}
      />
      {error && <HelperText error>{error}</HelperText>}
      {!error && helperText && <HelperText>{helperText}</HelperText>}
    </div>
  );
};

// Select component
interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: ReactNode;
  error?: string;
  helperText?: string;
  children: ReactNode;
}

export const Select = ({
  label,
  error,
  helperText,
  required,
  className = '',
  id,
  children,
  ...props
}: SelectProps) => {
  const selectId = id || props.name;

  return (
    <div>
      {label && <Label htmlFor={selectId} required={required}>{label}</Label>}
      <select
        id={selectId}
        className={`${baseInputStyles} ${error ? errorStyles : ''} ${className}`.trim().replace(/\s+/g, ' ')}
        required={required}
        {...props}
      >
        {children}
      </select>
      {error && <HelperText error>{error}</HelperText>}
      {!error && helperText && <HelperText>{helperText}</HelperText>}
    </div>
  );
};

// Form group for consistent spacing
interface FormGroupProps {
  children: ReactNode;
  className?: string;
}

export const FormGroup = ({ children, className = '' }: FormGroupProps) => (
  <div className={`space-y-4 ${className}`}>
    {children}
  </div>
);

// Form row for horizontal layouts
interface FormRowProps {
  children: ReactNode;
  cols?: 2 | 3 | 4;
  className?: string;
}

export const FormRow = ({ children, cols = 2, className = '' }: FormRowProps) => {
  // Mobile first: einspaltig stapeln, erst ab sm nebeneinander
  const colsClass = {
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
  };

  return (
    <div className={`grid ${colsClass[cols]} gap-4 ${className}`}>
      {children}
    </div>
  );
};

export default Input;
