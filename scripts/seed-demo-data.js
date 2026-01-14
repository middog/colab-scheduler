/**
 * Seed demo data for development
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-west-2' });
const docClient = DynamoDBDocumentClient.from(client);

const USERS_TABLE = process.env.USERS_TABLE || 'colab-scheduler-dev-users';
const BOOKINGS_TABLE = process.env.BOOKINGS_TABLE || 'colab-scheduler-dev-bookings';

const allTools = ['laser', '3dprinter', 'cnc', 'solder', 'sewing-standard', 'sewing-industrial', 'woodshop'];
const allRooms = ['laser-lab', '3d-printing', 'cnc-area', 'electronics-lab', 'sewing-room', 'woodshop', 'classroom'];

async function seed() {
  console.log('🌱 Seeding demo data...');
  
  const now = new Date().toISOString();
  const passwordHash = await bcrypt.hash('demodemo', 10);
  
  // Admin user
  const admin = {
    email: 'admin@colab.org',
    id: uuidv4(),
    firstName: 'Admin',
    lastName: 'User',
    displayName: 'Admin',
    status: 'active',
    role: 'admin',
    permissions: {
      tools: allTools,
      rooms: allRooms,
      capabilities: ['can_view_schedule', 'can_book', 'can_approve', 'can_admin']
    },
    authProviders: [{ provider: 'email', providerId: 'admin@colab.org', linkedAt: now }],
    passwordHash,
    certifications: allTools.map(t => ({
      certificationId: `cert-${t}`,
      name: `${t} Certification`,
      earnedAt: now,
      grantedBy: 'system',
      method: 'manual'
    })),
    preferences: {
      notifications: { email: true, slack: false, sms: false },
      theme: 'system',
      timezone: 'America/Los_Angeles'
    },
    createdAt: now,
    createdBy: 'system',
    updatedAt: now,
    memberSince: now
  };
  
  // Regular member
  const member = {
    email: 'member@colab.org',
    id: uuidv4(),
    firstName: 'Demo',
    lastName: 'Member',
    displayName: 'Demo Member',
    status: 'active',
    role: 'certified',
    permissions: {
      tools: ['3dprinter', 'solder', 'sewing-standard'],
      rooms: ['3d-printing', 'electronics-lab', 'sewing-room'],
      capabilities: ['can_view_schedule', 'can_book']
    },
    authProviders: [{ provider: 'email', providerId: 'member@colab.org', linkedAt: now }],
    passwordHash,
    certifications: [
      { certificationId: 'cert-3dprinter', name: '3D Printer Certification', earnedAt: now, grantedBy: 'admin@colab.org', method: 'attended' },
      { certificationId: 'cert-solder', name: 'Soldering Certification', earnedAt: now, grantedBy: 'admin@colab.org', method: 'attended' }
    ],
    preferences: {
      notifications: { email: true, slack: false, sms: false },
      theme: 'system',
      timezone: 'America/Los_Angeles'
    },
    createdAt: now,
    createdBy: 'admin@colab.org',
    updatedAt: now,
    memberSince: now
  };
  
  // Pending user
  const pending = {
    email: 'pending@colab.org',
    id: uuidv4(),
    firstName: 'Pending',
    lastName: 'User',
    displayName: 'Pending User',
    status: 'pending',
    role: 'member',
    permissions: {
      tools: [],
      rooms: [],
      capabilities: ['can_view_schedule']
    },
    authProviders: [{ provider: 'email', providerId: 'pending@colab.org', linkedAt: now }],
    passwordHash,
    certifications: [],
    preferences: {
      notifications: { email: true, slack: false, sms: false },
      theme: 'system',
      timezone: 'America/Los_Angeles'
    },
    createdAt: now,
    createdBy: 'self-registration',
    updatedAt: now,
    memberSince: now
  };
  
  // Insert users
  for (const user of [admin, member, pending]) {
    try {
      await docClient.send(new PutCommand({
        TableName: USERS_TABLE,
        Item: user
      }));
      console.log(`  ✅ Created user: ${user.email}`);
    } catch (error) {
      console.log(`  ⚠️ User ${user.email}: ${error.message}`);
    }
  }
  
  // Create a sample booking
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const bookingDate = tomorrow.toISOString().split('T')[0];
  
  const booking = {
    id: uuidv4(),
    resourceType: 'tool',
    resourceId: '3dprinter',
    resourceName: '3D Printer',
    userId: member.id,
    userEmail: member.email,
    userName: member.displayName,
    date: bookingDate,
    startTime: '14:00',
    endTime: '16:00',
    purpose: 'Printing parts for my Burning Man project',
    status: 'pending',
    createdAt: now,
    updatedAt: now,
    dateResourceKey: `${bookingDate}#3dprinter`,
    userDateKey: `${member.email}#${bookingDate}`
  };
  
  try {
    await docClient.send(new PutCommand({
      TableName: BOOKINGS_TABLE,
      Item: booking
    }));
    console.log(`  ✅ Created sample booking`);
  } catch (error) {
    console.log(`  ⚠️ Booking: ${error.message}`);
  }
  
  console.log('');
  console.log('🎉 Demo data seeded!');
  console.log('');
  console.log('Demo accounts:');
  console.log('  admin@colab.org  / demodemo  (Admin - all tools)');
  console.log('  member@colab.org / demodemo  (Member - some tools)');
  console.log('  pending@colab.org / demodemo (Pending approval)');
}

seed().catch(console.error);
