/**
 * Error Boundary Components
 * 
 * Prevents entire app crashes when individual components fail.
 * Provides graceful degradation with user-friendly error messages.
 * 
 * Usage:
 *   <ErrorBoundary>
 *     <YourComponent />
 *   </ErrorBoundary>
 * 
 *   <RouteErrorBoundary>
 *     <Routes>...</Routes>
 *   </RouteErrorBoundary>
 * 
 * @version 4.2.0-rc69.6
 */

import React from 'react';

// =============================================================================
// Base Error Boundary
// =============================================================================

/**
 * Generic error boundary for component-level failures
 */
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { 
      hasError: false, 
      error: null,
      errorInfo: null 
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    
    // Log to console in development
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    // In production, send to error tracking service
    if (process.env.NODE_ENV === 'production') {
      // TODO: Send to Sentry, LogRocket, etc.
      // reportError(error, errorInfo);
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback UI from props
      if (this.props.fallback) {
        return typeof this.props.fallback === 'function'
          ? this.props.fallback({ 
              error: this.state.error, 
              retry: this.handleRetry 
            })
          : this.props.fallback;
      }

      // Default fallback UI
      return (
        <div className="p-6 bg-red-50 border border-red-200 rounded-lg text-center">
          <div className="text-4xl mb-4">😅</div>
          <h2 className="text-lg font-semibold text-red-800 mb-2">
            Something went wrong
          </h2>
          <p className="text-red-600 text-sm mb-4">
            {this.props.message || "This section couldn't load properly."}
          </p>
          <button
            onClick={this.handleRetry}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
          >
            Try Again
          </button>
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <details className="mt-4 text-left text-xs text-red-700">
              <summary className="cursor-pointer">Error Details</summary>
              <pre className="mt-2 p-2 bg-red-100 rounded overflow-auto">
                {this.state.error.toString()}
                {this.state.errorInfo?.componentStack}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

// =============================================================================
// Route-Level Error Boundary
// =============================================================================

/**
 * Error boundary for entire routes/pages
 * Shows full-page error with navigation options
 */
export class RouteErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Route error:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
          <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
            <div className="text-6xl mb-6">🔥</div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Page Error
            </h1>
            <p className="text-gray-600 mb-6">
              Sorry, this page encountered an unexpected error. 
              Our team has been notified.
            </p>
            <div className="space-y-3">
              <button
                onClick={this.handleRetry}
                className="w-full px-4 py-3 bg-orange-500 text-white rounded-lg font-medium hover:bg-orange-600 transition-colors"
              >
                Reload Page
              </button>
              <button
                onClick={this.handleGoHome}
                className="w-full px-4 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
              >
                Go to Home
              </button>
            </div>
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="mt-6 text-left text-xs text-gray-500">
                <summary className="cursor-pointer text-gray-400">
                  Technical Details
                </summary>
                <pre className="mt-2 p-3 bg-gray-100 rounded text-red-600 overflow-auto">
                  {this.state.error.toString()}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// =============================================================================
// Data Loading Error Boundary
// =============================================================================

/**
 * Error boundary specifically for data loading states
 * Shows appropriate UI for loading, error, and empty states
 */
export class DataErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Data loading error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <h3 className="font-medium text-yellow-800">
                Unable to Load Data
              </h3>
              <p className="text-sm text-yellow-600">
                {this.props.message || "We couldn't fetch the data. Please check your connection."}
              </p>
            </div>
          </div>
          {this.props.onRetry && (
            <button
              onClick={() => {
                this.setState({ hasError: false });
                this.props.onRetry();
              }}
              className="mt-3 text-sm text-yellow-700 underline hover:no-underline"
            >
              Try again
            </button>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

// =============================================================================
// Suspense Fallback Component
// =============================================================================

/**
 * Loading fallback for React.Suspense
 */
export const LoadingFallback = ({ message = 'Loading...' }) => (
  <div className="flex items-center justify-center p-8">
    <div className="text-center">
      <div className="animate-spin text-4xl mb-3">🔥</div>
      <p className="text-gray-500">{message}</p>
    </div>
  </div>
);

// =============================================================================
// API Error Component
// =============================================================================

/**
 * Reusable component for displaying API errors
 */
export const ApiError = ({ 
  error, 
  onRetry, 
  title = 'Error Loading Data',
  showDetails = process.env.NODE_ENV === 'development' 
}) => (
  <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
    <div className="flex items-start gap-3">
      <span className="text-xl">❌</span>
      <div className="flex-1">
        <h3 className="font-medium text-red-800">{title}</h3>
        <p className="text-sm text-red-600 mt-1">
          {error?.message || 'An unexpected error occurred'}
        </p>
        {showDetails && error?.status && (
          <p className="text-xs text-red-400 mt-1">
            Status: {error.status}
          </p>
        )}
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-3 px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
          >
            Retry
          </button>
        )}
      </div>
    </div>
  </div>
);

// =============================================================================
// Empty State Component
// =============================================================================

/**
 * Reusable component for empty data states
 */
export const EmptyState = ({ 
  icon = '📭', 
  title = 'No Data', 
  message = 'Nothing to show here yet.',
  action = null 
}) => (
  <div className="text-center py-12 px-4">
    <div className="text-5xl mb-4">{icon}</div>
    <h3 className="text-lg font-medium text-gray-900 mb-1">{title}</h3>
    <p className="text-gray-500 mb-4">{message}</p>
    {action}
  </div>
);

// =============================================================================
// HOC for Error Boundary Wrapping
// =============================================================================

/**
 * Higher-order component to wrap any component with error boundary
 * 
 * Usage:
 *   const SafeComponent = withErrorBoundary(MyComponent, {
 *     message: 'This feature is temporarily unavailable'
 *   });
 */
export const withErrorBoundary = (Component, options = {}) => {
  return function WrappedComponent(props) {
    return (
      <ErrorBoundary {...options}>
        <Component {...props} />
      </ErrorBoundary>
    );
  };
};

export default ErrorBoundary;
