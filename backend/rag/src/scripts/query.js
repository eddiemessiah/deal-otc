#!/usr/bin/env node

/**
 * Query the knowledge base using natural language.
 * Usage: node scripts/query.js "<question>" [--limit N] [--threshold 0.3] [--tags "t1,t2"]
 */

const { KnowledgeDB, EmbeddingGenerator, KnowledgeSearch, loadEmbeddingCredentials } = require('../src');
const { logEvent } = require('../../../shared/event-log');

async function main() {
  const args = process.argv.slice(2);
  const startedAt = Date.now();

  if (args.length === 0 || args[0] === '--help') {
    console.log(JSON.stringify({
      error: 'Usage: node scripts/query.js "<question>" [--limit N] [--threshold 0.3] [--tags "t1,t2"] [--since "7d"] [--entity "OpenAI"] [--cited] [--cite-style footnote|inline|compact]'
    }));
    process.exit(1);
  }

  const query = args[0];
  const options = parseOptions(args.slice(1));
  logEvent({
    event: 'kb_query_start',
    query_len: String(query || '').length,
    limit: options.limit ? parseInt(options.limit, 10) : 5,
    threshold: options.threshold ? parseFloat(options.threshold) : 0.3,
    has_tags: Boolean(options.tags),
    source_type: options.type || null,
  });

  let db;
  try {
    const creds = loadEmbeddingCredentials();
    db = new KnowledgeDB();
    const embedder = new EmbeddingGenerator(creds.key, creds.provider);
    const search = new KnowledgeSearch(db, embedder);

    const results = await search.search(query, {
      limit: options.limit ? parseInt(options.limit, 10) : 5,
      threshold: options.threshold ? parseFloat(options.threshold) : 0.3,
      tags: options.tags ? options.tags.split(',').map(t => t.trim()) : [],
      sourceType: options.type,
      since: options.since || undefined,
      entity: options.entity || undefined,
      citeStyle: options['cite-style'] || 'footnote',
    });
    const resultCount = Array.isArray(results)
      ? results.length
      : Array.isArray(results?.results)
        ? results.results.length
        : 0;

    logEvent({
      event: 'kb_query_end',
      ok: true,
      query_len: String(query || '').length,
      result_count: resultCount,
      duration_ms: Date.now() - startedAt,
    });

    if (options.cited && results.citationBlock) {
      console.log(results.citationBlock);
    } else {
      console.log(JSON.stringify(results));
    }

  } catch (error) {
    logEvent({
      event: 'kb_query_end',
      ok: false,
      query_len: String(query || '').length,
      error: error.message,
      duration_ms: Date.now() - startedAt,
    }, { level: 'error' });
    console.log(JSON.stringify({
      error: error.message,
      stack: process.env.DEBUG ? error.stack : undefined
    }));
    process.exit(1);
  } finally {
    if (db) db.close();
  }
}

function parseOptions(args) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      options.limit = args[++i];
    } else if (args[i] === '--threshold' && args[i + 1]) {
      options.threshold = args[++i];
    } else if (args[i] === '--tags' && args[i + 1]) {
      options.tags = args[++i];
    } else if (args[i] === '--type' && args[i + 1]) {
      options.type = args[++i];
    } else if (args[i] === '--since' && args[i + 1]) {
      options.since = args[++i];
    } else if (args[i] === '--entity' && args[i + 1]) {
      options.entity = args[++i];
    } else if (args[i] === '--cited') {
      options.cited = true;
    } else if (args[i] === '--cite-style' && args[i + 1]) {
      options['cite-style'] = args[++i];
    }
  }
  return options;
}

main();

