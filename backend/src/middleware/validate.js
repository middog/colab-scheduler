/**
 * SDCoLab Scheduler - Validation Middleware
 * 
 * Request validation using Zod schemas.
 * Validates body, query params, and URL params.
 * 
 * 🔥 Fire Triangle: OXYGEN layer - input sanitization
 * 
 * @version 4.3.0
 */

import { ZodError } from 'zod';

/**
 * Format Zod errors into a clean API response
 * 
 * @param {ZodError} error - Zod validation error
 * @returns {object} Formatted error response
 */
const formatZodError = (error) => {
  const fields = {};
  
  for (const issue of error.issues) {
    const path = issue.path.join('.');
    if (!fields[path]) {
      fields[path] = [];
    }
    fields[path].push(issue.message);
  }
  
  return {
    error: 'Validation failed',
    code: 'VALIDATION_ERROR',
    fields
  };
};

/**
 * Create validation middleware for a route
 * 
 * @param {object} schemas - Zod schemas for different parts of the request
 * @param {ZodSchema} schemas.body - Schema for request body
 * @param {ZodSchema} schemas.query - Schema for query parameters
 * @param {ZodSchema} schemas.params - Schema for URL parameters
 * @param {object} options - Validation options
 * @param {boolean} options.stripUnknown - Remove unknown fields (default: true)
 * @returns {Function} Express middleware
 */
export const validate = (schemas, options = {}) => {
  const { stripUnknown = true } = options;
  
  return async (req, res, next) => {
    try {
      // Validate body
      if (schemas.body) {
        const result = stripUnknown 
          ? schemas.body.safeParse(req.body)
          : schemas.body.strict().safeParse(req.body);
        
        if (!result.success) {
          return res.status(400).json(formatZodError(result.error));
        }
        req.body = result.data;
      }
      
      // Validate query parameters
      if (schemas.query) {
        const result = schemas.query.safeParse(req.query);
        if (!result.success) {
          return res.status(400).json(formatZodError(result.error));
        }
        req.query = result.data;
      }
      
      // Validate URL parameters
      if (schemas.params) {
        const result = schemas.params.safeParse(req.params);
        if (!result.success) {
          return res.status(400).json(formatZodError(result.error));
        }
        req.params = result.data;
      }
      
      next();
    } catch (error) {
      console.error('Validation middleware error:', error);
      res.status(500).json({ error: 'Validation error' });
    }
  };
};

/**
 * Convenience wrapper for body-only validation
 * 
 * @param {ZodSchema} schema - Zod schema for request body
 * @returns {Function} Express middleware
 */
export const validateBody = (schema) => validate({ body: schema });

/**
 * Convenience wrapper for query-only validation
 * 
 * @param {ZodSchema} schema - Zod schema for query parameters
 * @returns {Function} Express middleware
 */
export const validateQuery = (schema) => validate({ query: schema });

/**
 * Convenience wrapper for params-only validation
 * 
 * @param {ZodSchema} schema - Zod schema for URL parameters
 * @returns {Function} Express middleware
 */
export const validateParams = (schema) => validate({ params: schema });

export default { validate, validateBody, validateQuery, validateParams };
