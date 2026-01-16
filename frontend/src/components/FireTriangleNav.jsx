/**
 * SDCoLab Scheduler - Fire Triangle Navigation
 * 
 * Grouped navigation using Fire Triangle metaphor:
 * 🌬️ Oxygen - Participate (schedule, bookings, certs)
 * 🪵 Fuel - Resources (tools, config)
 * 🔥 Heat - Community (people, issues, activity)
 * ⚙️ System - Operator only (integrations, templates, roles)
 * 
 * @version 4.2.0-rc69.15
 */

import React, { useState } from 'react';
import { 
  Calendar, CalendarRange, Award, Settings, Wrench, Users, 
  AlertTriangle, Activity, Zap, FileText, Shield, ChevronDown, ChevronRight,
  Eye, EyeOff
} from 'lucide-react';
import { useTheme } from './ColabScheduler.jsx';
import { 
  getAccessibleNavGroups, 
  parseRouteHash, 
  buildRouteHash,
  isTender,
  hasFullToolAccess 
} from './lib/permissions.js';

// Icon mapping
const ICONS = {
  Calendar, CalendarRange, Award, Settings, Wrench, Users,
  AlertTriangle, Activity, Zap, FileText, Shield
};

/**
 * Fire Triangle Navigation Component
 */
const FireTriangleNav = ({ 
  user, 
  currentHash, 
  onNavigate, 
  pendingCount = 0,
  showAllToggle = false,
  onShowAllChange = () => {}
}) => {
  const { theme } = useTheme();
  const [expandedGroups, setExpandedGroups] = useState({
    oxygen: true,
    fuel: true,
    heat: true,
    system: true
  });
  
  const groups = getAccessibleNavGroups(user);
  const { group: currentGroup, view: currentView } = parseRouteHash(currentHash);
  
  const toggleGroup = (groupId) => {
    setExpandedGroups(prev => ({
      ...prev,
      [groupId]: !prev[groupId]
    }));
  };
  
  const handleNavigate = (group, view) => {
    const hash = buildRouteHash(group, view);
    onNavigate(hash, group, view);
  };
  
  // Show "All Tools" toggle for scoped tenders in Fuel/Heat views
  const showScopeToggle = isTender(user) && !hasFullToolAccess(user) && 
    (currentGroup === 'fuel' || currentGroup === 'heat');
  
  return (
    <nav className={`${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white'} border-b`}>
      <div className="max-w-7xl mx-auto">
        {/* Desktop: Horizontal grouped tabs */}
        <div className="hidden md:flex items-center gap-1 p-2 overflow-x-auto">
          {groups.map(group => (
            <div key={group.id} className="flex items-center">
              {/* Group label */}
              <span className={`px-2 py-1 text-xs font-medium rounded-l ${
                currentGroup === group.id
                  ? 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300'
                  : 'text-gray-500 dark:text-gray-400'
              }`}>
                {group.icon}
              </span>
              
              {/* Group routes */}
              <div className="flex">
                {group.routes.map((route, idx) => {
                  const Icon = ICONS[route.icon] || Calendar;
                  const isActive = currentGroup === group.id && currentView === route.id;
                  const isLast = idx === group.routes.length - 1;
                  
                  // Add pending count badge for people view
                  const showBadge = route.id === 'people' && pendingCount > 0;
                  
                  return (
                    <button
                      key={route.id}
                      onClick={() => handleNavigate(group.id, route.id)}
                      className={`flex items-center gap-1.5 px-3 py-2 text-sm whitespace-nowrap transition-colors ${
                        isActive 
                          ? 'bg-orange-500 text-white' 
                          : theme === 'dark' 
                            ? 'hover:bg-gray-700 text-gray-300' 
                            : 'hover:bg-gray-100 text-gray-700'
                      } ${isLast ? 'rounded-r' : ''}`}
                    >
                      <Icon size={16} />
                      <span>{route.label}</span>
                      {showBadge && (
                        <span className="ml-1 px-1.5 py-0.5 text-xs bg-red-500 text-white rounded-full">
                          {pendingCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              
              {/* Separator between groups */}
              <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-2" />
            </div>
          ))}
          
          {/* Scope toggle for tenders */}
          {showScopeToggle && (
            <button
              onClick={() => onShowAllChange(!showAllToggle)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded ml-auto ${
                showAllToggle
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                  : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
              title={showAllToggle ? 'Showing all tools (read-only)' : 'Showing your tools only'}
            >
              {showAllToggle ? <Eye size={16} /> : <EyeOff size={16} />}
              <span className="hidden lg:inline">
                {showAllToggle ? 'All Tools' : 'My Tools'}
              </span>
            </button>
          )}
        </div>
        
        {/* Mobile: Collapsible groups */}
        <div className="md:hidden p-2 space-y-1">
          {groups.map(group => (
            <div key={group.id}>
              {/* Group header */}
              <button
                onClick={() => toggleGroup(group.id)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded ${
                  currentGroup === group.id
                    ? 'bg-orange-100 dark:bg-orange-900/30'
                    : ''
                }`}
              >
                <span className="flex items-center gap-2 font-medium">
                  <span>{group.icon}</span>
                  <span>{group.label}</span>
                </span>
                {expandedGroups[group.id] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>
              
              {/* Group routes */}
              {expandedGroups[group.id] && (
                <div className="ml-6 mt-1 space-y-1">
                  {group.routes.map(route => {
                    const Icon = ICONS[route.icon] || Calendar;
                    const isActive = currentGroup === group.id && currentView === route.id;
                    const showBadge = route.id === 'people' && pendingCount > 0;
                    
                    return (
                      <button
                        key={route.id}
                        onClick={() => handleNavigate(group.id, route.id)}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded text-sm ${
                          isActive 
                            ? 'bg-orange-500 text-white' 
                            : theme === 'dark'
                              ? 'hover:bg-gray-700'
                              : 'hover:bg-gray-100'
                        }`}
                      >
                        <Icon size={16} />
                        <span>{route.label}</span>
                        {showBadge && (
                          <span className="ml-auto px-1.5 py-0.5 text-xs bg-red-500 text-white rounded-full">
                            {pendingCount}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
          
          {/* Mobile scope toggle */}
          {showScopeToggle && (
            <button
              onClick={() => onShowAllChange(!showAllToggle)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded text-sm mt-2 ${
                showAllToggle
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                  : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              {showAllToggle ? <Eye size={16} /> : <EyeOff size={16} />}
              <span>{showAllToggle ? 'Showing All Tools (Read-only)' : 'Showing My Tools Only'}</span>
            </button>
          )}
        </div>
      </div>
    </nav>
  );
};

export default FireTriangleNav;
