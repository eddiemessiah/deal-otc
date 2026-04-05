#!/usr/bin/env node

/**
 * Backfill: scan existing tweet entries for external URLs in their content,
 * ingest those linked articles, and create source_links connecting them.
 *
 * Usage: node scripts/backfill-tweet-links.js [--dry-run] [--limit N]
 */

const path = require('path');
const { KnowledgeDB, EmbeddingGenerator, chunkText, extractContent, contentHash, generateSummary, loadEmbeddingCredentials } = require('../src');
const { extractExternalUrls } = require('../src/extractor');
const { sanitizeAndScan } = require('../../../shared/ingestion-security');
const { logEvent } = require('../../../shared/event-log');
const { acquireLock, releaseLock, autoTag } = require('./ingest');
const { getDataDir } = require('../src/config');

const LOCK_FILE = path.join(getDataDir(), '.ingest.lock');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : null;

  const db = new KnowledgeDB();

  if (!dryRun) {
    if (!acquireLock({ lockFilePath: LOCK_FILE })) {
      console.error('Another ingest is running. Try again later.');
      process.exit(1);
    }
  }

  const cleanup = () => {
    if (!dryRun) releaseLock({ lockFilePath: LOCK_FILE });
    db.close();
  };
  process.on('SIGINT', () => { cleanup(); process.exit(130); });
  process.on('SIGTERM', () => { cleanup(); process.exit(143); });

  try {
    const tweets = await db.listSources({ type: 'tweet', limit: limit || undefined });
    console.error(`Scanning ${tweets.length} tweet entries for external URLs...\n`);

    const stats = { scanned: 0, urls_found: 0, ingested: 0, already_exists: 0, linked: 0, errors: 0, skipped: 0 };

    let embedder = null;
    let embeddingMeta = null;
    if (!dryRun) {
      const creds = loadEmbeddingCredentials();
      embedder = new EmbeddingGenerator(creds.key, creds.provider);
    }

    for (const tweet of tweets) {
      stats.scanned++;
      const full = await db.getSourceById(tweet.id);
      if (!full || !full.raw_content) continue;

      const urls = extractExternalUrls(full.raw_content);
      if (urls.length === 0) continue;

      stats.urls_found += urls.length;
      console.error(`[${stats.scanned}/${tweets.length}] Tweet #${tweet.id} "${tweet.title}" - ${urls.length} URL(s)`);

      for (const url of urls) {
        if (dryRun) {
          console.error(`  → ${url} (dry run)`);
          continue;
        }

        try {
          // Check if already in KB
          const existing = await db.getSourceByUrl(url);
          if (existing) {
            const didLink = await db.insertSourceLink(tweet.id, existing.id, 'linked_from_tweet', 'backfill');
            if (didLink) {
              console.error(`  ✓ ${url} - already in KB (#${existing.id}), linked`);
              stats.linked++;
            } else {
              console.error(`  - ${url} - already in KB and linked (#${existing.id})`);
            }
            stats.already_exists++;
            continue;
          }

          // Extract content
          const extracted = extractContent(url, {});
          const scanSource = extracted?.type === 'tweet' ? 'kb_tweet' : 'kb_url';
          const { sanitized: content, blocked } = await sanitizeAndScan(extracted.content, {
            source: scanSource,
            maxLength: 200000,
            metadata: {
              ingest_context: 'kb_backfill_tweet_links',
              source_tweet_id: tweet.id,
              source_tweet_url: tweet.url || null,
              target_url: url,
              extracted_type: extracted?.type || null,
            },
          });
          if (blocked) {
            console.error(`  ✗ ${url} - blocked by frontier scanner`);
            stats.skipped++;
            continue;
          }
          if (!content || content.length < 10) {
            console.error(`  ✗ ${url} - no content`);
            stats.skipped++;
            continue;
          }

          // Content hash dedup
          const hash = contentHash(content);
          const byHash = await db.getSourceByHash(hash);
          if (byHash) {
            await db.insertSourceLink(tweet.id, byHash.id, 'linked_from_tweet', 'backfill');
            console.error(`  ✓ ${url} - content match (#${byHash.id}), linked`);
            stats.already_exists++;
            stats.linked++;
            continue;
          }

          // Summary
          let summary = await generateSummary(url, extracted.type, { content });
          if (!summary) summary = content.substring(0, 500);

          // Chunk
          const chunks = chunkText(content, { chunkSize: 800, overlap: 200 });
          if (chunks.length === 0) {
            console.error(`  ✗ ${url} - no chunks`);
            stats.skipped++;
            continue;
          }

          // Embed (capture metadata after first successful batch)
          const embeddings = await embedder.generateBatch(chunks.map(c => c.content));
          const ok = embeddings.filter(e => e !== null).length;
          if (ok === 0) {
            console.error(`  ✗ ${url} - embedding failed`);
            stats.errors++;
            continue;
          }

          if (!embeddingMeta) {
            embeddingMeta = {
              embedding_dim: embedder.getDimension(),
              embedding_provider: embedder.provider,
              embedding_model: embedder.getModel(),
            };
          }

          const chunksData = chunks.map((c, i) => ({
            index: c.index, content: c.content, embedding: embeddings[i], ...embeddingMeta,
          }));

          // Tags
          const tags = autoTag(content, extracted.title);

          // Store
          const sourceId = await db.insertSource({
            url, title: extracted.title, sourceType: extracted.type,
            summary, rawContent: content, contentHash: hash, tags,
          });
          await db.insertChunks(sourceId, chunksData);
          await db.insertSourceLink(tweet.id, Number(sourceId), 'linked_from_tweet', 'backfill');

          console.error(`  ✓ ${url} - ingested (#${sourceId}, ${chunks.length} chunks)`);
          stats.ingested++;
          stats.linked++;

          // Brief pause between ingestions to be gentle on APIs
          await sleep(1000);
        } catch (err) {
          console.error(`  ✗ ${url} - error: ${err.message}`);
          stats.errors++;
        }
      }
    }

    logEvent({ event: 'kb_backfill_tweet_links', ...stats, dry_run: dryRun });
    console.log(JSON.stringify({ ...stats, dry_run: dryRun }));
  } finally {
    cleanup();
  }
}

main().catch(err => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});

