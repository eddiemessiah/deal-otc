#!/usr/bin/env node

/**
 * Ingest content into the knowledge base.
 * Usage: node scripts/ingest.js "<url_or_path_or_text>" [--tags "t1,t2"] [--title "Title"] [--type article|video|pdf|text] [--no-browser] [--dry-run]
 */

const path = require('path');
const fs = require('fs');
const { KnowledgeDB, EmbeddingGenerator, chunkText, extractContent, contentHash, generateSummary, loadEmbeddingCredentials } = require('../src');
const { disableBrowser, normalizeUrl, isJunkTitle } = require('../src/extractor');
const { extractEntities } = require('../src/entity-extractor');
const { sanitizeUntrustedText } = require('../../../shared/content-sanitizer');
const { scanWithFrontierScanner } = require('../../../shared/frontier-scanner');
const { logEvent } = require('../../../shared/event-log');
const { getDataDir } = require('../src/config');

const LOCK_FILE = path.join(getDataDir(), '.ingest.lock');

async function main() {
  const args = process.argv.slice(2);
  const startedAt = Date.now();

  if (args.length === 0 || args[0] === '--help') {
    console.log(JSON.stringify({
      error: 'Usage: node scripts/ingest.js "<url_or_text>" [--tags "t1,t2"] [--title "Title"] [--type article|video|pdf|text] [--no-browser] [--dry-run]'
    }));
    process.exit(1);
  }

  // Autonomy policy check for KB ingestion
  try {
    const { checkPolicy } = require('../../../shared/autonomy-controller');
    const decision = checkPolicy('kb_ingest', {
      isExternal: false,
      contentPreview: String(args[0]).slice(0, 200),
    });
    if (!decision.allowed) {
      console.log(JSON.stringify({ error: 'blocked_by_autonomy_policy' }));
      process.exit(1);
    }
  } catch { /* autonomy controller not available, proceed normally */ }

  // Parse arguments
  let input = args[0];
  const options = parseOptions(args.slice(1));
  const initialUrlHost = getUrlHost(input);
  const sourceType = options.type || detectSourceType(input);
  logEvent({
    event: 'kb_ingest_start',
    source_type: sourceType,
    url_host: initialUrlHost,
    dry_run: Boolean(options.dryRun),
    no_browser: Boolean(options.noBrowser),
  });

  // Handle --no-browser flag
  if (options.noBrowser) {
    disableBrowser();
  }

  // Normalize URL for consistent dedup (strip tracking params, www, etc.)
  if (input.startsWith('http')) {
    input = normalizeUrl(input);
  }

  // Dry-run mode: skip lock, DB, and embeddings
  if (options.dryRun) {
    logEvent({
      event: 'kb_ingest_dry_run',
      source_type: sourceType,
      url_host: initialUrlHost,
      duration_ms: Date.now() - startedAt,
    });
    return dryRun(input, options);
  }

  // Acquire lock
  if (!acquireLock()) {
    logEvent({
      event: 'kb_ingest_end',
      ok: false,
      reason: 'lock_busy',
      source_type: sourceType,
      url_host: initialUrlHost,
      duration_ms: Date.now() - startedAt,
    }, { level: 'warn' });
    console.log(JSON.stringify({ error: 'Another ingest is already running. Try again in a moment.' }));
    process.exit(1);
  }

  let db;
  try {
    db = new KnowledgeDB();

    // 1. URL-based dedup (check both normalized and original)
    if (input.startsWith('http')) {
      const existingByUrl = await db.getSourceByUrl(input);
      if (existingByUrl) {
        logEvent({
          event: 'kb_ingest_end',
          ok: false,
          reason: 'duplicate_url',
          source_type: sourceType,
          url_host: initialUrlHost,
          source_id: existingByUrl.id,
          duration_ms: Date.now() - startedAt,
        }, { level: 'info' });
        console.log(JSON.stringify({
          success: false,
          error: 'duplicate',
          message: `This URL already exists in your knowledge base as "${existingByUrl.title}" (id: ${existingByUrl.id})`,
          source_id: existingByUrl.id
        }));
        process.exit(0);
      }
    }

    // 2. Extract content
    const extracted = extractContent(input, {
      type: options.type,
      title: options.title
    });

    const sanitizedContent = sanitizeUntrustedText(extracted.content, { maxLength: 200000 });
    if (!sanitizedContent || sanitizedContent.length < 10) {
      logEvent({
        event: 'kb_ingest_end',
        ok: false,
        reason: 'no_content_extracted',
        source_type: sourceType,
        url_host: initialUrlHost,
        duration_ms: Date.now() - startedAt,
      }, { level: 'warn' });
      console.log(JSON.stringify({
        error: 'No content could be extracted from the input.',
        extraction_log: extracted.extraction_log
      }));
      process.exit(1);
    }

    const scanResult = await scanWithFrontierScanner({
      text: sanitizedContent,
      source: getFrontierScanSource(extracted),
      metadata: {
        ingest_context: 'kb_primary',
        url: extracted.url || null,
        source_type: extracted.type || null,
      },
    });
    if (scanResult.blocked) {
      logEvent({
        event: 'kb_ingest_end',
        ok: false,
        reason: 'blocked_by_frontier_scan',
        source_type: extracted.type || sourceType,
        url_host: getUrlHost(extracted.url) || initialUrlHost,
        frontier_verdict: scanResult.verdict,
        frontier_risk_score: scanResult.risk_score,
        frontier_reasons: scanResult.reasons,
        duration_ms: Date.now() - startedAt,
      }, { level: 'warn' });
      console.log(JSON.stringify({
        error: 'Blocked by frontier scanner',
        verdict: scanResult.verdict,
        risk_score: scanResult.risk_score,
        reasons: scanResult.reasons,
      }));
      process.exit(1);
    }

    // 3. Content-hash dedup
    const hash = contentHash(sanitizedContent);
    const existing = await db.getSourceByHash(hash);
    if (existing) {
      logEvent({
        event: 'kb_ingest_end',
        ok: false,
        reason: 'duplicate_content_hash',
        source_type: sourceType,
        url_host: initialUrlHost,
        source_id: existing.id,
        duration_ms: Date.now() - startedAt,
      }, { level: 'info' });
      console.log(JSON.stringify({
        success: false,
        error: 'duplicate',
        message: `This content already exists in your knowledge base as "${existing.title}" (id: ${existing.id})`,
        source_id: existing.id
      }));
      process.exit(0);
    }

    // 4. Generate summary
    let summary = null;
    if (extracted.type === 'tweet' || extracted.type === 'text') {
      summary = sanitizedContent.substring(0, 500);
    } else if (extracted.url || input.startsWith('/')) {
      summary = await generateSummary(input, extracted.type, { content: sanitizedContent });
    } else {
      summary = sanitizedContent.substring(0, 500);
    }

    // 5. Chunk the content
    let chunks = chunkText(sanitizedContent, { chunkSize: 800, overlap: 200 });

    // For large documents, use relevance signals to decide how many chunks are worth embedding
    const LARGE_DOC_THRESHOLD = 50;
    if (chunks.length > LARGE_DOC_THRESHOLD) {
      const relevance = assessLargeDocRelevance(sanitizedContent, extracted, chunks.length);
      if (relevance.maxChunks && chunks.length > relevance.maxChunks) {
        logEvent({
          event: 'kb_ingest_relevance_cap',
          source_type: sourceType,
          url_host: initialUrlHost,
          original_chunks: chunks.length,
          capped_to: relevance.maxChunks,
          reason: relevance.reason,
          tag_count: relevance.tagCount,
        }, { level: 'info' });
        chunks = chunks.slice(0, relevance.maxChunks);
      }
    }

    if (chunks.length === 0) {
      logEvent({
        event: 'kb_ingest_end',
        ok: false,
        reason: 'no_chunks',
        source_type: sourceType,
        url_host: initialUrlHost,
        duration_ms: Date.now() - startedAt,
      }, { level: 'warn' });
      console.log(JSON.stringify({ error: 'Content too short to create meaningful chunks.' }));
      process.exit(1);
    }

    // 5b. Content substance check (detect non-article pages)
    const substanceCheck = assessContentSubstance(sanitizedContent, extracted);

    // 6. Generate embeddings for each chunk
    const creds = loadEmbeddingCredentials();
    const embedder = new EmbeddingGenerator(creds.key, creds.provider);

    const chunkTexts = chunks.map(c => c.content);
    const embeddings = await embedder.generateBatch(chunkTexts);

    // 6b. Semantic overlap check against existing KB
    let overlapMatch = null;
    try {
      overlapMatch = await findSemanticOverlap(db, embedder, summary || sanitizedContent.substring(0, 500));
    } catch { /* non-fatal, don't block ingest */ }

    // Check how many embeddings succeeded
    const successCount = embeddings.filter(e => e !== null).length;
    if (successCount === 0) {
      logEvent({
        event: 'kb_ingest_end',
        ok: false,
        reason: 'embedding_failed_all',
        source_type: sourceType,
        url_host: initialUrlHost,
        chunk_count: chunks.length,
        duration_ms: Date.now() - startedAt,
      }, { level: 'error' });
      console.log(JSON.stringify({ error: 'All embedding generations failed. Content was extracted but could not be embedded.' }));
      process.exit(1);
    }

    // Attach embeddings to chunks
    const embeddingMeta = {
      embedding_dim: embedder.getDimension(),
      embedding_provider: embedder.provider,
      embedding_model: embedder.getModel()
    };
    const chunksWithEmbeddings = chunks.map((chunk, i) => ({
      index: chunk.index,
      content: chunk.content,
      embedding: embeddings[i],
      ...embeddingMeta
    }));

    // 7. Determine tags (user-provided or auto-generated)
    let tags = options.tags ? options.tags.split(',').map(t => t.trim()).filter(Boolean) : [];
    if (tags.length === 0) {
      tags = autoTag(sanitizedContent, extracted.title);
    }

    // 8. Store in database
    const sourceId = await db.insertSource({
      url: extracted.url,
      title: extracted.title,
      sourceType: extracted.type,
      summary,
      rawContent: sanitizedContent,
      contentHash: hash,
      tags
    });

    await db.insertChunks(sourceId, chunksWithEmbeddings);

    // 9. Extract and store entities (companies, people, products)
    const entities = extractEntities(sanitizedContent, extracted.title);
    if (entities.length > 0) {
      await db.insertEntities(sourceId, entities);
    }

    // 10. Output result
    const result = {
      success: true,
      source_id: Number(sourceId),
      title: extracted.title,
      type: extracted.type,
      chunks: chunks.length,
      embedded: successCount,
      tags,
      entities: entities.map(e => e.name),
      summary: summary?.substring(0, 200),
      strategy_used: extracted.strategy_used || null
    };
    if (extracted.extraction_log) {
      result.extraction_log = extracted.extraction_log;
    }
    if (successCount < chunks.length) {
      result.warning = `${chunks.length - successCount} chunks failed embedding generation`;
    }
    if (overlapMatch) {
      result.overlap = overlapMatch;
    }
    if (substanceCheck.warning) {
      result.substance_warning = substanceCheck.warning;
      result.substance_score = substanceCheck.score;
    }
    logEvent({
      event: 'kb_ingest_end',
      ok: true,
      source_type: extracted.type || sourceType,
      url_host: getUrlHost(extracted.url) || initialUrlHost,
      source_id: Number(sourceId),
      chunk_count: chunks.length,
      embedded_count: successCount,
      strategy_used: extracted.strategy_used || null,
      duration_ms: Date.now() - startedAt,
    });

    // 10. Follow and ingest external URLs linked from the tweet
    if (extracted.type === 'tweet' && extracted.external_urls?.length > 0 && !options.noFollowLinks) {
      const linkedResults = await ingestLinkedUrls(db, embedder, embeddingMeta, Number(sourceId), extracted.external_urls);
      if (linkedResults.length > 0) {
        result.linked_urls = linkedResults;
      }
    }

    console.log(JSON.stringify(result));

  } catch (error) {
    logEvent({
      event: 'kb_ingest_end',
      ok: false,
      source_type: sourceType,
      url_host: initialUrlHost,
      error: error.message,
      duration_ms: Date.now() - startedAt,
    }, { level: 'error' });
    const output = {
      error: error.message,
      stack: process.env.DEBUG ? error.stack : undefined
    };
    if (error.extraction_log) {
      output.extraction_log = error.extraction_log;
    }
    console.log(JSON.stringify(output));
    process.exit(1);
  } finally {
    if (db) db.close();
    releaseLock();
  }
}

/**
 * Dry-run mode: extract + chunk but don't write to DB or generate embeddings.
 * Useful for testing whether a URL can be extracted successfully.
 */
async function dryRun(input, options) {
  try {
    const extracted = extractContent(input, {
      type: options.type,
      title: options.title
    });

    const sanitizedContent = sanitizeUntrustedText(extracted.content, { maxLength: 200000 });
    const chunks = chunkText(sanitizedContent, { chunkSize: 800, overlap: 200 });

    const output = {
      dry_run: true,
      title: extracted.title,
      type: extracted.type,
      content_length: sanitizedContent.length,
      chunks: chunks.length,
      strategy_used: extracted.strategy_used || null,
      extraction_log: extracted.extraction_log || [],
      content_preview: sanitizedContent.substring(0, 500)
    };
    if (extracted.external_urls?.length > 0) {
      output.external_urls = extracted.external_urls;
    }
    console.log(JSON.stringify(output));
  } catch (error) {
    const output = {
      dry_run: true,
      error: error.message
    };
    if (error.extraction_log) {
      output.extraction_log = error.extraction_log;
    }
    console.log(JSON.stringify(output));
    process.exit(1);
  }
}

/**
 * Simple auto-tagging based on keyword frequency in the content.
 * No LLM call - just fast keyword extraction.
 */
function autoTag(content, title) {
  const text = `${title || ''} ${content}`.toLowerCase();

  const tagKeywords = {
    'ai': /\b(artificial intelligence|machine learning|deep learning|neural network|llm|large language model|gpt|claude|gemini|anthropic|openai)\b/g,
    'agents': /\b(ai agent|agentic|autonomous agent|agent framework|tool use)\b/g,
    'rag': /\b(retrieval.augmented|rag|vector search|embeddings|semantic search|knowledge base)\b/g,
    'fine-tuning': /\b(fine.tun|finetuning|lora|qlora|training data|model training)\b/g,
    'open-source': /\b(open.source|llama|mistral|hugging\s?face)\b/g,
    'robotics': /\b(robot|humanoid|embodied ai|manipulation|locomotion)\b/g,
    'business': /\b(revenue|valuation|funding|ipo|acquisition|startup|enterprise)\b/g,
    'safety': /\b(alignment|safety|misalignment|jail-break|red team|guardrail)\b/g,
    'hardware': /\b(gpu|tpu|nvidia|chip|semiconductor|blackwell|inference hardware)\b/g,
    'coding': /\b(coding agent|code generation|copilot|cursor|ide|developer tool)\b/g,
    'video': /\b(youtube|video|creator|thumbnail|content creation)\b/g,
    'crypto': /\b(crypto|bitcoin|ethereum|blockchain|web3|defi)\b/g,
    'apple': /\b(apple|iphone|ios|macos|wwdc|vision pro)\b/g,
    'google': /\b(google|alphabet|deepmind|android|search)\b/g,
    'microsoft': /\b(microsoft|azure|windows|copilot|bing)\b/g,
    'meta': /\b(meta|facebook|instagram|threads|whatsapp)\b/g,
  };

  const tags = [];
  for (const [tag, regex] of Object.entries(tagKeywords)) {
    const matches = text.match(regex);
    if (matches && matches.length >= 2) {
      tags.push(tag);
    }
  }

  return tags.slice(0, 5); // Max 5 auto-tags
}

/**
 * Decide how many chunks a large document deserves based on topical relevance,
 * source domain, and title quality. Small documents (<50 chunks) bypass this
 * entirely. Returns { maxChunks, reason, tagCount }.
 */
function assessLargeDocRelevance(content, extracted, chunkCount) {
  const tags = autoTag(content, extracted.title);
  const url = extracted.url || '';
  const title = extracted.title || '';
  const host = getUrlHost(url) || '';

  const TRUSTED_RESEARCH_DOMAINS = [
    'arxiv.org', 'anthropic.com', 'openai.com', 'deepmind.com',
    'ai.meta.com', 'research.google', 'blog.google', 'claude.com',
  ];
  const BULK_CONTENT_DOMAINS = [
    'wikipedia.org', 'biztoc.com', 'opentools.ai',
  ];

  const isTrusted = TRUSTED_RESEARCH_DOMAINS.some(d => host.includes(d));
  const isBulk = BULK_CONTENT_DOMAINS.some(d => host.includes(d));
  const base = { tagCount: tags.length };

  // Bulk content sites (Wikipedia, aggregators) are rarely worth embedding at scale
  if (isBulk) {
    return { ...base, maxChunks: 30, reason: 'bulk content domain, capping' };
  }

  // Trusted research domains get generous limits
  if (isTrusted) {
    return chunkCount <= 200
      ? { ...base, maxChunks: null, reason: 'trusted research domain' }
      : { ...base, maxChunks: 200, reason: 'trusted domain, very large' };
  }

  // Strong topical relevance (2+ tags): allow up to 150
  if (tags.length >= 2) {
    return chunkCount <= 150
      ? { ...base, maxChunks: null, reason: 'strong topical relevance' }
      : { ...base, maxChunks: 150, reason: 'relevant but very large' };
  }

  // Weak relevance (1 tag): cap at 80
  if (tags.length === 1) {
    return chunkCount <= 80
      ? { ...base, maxChunks: null, reason: 'moderate topical relevance' }
      : { ...base, maxChunks: 80, reason: 'weakly relevant, capping' };
  }

  // No topical tags at all. Junk title makes it even less likely to be useful.
  if (isJunkTitle(title)) {
    return { ...base, maxChunks: 30, reason: 'no topical relevance, generic title' };
  }

  return { ...base, maxChunks: 50, reason: 'no topical relevance' };
}

/**
 * Check semantic overlap with existing KB content. Embeds the summary text,
 * then compares against all existing chunk embeddings. Returns the best match
 * above threshold, or null. Cost: one extra embedding call.
 */
async function findSemanticOverlap(db, embedder, summaryText) {
  if (!summaryText || summaryText.length < 20) return null;

  const OVERLAP_THRESHOLD = 0.92;
  const queryBuffer = typeof embedder.generateQuery === 'function'
    ? await embedder.generateQuery(summaryText.substring(0, 500))
    : await embedder.generate(summaryText.substring(0, 500));
  const queryVector = embedder.bufferToVector(queryBuffer);
  const expectedDim = queryVector.length;

  const candidates = await db.getAllChunksWithEmbeddings();
  if (candidates.length === 0) return null;

  let bestMatch = null;
  let bestScore = 0;
  const seenSources = new Set();

  for (const chunk of candidates) {
    if (!chunk.embedding) continue;
    if (seenSources.has(chunk.source_id)) continue;

    const chunkDim = Math.floor(chunk.embedding.length / 4);
    if (chunkDim !== expectedDim) continue;

    const chunkVector = embedder.bufferToVector(chunk.embedding);
    const similarity = embedder.cosineSimilarity(queryVector, chunkVector);

    if (similarity > bestScore) {
      bestScore = similarity;
      seenSources.add(chunk.source_id);
      bestMatch = {
        source_id: chunk.source_id,
        title: chunk.title,
        similarity: Math.round(similarity * 100),
      };
    }
  }

  if (bestScore < OVERLAP_THRESHOLD) return null;
  return bestMatch;
}

const NON_ARTICLE_SIGNALS = [
  { pattern: /\b(sign in|log in|create account|sign up|register now)\b/gi, weight: 3, label: 'login_page' },
  { pattern: /\b(add to cart|buy now|checkout|price|pricing plan)\b/gi, weight: 3, label: 'product_page' },
  { pattern: /\b(apply now|job opening|we.re hiring|career|open position)\b/gi, weight: 2, label: 'job_listing' },
  { pattern: /\b(cookie policy|privacy policy|terms of service|accept cookies)\b/gi, weight: 2, label: 'boilerplate' },
  { pattern: /\b(subscribe to our newsletter|unsubscribe|email address)\b/gi, weight: 1, label: 'newsletter' },
];

/**
 * Score how much the extracted content looks like a real article vs. a
 * product page, homepage, login wall, or other non-article page. Returns
 * { score (0-1, higher=more article-like), warning (string|null) }.
 */
function assessContentSubstance(content, extracted) {
  if (!content) return { score: 0, warning: 'empty content' };

  const lines = content.split('\n').filter(l => l.trim().length > 0);
  const totalChars = content.length;

  // Average line length: real articles have longer paragraphs
  const avgLineLen = totalChars / Math.max(lines.length, 1);

  // Count non-article signals
  let signalWeight = 0;
  const detectedLabels = [];
  for (const sig of NON_ARTICLE_SIGNALS) {
    const matches = content.match(sig.pattern);
    if (matches && matches.length >= 2) {
      signalWeight += sig.weight;
      detectedLabels.push(sig.label);
    }
  }

  // Short content from a URL is suspicious (paywall or login wall)
  const isUrl = (extracted.url || '').startsWith('http');
  const isShortForUrl = isUrl && totalChars < 200 && extracted.type !== 'tweet';

  // Score: start at 1.0 and deduct
  let score = 1.0;
  if (avgLineLen < 30) score -= 0.2;
  if (signalWeight >= 4) score -= 0.3;
  else if (signalWeight >= 2) score -= 0.15;
  if (isShortForUrl) score -= 0.3;
  score = Math.max(0, Math.round(score * 100) / 100);

  let warning = null;
  if (score < 0.5) {
    const reasons = [];
    if (isShortForUrl) reasons.push('very little content extracted (possible paywall)');
    if (detectedLabels.length > 0) reasons.push(`looks like: ${[...new Set(detectedLabels)].join(', ')}`);
    if (avgLineLen < 30) reasons.push('mostly short lines (nav/menu content)');
    warning = reasons.join('; ') || 'low substance score';
  }

  return { score, warning };
}

/**
 * Ingest external URLs found in a tweet and link them to the parent source.
 * Each URL is extracted, chunked, embedded, and stored as a separate KB entry,
 * then connected to the parent via source_links.
 * Errors for individual URLs are caught and reported, not thrown.
 */
async function ingestLinkedUrls(db, embedder, embeddingMeta, parentSourceId, urls) {
  const results = [];

  for (const url of urls) {
    try {
      // Check if URL already exists in KB
      const existing = await db.getSourceByUrl(url);
      if (existing) {
        await db.insertSourceLink(parentSourceId, existing.id, 'linked_from_tweet');
        results.push({ url, source_id: existing.id, status: 'already_exists', linked: true });
        continue;
      }

      // Extract content
      const extracted = extractContent(url, {});
      const content = sanitizeUntrustedText(extracted.content, { maxLength: 200000 });
      if (!content || content.length < 10) {
        results.push({ url, status: 'skipped', reason: 'no_content' });
        continue;
      }

      const scanResult = await scanWithFrontierScanner({
        text: content,
        source: getFrontierScanSource(extracted),
        metadata: {
          ingest_context: 'kb_linked_url',
          parent_source_id: parentSourceId,
          url: extracted.url || url,
          source_type: extracted.type || null,
        },
      });
      if (scanResult.blocked) {
        results.push({
          url,
          status: 'blocked',
          reason: 'blocked_by_frontier_scan',
          verdict: scanResult.verdict,
          risk_score: scanResult.risk_score,
        });
        continue;
      }

      // Content hash dedup
      const hash = contentHash(content);
      const existingByHash = await db.getSourceByHash(hash);
      if (existingByHash) {
        await db.insertSourceLink(parentSourceId, existingByHash.id, 'linked_from_tweet');
        results.push({ url, source_id: existingByHash.id, status: 'already_exists', linked: true });
        continue;
      }

      // Generate summary
      let summary = await generateSummary(url, extracted.type, { content });
      if (!summary) summary = content.substring(0, 500);

      // Chunk
      const chunks = chunkText(content, { chunkSize: 800, overlap: 200 });
      if (chunks.length === 0) {
        results.push({ url, status: 'skipped', reason: 'no_chunks' });
        continue;
      }

      // Embed
      const chunkTexts = chunks.map(c => c.content);
      const embeddings = await embedder.generateBatch(chunkTexts);
      const successCount = embeddings.filter(e => e !== null).length;
      if (successCount === 0) {
        results.push({ url, status: 'error', error: 'all_embeddings_failed' });
        continue;
      }

      const chunksWithEmbeddings = chunks.map((chunk, i) => ({
        index: chunk.index,
        content: chunk.content,
        embedding: embeddings[i],
        ...embeddingMeta,
      }));

      // Auto-tag based on article content
      const tags = autoTag(content, extracted.title);

      // Store
      const sourceId = await db.insertSource({
        url,
        title: extracted.title,
        sourceType: extracted.type,
        summary,
        rawContent: content,
        contentHash: hash,
        tags,
      });
      await db.insertChunks(sourceId, chunksWithEmbeddings);

      // Extract and store entities
      const linkedEntities = extractEntities(content, extracted.title);
      if (linkedEntities.length > 0) {
        await db.insertEntities(sourceId, linkedEntities);
      }

      // Link to parent tweet
      await db.insertSourceLink(parentSourceId, Number(sourceId), 'linked_from_tweet');

      logEvent({
        event: 'kb_ingest_linked',
        parent_source_id: parentSourceId,
        child_source_id: Number(sourceId),
        url_host: getUrlHost(url),
        chunk_count: chunks.length,
        embedded_count: successCount,
      });

      results.push({
        url,
        source_id: Number(sourceId),
        title: extracted.title,
        type: extracted.type,
        chunks: chunks.length,
        embedded: successCount,
        status: 'ingested',
      });
    } catch (err) {
      logEvent({
        event: 'kb_ingest_linked_error',
        parent_source_id: parentSourceId,
        url,
        error: err.message,
      }, { level: 'warn' });
      results.push({ url, status: 'error', error: err.message });
    }
  }

  return results;
}

function parseOptions(args) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--tags' && args[i + 1]) {
      options.tags = args[++i];
    } else if (args[i] === '--title' && args[i + 1]) {
      options.title = args[++i];
    } else if (args[i] === '--type' && args[i + 1]) {
      options.type = args[++i];
    } else if (args[i] === '--no-browser') {
      options.noBrowser = true;
    } else if (args[i] === '--dry-run') {
      options.dryRun = true;
    } else if (args[i] === '--no-follow-links') {
      options.noFollowLinks = true;
    }
  }
  return options;
}

function getUrlHost(input) {
  if (!String(input || '').startsWith('http')) return null;
  try {
    return new URL(String(input)).host;
  } catch {
    return null;
  }
}

function detectSourceType(input) {
  const value = String(input || '');
  if (/^https?:\/\/(www\.)?(twitter\.com|x\.com)\//i.test(value)) return 'tweet';
  if (/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(value)) return 'video';
  if (/\.pdf($|[?#])/i.test(value)) return 'pdf';
  if (/^https?:\/\//i.test(value)) return 'article';
  return 'text';
}

function getFrontierScanSource(extracted) {
  if (String(extracted?.type || '').toLowerCase() === 'tweet') return 'kb_tweet';
  if (String(extracted?.url || '').startsWith('http')) return 'kb_url';
  return 'kb_text';
}

// --- Lock file for concurrency control ---

const STALE_LOCK_MS = 15 * 60 * 1000; // 15 minutes (increased from 5 to handle slow extractions)

function isPidAlive(pid) {
  try {
    process.kill(pid, 0); // Signal 0 tests existence without killing
    return true;
  } catch {
    return false; // Process doesn't exist
  }
}

/**
 * Acquire exclusive lock. Uses 'wx' for normal acquisition. If lock exists but is stale
 * (pid dead, too old, or invalid), atomically renames it aside and then retries 'wx'.
 * Only one process can win the rename-aside race; only one can then succeed at 'wx'.
 *
 * @param {Object} [opts] - Testability options
 * @param {string} [opts.lockFilePath] - Override lock file path
 * @param {number} [opts.pidOverride] - Override PID for lock content
 * @param {Function} [opts.isPidAliveFn] - Override isPidAlive check
 * @returns {boolean} - true if lock acquired, false otherwise
 */
function acquireLock(opts = {}) {
  const lockFilePath = opts.lockFilePath ?? LOCK_FILE;
  const pid = opts.pidOverride ?? process.pid;
  const isPidAliveFn = opts.isPidAliveFn ?? isPidAlive;

  const dir = path.dirname(lockFilePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  // Attempt 1: Try atomic creation (O_CREAT | O_EXCL via 'wx' flag)
  try {
    fs.writeFileSync(lockFilePath, String(pid), { flag: 'wx' });
    return true;
  } catch (err) {
    if (err.code !== 'EEXIST') return false;
  }

  // Lock file exists - check the owning PID and staleness
  try {
    const lockContent = fs.readFileSync(lockFilePath, 'utf8').trim();
    const lockPid = parseInt(lockContent, 10);
    const stat = fs.statSync(lockFilePath);
    const ageMs = Date.now() - stat.mtimeMs;

    // If the PID is valid and still alive, and lock isn't ancient, respect it
    if (!isNaN(lockPid) && isPidAliveFn(lockPid) && ageMs <= STALE_LOCK_MS) {
      return false; // Lock is valid - another process owns it
    }

    // Lock is stale: either PID is dead, PID is invalid, or lock is too old
    const reason = !isNaN(lockPid) && !isPidAliveFn(lockPid)
      ? `owner PID ${lockPid} is dead`
      : ageMs > STALE_LOCK_MS
        ? `lock is ${Math.round(ageMs / 1000)}s old (max ${STALE_LOCK_MS / 1000}s)`
        : 'invalid PID in lock file';
    console.error(`[lock] Removing stale lock: ${reason}`);

    // Atomically rename existing lock aside. Only one process can succeed at
    // renaming an existing file; others get ENOENT. Then try 'wx' - only one
    // can create the new lock.
    const stalePath = lockFilePath + '.stale.' + lockPid + '.' + Date.now();
    let didRename = false;
    try {
      fs.renameSync(lockFilePath, stalePath);
      didRename = true;
    } catch (renameErr) {
      if (renameErr.code === 'ENOENT') {
        // Another process already moved it; try wx in case we can still acquire
      } else {
        return false;
      }
    }

    // Retry 'wx' creation - file should now not exist (or we lost the race)
    try {
      fs.writeFileSync(lockFilePath, String(pid), { flag: 'wx' });
    } catch (writeErr) {
      if (didRename) {
        try { fs.unlinkSync(stalePath); } catch { /* ignore */ }
      }
      if (writeErr.code === 'EEXIST') {
        return false; // Lost race
      }
      return false;
    }

    if (didRename) {
      try { fs.unlinkSync(stalePath); } catch { /* ignore */ }
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Release lock only if we own it.
 *
 * @param {Object} [opts] - Testability options
 * @param {string} [opts.lockFilePath] - Override lock file path
 * @param {number} [opts.pidOverride] - Override PID for ownership check
 */
function releaseLock(opts = {}) {
  const lockFilePath = opts.lockFilePath ?? LOCK_FILE;
  const pid = opts.pidOverride ?? process.pid;

  try {
    const lockContent = fs.readFileSync(lockFilePath, 'utf8').trim();
    const lockPid = parseInt(lockContent, 10);
    if (lockPid === pid) {
      fs.unlinkSync(lockFilePath);
    }
  } catch { /* lock already removed or doesn't exist */ }
}

// Export for unit tests and backfill script
if (typeof module !== 'undefined' && module.exports) {
  module.exports.acquireLock = acquireLock;
  module.exports.releaseLock = releaseLock;
  module.exports.autoTag = autoTag;
  module.exports.assessLargeDocRelevance = assessLargeDocRelevance;
  module.exports.assessContentSubstance = assessContentSubstance;
  module.exports.findSemanticOverlap = findSemanticOverlap;
  module.exports.ingestLinkedUrls = ingestLinkedUrls;
}

if (require.main === module) {
  main();
}

