import React, { useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import ColabScheduler from './ColabScheduler.jsx'
import HelpPage from './pages/HelpPage.jsx'
import PublicToolsCatalog from './pages/PublicToolsCatalog.jsx'
import './index.css'

/**
 * Validate that a redirect path is safe (internal only)
 * Prevents open redirect vulnerabilities
 */
const validateRedirect = (redirect) => {
  if (!redirect) return '/';
  
  // Must start with /
  if (!redirect.startsWith('/')) return '/';
  
  // Must not start with // (protocol-relative URL)
  if (redirect.startsWith('//')) return '/';
  
  // Must not contain scheme
  if (redirect.includes(':')) return '/';
  
  // Must not contain backslashes (IE compat)
  if (redirect.includes('\\')) return '/';
  
  return redirect;
};

// Auth callback handler - processes OAuth tokens and redirects to main app
// SECURITY: Now reads tokens from URL fragment (#) instead of query params
// to prevent leakage via HTTP Referer headers
const AuthCallback = () => {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  
  useEffect(() => {
    // Check for error in query params first
    const error = searchParams.get('error');
    if (error) {
      console.error('Auth error:', error);
      navigate('/?error=' + encodeURIComponent(error));
      return;
    }
    
    // Parse tokens from URL fragment (hash)
    // Format: #token=xxx&refresh=xxx&session=xxx&redirect=/path
    const hash = location.hash.substring(1); // Remove leading #
    const hashParams = new URLSearchParams(hash);
    
    const token = hashParams.get('token');
    const refresh = hashParams.get('refresh');
    const sessionId = hashParams.get('session');
    const rawRedirect = hashParams.get('redirect');
    
    // Validate redirect to prevent open redirect attacks
    const redirect = validateRedirect(rawRedirect);
    
    if (token) {
      // Store tokens and session ID
      localStorage.setItem('colab_token', token);
      if (refresh) {
        localStorage.setItem('colab_refresh', refresh);
      }
      if (sessionId) {
        localStorage.setItem('colab_session', sessionId);
      }
      
      // Clear the hash from URL before navigating (security hygiene)
      window.history.replaceState(null, '', location.pathname);
      
      // Navigate to validated destination
      navigate(redirect);
    } else {
      // No token found - redirect to home
      navigate('/');
    }
  }, [searchParams, location, navigate]);
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
      <div className="text-center">
        <div className="animate-spin w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full mx-auto mb-4"></div>
        <p className="text-gray-600 dark:text-gray-400">Completing sign in...</p>
      </div>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ColabScheduler />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/register" element={<ColabScheduler />} />
        <Route path="/settings" element={<ColabScheduler />} />
        <Route path="/reset-password" element={<ColabScheduler />} />
        <Route path="/help" element={<HelpPage />} />
        <Route path="/tools" element={<PublicToolsCatalog />} />
        <Route path="/equipment" element={<PublicToolsCatalog />} />
        {/* Catch-all route - redirect unknown paths to home */}
        <Route path="*" element={<ColabScheduler />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
)
