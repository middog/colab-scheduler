/**
 * SDCoLab Scheduler - Public Routes
 * 
 * Unauthenticated endpoints for public visibility:
 * - Tools/Equipment catalog
 * - Rooms listing
 * - Upcoming public events
 * - Organization info
 * 
 * 🔥 Fire Triangle: HEAT layer - community-facing presence
 */

import { ErrorCodes, sendSuccess, sendError } from '../lib/responses.js';
import { Router } from 'express';
import { config } from '../lib/config.js';
import { bookingService } from '../lib/database.js';

const router = Router();

// =============================================================================
// Public Tools Catalog
// =============================================================================

/**
 * GET /api/public/tools
 * Public listing of all tools with availability info
 */
router.get('/tools', async (req, res) => {
  try {
    const { category } = req.query;
    
    let tools = config.tools.map(tool => ({
      id: tool.id,
      name: tool.name,
      category: tool.category,
      room: tool.room,
      roomName: config.rooms.find(r => r.id === tool.room)?.name || tool.room,
      maxConcurrent: tool.maxConcurrent,
      requiresCert: tool.requiresCert,
      // Don't expose internal details
      description: tool.description || null,
      imageUrl: tool.imageUrl || null,
      specs: tool.specs || null
    }));
    
    // Filter by category if specified
    if (category) {
      tools = tools.filter(t => t.category === category);
    }
    
    // Get categories for filtering
    const categories = [...new Set(config.tools.map(t => t.category))].sort();
    
    sendSuccess(res, { 
      tools,
      categories,
      total: tools.length,
      organization: {
        name: 'SDCoLab',
        tagline: 'San Diego Collaborative Arts Project',
        website: 'https://sdcolab.org'
      }
    });
  } catch (error) {
    console.error('Public tools error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to get tools');
  }
});

/**
 * GET /api/public/tools/:id
 * Public detail view of a single tool
 */
router.get('/tools/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const tool = config.tools.find(t => t.id === id);
    
    if (!tool) {
      return sendError(res, ErrorCodes.NOT_FOUND, 'Tool not found');
    }
    
    const room = config.rooms.find(r => r.id === tool.room);
    
    // Get today's bookings to show availability
    const today = new Date().toISOString().split('T')[0];
    const bookings = await bookingService.getByDate(today);
    const toolBookings = bookings.filter(b => 
      b.resourceId === id && 
      b.status !== 'rejected' && 
      b.status !== 'cancelled'
    );
    
    sendSuccess(res, {
      tool: {
        id: tool.id,
        name: tool.name,
        category: tool.category,
        room: tool.room,
        roomName: room?.name || tool.room,
        roomCapacity: room?.capacity,
        maxConcurrent: tool.maxConcurrent,
        requiresCert: tool.requiresCert,
        description: tool.description || `The ${tool.name} is available for use by ${tool.requiresCert ? 'certified members' : 'all members'}.`,
        imageUrl: tool.imageUrl || null,
        specs: tool.specs || null
      },
      availability: {
        date: today,
        currentBookings: toolBookings.length,
        slotsAvailable: tool.maxConcurrent - toolBookings.length,
        bookedSlots: toolBookings.map(b => ({
          startTime: b.startTime,
          endTime: b.endTime
        }))
      }
    });
  } catch (error) {
    console.error('Public tool detail error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to get tool');
  }
});

// =============================================================================
// Public Rooms Listing
// =============================================================================

/**
 * GET /api/public/rooms
 * Public listing of all rooms/spaces
 */
router.get('/rooms', (req, res) => {
  try {
    const rooms = config.rooms.map(room => ({
      id: room.id,
      name: room.name,
      capacity: room.capacity,
      description: room.description || null,
      imageUrl: room.imageUrl || null,
      tools: config.tools.filter(t => t.room === room.id).map(t => ({
        id: t.id,
        name: t.name
      }))
    }));
    
    sendSuccess(res, { rooms, total: rooms.length });
  } catch (error) {
    console.error('Public rooms error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to get rooms');
  }
});

// =============================================================================
// Public Events (Future: workshops, open houses)
// =============================================================================

/**
 * GET /api/public/events
 * Public upcoming events/workshops
 */
router.get('/events', async (req, res) => {
  try {
    // Future: Query events table for public events
    // For now, return empty with structure
    sendSuccess(res, {
      events: [],
      message: 'Public events calendar coming soon!'
    });
  } catch (error) {
    console.error('Public events error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to get events');
  }
});

// =============================================================================
// Organization Info
// =============================================================================

/**
 * GET /api/public/info
 * Public organization information
 */
router.get('/info', (req, res) => {
  sendSuccess(res, {
    organization: {
      name: 'SDCoLab',
      fullName: 'San Diego Collaborative Arts Project',
      type: '501(c)(3) Nonprofit',
      mission: 'Empowering creative communities through shared tools and collaborative spaces.',
      website: 'https://sdcolab.org',
      contact: {
        email: 'info@sdcolab.org'
      }
    },
    fireTriangle: {
      fuel: 'Physical resources - tools, materials, spaces',
      oxygen: 'Process & governance - how we organize',
      heat: 'Community energy - the people who make it happen'
    },
    stats: {
      tools: config.tools.length,
      rooms: config.rooms.length,
      categories: [...new Set(config.tools.map(t => t.category))].length
    }
  });
});

export default router;
