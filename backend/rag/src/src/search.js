const { sanitizeUntrustedText } = require('../../../shared/content-sanitizer');
const { logEvent } = require('../../../shared/event-log');
const { formatCitedResponse } = require('./citation-formatter');
const { parseTags } = require('./db');

const SOURCE_CREDIBILITY = {
  'bloomberg.com': 0.95, 'nytimes.com': 0.95, 'wsj.com': 0.95,
  'reuters.com': 0.95, 'ft.com': 0.9, 'washingtonpost.com': 0.9,
  'apnews.com': 0.9, 'bbc.com': 0.85, 'bbc.co.uk': 0.85,
  'techcrunch.com': 0.85, 'theverge.com': 0.85, 'arstechnica.com': 0.85,
  'wired.com': 0.85, 'technologyreview.com': 0.9, 'theinformation.com': 0.9,
  'semafor.com': 0.8, 'platformer.news': 0.8,
  'anthropic.com': 0.8, 'openai.com': 0.8, 'blog.google': 0.8,
  'ai.meta.com': 0.8, 'microsoft.com': 0.8, 'nvidia.com': 0.8,
  'developers.openai.com': 0.8, 'ai.google.dev': 0.8,
  'arxiv.org': 0.85, 'github.com': 0.7, 'huggingface.co': 0.7,
  'x.com': 0.5, 'twitter.com': 0.5, 'reddit.com': 0.4,
  'youtube.com': 0.6, 'youtu.be': 0.6,
  'substack.com': 0.6, 'medium.com': 0.5,
};

const DEFAULT_CREDIBILITY = 0.5;
const FRESHNESS_DECAY_DAYS = 90;
const FRESHNESS_WEIGHT = 0.12;
const CREDIBILITY_WEIGHT = 0.08;

const TAG_SCORE_WEIGHTS = {
  'workflow-radar': 0.4,
};

function getCredibility(url) {
  if (!url) return DEFAULT_CREDIBILITY;
  try {
    let hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    if (SOURCE_CREDIBILITY[hostname] !== undefined) return SOURCE_CREDIBILITY[hostname];
    const parts = hostname.split('.');
    if (parts.length > 2) {
      const parent = parts.slice(-2).join('.');
      if (SOURCE_CREDIBILITY[parent] !== undefined) return SOURCE_CREDIBILITY[parent];
    }
    return DEFAULT_CREDIBILITY;
  } catch {
    return DEFAULT_CREDIBILITY;
  }
}

function getFreshnessBoost(createdAt) {
  if (!createdAt) return 0;
  try {
    const ageMs = Date.now() - new Date(createdAt).getTime();
    const ageDays = Math.max(0, ageMs / (1000 * 60 * 60 * 24));
    return Math.max(0, 1 - ageDays / FRESHNESS_DECAY_DAYS);
  } catch {
    return 0;
  }
}

function parseSince(since) {
  if (!since) return null;
  const match = String(since).match(/^(\d+)\s*(d|h|w|m)$/i);
  if (match) {
    const n = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
    if (unit === 'h') return Math.max(1, Math.ceil(n / 24));
    if (unit === 'd') return n;
    if (unit === 'w') return n * 7;
    if (unit === 'm') return n * 30;
  }
  try {
    const date = new Date(since);
    if (!isNaN(date.getTime())) {
      const days = Math.ceil((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
      return Math.max(1, days);
    }
  } catch { /* ignore */ }
  return null;
}

class KnowledgeSearch {
  constructor(db, embeddings) {
    this.db = db;
    this.embeddings = embeddings;
  }

  async search(query, options = {}) {
    const limit = options.limit || 5;
    const threshold = options.threshold || 0.3;
    const tags = options.tags || [];
    const sinceDays = parseSince(options.since);

    let entitySourceIds = null;
    if (options.entity) {
      entitySourceIds = await this.db.getSourceIdsByEntity(options.entity);
      if (entitySourceIds.length === 0) {
        return {
          response: `No sources found mentioning "${options.entity}". Try a broader search without --entity.`,
          results: [],
          total_results: 0
        };
      }
    }

    const hasGenerateQuery = this.embeddings && typeof this.embeddings.generateQuery === 'function';
    const hasGenerate = this.embeddings && typeof this.embeddings.generate === 'function';
    if (!hasGenerateQuery && !hasGenerate) {
      throw new Error('Embeddings provider must implement generateQuery() or generate()');
    }

    const queryBuffer = hasGenerateQuery
      ? await this.embeddings.generateQuery(query)
      : await this.embeddings.generate(query);

    const queryVector = Buffer.isBuffer(queryBuffer)
      ? Array.from(new Float32Array(queryBuffer.buffer, queryBuffer.byteOffset, queryBuffer.length / 4))
      : queryBuffer;

    // Fetch more candidates from pgvector than needed so we can apply
    // freshness/credibility re-ranking and dedup in JS
    const candidateLimit = Math.max(limit * 5, 50);

    const candidates = await this.db.matchChunks({
      queryEmbedding: queryVector,
      threshold,
      limit: candidateLimit,
      sourceType: options.sourceType || null,
      sinceDays: sinceDays || null,
      sourceIds: entitySourceIds || null,
      tags: tags.length > 0 ? tags : null,
    });

    if (candidates.length === 0) {
      if (sinceDays) {
        return {
          response: `No results found in the last ${sinceDays} days. Try a wider time range or remove the --since filter.`,
          results: [],
          total_results: 0
        };
      }
      return {
        response: 'Your knowledge base is empty. Drop some articles, videos, or notes to get started!',
        results: [],
        total_results: 0
      };
    }

    const scored = [];
    for (const chunk of candidates) {
      const similarity = chunk.similarity;
      const freshness = getFreshnessBoost(chunk.created_at || chunk.source_created_at);
      const credibility = getCredibility(chunk.url);
      const driftScore = chunk.freshness_score ?? 1.0;

      const chunkTags = parseTags(chunk.tags);
      let tagPenalty = 1.0;
      for (const t of chunkTags) {
        if (TAG_SCORE_WEIGHTS[t] !== undefined) {
          tagPenalty = Math.min(tagPenalty, TAG_SCORE_WEIGHTS[t]);
        }
      }

      const score = similarity
        * (1 + freshness * FRESHNESS_WEIGHT)
        * (1 + credibility * CREDIBILITY_WEIGHT)
        * driftScore
        * tagPenalty;

      const safeChunk = sanitizeUntrustedText(chunk.content, { maxLength: 2500 });
      scored.push({
        source_id: chunk.source_id,
        title: chunk.title,
        url: chunk.url,
        type: chunk.source_type,
        similarity: Math.round(similarity * 1000) / 1000,
        score: Math.round(score * 1000) / 1000,
        freshness: Math.round(freshness * 100) / 100,
        credibility: Math.round(credibility * 100) / 100,
        excerpt: safeChunk.substring(0, 300),
        tags: chunkTags,
        summary: chunk.summary,
        saved_at: (chunk.created_at || chunk.source_created_at || '').split('T')[0],
      });
    }

    scored.sort((a, b) => b.score - a.score);

    const seenSources = new Set();
    const deduped = [];
    for (const result of scored) {
      if (!seenSources.has(result.source_id)) {
        seenSources.add(result.source_id);
        deduped.push(result);
      }
      if (deduped.length >= limit) break;
    }

    const response = formatResponse(query, deduped);
    const cited = formatCitedResponse(query, deduped, {
      style: options.citeStyle || 'footnote',
      showFreshness: options.showFreshness !== false,
      maxExcerpt: options.maxExcerpt || 200,
    });

    logEvent({
      event: 'kb_search',
      query: query.substring(0, 200),
      candidates: candidates.length,
      above_threshold: scored.length,
      results: deduped.length,
      skipped_mismatched: 0,
      filters: {
        since: options.since || null,
        entity: options.entity || null,
        sourceType: options.sourceType || null,
        tags: tags.length > 0 ? tags : null,
      },
      top_score: deduped.length > 0 ? deduped[0].score : null,
    });

    return {
      response,
      citedResponse: cited.response,
      citations: cited.citations,
      footnotes: cited.footnotes,
      citationBlock: cited.citationBlock,
      results: deduped.map(r => ({
        source_id: r.source_id,
        title: r.title,
        url: r.url,
        type: r.type,
        score: r.score,
        similarity: r.similarity,
        freshness: r.freshness,
        credibility: r.credibility,
        excerpt: r.excerpt,
        tags: r.tags,
        saved_at: r.saved_at,
      })),
      total_results: deduped.length
    };
  }
}

function formatResponse(query, results) {
  if (results.length === 0) {
    return `No results found for "${query}". Try a broader query or check what's in your knowledge base with the list command.`;
  }

  let response = `Found ${results.length} relevant source${results.length > 1 ? 's' : ''}:\n\n`;

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const typeEmoji = { article: '\u{1F4C4}', video: '\u{1F3A5}', pdf: '\u{1F4D1}', text: '\u{1F4DD}', tweet: '\u{1F426}', other: '\u{1F4CE}' }[r.type] || '\u{1F4CE}';
    response += `${i + 1}. ${typeEmoji} **${r.title}**`;
    if (r.url) response += `\n   ${r.url}`;
    response += `\n   Score: ${Math.round((r.score || r.similarity) * 100)}%`;
    if (r.saved_at) response += ` | ${r.saved_at}`;
    if (r.tags?.length > 0) response += ` | Tags: ${r.tags.join(', ')}`;
    response += `\n   > ${r.excerpt}...\n\n`;
  }

  return response.trim();
}

module.exports = KnowledgeSearch;

