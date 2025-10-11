#!/usr/bin/env node

/**
 * Test script for ChittyRouter email routing functionality
 */

import { requestEmailChittyID, requestEmailChittyID } from '../src/utils/chittyid-client.js';

// Mock email message for testing
const mockEmailMessage = {
  from: 'client@example.com',
  to: 'arias-v-bianchi@example.com',
  headers: new Map([['subject', 'Test Case Communication']]),
  attachments: []
};

// Test ChittyID generation
async function testChittyIDGeneration() {
  console.log('🧪 Testing ChittyID Generation...');

  try {
    const chittyId = await requestEmailChittyID(mockEmailMessage);
    console.log('✅ Generated ChittyID:', chittyId);

    const isValid = requestEmailChittyID(chittyId);
    console.log('✅ ChittyID validation:', isValid ? 'PASS' : 'FAIL');

    return chittyId;
  } catch (error) {
    console.error('❌ ChittyID generation failed:', error.message);
    return null;
  }
}

// Test email routing patterns
function testEmailPatterns() {
  console.log('\n🧪 Testing Email Pattern Matching...');

  const testEmails = [
    'arias-v-bianchi@example.com',
    'smith-v-jones@example.com',
    'case-12345@example.com',
    'matter-abc123@example.com',
    'intake@example.com'
  ];

  testEmails.forEach(email => {
    const caseMatch = email.match(/([a-zA-Z-]+)-v-([a-zA-Z-]+)@/);
    if (caseMatch) {
      const [, plaintiff, defendant] = caseMatch;
      const caseId = `${plaintiff.toUpperCase()}_v_${defendant.toUpperCase()}`;
      console.log(`✅ ${email} → Case ID: ${caseId}`);
    } else {
      console.log(`ℹ️  ${email} → No case pattern match`);
    }
  });
}

// Test priority determination
function testPriorityDetermination() {
  console.log('\n🧪 Testing Priority Determination...');

  const testMessages = [
    { subject: 'Urgent: Court date tomorrow', content: 'Need immediate response' },
    { subject: 'Document submission', content: 'Please find attached documents' },
    { subject: 'Question about case', content: 'Just a quick question' },
    { subject: 'EMERGENCY: Subpoena received', content: 'Critical deadline approaching' }
  ];

  testMessages.forEach(msg => {
    const urgentKeywords = [
      'urgent', 'emergency', 'asap', 'immediate',
      'court date', 'deadline', 'subpoena', 'motion'
    ];

    const content = (msg.subject + ' ' + msg.content).toLowerCase();
    const hasUrgentKeywords = urgentKeywords.some(keyword =>
      content.includes(keyword)
    );

    const priority = hasUrgentKeywords ? 'HIGH' : 'NORMAL';
    console.log(`📧 "${msg.subject}" → Priority: ${priority}`);
  });
}

// Main test runner
async function runTests() {
  console.log('🚀 ChittyRouter Email Routing Tests\n');

  await testChittyIDGeneration();
  testEmailPatterns();
  testPriorityDetermination();

  console.log('\n✅ All tests completed!');
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch(console.error);
}

export { testChittyIDGeneration, testEmailPatterns, testPriorityDetermination };