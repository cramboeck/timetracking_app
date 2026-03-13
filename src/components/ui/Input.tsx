/**
 * Standardized Input Components
 * Provides consistent form element styling across the application
 */

import { InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes, ReactNode } from 'react';

// Base input styles used across all form elements
const baseInputStyles = `
  w-full px-3 py-2 rounded-lg
  border border-gray-300 dark:border-gray-600
  bg-white dark:bg-gray-700
  text-gray-900 dark:text-white
  placeholder:text-gray-400 dark:placeholder:text-gray-500
  transition-colors duration-150
  focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
  dark:focus:ring-blue-400 dark:focus:border-blue-400
  disabled:bg-gray-100 dark:disabled:bg-gray-800
  disabled:text-gray-500 dark:disabled:text-gray-500
  disabled:cursor-not-allowed
`;

const errorStyles = `
  border-red-500 dark:border-red-500
  focus:ring-red-500 focus:border-red-500
  dark:focus:ring-red-400 dark:focus:border-red-400
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
    className={`block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 ${className}`}
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
  <p className={`mt-1 text-sm ${error ? 'text-red-500' : 'text-gray-500 dark:text-gray-400'} ${className}`}>
    {children}
  </p>
);

// Input component
interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
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
  label?: string;
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
  label?: string;
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
  const colsClass = {
    2: 'grid-cols-2',
    3: 'grid-cols-3',
    4: 'grid-cols-4',
  };

  return (
    <div className={`grid ${colsClass[cols]} gap-4 ${className}`}>
      {children}
    </div>
  );
};

export default Input;
