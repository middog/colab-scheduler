import React, { useState, useEffect } from 'react';
import { 
  BookOpen, Calendar, Clock, Users, Wrench, MapPin, 
  Send, X, AlertCircle, CheckCircle, ChevronDown
} from 'lucide-react';
import { api } from '../lib/api.js';

/**
 * Class Proposal Form
 * 
 * Allows instructors to propose new classes/workshops for the makerspace.
 * Integrates with GitHub Issues for tracking and approval workflow.
 * 
 * 🔥 Fire Triangle: HEAT layer - community engagement through education
 * 
 * @version 4.2.0-rc69.15
 */

const TOOLS = [
  { id: 'laser', name: 'Laser Cutter', room: 'Laser Lab' },
  { id: '3dprinter', name: '3D Printer', room: '3D Printing Area' },
  { id: 'cnc', name: 'CNC Router', room: 'CNC Area' },
  { id: 'solder', name: 'Soldering Station', room: 'Electronics Lab' },
  { id: 'sewing-standard', name: 'Sewing Machines', room: 'Sewing Room' },
  { id: 'sewing-industrial', name: 'Industrial Sewing', room: 'Sewing Room' },
  { id: 'woodshop', name: 'Woodshop', room: 'Woodshop' }
];

const SKILL_LEVELS = [
  { id: 'beginner', name: 'Beginner', desc: 'No prior experience required' },
  { id: 'intermediate', name: 'Intermediate', desc: 'Some familiarity with tools/concepts' },
  { id: 'advanced', name: 'Advanced', desc: 'Significant experience required' }
];

const CLASS_TYPES = [
  { id: 'certification', name: 'Certification Training', desc: 'Required for tool access' },
  { id: 'workshop', name: 'Workshop', desc: 'Hands-on skill building' },
  { id: 'seminar', name: 'Seminar', desc: 'Lecture/demo format' },
  { id: 'open-lab', name: 'Open Lab', desc: 'Supervised practice time' }
];

export default function ClassProposalForm({ isOpen, onClose, theme, user, onSuccess }) {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    classType: 'workshop',
    skillLevel: 'beginner',
    tools: [],
    prerequisites: '',
    maxParticipants: 8,
    estimatedDuration: 2,
    materialsProvided: true,
    materialsCost: 0,
    proposedDates: '',
    additionalNotes: ''
  });
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  
  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setError(null);
  };
  
  const toggleTool = (toolId) => {
    setFormData(prev => ({
      ...prev,
      tools: prev.tools.includes(toolId)
        ? prev.tools.filter(t => t !== toolId)
        : [...prev.tools, toolId]
    }));
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validation
    if (!formData.title.trim()) {
      setError('Please enter a class title');
      return;
    }
    if (!formData.description.trim()) {
      setError('Please provide a class description');
      return;
    }
    if (formData.tools.length === 0) {
      setError('Please select at least one tool/area');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      // Build issue body for GitHub
      const selectedTools = formData.tools.map(id => TOOLS.find(t => t.id === id)?.name).join(', ');
      const selectedRooms = [...new Set(formData.tools.map(id => TOOLS.find(t => t.id === id)?.room))].join(', ');
      
      const issueBody = `## Class Proposal

### Basic Information
- **Title:** ${formData.title}
- **Type:** ${CLASS_TYPES.find(t => t.id === formData.classType)?.name}
- **Skill Level:** ${SKILL_LEVELS.find(s => s.id === formData.skillLevel)?.name}
- **Proposed By:** ${user?.displayName || user?.email}

### Description
${formData.description}

### Logistics
- **Tools/Equipment:** ${selectedTools}
- **Rooms Needed:** ${selectedRooms}
- **Max Participants:** ${formData.maxParticipants}
- **Estimated Duration:** ${formData.estimatedDuration} hours
- **Materials Provided:** ${formData.materialsProvided ? 'Yes' : 'No'}
${formData.materialsCost > 0 ? `- **Materials Cost:** $${formData.materialsCost}` : ''}

### Prerequisites
${formData.prerequisites || 'None specified'}

### Proposed Schedule
${formData.proposedDates || 'Flexible - to be determined'}

### Additional Notes
${formData.additionalNotes || 'None'}

---
*Submitted via SDCoLab Scheduler Class Proposal Portal*`;

      // Create GitHub issue via API
      const response = await api('/github/issues', {
        method: 'POST',
        body: JSON.stringify({
          title: `[Class Proposal] ${formData.title}`,
          body: issueBody,
          labels: [
            'fire:heat',
            'template:class-proposal',
            `class-type:${formData.classType}`,
            `skill-level:${formData.skillLevel}`,
            'status:new'
          ]
        })
      });
      
      setSuccess(true);
      if (onSuccess) {
        onSuccess(response);
      }
    } catch (err) {
      setError(err.message || 'Failed to submit class proposal');
    } finally {
      setLoading(false);
    }
  };
  
  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      classType: 'workshop',
      skillLevel: 'beginner',
      tools: [],
      prerequisites: '',
      maxParticipants: 8,
      estimatedDuration: 2,
      materialsProvided: true,
      materialsCost: 0,
      proposedDates: '',
      additionalNotes: ''
    });
    setError(null);
    setSuccess(false);
  };
  
  const handleClose = () => {
    resetForm();
    onClose();
  };
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black/50" onClick={handleClose} />
      <div className="relative min-h-screen flex items-center justify-center p-4">
        <div className={`relative w-full max-w-2xl rounded-xl shadow-2xl ${
          theme === 'dark' ? 'bg-gray-800 text-white' : 'bg-white'
        }`}>
          {/* Header */}
          <div className={`flex items-center justify-between p-4 border-b ${
            theme === 'dark' ? 'border-gray-700' : 'border-gray-200'
          }`}>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <BookOpen className="text-orange-500" size={24} />
              Propose a Class
            </h2>
            <button
              onClick={handleClose}
              className={`p-2 rounded-lg transition-colors ${
                theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-100'
              }`}
            >
              <X size={20} />
            </button>
          </div>
          
          {/* Content */}
          <div className="p-6 max-h-[70vh] overflow-y-auto">
            {success ? (
              <div className="text-center py-8">
                <CheckCircle className="mx-auto text-green-500 mb-4" size={48} />
                <h3 className="text-xl font-bold mb-2">Proposal Submitted!</h3>
                <p className={`mb-6 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                  Your class proposal has been submitted for review. You'll be notified when it's approved.
                </p>
                <div className="flex gap-3 justify-center">
                  <button
                    onClick={resetForm}
                    className={`px-4 py-2 rounded-lg border ${
                      theme === 'dark' ? 'border-gray-600 hover:bg-gray-700' : 'hover:bg-gray-100'
                    }`}
                  >
                    Submit Another
                  </button>
                  <button
                    onClick={handleClose}
                    className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                {error && (
                  <div className="p-3 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded-lg flex items-center gap-2 text-red-700 dark:text-red-300">
                    <AlertCircle size={18} />
                    {error}
                  </div>
                )}
                
                {/* Title */}
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Class Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => handleChange('title', e.target.value)}
                    placeholder="e.g., Introduction to Laser Cutting"
                    className={`w-full p-3 border rounded-lg ${
                      theme === 'dark' ? 'bg-gray-700 border-gray-600' : 'border-gray-300'
                    }`}
                  />
                </div>
                
                {/* Class Type & Skill Level */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Class Type</label>
                    <select
                      value={formData.classType}
                      onChange={(e) => handleChange('classType', e.target.value)}
                      className={`w-full p-3 border rounded-lg ${
                        theme === 'dark' ? 'bg-gray-700 border-gray-600' : 'border-gray-300'
                      }`}
                    >
                      {CLASS_TYPES.map(type => (
                        <option key={type.id} value={type.id}>{type.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Skill Level</label>
                    <select
                      value={formData.skillLevel}
                      onChange={(e) => handleChange('skillLevel', e.target.value)}
                      className={`w-full p-3 border rounded-lg ${
                        theme === 'dark' ? 'bg-gray-700 border-gray-600' : 'border-gray-300'
                      }`}
                    >
                      {SKILL_LEVELS.map(level => (
                        <option key={level.id} value={level.id}>{level.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                
                {/* Description */}
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Description <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => handleChange('description', e.target.value)}
                    placeholder="Describe what participants will learn, activities, and outcomes..."
                    rows={4}
                    className={`w-full p-3 border rounded-lg ${
                      theme === 'dark' ? 'bg-gray-700 border-gray-600' : 'border-gray-300'
                    }`}
                  />
                </div>
                
                {/* Tools/Equipment */}
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Tools/Equipment <span className="text-red-500">*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {TOOLS.map(tool => (
                      <button
                        key={tool.id}
                        type="button"
                        onClick={() => toggleTool(tool.id)}
                        className={`p-3 rounded-lg border text-left transition-colors ${
                          formData.tools.includes(tool.id)
                            ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/30'
                            : theme === 'dark' ? 'border-gray-600 hover:bg-gray-700' : 'border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Wrench size={16} className={formData.tools.includes(tool.id) ? 'text-orange-500' : ''} />
                          <span className="font-medium">{tool.name}</span>
                        </div>
                        <div className={`text-xs mt-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                          <MapPin size={12} className="inline mr-1" />{tool.room}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
                
                {/* Logistics */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      <Users size={16} className="inline mr-1" />
                      Max Participants
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="30"
                      value={formData.maxParticipants}
                      onChange={(e) => handleChange('maxParticipants', parseInt(e.target.value) || 1)}
                      className={`w-full p-3 border rounded-lg ${
                        theme === 'dark' ? 'bg-gray-700 border-gray-600' : 'border-gray-300'
                      }`}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      <Clock size={16} className="inline mr-1" />
                      Duration (hours)
                    </label>
                    <input
                      type="number"
                      min="0.5"
                      max="8"
                      step="0.5"
                      value={formData.estimatedDuration}
                      onChange={(e) => handleChange('estimatedDuration', parseFloat(e.target.value) || 1)}
                      className={`w-full p-3 border rounded-lg ${
                        theme === 'dark' ? 'bg-gray-700 border-gray-600' : 'border-gray-300'
                      }`}
                    />
                  </div>
                </div>
                
                {/* Materials */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.materialsProvided}
                        onChange={(e) => handleChange('materialsProvided', e.target.checked)}
                        className="rounded"
                      />
                      <span className="text-sm font-medium">Materials provided by instructor</span>
                    </label>
                  </div>
                  {formData.materialsProvided && (
                    <div>
                      <label className="block text-sm font-medium mb-2">Materials Cost ($)</label>
                      <input
                        type="number"
                        min="0"
                        step="5"
                        value={formData.materialsCost}
                        onChange={(e) => handleChange('materialsCost', parseFloat(e.target.value) || 0)}
                        className={`w-full p-3 border rounded-lg ${
                          theme === 'dark' ? 'bg-gray-700 border-gray-600' : 'border-gray-300'
                        }`}
                      />
                    </div>
                  )}
                </div>
                
                {/* Prerequisites */}
                <div>
                  <label className="block text-sm font-medium mb-2">Prerequisites</label>
                  <input
                    type="text"
                    value={formData.prerequisites}
                    onChange={(e) => handleChange('prerequisites', e.target.value)}
                    placeholder="e.g., Basic shop safety certification required"
                    className={`w-full p-3 border rounded-lg ${
                      theme === 'dark' ? 'bg-gray-700 border-gray-600' : 'border-gray-300'
                    }`}
                  />
                </div>
                
                {/* Proposed Dates */}
                <div>
                  <label className="block text-sm font-medium mb-2">
                    <Calendar size={16} className="inline mr-1" />
                    Proposed Dates/Times
                  </label>
                  <input
                    type="text"
                    value={formData.proposedDates}
                    onChange={(e) => handleChange('proposedDates', e.target.value)}
                    placeholder="e.g., Saturdays 10am-12pm, or flexible"
                    className={`w-full p-3 border rounded-lg ${
                      theme === 'dark' ? 'bg-gray-700 border-gray-600' : 'border-gray-300'
                    }`}
                  />
                </div>
                
                {/* Additional Notes */}
                <div>
                  <label className="block text-sm font-medium mb-2">Additional Notes</label>
                  <textarea
                    value={formData.additionalNotes}
                    onChange={(e) => handleChange('additionalNotes', e.target.value)}
                    placeholder="Any other information about your class proposal..."
                    rows={2}
                    className={`w-full p-3 border rounded-lg ${
                      theme === 'dark' ? 'bg-gray-700 border-gray-600' : 'border-gray-300'
                    }`}
                  />
                </div>
                
                {/* Submit */}
                <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <button
                    type="button"
                    onClick={handleClose}
                    className={`flex-1 p-3 rounded-lg border ${
                      theme === 'dark' ? 'border-gray-600 hover:bg-gray-700' : 'hover:bg-gray-100'
                    }`}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 bg-orange-500 text-white p-3 rounded-lg hover:bg-orange-600 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <>
                        <span className="animate-spin">⏳</span>
                        Submitting...
                      </>
                    ) : (
                      <>
                        <Send size={18} />
                        Submit Proposal
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
