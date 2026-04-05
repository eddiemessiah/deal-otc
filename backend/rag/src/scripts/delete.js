#!/usr/bin/env node

/**
 * Delete a source from the knowledge base.
 * Usage: node scripts/delete.js <source_id>
 */

const { KnowledgeDB } = require('../src');
const { logEvent } = require('../../../shared/event-log');

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help') {
    console.log(JSON.stringify({
      error: 'Usage: node scripts/delete.js <source_id>'
    }));
    process.exit(1);
  }

  const sourceId = parseInt(args[0], 10);
  if (isNaN(sourceId)) {
    console.log(JSON.stringify({ error: 'Source ID must be a number' }));
    process.exit(1);
  }

  let db;
  try {
    db = new KnowledgeDB();

    const source = await db.getSourceById(sourceId);
    if (!source) {
      logEvent({ event: 'kb_delete', source_id: sourceId, ok: false, error: 'not found' }, { level: 'warn' });
      console.log(JSON.stringify({ error: `Source ${sourceId} not found` }));
      process.exit(1);
    }

    const deleted = await db.deleteSource(sourceId);
    logEvent({ event: 'kb_delete', source_id: sourceId, title: source.title, ok: deleted });

    console.log(JSON.stringify({
      success: deleted,
      deleted_id: sourceId,
      deleted_title: source.title
    }));

  } catch (error) {
    logEvent({ event: 'kb_delete', source_id: sourceId, ok: false, error: error.message }, { level: 'error' });
    console.log(JSON.stringify({ error: error.message }));
    process.exit(1);
  } finally {
    if (db) db.close();
  }
}

main();

