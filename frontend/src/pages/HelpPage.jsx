import React, { useState } from 'react';
import { 
  HelpCircle, Book, Users, Calendar, Wrench, Shield, Key, 
  ChevronRight, ChevronDown, Home, Sun, Moon, ArrowLeft,
  Flame, Wind, Thermometer, GitBranch, MessageSquare
} from 'lucide-react';

/**
 * Full Documentation Page
 * 
 * Accessible at /help
 * Contains:
 * - Getting Started
 * - Booking Tools
 * - Account Management
 * - For Admins
 * - Fire Triangle / 3S Methodology
 * - Pack Protocols (for contributors)
 */

const HelpPage = () => {
  const [activeSection, setActiveSection] = useState('getting-started');
  const [theme, setTheme] = useState(() => 
    document.documentElement.classList.contains('dark') ? 'dark' : 'light'
  );
  const [expandedItems, setExpandedItems] = useState({});

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    document.documentElement.classList.toggle('dark', newTheme === 'dark');
  };

  const toggleItem = (id) => {
    setExpandedItems(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const sections = [
    { id: 'getting-started', icon: Home, title: 'Getting Started' },
    { id: 'booking', icon: Calendar, title: 'Booking Tools' },
    { id: 'account', icon: Users, title: 'Your Account' },
    { id: 'certifications', icon: Shield, title: 'Certifications' },
    { id: 'admin', icon: Key, title: 'For Administrators' },
    { id: 'fire-triangle', icon: Flame, title: 'Fire Triangle & 3S' },
    { id: 'contributing', icon: GitBranch, title: 'Contributing' },
  ];

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
      } text-white p-4 shadow-lg`}>
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <a href="/" className="p-2 hover:bg-white/20 rounded">
              <ArrowLeft size={20} />
            </a>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <span className="text-3xl">📚</span>
              Documentation
            </h1>
          </div>
          <button onClick={toggleTheme} className="p-2 hover:bg-white/20 rounded">
            {isDark ? <Sun size={20} /> : <Moon size={20} />}
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto p-4 flex gap-6">
        {/* Sidebar */}
        <nav className={`w-64 flex-shrink-0 hidden md:block`}>
          <div className={`${cardBg} rounded-lg p-4 sticky top-4`}>
            <h2 className="font-bold mb-4 text-orange-500">Contents</h2>
            <ul className="space-y-1">
              {sections.map(({ id, icon: Icon, title }) => (
                <li key={id}>
                  <button
                    onClick={() => setActiveSection(id)}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded text-left transition-colors ${
                      activeSection === id 
                        ? 'bg-orange-500 text-white' 
                        : `hover:${isDark ? 'bg-gray-700' : 'bg-gray-100'}`
                    }`}
                  >
                    <Icon size={18} />
                    {title}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </nav>

        {/* Main Content */}
        <main className={`flex-1 ${cardBg} rounded-lg p-6 shadow`}>
          
          {/* Getting Started */}
          {activeSection === 'getting-started' && (
            <div className="space-y-6">
              <h1 className="text-3xl font-bold flex items-center gap-3">
                <span className="text-4xl">🔥</span>
                Welcome to SDCoLab Scheduler
              </h1>
              
              <p className={textMuted}>
                The SDCoLab Scheduler helps our community book tools, rooms, and equipment 
                at the makerspace. This guide will help you get started.
              </p>

              <div className={`p-4 rounded-lg border-2 border-orange-500/50 ${isDark ? 'bg-orange-900/20' : 'bg-orange-50'}`}>
                <h3 className="font-bold text-orange-500 mb-2">Quick Start</h3>
                <ol className="list-decimal list-inside space-y-2">
                  <li>Create an account or sign in with Google/Microsoft/GitHub</li>
                  <li>Your account starts with basic access (viewing only)</li>
                  <li>Get certified for tools you want to use</li>
                  <li>Book time slots for your projects!</li>
                </ol>
              </div>

              <h2 className="text-2xl font-bold mt-8">The Basics</h2>
              
              <div className="grid md:grid-cols-3 gap-4">
                <div className={`p-4 rounded-lg ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`}>
                  <div className="text-3xl mb-2">📅</div>
                  <h3 className="font-bold">Schedule View</h3>
                  <p className={`text-sm ${textMuted}`}>See what's available and book time</p>
                </div>
                <div className={`p-4 rounded-lg ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`}>
                  <div className="text-3xl mb-2">🔧</div>
                  <h3 className="font-bold">My Bookings</h3>
                  <p className={`text-sm ${textMuted}`}>Track your reservations</p>
                </div>
                <div className={`p-4 rounded-lg ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`}>
                  <div className="text-3xl mb-2">🌙</div>
                  <h3 className="font-bold">Dark Mode</h3>
                  <p className={`text-sm ${textMuted}`}>Toggle with the sun/moon icon</p>
                </div>
              </div>
            </div>
          )}

          {/* Booking Tools */}
          {activeSection === 'booking' && (
            <div className="space-y-6">
              <h1 className="text-3xl font-bold">📅 Booking Tools</h1>
              
              <h2 className="text-xl font-bold">How to Book</h2>
              <ol className="list-decimal list-inside space-y-3">
                <li><strong>Select a date</strong> using the date picker</li>
                <li><strong>Choose a tool</strong> you're certified to use</li>
                <li><strong>Pick time slots</strong> (green = available, yellow = pending)</li>
                <li><strong>Describe your project</strong> - what are you making?</li>
                <li><strong>Submit</strong> - your request goes to admins for approval</li>
              </ol>

              <h2 className="text-xl font-bold mt-8">Time Slot Colors</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="flex items-center gap-2">
                  <span className="w-4 h-4 rounded bg-green-200 dark:bg-green-900" />
                  <span>Available</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-4 h-4 rounded bg-yellow-200 dark:bg-yellow-900" />
                  <span>Pending</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-4 h-4 rounded bg-purple-200 dark:bg-purple-900" />
                  <span>Booked</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-4 h-4 rounded bg-red-200 dark:bg-red-900" />
                  <span>Full</span>
                </div>
              </div>

              <h2 className="text-xl font-bold mt-8">Approval Process</h2>
              <p className={textMuted}>
                All bookings require admin approval. This helps us ensure:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-4">
                <li>No scheduling conflicts</li>
                <li>Users have proper certification</li>
                <li>Equipment is available and maintained</li>
              </ul>
              <p className={`mt-2 ${textMuted}`}>
                You'll be notified when your booking is approved or if there's an issue.
              </p>

              <h2 className="text-xl font-bold mt-8">Canceling a Booking</h2>
              <p className={textMuted}>
                Go to "My Bookings" and click "Cancel" next to the booking. 
                Please cancel as early as possible so others can use the slot.
              </p>
            </div>
          )}

          {/* Account */}
          {activeSection === 'account' && (
            <div className="space-y-6">
              <h1 className="text-3xl font-bold">👤 Your Account</h1>
              
              <h2 className="text-xl font-bold">Sign In Options</h2>
              <div className="grid md:grid-cols-2 gap-4">
                <div className={`p-4 rounded-lg border ${border}`}>
                  <h3 className="font-bold mb-2">🔐 Email & Password</h3>
                  <p className={`text-sm ${textMuted}`}>
                    Traditional login. You can reset your password anytime.
                  </p>
                </div>
                <div className={`p-4 rounded-lg border ${border}`}>
                  <h3 className="font-bold mb-2">🔵 Google</h3>
                  <p className={`text-sm ${textMuted}`}>
                    One-click sign in with your Google account.
                  </p>
                </div>
                <div className={`p-4 rounded-lg border ${border}`}>
                  <h3 className="font-bold mb-2">🟦 Microsoft</h3>
                  <p className={`text-sm ${textMuted}`}>
                    Sign in with Microsoft/Outlook account.
                  </p>
                </div>
                <div className={`p-4 rounded-lg border ${border}`}>
                  <h3 className="font-bold mb-2">⬛ GitHub</h3>
                  <p className={`text-sm ${textMuted}`}>
                    Perfect for our tech community members.
                  </p>
                </div>
              </div>

              <h2 className="text-xl font-bold mt-8">Account Statuses</h2>
              <ul className="space-y-2">
                <li><strong className="text-yellow-500">Pending:</strong> Account created, awaiting admin approval</li>
                <li><strong className="text-green-500">Active:</strong> Full access based on your certifications</li>
                <li><strong className="text-gray-500">Suspended:</strong> Temporarily disabled - contact admin</li>
                <li><strong className="text-red-500">Deactivated:</strong> Account disabled</li>
              </ul>

              <h2 className="text-xl font-bold mt-8">Password Reset</h2>
              <p className={textMuted}>
                Click "Forgot password?" on the login page. You'll receive an email 
                with a reset link (valid for 1 hour).
              </p>
            </div>
          )}

          {/* Certifications */}
          {activeSection === 'certifications' && (
            <div className="space-y-6">
              <h1 className="text-3xl font-bold">🎓 Certifications</h1>
              
              <p className={textMuted}>
                Some tools and rooms require certification before you can book them. 
                This ensures everyone's safety and helps protect our equipment.
              </p>

              <h2 className="text-xl font-bold mt-6">Tools Requiring Certification</h2>
              <div className="grid md:grid-cols-2 gap-3">
                {[
                  { name: 'Laser Cutter', level: 'Required', color: 'red' },
                  { name: 'CNC Router', level: 'Required', color: 'red' },
                  { name: 'Industrial Sewing', level: 'Required', color: 'red' },
                  { name: 'Woodshop', level: 'Required', color: 'red' },
                  { name: '3D Printer', level: 'Recommended', color: 'yellow' },
                  { name: 'Soldering Station', level: 'Open', color: 'green' },
                  { name: 'Sewing Machines', level: 'Open', color: 'green' },
                ].map(tool => (
                  <div key={tool.name} className={`p-3 rounded-lg border ${border} flex justify-between`}>
                    <span>{tool.name}</span>
                    <span className={`text-${tool.color}-500 text-sm`}>{tool.level}</span>
                  </div>
                ))}
              </div>

              <h2 className="text-xl font-bold mt-8">How to Get Certified</h2>
              <div className="space-y-4">
                <div className={`p-4 rounded-lg ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`}>
                  <h3 className="font-bold text-orange-500">1. Attended Training</h3>
                  <p className={`text-sm ${textMuted}`}>
                    Join a scheduled training session led by a certified instructor. 
                    Check the calendar for upcoming sessions.
                  </p>
                </div>
                <div className={`p-4 rounded-lg ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`}>
                  <h3 className="font-bold text-orange-500">2. Unattended (Coming Soon)</h3>
                  <p className={`text-sm ${textMuted}`}>
                    Complete online learning modules and pass a quiz to earn certification 
                    at your own pace.
                  </p>
                </div>
                <div className={`p-4 rounded-lg ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`}>
                  <h3 className="font-bold text-orange-500">3. Admin Grant</h3>
                  <p className={`text-sm ${textMuted}`}>
                    If you have prior experience, an admin can grant certification 
                    after verifying your skills.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Admin */}
          {activeSection === 'admin' && (
            <div className="space-y-6">
              <h1 className="text-3xl font-bold">🔑 For Administrators</h1>
              
              <h2 className="text-xl font-bold">User Management</h2>
              <ul className="space-y-2">
                <li><strong>Approve users:</strong> Review and activate new registrations</li>
                <li><strong>Assign roles:</strong> Member, Certified, Steward, Admin</li>
                <li><strong>Grant certifications:</strong> Enable users for specific tools</li>
                <li><strong>Deactivate/Delete:</strong> Remove access when needed</li>
                <li><strong>Bulk import:</strong> Import users from CSV</li>
                <li><strong>Send invites:</strong> Email invite links with pre-set permissions</li>
              </ul>

              <h2 className="text-xl font-bold mt-8">Booking Approvals</h2>
              <p className={textMuted}>
                The Admin tab shows all pending booking requests. For each request:
              </p>
              <ul className="list-disc list-inside ml-4 space-y-1">
                <li>Review the user's certification status</li>
                <li>Check for scheduling conflicts</li>
                <li>Approve → Creates calendar event & notifies user</li>
                <li>Reject → Notifies user with reason</li>
              </ul>

              <h2 className="text-xl font-bold mt-8">Activity Logs</h2>
              <p className={textMuted}>
                All actions are logged for transparency and accountability:
              </p>
              <ul className="list-disc list-inside ml-4 space-y-1">
                <li>User registrations and logins</li>
                <li>Booking requests, approvals, rejections</li>
                <li>Admin actions (user edits, permission changes)</li>
                <li>Log views (who viewed the activity log and when)</li>
              </ul>
              <p className={`mt-2 p-3 rounded ${isDark ? 'bg-blue-900/30' : 'bg-blue-50'} border border-blue-500/50`}>
                <strong>Oversight:</strong> When you view activity logs, that action is also logged. 
                This ensures accountability and transparency in our governance.
              </p>
            </div>
          )}

          {/* Fire Triangle */}
          {activeSection === 'fire-triangle' && (
            <div className="space-y-6">
              <h1 className="text-3xl font-bold">🔥 Fire Triangle & 3S Methodology</h1>
              
              <p className={textMuted}>
                Our organization uses the <strong>Fire Triangle</strong> model and 
                <strong> 3S methodology</strong> from sdcap-governance to structure 
                our work and decision-making.
              </p>

              <h2 className="text-xl font-bold mt-6">The Fire Triangle</h2>
              <div className="grid md:grid-cols-3 gap-4">
                <div className={`p-4 rounded-lg border-2 border-yellow-500 ${isDark ? 'bg-yellow-900/20' : 'bg-yellow-50'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <Wrench className="text-yellow-500" />
                    <h3 className="font-bold text-yellow-500">FUEL</h3>
                  </div>
                  <p className={`text-sm ${textMuted}`}>
                    Physical resources: tools, equipment, materials, space. 
                    This scheduler is primarily a FUEL system.
                  </p>
                  <p className="text-sm mt-2">
                    <strong>SDCoLab</strong> provides the FUEL.
                  </p>
                </div>
                <div className={`p-4 rounded-lg border-2 border-blue-500 ${isDark ? 'bg-blue-900/20' : 'bg-blue-50'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <Wind className="text-blue-500" />
                    <h3 className="font-bold text-blue-500">OXYGEN</h3>
                  </div>
                  <p className={`text-sm ${textMuted}`}>
                    Governance, process, documentation. The rules, workflows, 
                    and structures that enable work.
                  </p>
                  <p className="text-sm mt-2">
                    <strong>SDCAP</strong> provides the OXYGEN.
                  </p>
                </div>
                <div className={`p-4 rounded-lg border-2 border-red-500 ${isDark ? 'bg-red-900/20' : 'bg-red-50'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <Thermometer className="text-red-500" />
                    <h3 className="font-bold text-red-500">HEAT</h3>
                  </div>
                  <p className={`text-sm ${textMuted}`}>
                    Community, energy, engagement. The people and 
                    connections that make things happen.
                  </p>
                  <p className="text-sm mt-2">
                    <strong>The Community</strong> provides the HEAT.
                  </p>
                </div>
              </div>

              <div className={`p-4 rounded-lg ${isDark ? 'bg-gray-700' : 'bg-gray-100'} mt-4`}>
                <p className="text-center italic">
                  "Fire needs all three elements. Remove any one and the fire goes out. 
                  Our community works the same way."
                </p>
              </div>

              <h2 className="text-xl font-bold mt-8">The 3S Cycle</h2>
              <div className="space-y-4">
                <div className={`p-4 rounded-lg border-l-4 border-purple-500 ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`}>
                  <h3 className="font-bold text-purple-500">1. SENSE</h3>
                  <p className={`text-sm ${textMuted}`}>
                    Discover what's happening. Observe, listen, gather information. 
                    Issues are created, needs are identified.
                  </p>
                </div>
                <div className={`p-4 rounded-lg border-l-4 border-orange-500 ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`}>
                  <h3 className="font-bold text-orange-500">2. STABILIZE</h3>
                  <p className={`text-sm ${textMuted}`}>
                    Take action. Build, fix, create. Work gets done, 
                    solutions are implemented.
                  </p>
                </div>
                <div className={`p-4 rounded-lg border-l-4 border-green-500 ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`}>
                  <h3 className="font-bold text-green-500">3. STRENGTHEN</h3>
                  <p className={`text-sm ${textMuted}`}>
                    Improve and maintain. Learn from experience, document, 
                    make things better for next time.
                  </p>
                </div>
              </div>

              <p className={`mt-4 ${textMuted}`}>
                This cycle repeats continuously. Every Fire Party (Tuesdays 6pm) 
                is an opportunity to move through the 3S cycle together.
              </p>
            </div>
          )}

          {/* Contributing */}
          {activeSection === 'contributing' && (
            <div className="space-y-6">
              <h1 className="text-3xl font-bold">🐕 Contributing (Pack Protocols)</h1>
              
              <p className={textMuted}>
                We welcome contributions! Whether you're fixing a typo or building a new feature, 
                there's a place for you.
              </p>

              <h2 className="text-xl font-bold mt-6">Three Ways to Contribute</h2>
              
              <div className="space-y-4">
                <div className={`p-4 rounded-lg ${isDark ? 'bg-green-900/30' : 'bg-green-50'} border border-green-500/50`}>
                  <h3 className="font-bold text-green-500">🌱 Level 1: Just Tell Us</h3>
                  <p className={`text-sm ${textMuted}`}>
                    Open an issue describing what you'd like. We'll make it happen.
                    No technical skills required!
                  </p>
                </div>
                <div className={`p-4 rounded-lg ${isDark ? 'bg-yellow-900/30' : 'bg-yellow-50'} border border-yellow-500/50`}>
                  <h3 className="font-bold text-yellow-500">🌿 Level 2: Edit in Browser</h3>
                  <p className={`text-sm ${textMuted}`}>
                    Click the pencil icon on any file in GitHub to edit directly. 
                    Great for documentation fixes.
                  </p>
                </div>
                <div className={`p-4 rounded-lg ${isDark ? 'bg-orange-900/30' : 'bg-orange-50'} border border-orange-500/50`}>
                  <h3 className="font-bold text-orange-500">🌳 Level 3: Full Workflow</h3>
                  <p className={`text-sm ${textMuted}`}>
                    Fork, clone, branch, commit, PR. For bigger changes and features.
                  </p>
                </div>
              </div>

              <h2 className="text-xl font-bold mt-8">Commit Message Format</h2>
              <pre className={`p-4 rounded-lg ${isDark ? 'bg-gray-700' : 'bg-gray-100'} overflow-x-auto text-sm`}>
{`🔥 ignite: New feature
🦴 fetch:   Add resource/dependency
🐾 track:   Refactor/improve
🩹 mend:    Bug fix
📜 howl:    Documentation
🧹 groom:   Cleanup/chores`}
              </pre>

              <h2 className="text-xl font-bold mt-8">Branch Naming</h2>
              <pre className={`p-4 rounded-lg ${isDark ? 'bg-gray-700' : 'bg-gray-100'} overflow-x-auto text-sm`}>
{`main              # Production stable
develop           # Integration testing
feature/SDCAP-XX  # New features
fix/SDCAP-XX      # Bug fixes
docs/SDCAP-XX     # Documentation`}
              </pre>

              <div className={`p-4 rounded-lg ${isDark ? 'bg-gray-700' : 'bg-gray-100'} mt-6`}>
                <h3 className="font-bold mb-2">🔥 Fire Party</h3>
                <p className={`text-sm ${textMuted}`}>
                  Join us Tuesdays at 6pm PT to discuss issues, plan work, and 
                  celebrate wins. All are welcome!
                </p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default HelpPage;
