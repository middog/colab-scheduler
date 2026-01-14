/**
 * SDCoLab Scheduler - Form Field Component
 * 
 * Enhanced form inputs with:
 * - Field-level validation messages
 * - Visual error states
 * - Accessibility support
 * - Various input types
 * 
 * @version 4.2.0-rc69.6
 */

import React, { useState, useId } from 'react';
import { AlertCircle, Eye, EyeOff, Check, X } from 'lucide-react';

/**
 * Base input wrapper with label and error display
 */
export const FormField = ({
  label,
  error,
  hint,
  required = false,
  children,
  className = '',
  theme = 'light'
}) => {
  const id = useId();
  const isDark = theme === 'dark';
  
  return (
    <div className={`space-y-1 ${className}`}>
      {label && (
        <label 
          htmlFor={id}
          className={`block text-sm font-medium ${isDark ? 'text-gray-200' : 'text-gray-700'}`}
        >
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      
      <div className="relative">
        {React.cloneElement(children, { id, 'aria-invalid': !!error, 'aria-describedby': error ? `${id}-error` : undefined })}
        
        {/* Error icon */}
        {error && (
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
            <AlertCircle className="h-5 w-5 text-red-500" />
          </div>
        )}
      </div>
      
      {/* Error message */}
      {error && (
        <p 
          id={`${id}-error`}
          className="text-sm text-red-500 flex items-center gap-1"
          role="alert"
        >
          {error}
        </p>
      )}
      
      {/* Hint text */}
      {hint && !error && (
        <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
          {hint}
        </p>
      )}
    </div>
  );
};

/**
 * Text Input with validation
 */
export const TextInput = ({
  value,
  onChange,
  onBlur,
  type = 'text',
  placeholder,
  disabled = false,
  error = null,
  className = '',
  theme = 'light',
  ...props
}) => {
  const isDark = theme === 'dark';
  
  const baseClasses = `
    w-full px-3 py-2 rounded-lg border transition-colors
    focus:outline-none focus:ring-2 focus:ring-offset-1
    disabled:opacity-50 disabled:cursor-not-allowed
  `;
  
  const themeClasses = isDark
    ? `bg-gray-700 text-white border-gray-600 
       placeholder-gray-400
       focus:border-orange-500 focus:ring-orange-500`
    : `bg-white text-gray-900 border-gray-300
       placeholder-gray-400
       focus:border-orange-500 focus:ring-orange-500`;
  
  const errorClasses = error
    ? 'border-red-500 focus:border-red-500 focus:ring-red-500 pr-10'
    : '';
  
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange?.(e.target.value)}
      onBlur={onBlur}
      placeholder={placeholder}
      disabled={disabled}
      className={`${baseClasses} ${themeClasses} ${errorClasses} ${className}`}
      {...props}
    />
  );
};

/**
 * Password Input with show/hide toggle
 */
export const PasswordInput = ({
  value,
  onChange,
  onBlur,
  placeholder = 'Enter password',
  error = null,
  theme = 'light',
  ...props
}) => {
  const [showPassword, setShowPassword] = useState(false);
  const isDark = theme === 'dark';
  
  return (
    <div className="relative">
      <TextInput
        type={showPassword ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        placeholder={placeholder}
        error={error}
        theme={theme}
        className="pr-10"
        {...props}
      />
      <button
        type="button"
        onClick={() => setShowPassword(!showPassword)}
        className={`
          absolute inset-y-0 right-0 pr-3 flex items-center
          ${isDark ? 'text-gray-400 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700'}
        `}
        tabIndex={-1}
      >
        {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
      </button>
    </div>
  );
};

/**
 * Textarea with validation
 */
export const TextArea = ({
  value,
  onChange,
  onBlur,
  placeholder,
  rows = 3,
  maxLength,
  disabled = false,
  error = null,
  theme = 'light',
  className = '',
  ...props
}) => {
  const isDark = theme === 'dark';
  const charCount = value?.length || 0;
  
  const baseClasses = `
    w-full px-3 py-2 rounded-lg border transition-colors resize-none
    focus:outline-none focus:ring-2 focus:ring-offset-1
    disabled:opacity-50 disabled:cursor-not-allowed
  `;
  
  const themeClasses = isDark
    ? `bg-gray-700 text-white border-gray-600 
       placeholder-gray-400
       focus:border-orange-500 focus:ring-orange-500`
    : `bg-white text-gray-900 border-gray-300
       placeholder-gray-400
       focus:border-orange-500 focus:ring-orange-500`;
  
  const errorClasses = error
    ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
    : '';
  
  return (
    <div className="relative">
      <textarea
        value={value}
        onChange={e => onChange?.(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        rows={rows}
        maxLength={maxLength}
        disabled={disabled}
        className={`${baseClasses} ${themeClasses} ${errorClasses} ${className}`}
        {...props}
      />
      {maxLength && (
        <div className={`absolute bottom-2 right-2 text-xs ${
          charCount > maxLength * 0.9 
            ? 'text-red-500' 
            : isDark ? 'text-gray-400' : 'text-gray-500'
        }`}>
          {charCount}/{maxLength}
        </div>
      )}
    </div>
  );
};

/**
 * Select dropdown with validation
 */
export const Select = ({
  value,
  onChange,
  onBlur,
  options = [],
  placeholder = 'Select an option',
  disabled = false,
  error = null,
  theme = 'light',
  className = '',
  ...props
}) => {
  const isDark = theme === 'dark';
  
  const baseClasses = `
    w-full px-3 py-2 rounded-lg border transition-colors appearance-none
    focus:outline-none focus:ring-2 focus:ring-offset-1
    disabled:opacity-50 disabled:cursor-not-allowed
    bg-no-repeat bg-right
  `;
  
  const themeClasses = isDark
    ? `bg-gray-700 text-white border-gray-600 
       focus:border-orange-500 focus:ring-orange-500`
    : `bg-white text-gray-900 border-gray-300
       focus:border-orange-500 focus:ring-orange-500`;
  
  const errorClasses = error
    ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
    : '';
  
  return (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange?.(e.target.value)}
        onBlur={onBlur}
        disabled={disabled}
        className={`${baseClasses} ${themeClasses} ${errorClasses} ${className}`}
        style={{
          backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
          backgroundPosition: 'right 0.5rem center',
          backgroundSize: '1.5em 1.5em',
          paddingRight: '2.5rem'
        }}
        {...props}
      >
        <option value="" disabled>{placeholder}</option>
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
};

/**
 * Date Input with validation
 */
export const DateInput = ({
  value,
  onChange,
  onBlur,
  min,
  max,
  disabled = false,
  error = null,
  theme = 'light',
  ...props
}) => {
  const isDark = theme === 'dark';
  
  // Default min to today
  const today = new Date().toISOString().split('T')[0];
  
  return (
    <TextInput
      type="date"
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      min={min || today}
      max={max}
      disabled={disabled}
      error={error}
      theme={theme}
      {...props}
    />
  );
};

/**
 * Time Input with validation
 */
export const TimeInput = ({
  value,
  onChange,
  onBlur,
  min,
  max,
  step = 3600, // Default to 1-hour increments
  disabled = false,
  error = null,
  theme = 'light',
  ...props
}) => {
  return (
    <TextInput
      type="time"
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      error={error}
      theme={theme}
      {...props}
    />
  );
};

/**
 * Checkbox with label
 */
export const Checkbox = ({
  checked,
  onChange,
  label,
  disabled = false,
  error = null,
  theme = 'light',
  ...props
}) => {
  const isDark = theme === 'dark';
  const id = useId();
  
  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={e => onChange?.(e.target.checked)}
        disabled={disabled}
        className={`
          h-4 w-4 rounded border transition-colors
          focus:ring-2 focus:ring-offset-1 focus:ring-orange-500
          ${isDark 
            ? 'bg-gray-700 border-gray-600 text-orange-500' 
            : 'bg-white border-gray-300 text-orange-500'
          }
          ${error ? 'border-red-500' : ''}
          disabled:opacity-50
        `}
        {...props}
      />
      {label && (
        <label 
          htmlFor={id}
          className={`text-sm ${isDark ? 'text-gray-200' : 'text-gray-700'} ${disabled ? 'opacity-50' : ''}`}
        >
          {label}
        </label>
      )}
    </div>
  );
};

/**
 * Form validation summary
 */
export const ValidationSummary = ({ errors = {}, theme = 'light' }) => {
  const errorList = Object.entries(errors).filter(([_, msg]) => msg);
  
  if (errorList.length === 0) return null;
  
  const isDark = theme === 'dark';
  
  return (
    <div className={`
      rounded-lg p-4 border
      ${isDark 
        ? 'bg-red-900/20 border-red-800 text-red-300' 
        : 'bg-red-50 border-red-200 text-red-700'
      }
    `}>
      <div className="flex items-center gap-2 mb-2">
        <AlertCircle className="h-5 w-5" />
        <h3 className="font-medium">Please fix the following errors:</h3>
      </div>
      <ul className="list-disc list-inside space-y-1 text-sm">
        {errorList.map(([field, message]) => (
          <li key={field}>{message}</li>
        ))}
      </ul>
    </div>
  );
};

/**
 * Form success message
 */
export const SuccessMessage = ({ message, onDismiss, theme = 'light' }) => {
  if (!message) return null;
  
  const isDark = theme === 'dark';
  
  return (
    <div className={`
      rounded-lg p-4 border flex items-center justify-between
      ${isDark 
        ? 'bg-green-900/20 border-green-800 text-green-300' 
        : 'bg-green-50 border-green-200 text-green-700'
      }
    `}>
      <div className="flex items-center gap-2">
        <Check className="h-5 w-5" />
        <span>{message}</span>
      </div>
      {onDismiss && (
        <button 
          onClick={onDismiss}
          className="p-1 hover:opacity-70 transition-opacity"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
};

export default {
  FormField,
  TextInput,
  PasswordInput,
  TextArea,
  Select,
  DateInput,
  TimeInput,
  Checkbox,
  ValidationSummary,
  SuccessMessage
};
