#!/usr/bin/env node

/**
 * List sources in the knowledge base.
 * Usage: node scripts/list.js [--tag "ai"] [--type video] [--recent 7] [--limit 50]
 */

const { KnowledgeDB, parseTags } = require('../src');
const { logEvent } = require('../../../shared/event-log');

async function main() {
  const args = process.argv.slice(2);
  const options = parseOptions(args);

  let db;
  try {
    db = new KnowledgeDB();

    const sources = await db.listSources({
      type: options.type,
      tag: options.tag,
      limit: options.limit ? parseInt(options.limit, 10) : 50,
      recent: options.recent ? parseInt(options.recent, 10) : undefined
    });

    const totalSources = await db.getSourceCount();
    const totalChunks = await db.getChunkCount();

    logEvent({ event: 'kb_list', total_in_db: totalSources, showing: sources.length, filters: { type: options.type || null, tag: options.tag || null, recent: options.recent || null } });

    console.log(JSON.stringify({
      total_in_db: totalSources,
      total_chunks: totalChunks,
      showing: sources.length,
      sources: sources.map(s => ({
        id: s.id,
        title: s.title,
        type: s.source_type,
        url: s.url,
        tags: parseTags(s.tags),
        saved_at: s.created_at
      }))
    }));

  } catch (error) {
    logEvent({ event: 'kb_list', ok: false, error: error.message }, { level: 'error' });
    console.log(JSON.stringify({ error: error.message }));
    process.exit(1);
  } finally {
    if (db) db.close();
  }
}

function parseOptions(args) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--tag' && args[i + 1]) {
      options.tag = args[++i];
    } else if (args[i] === '--type' && args[i + 1]) {
      options.type = args[++i];
    } else if (args[i] === '--recent' && args[i + 1]) {
      options.recent = args[++i];
    } else if (args[i] === '--limit' && args[i + 1]) {
      options.limit = args[++i];
    }
  }
  return options;
}

main();

