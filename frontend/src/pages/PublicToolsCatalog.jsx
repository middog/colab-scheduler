import React, { useState, useEffect } from 'react';
import { Wrench, MapPin, Users, Shield, ShieldCheck, ExternalLink, Search, Filter, Sun, Moon } from 'lucide-react';
import { api } from '../lib/api.js';

/**
 * Public Tools Catalog
 * 
 * Unauthenticated page showing all available tools at SDCoLab.
 * Accessible at /tools (public)
 * 
 * 🔥 Fire Triangle: HEAT layer - community visibility
 * 
 * @version 4.2.0-rc69.6
 */

const PublicToolsCatalog = () => {
  const [tools, setTools] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [theme, setTheme] = useState(() => 
    window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  );

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    const fetchTools = async () => {
      try {
        // Use shared api client - auto-unwraps standardized response
        const data = await api('/public/tools');
        setTools(data.tools || []);
        setCategories(data.categories || []);
      } catch (err) {
        setError('Failed to load tools');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchTools();
  }, []);

  const filteredTools = tools.filter(tool => {
    const matchesSearch = tool.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         tool.category.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = !selectedCategory || tool.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const categoryIcons = {
    fabrication: '🔨',
    electronics: '⚡',
    textiles: '🧵',
    woodworking: '🪚',
    general: '🔧'
  };

  const isDark = theme === 'dark';
  const bg = isDark ? 'bg-gray-900' : 'bg-gray-50';
  const cardBg = isDark ? 'bg-gray-800' : 'bg-white';
  const text = isDark ? 'text-white' : 'text-gray-900';
  const textMuted = isDark ? 'text-gray-400' : 'text-gray-600';
  const border = isDark ? 'border-gray-700' : 'border-gray-200';

  return (
    <div className={`min-h-screen ${bg} ${text}`}>
      {/* Header */}
      <header className={`${
        isDark 
          ? 'bg-gradient-to-r from-gray-800 via-purple-900 to-gray-800' 
          : 'bg-gradient-to-r from-orange-500 via-pink-500 to-purple-600'
      } text-white`}>
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-3">
                <span className="text-4xl">🔥</span>
                SDCoLab Equipment Catalog
              </h1>
              <p className="mt-2 text-white/80">
                San Diego Collaborative Arts Project • Community Makerspace
              </p>
            </div>
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
                className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              >
                {isDark ? <Sun size={20} /> : <Moon size={20} />}
              </button>
              <a 
                href="/"
                className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
              >
                Sign In
              </a>
            </div>
          </div>
        </div>
      </header>

      {/* Search & Filters */}
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className={`${cardBg} rounded-xl shadow-lg p-4 flex flex-col md:flex-row gap-4`}>
          <div className="flex-1 relative">
            <Search size={20} className={`absolute left-3 top-1/2 -translate-y-1/2 ${textMuted}`} />
            <input
              type="text"
              placeholder="Search tools..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full pl-10 pr-4 py-3 rounded-lg border ${
                isDark ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-300'
              } focus:ring-2 focus:ring-orange-500 focus:border-transparent`}
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter size={20} className={textMuted} />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className={`px-4 py-3 rounded-lg border ${
                isDark ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-300'
              }`}
            >
              <option value="">All Categories</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>
                  {categoryIcons[cat] || '🔧'} {cat.charAt(0).toUpperCase() + cat.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Tools Grid */}
      <div className="max-w-6xl mx-auto px-4 pb-12">
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin inline-block w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full"></div>
            <p className={`mt-4 ${textMuted}`}>Loading equipment...</p>
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-red-500">{error}</p>
          </div>
        ) : filteredTools.length === 0 ? (
          <div className="text-center py-12">
            <Wrench size={48} className={`mx-auto mb-4 ${textMuted}`} />
            <p className={textMuted}>No tools found matching your criteria</p>
          </div>
        ) : (
          <>
            <p className={`mb-6 ${textMuted}`}>
              Showing {filteredTools.length} of {tools.length} tools
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredTools.map(tool => (
                <div 
                  key={tool.id}
                  className={`${cardBg} rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-shadow border ${border}`}
                >
                  {/* Tool Header */}
                  <div className={`p-4 border-b ${border} ${
                    isDark ? 'bg-gray-700/50' : 'bg-gray-50'
                  }`}>
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-2xl mr-2">
                          {categoryIcons[tool.category] || '🔧'}
                        </span>
                        <h3 className="text-lg font-bold inline">{tool.name}</h3>
                      </div>
                      {tool.requiresCert ? (
                        <span className="flex items-center gap-1 text-xs px-2 py-1 bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 rounded-full">
                          <ShieldCheck size={12} />
                          Cert Required
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs px-2 py-1 bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 rounded-full">
                          <Shield size={12} />
                          Open Access
                        </span>
                      )}
                    </div>
                  </div>
                  
                  {/* Tool Details */}
                  <div className="p-4 space-y-3">
                    <div className={`flex items-center gap-2 text-sm ${textMuted}`}>
                      <MapPin size={16} />
                      <span>{tool.roomName}</span>
                    </div>
                    
                    <div className={`flex items-center gap-2 text-sm ${textMuted}`}>
                      <Users size={16} />
                      <span>
                        {tool.maxConcurrent === 1 
                          ? '1 user at a time' 
                          : `Up to ${tool.maxConcurrent} concurrent users`}
                      </span>
                    </div>
                    
                    <div className={`flex items-center gap-2 text-sm`}>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        isDark ? 'bg-gray-700' : 'bg-gray-100'
                      }`}>
                        {tool.category}
                      </span>
                    </div>
                    
                    {tool.description && (
                      <p className={`text-sm ${textMuted} line-clamp-2`}>
                        {tool.description}
                      </p>
                    )}
                  </div>
                  
                  {/* Action */}
                  <div className={`p-4 border-t ${border}`}>
                    <a
                      href={`/?tool=${tool.id}`}
                      className="block w-full text-center px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors"
                    >
                      Book This Tool
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Fire Triangle Info */}
      <div className={`${isDark ? 'bg-gray-800' : 'bg-white'} border-t ${border}`}>
        <div className="max-w-6xl mx-auto px-4 py-12">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold">🔥 The Fire Triangle</h2>
            <p className={`mt-2 ${textMuted}`}>How we organize our community</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="text-4xl mb-4">🟡</div>
              <h3 className="font-bold text-yellow-500">FUEL</h3>
              <p className={`mt-2 text-sm ${textMuted}`}>
                Physical resources: tools, materials, and spaces that enable creation
              </p>
            </div>
            <div className="text-center">
              <div className="text-4xl mb-4">🔵</div>
              <h3 className="font-bold text-blue-500">OXYGEN</h3>
              <p className={`mt-2 text-sm ${textMuted}`}>
                Process & governance: how we organize, schedule, and maintain
              </p>
            </div>
            <div className="text-center">
              <div className="text-4xl mb-4">🔴</div>
              <h3 className="font-bold text-red-500">HEAT</h3>
              <p className={`mt-2 text-sm ${textMuted}`}>
                Community energy: the people, passion, and participation
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className={`${isDark ? 'bg-gray-900' : 'bg-gray-100'} border-t ${border}`}>
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className={textMuted}>
              <p>© {new Date().getFullYear()} San Diego Collaborative Arts Project</p>
              <p className="text-sm">501(c)(3) Nonprofit Organization</p>
            </div>
            <div className="flex gap-6">
              <a href="https://sdcolab.org" className={`${textMuted} hover:text-orange-500`}>
                Website
              </a>
              <a href="/help" className={`${textMuted} hover:text-orange-500`}>
                Help
              </a>
              <a href="mailto:info@sdcolab.org" className={`${textMuted} hover:text-orange-500`}>
                Contact
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default PublicToolsCatalog;
