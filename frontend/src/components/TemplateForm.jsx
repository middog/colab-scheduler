import React, { useState } from 'react';
import { CheckCircle, AlertCircle, ChevronDown } from 'lucide-react';

/**
 * TemplateForm - Dynamic form renderer for GitHub issue templates
 * 
 * Renders form fields based on parsed YAML issue template body.
 * Supports: markdown, input, textarea, dropdown, checkboxes
 * 
 * 🔥 Fire Triangle: FUEL layer - issue creation interface
 * 
 * @version 4.2.0-rc69.15
 */

const TemplateForm = ({ 
  template, 
  values, 
  onChange, 
  theme = 'light',
  errors = {}
}) => {
  const isDark = theme === 'dark';
  
  const handleFieldChange = (fieldId, value) => {
    onChange({ ...values, [fieldId]: value });
  };
  
  const handleCheckboxChange = (fieldId, optionIndex, checked, isRequired) => {
    const currentValues = values[fieldId] || [];
    let newValues;
    
    if (checked) {
      newValues = [...currentValues, optionIndex];
    } else {
      newValues = currentValues.filter(i => i !== optionIndex);
    }
    
    onChange({ ...values, [fieldId]: newValues });
  };
  
  const handleMultiSelectChange = (fieldId, option, checked) => {
    const currentValues = values[fieldId] || [];
    let newValues;
    
    if (checked) {
      newValues = [...currentValues, option];
    } else {
      newValues = currentValues.filter(v => v !== option);
    }
    
    onChange({ ...values, [fieldId]: newValues });
  };
  
  const renderField = (field, index) => {
    const { type, id, attributes = {}, validations = {} } = field;
    const isRequired = validations.required;
    const fieldValue = values[id];
    const hasError = errors[id];
    
    const inputClasses = `w-full p-3 rounded-lg border transition-colors ${
      hasError 
        ? 'border-red-500 focus:border-red-500' 
        : isDark 
          ? 'bg-gray-700 border-gray-600 focus:border-blue-500' 
          : 'bg-white border-gray-300 focus:border-blue-500'
    } focus:outline-none focus:ring-2 focus:ring-blue-500/20`;
    
    const labelClasses = `block text-sm font-medium mb-2 ${isDark ? 'text-gray-200' : 'text-gray-700'}`;
    
    switch (type) {
      case 'markdown':
        return (
          <div 
            key={index} 
            className={`prose prose-sm max-w-none ${isDark ? 'prose-invert' : ''} ${
              isDark ? 'bg-gray-700/50' : 'bg-gray-50'
            } p-4 rounded-lg`}
          >
            <div dangerouslySetInnerHTML={{ 
              __html: (attributes.value || '')
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.*?)\*/g, '<em>$1</em>')
                .replace(/`(.*?)`/g, '<code>$1</code>')
                .replace(/\n/g, '<br/>')
                .replace(/## (.*?)(<br\/>|$)/g, '<h3>$1</h3>')
                .replace(/### (.*?)(<br\/>|$)/g, '<h4>$1</h4>')
            }} />
          </div>
        );
      
      case 'input':
        return (
          <div key={index} className="space-y-2">
            <label className={labelClasses}>
              {attributes.label}
              {isRequired && <span className="text-red-500 ml-1">*</span>}
            </label>
            {attributes.description && (
              <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                {attributes.description}
              </p>
            )}
            <input
              type="text"
              value={fieldValue || ''}
              onChange={(e) => handleFieldChange(id, e.target.value)}
              placeholder={attributes.placeholder || ''}
              className={inputClasses}
            />
            {hasError && (
              <p className="text-red-500 text-sm flex items-center gap-1">
                <AlertCircle size={14} /> {hasError}
              </p>
            )}
          </div>
        );
      
      case 'textarea':
        return (
          <div key={index} className="space-y-2">
            <label className={labelClasses}>
              {attributes.label}
              {isRequired && <span className="text-red-500 ml-1">*</span>}
            </label>
            {attributes.description && (
              <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                {attributes.description}
              </p>
            )}
            <textarea
              value={fieldValue || attributes.value || ''}
              onChange={(e) => handleFieldChange(id, e.target.value)}
              placeholder={attributes.placeholder || ''}
              rows={attributes.render === 'shell' ? 6 : 4}
              className={`${inputClasses} ${attributes.render === 'shell' ? 'font-mono text-sm' : ''}`}
            />
            {hasError && (
              <p className="text-red-500 text-sm flex items-center gap-1">
                <AlertCircle size={14} /> {hasError}
              </p>
            )}
          </div>
        );
      
      case 'dropdown':
        if (attributes.multiple) {
          // Multi-select as checkboxes
          return (
            <div key={index} className="space-y-2">
              <label className={labelClasses}>
                {attributes.label}
                {isRequired && <span className="text-red-500 ml-1">*</span>}
              </label>
              {attributes.description && (
                <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  {attributes.description}
                </p>
              )}
              <div className={`space-y-2 p-3 rounded-lg ${isDark ? 'bg-gray-700' : 'bg-gray-50'}`}>
                {(attributes.options || []).map((option, optIndex) => (
                  <label 
                    key={optIndex} 
                    className={`flex items-center gap-3 p-2 rounded cursor-pointer hover:${isDark ? 'bg-gray-600' : 'bg-gray-100'}`}
                  >
                    <input
                      type="checkbox"
                      checked={(fieldValue || []).includes(option)}
                      onChange={(e) => handleMultiSelectChange(id, option, e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                    />
                    <span className={isDark ? 'text-gray-200' : 'text-gray-700'}>{option}</span>
                  </label>
                ))}
              </div>
              {hasError && (
                <p className="text-red-500 text-sm flex items-center gap-1">
                  <AlertCircle size={14} /> {hasError}
                </p>
              )}
            </div>
          );
        }
        
        // Single select dropdown
        return (
          <div key={index} className="space-y-2">
            <label className={labelClasses}>
              {attributes.label}
              {isRequired && <span className="text-red-500 ml-1">*</span>}
            </label>
            {attributes.description && (
              <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                {attributes.description}
              </p>
            )}
            <div className="relative">
              <select
                value={fieldValue ?? (attributes.default !== undefined ? attributes.options?.[attributes.default] : '')}
                onChange={(e) => handleFieldChange(id, e.target.value)}
                className={`${inputClasses} appearance-none pr-10`}
              >
                <option value="">Select an option...</option>
                {(attributes.options || []).map((option, optIndex) => (
                  <option key={optIndex} value={option}>{option}</option>
                ))}
              </select>
              <ChevronDown 
                className={`absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none ${
                  isDark ? 'text-gray-400' : 'text-gray-500'
                }`} 
                size={20} 
              />
            </div>
            {hasError && (
              <p className="text-red-500 text-sm flex items-center gap-1">
                <AlertCircle size={14} /> {hasError}
              </p>
            )}
          </div>
        );
      
      case 'checkboxes':
        return (
          <div key={index} className="space-y-2">
            <label className={labelClasses}>
              {attributes.label}
            </label>
            {attributes.description && (
              <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                {attributes.description}
              </p>
            )}
            <div className={`space-y-2 p-3 rounded-lg ${isDark ? 'bg-gray-700' : 'bg-gray-50'}`}>
              {(attributes.options || []).map((option, optIndex) => {
                const optionLabel = typeof option === 'object' ? option.label : option;
                const optionRequired = typeof option === 'object' ? option.required : false;
                const isChecked = (fieldValue || []).includes(optIndex);
                
                return (
                  <label 
                    key={optIndex} 
                    className={`flex items-start gap-3 p-2 rounded cursor-pointer hover:${isDark ? 'bg-gray-600' : 'bg-gray-100'}`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) => handleCheckboxChange(id, optIndex, e.target.checked, optionRequired)}
                      className="w-4 h-4 mt-0.5 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                    />
                    <span className={isDark ? 'text-gray-200' : 'text-gray-700'}>
                      {optionLabel}
                      {optionRequired && <span className="text-red-500 ml-1">*</span>}
                    </span>
                  </label>
                );
              })}
            </div>
            {hasError && (
              <p className="text-red-500 text-sm flex items-center gap-1">
                <AlertCircle size={14} /> {hasError}
              </p>
            )}
          </div>
        );
      
      default:
        return null;
    }
  };
  
  if (!template || !template.body) {
    return (
      <div className={`p-4 rounded-lg ${isDark ? 'bg-gray-700' : 'bg-gray-100'} text-center`}>
        <p className={isDark ? 'text-gray-400' : 'text-gray-500'}>
          No template fields to display
        </p>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      {template.body.map((field, index) => renderField(field, index))}
    </div>
  );
};

/**
 * Validate form values against template requirements
 */
export const validateTemplateForm = (template, values) => {
  const errors = {};
  
  if (!template?.body) return errors;
  
  for (const field of template.body) {
    const { type, id, attributes = {}, validations = {} } = field;
    
    // Skip non-input types
    if (type === 'markdown') continue;
    
    const value = values[id];
    
    // Check required fields
    if (validations.required) {
      if (type === 'checkboxes') {
        // For checkboxes, check if required options are checked
        const options = attributes.options || [];
        options.forEach((option, index) => {
          if (typeof option === 'object' && option.required) {
            if (!value || !value.includes(index)) {
              errors[id] = 'Please check all required options';
            }
          }
        });
      } else if (!value || (Array.isArray(value) && value.length === 0)) {
        errors[id] = 'This field is required';
      } else if (typeof value === 'string' && !value.trim()) {
        errors[id] = 'This field is required';
      }
    }
  }
  
  return errors;
};

/**
 * Build issue body from template and form values
 */
export const buildIssueBody = (template, values) => {
  if (!template?.body) return '';
  
  const sections = [];
  
  for (const field of template.body) {
    const { type, id, attributes = {} } = field;
    const value = values[id];
    
    // Skip markdown and empty values
    if (type === 'markdown') continue;
    if (!value || (Array.isArray(value) && value.length === 0)) continue;
    
    const label = attributes.label || id;
    
    switch (type) {
      case 'input':
      case 'textarea':
        sections.push(`### ${label}\n${value}`);
        break;
      
      case 'dropdown':
        if (Array.isArray(value)) {
          sections.push(`### ${label}\n${value.join(', ')}`);
        } else {
          sections.push(`### ${label}\n${value}`);
        }
        break;
      
      case 'checkboxes':
        const options = attributes.options || [];
        const checkedLabels = value.map(index => {
          const opt = options[index];
          return typeof opt === 'object' ? opt.label : opt;
        });
        if (checkedLabels.length > 0) {
          sections.push(`### ${label}\n${checkedLabels.map(l => `- [x] ${l}`).join('\n')}`);
        }
        break;
    }
  }
  
  return sections.join('\n\n');
};

export default TemplateForm;
