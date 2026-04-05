#!/usr/bin/env node

/**
 * Show knowledge base statistics.
 * Usage: node scripts/stats.js
 */

const { KnowledgeDB } = require('../src');
const { logEvent } = require('../../../shared/event-log');

async function main() {
  let db;
  try {
    db = new KnowledgeDB();
    const stats = await db.getStats();

    logEvent({ event: 'kb_stats', total_sources: stats.total_sources, total_chunks: stats.total_chunks, db_size_mb: stats.db_size_mb });

    console.log(JSON.stringify({
      total_sources: stats.total_sources,
      total_chunks: stats.total_chunks,
      embedded_chunks: stats.embedded_chunks,
      chunks_missing_embeddings: stats.chunks_missing_embeddings,
      by_type: stats.by_type,
      top_tags: stats.top_tags,
      db_size_mb: stats.db_size_mb
    }));
  } catch (error) {
    logEvent({ event: 'kb_stats', ok: false, error: error.message }, { level: 'error' });
    console.log(JSON.stringify({ error: error.message }));
    process.exit(1);
  } finally {
    if (db) db.close();
  }
}

main();

