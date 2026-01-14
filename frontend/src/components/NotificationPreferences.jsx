import React, { useState, useEffect, useCallback } from 'react';
import { 
  Bell, Mail, MessageSquare, Smartphone, Clock, 
  CheckCircle, Settings, Save, RefreshCw, BellOff
} from 'lucide-react';
import { api } from '../lib/api.js';

/**
 * Notification Preferences Panel
 * 
 * Features:
 * - Configure email notification settings
 * - Set booking reminder timing
 * - Certification expiry warning settings
 * - Toggle digest emails
 * - SMS preferences (future)
 * 
 * 🔥 Fire Triangle: OXYGEN layer - communication preferences
 * 
 * @version 4.2.0-rc69.6
 */

const NotificationPreferences = ({ token, user, theme, showMessage, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preferences, setPreferences] = useState({
    email: {
      enabled: true,
      bookingReminders: true,
      bookingReminderTiming: 24,
      certExpiryWarnings: true,
      certExpiryTiming: 30,
      weeklyDigest: false,
      announcements: true
    },
    sms: {
      enabled: false,
      bookingReminders: false,
      bookingReminderTiming: 2,
      urgentOnly: true
    },
    push: {
      enabled: false,
      bookingReminders: false,
      announcements: true
    },
    inApp: {
      enabled: true,
      showBadges: true
    }
  });

  // api() from lib/api.js auto-unwraps { success, data } -> data
  const loadPreferences = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api('/notifications/preferences');
      // data is already unwrapped: { preferences: {...} }
      setPreferences(prev => ({ ...prev, ...data.preferences }));
    } catch (err) {
      showMessage('Failed to load preferences', 'error');
    } finally {
      setLoading(false);
    }
  }, [showMessage]);

  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  const handleSave = async () => {
    try {
      setSaving(true);
      await api('/notifications/preferences', {
        method: 'PUT',
        body: JSON.stringify(preferences)
      });
      showMessage('Preferences saved successfully');
      if (onClose) onClose();
    } catch (err) {
      showMessage(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const updateEmailPref = (key, value) => {
    setPreferences(prev => ({
      ...prev,
      email: { ...prev.email, [key]: value }
    }));
  };

  const updateSmsPref = (key, value) => {
    setPreferences(prev => ({
      ...prev,
      sms: { ...prev.sms, [key]: value }
    }));
  };

  const updatePushPref = (key, value) => {
    setPreferences(prev => ({
      ...prev,
      push: { ...prev.push, [key]: value }
    }));
  };

  const updateInAppPref = (key, value) => {
    setPreferences(prev => ({
      ...prev,
      inApp: { ...prev.inApp, [key]: value }
    }));
  };

  const isDark = theme === 'dark';
  const cardClass = `p-4 rounded-lg border ${isDark ? 'border-gray-700 bg-gray-700/50' : 'border-gray-200 bg-gray-50'}`;
  const inputClass = `p-2 rounded border ${isDark ? 'bg-gray-700 border-gray-600' : 'border-gray-300'}`;

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin inline-block w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full"></div>
        <p className="mt-2 text-gray-500">Loading preferences...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="text-orange-500" size={24} />
          <h2 className="text-xl font-bold">Notification Preferences</h2>
        </div>
        <button
          onClick={loadPreferences}
          className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
          title="Refresh"
        >
          <RefreshCw size={18} />
        </button>
      </div>

      {/* Email Notifications */}
      <div className={cardClass}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Mail className="text-blue-500" size={20} />
            <h3 className="font-bold">Email Notifications</h3>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={preferences.email.enabled}
              onChange={(e) => updateEmailPref('enabled', e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-300 peer-focus:ring-2 peer-focus:ring-orange-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
          </label>
        </div>

        {preferences.email.enabled && (
          <div className="space-y-4 pl-7">
            {/* Booking Reminders */}
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Booking Reminders</p>
                <p className="text-sm text-gray-500">Get reminded before your bookings</p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={preferences.email.bookingReminders}
                  onChange={(e) => updateEmailPref('bookingReminders', e.target.checked)}
                  className="rounded"
                />
              </div>
            </div>
            
            {preferences.email.bookingReminders && (
              <div className="flex items-center gap-2 ml-4">
                <Clock size={16} className="text-gray-400" />
                <span className="text-sm">Remind me</span>
                <select
                  value={preferences.email.bookingReminderTiming}
                  onChange={(e) => updateEmailPref('bookingReminderTiming', parseInt(e.target.value))}
                  className={inputClass}
                >
                  <option value="1">1 hour</option>
                  <option value="2">2 hours</option>
                  <option value="4">4 hours</option>
                  <option value="12">12 hours</option>
                  <option value="24">1 day</option>
                  <option value="48">2 days</option>
                  <option value="72">3 days</option>
                </select>
                <span className="text-sm">before</span>
              </div>
            )}

            {/* Certification Expiry */}
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Certification Expiry Warnings</p>
                <p className="text-sm text-gray-500">Get notified when certifications expire soon</p>
              </div>
              <input
                type="checkbox"
                checked={preferences.email.certExpiryWarnings}
                onChange={(e) => updateEmailPref('certExpiryWarnings', e.target.checked)}
                className="rounded"
              />
            </div>
            
            {preferences.email.certExpiryWarnings && (
              <div className="flex items-center gap-2 ml-4">
                <Clock size={16} className="text-gray-400" />
                <span className="text-sm">Warn me</span>
                <select
                  value={preferences.email.certExpiryTiming}
                  onChange={(e) => updateEmailPref('certExpiryTiming', parseInt(e.target.value))}
                  className={inputClass}
                >
                  <option value="7">1 week</option>
                  <option value="14">2 weeks</option>
                  <option value="30">1 month</option>
                  <option value="60">2 months</option>
                  <option value="90">3 months</option>
                </select>
                <span className="text-sm">before expiry</span>
              </div>
            )}

            {/* Weekly Digest */}
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Weekly Digest</p>
                <p className="text-sm text-gray-500">Summary of your upcoming bookings</p>
              </div>
              <input
                type="checkbox"
                checked={preferences.email.weeklyDigest}
                onChange={(e) => updateEmailPref('weeklyDigest', e.target.checked)}
                className="rounded"
              />
            </div>

            {/* Announcements */}
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Announcements</p>
                <p className="text-sm text-gray-500">Important updates from SDCoLab</p>
              </div>
              <input
                type="checkbox"
                checked={preferences.email.announcements}
                onChange={(e) => updateEmailPref('announcements', e.target.checked)}
                className="rounded"
              />
            </div>
          </div>
        )}
      </div>

      {/* SMS Notifications */}
      <div className={cardClass}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Smartphone className="text-green-500" size={20} />
            <h3 className="font-bold">SMS Notifications</h3>
            <span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300 rounded">Coming Soon</span>
          </div>
          <label className="relative inline-flex items-center cursor-pointer opacity-50">
            <input
              type="checkbox"
              checked={preferences.sms.enabled}
              onChange={(e) => updateSmsPref('enabled', e.target.checked)}
              className="sr-only peer"
              disabled
            />
            <div className="w-11 h-6 bg-gray-300 rounded-full peer peer-checked:bg-green-500"></div>
          </label>
        </div>

        <div className="pl-7 text-sm text-gray-500">
          <p>SMS notifications will be available soon for urgent reminders.</p>
        </div>
      </div>

      {/* Push Notifications */}
      <div className={cardClass}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Bell className="text-purple-500" size={20} />
            <h3 className="font-bold">Push Notifications</h3>
            <span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300 rounded">Beta</span>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={preferences.push.enabled}
              onChange={(e) => updatePushPref('enabled', e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-300 peer-focus:ring-2 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-500"></div>
          </label>
        </div>

        {preferences.push.enabled && (
          <div className="space-y-4 pl-7">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Booking Reminders</p>
                <p className="text-sm text-gray-500">Browser/mobile push for bookings</p>
              </div>
              <input
                type="checkbox"
                checked={preferences.push.bookingReminders}
                onChange={(e) => updatePushPref('bookingReminders', e.target.checked)}
                className="rounded"
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Announcements</p>
                <p className="text-sm text-gray-500">Important community updates</p>
              </div>
              <input
                type="checkbox"
                checked={preferences.push.announcements}
                onChange={(e) => updatePushPref('announcements', e.target.checked)}
                className="rounded"
              />
            </div>
          </div>
        )}
      </div>

      {/* In-App Notifications */}
      <div className={cardClass}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Settings className="text-gray-500" size={20} />
            <h3 className="font-bold">In-App Notifications</h3>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={preferences.inApp.enabled}
              onChange={(e) => updateInAppPref('enabled', e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-300 peer-focus:ring-2 peer-focus:ring-gray-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gray-500"></div>
          </label>
        </div>

        {preferences.inApp.enabled && (
          <div className="pl-7">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Show Notification Badges</p>
                <p className="text-sm text-gray-500">Display unread count in navigation</p>
              </div>
              <input
                type="checkbox"
                checked={preferences.inApp.showBadges}
                onChange={(e) => updateInAppPref('showBadges', e.target.checked)}
                className="rounded"
              />
            </div>
          </div>
        )}
      </div>

      {/* Save Button */}
      <div className="flex gap-2 pt-4">
        {onClose && (
          <button
            onClick={onClose}
            className="flex-1 py-3 border rounded hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
        )}
        <button
          onClick={() => handleSave()}
          disabled={saving}
          className="flex-1 py-3 bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving ? (
            <>
              <RefreshCw size={18} className="animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save size={18} />
              Save Preferences
            </>
          )}
        </button>
      </div>

      {/* Unsubscribe All */}
      <div className="text-center pt-4 border-t border-gray-200 dark:border-gray-700">
        <button
          onClick={() => {
            setPreferences(prev => ({
              ...prev,
              email: { ...prev.email, enabled: false },
              sms: { ...prev.sms, enabled: false },
              push: { ...prev.push, enabled: false }
            }));
          }}
          className="text-sm text-red-500 hover:underline flex items-center gap-1 mx-auto"
        >
          <BellOff size={14} />
          Disable all external notifications
        </button>
      </div>
    </div>
  );
};

export default NotificationPreferences;
