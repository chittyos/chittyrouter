#!/usr/bin/env node

/**
 * Setup script for Notion ATOMIC FACTS database
 * Creates all required properties and select options
 */

import { Client } from '@notionhq/client';
import dotenv from 'dotenv';

dotenv.config();

const NOTION_TOKEN = process.env.NOTION_INTEGRATION_TOKEN;
const DATABASE_NAME = 'ATOMIC FACTS';

// Property definitions
const PROPERTIES = {
  'Fact ID': {
    type: 'title',
    title: {}
  },
  'External ID': {
    type: 'rich_text',
    rich_text: {}
  },
  'Parent Document': {
    type: 'rich_text',
    rich_text: {}
  },
  'Fact Text': {
    type: 'rich_text',
    rich_text: {}
  },
  'Fact Type': {
    type: 'select',
    select: {
      options: [
        { name: 'DATE', color: 'blue' },
        { name: 'AMOUNT', color: 'green' },
        { name: 'ADMISSION', color: 'red' },
        { name: 'IDENTITY', color: 'purple' },
        { name: 'LOCATION', color: 'yellow' },
        { name: 'RELATIONSHIP', color: 'orange' },
        { name: 'ACTION', color: 'pink' },
        { name: 'STATUS', color: 'gray' }
      ]
    }
  },
  'Location in Document': {
    type: 'rich_text',
    rich_text: {}
  },
  'Classification Level': {
    type: 'select',
    select: {
      options: [
        { name: 'FACT', color: 'green' },
        { name: 'SUPPORTED_CLAIM', color: 'blue' },
        { name: 'ASSERTION', color: 'yellow' },
        { name: 'ALLEGATION', color: 'orange' },
        { name: 'CONTRADICTION', color: 'red' }
      ]
    }
  },
  'Weight': {
    type: 'number',
    number: {
      format: 'number'
    }
  },
  'Credibility Factors': {
    type: 'multi_select',
    multi_select: {
      options: [
        { name: 'DIRECT_EVIDENCE', color: 'green' },
        { name: 'WITNESS_TESTIMONY', color: 'blue' },
        { name: 'EXPERT_OPINION', color: 'purple' },
        { name: 'DOCUMENTARY', color: 'yellow' },
        { name: 'CIRCUMSTANTIAL', color: 'orange' },
        { name: 'BLOCKCHAIN_VERIFIED', color: 'pink' }
      ]
    }
  },
  'ChittyChain Status': {
    type: 'select',
    select: {
      options: [
        { name: 'Minted', color: 'green' },
        { name: 'Pending', color: 'yellow' },
        { name: 'Rejected', color: 'red' }
      ]
    }
  },
  'Verification Date': {
    type: 'date',
    date: {}
  },
  'Verification Method': {
    type: 'rich_text',
    rich_text: {}
  },
  'Sync Status': {
    type: 'select',
    select: {
      options: [
        { name: 'Synced', color: 'green' },
        { name: 'Pending', color: 'yellow' },
        { name: 'Failed', color: 'red' },
        { name: 'Retry', color: 'orange' }
      ]
    }
  },
  'Last Synced': {
    type: 'date',
    date: {}
  },
  'Evidence Vault URL': {
    type: 'url',
    url: {}
  },
  'Attachments': {
    type: 'files',
    files: {}
  },
  'Created By': {
    type: 'created_by',
    created_by: {}
  },
  'Created Time': {
    type: 'created_time',
    created_time: {}
  },
  'Last Edited By': {
    type: 'last_edited_by',
    last_edited_by: {}
  },
  'Last Edited Time': {
    type: 'last_edited_time',
    last_edited_time: {}
  }
};

async function setupNotionDatabase() {
  if (!NOTION_TOKEN) {
    console.error('❌ Missing NOTION_INTEGRATION_TOKEN environment variable');
    process.exit(1);
  }

  const notion = new Client({ auth: NOTION_TOKEN });

  console.log('🔍 Searching for existing ATOMIC FACTS database...');

  try {
    // Search for existing database
    const searchResponse = await notion.search({
      query: DATABASE_NAME,
      filter: {
        property: 'object',
        value: 'database'
      }
    });

    let databaseId;

    if (searchResponse.results.length > 0) {
      // Use existing database
      const existingDb = searchResponse.results.find(db =>
        db.title[0]?.plain_text === DATABASE_NAME
      );

      if (existingDb) {
        databaseId = existingDb.id;
        console.log(`✅ Found existing database: ${databaseId}`);
      }
    }

    if (!databaseId) {
      // Create new database
      console.log('📝 Creating new ATOMIC FACTS database...');

      // First, we need a parent page
      // You'll need to provide a parent page ID or create one
      const PARENT_PAGE_ID = process.env.NOTION_PARENT_PAGE_ID;

      if (!PARENT_PAGE_ID) {
        console.error('❌ Need NOTION_PARENT_PAGE_ID to create database');
        console.log('💡 Set NOTION_PARENT_PAGE_ID environment variable to the parent page ID');
        process.exit(1);
      }

      const newDb = await notion.databases.create({
        parent: { page_id: PARENT_PAGE_ID },
        title: [
          {
            type: 'text',
            text: {
              content: DATABASE_NAME
            }
          }
        ],
        properties: PROPERTIES
      });

      databaseId = newDb.id;
      console.log(`✅ Created new database: ${databaseId}`);
      console.log('\n📋 Add this to your environment variables:');
      console.log(`NOTION_DATABASE_ID_ATOMIC_FACTS=${databaseId}`);
    } else {
      // Update existing database properties
      console.log('🔄 Updating database properties...');

      const currentDb = await notion.databases.retrieve({
        database_id: databaseId
      });

      // Get current properties
      const currentProps = Object.keys(currentDb.properties);
      const neededProps = Object.keys(PROPERTIES);

      // Find missing properties
      const missingProps = neededProps.filter(prop => !currentProps.includes(prop));

      if (missingProps.length > 0) {
        console.log(`📝 Adding missing properties: ${missingProps.join(', ')}`);

        // Build update payload (only include new properties)
        const updateProperties = {};
        for (const prop of missingProps) {
          updateProperties[prop] = PROPERTIES[prop];
        }

        await notion.databases.update({
          database_id: databaseId,
          properties: updateProperties
        });

        console.log('✅ Properties updated successfully');
      } else {
        console.log('✅ All required properties already exist');
      }

      // Display current configuration
      console.log('\n📋 Current database configuration:');
      console.log(`Database ID: ${databaseId}`);
      console.log(`Properties: ${currentProps.length}`);
    }

    // Test the database with a test entry
    console.log('\n🧪 Testing database with sample fact...');

    const testFact = {
      'Fact ID': {
        title: [{
          text: { content: `TEST-${Date.now()}` }
        }]
      },
      'External ID': {
        rich_text: [{
          text: { content: `TEST-${Date.now()}` }
        }]
      },
      'Fact Text': {
        rich_text: [{
          text: { content: 'This is a test fact to verify database setup' }
        }]
      },
      'Fact Type': {
        select: { name: 'STATUS' }
      },
      'Classification Level': {
        select: { name: 'FACT' }
      },
      'Weight': {
        number: 1.0
      },
      'ChittyChain Status': {
        select: { name: 'Pending' }
      },
      'Sync Status': {
        select: { name: 'Synced' }
      }
    };

    const testPage = await notion.pages.create({
      parent: { database_id: databaseId },
      properties: testFact
    });

    console.log(`✅ Test fact created: ${testPage.id}`);
    console.log('\n🎉 Notion database setup complete!');
    console.log('\n📋 Configuration summary:');
    console.log(`Database Name: ${DATABASE_NAME}`);
    console.log(`Database ID: ${databaseId}`);
    console.log(`Properties: ${Object.keys(PROPERTIES).length}`);
    console.log('\n💡 Next steps:');
    console.log('1. Set environment variable: NOTION_DATABASE_ID_ATOMIC_FACTS=' + databaseId);
    console.log('2. Deploy the sync worker: npm run deploy:sync');
    console.log('3. Test sync endpoint: POST /sync/notion/atomic-facts');

  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    if (error.body) {
      console.error('Details:', JSON.stringify(error.body, null, 2));
    }
    process.exit(1);
  }
}

// Run setup
console.log('🚀 Notion ATOMIC FACTS Database Setup');
console.log('=====================================\n');
setupNotionDatabase();