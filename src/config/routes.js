/**
 * Email routing configuration for ChittyRouter
 */

import { CASE_EMAIL_ROUTES } from './case-registry.js';

export const EMAIL_ROUTES = {
  // Case-specific routes derived from the canonical case registry — DO NOT
  // hardcode additional case entries here. Add new cases to case-registry.js
  // and they will appear here automatically.
  ...CASE_EMAIL_ROUTES,

  // General intake
  'intake@example.com': {
    type: 'NEW_CLIENT',
    routers: ['ChittyRouter'],
    autoTriage: true,
    attorneys: ['intake@example.com']
  },

  // Emergency contact
  'emergency@example.com': {
    priority: 'CRITICAL',
    notify: 'IMMEDIATE',
    escalation: 'PARTNER',
    attorneys: ['emergency@example.com']
  },

  // Document submissions
  'documents@example.com': {
    type: 'DOCUMENT_INTAKE',
    autoProcess: true,
    requireChittyID: true,
    attorneys: ['documents@example.com']
  },

  // Court calendar
  'calendar@example.com': {
    type: 'COURT_SCHEDULE',
    autoCalendar: true,
    attorneys: ['calendar@example.com']
  }
};

// Default routing rules
export const DEFAULT_ROUTES = {
  fallback: 'intake@example.com',
  adminNotify: 'admin@example.com',
  errorHandler: 'errors@example.com'
};

// Case pattern matching
export const CASE_PATTERNS = [
  {
    pattern: /([a-zA-Z-]+)-v-([a-zA-Z-]+)@/,
    type: 'LAWSUIT',
    format: (plaintiff, defendant) => `${plaintiff.toUpperCase()}_v_${defendant.toUpperCase()}`
  },
  {
    pattern: /case-(\d+)@/,
    type: 'CASE_NUMBER',
    format: (caseNum) => `CASE_${caseNum}`
  },
  {
    pattern: /matter-([a-zA-Z0-9-]+)@/,
    type: 'MATTER',
    format: (matter) => `MATTER_${matter.toUpperCase()}`
  }
];

// Priority levels
export const PRIORITY_LEVELS = {
  CRITICAL: 1,
  HIGH: 2,
  NORMAL: 3,
  LOW: 4
};

// Notification settings
export const NOTIFICATION_SETTINGS = {
  IMMEDIATE: {
    delay: 0,
    methods: ['email', 'sms', 'slack']
  },
  URGENT: {
    delay: 300000, // 5 minutes
    methods: ['email', 'slack']
  },
  NORMAL: {
    delay: 3600000, // 1 hour
    methods: ['email']
  }
};