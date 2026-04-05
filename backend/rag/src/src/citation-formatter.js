/**
 * Citation formatter for KB search results.
 * Takes search results with metadata and produces citation-ready output
 * in footnote, inline, or compact formats.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const TYPE_EMOJI = {
  article: '📄',
  video: '🎥',
  pdf: '📑',
  text: '📝',
  tweet: '🐦',
  other: '📎',
};

/**
 * Extract a clean domain from a URL.
 * @param {string} url
 * @returns {string|null}
 */
function extractDomain(url) {
  if (!url) return null;
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    return hostname;
  } catch {
    return null;
  }
}

/**
 * Best-effort author extraction from URL/title/type.
 * - Tweets: @handle from x.com or twitter.com URLs
 * - Videos: channel name from YouTube URLs (path segment after /c/ or /@)
 * - Articles: null (no reliable way to extract)
 * @param {string} url
 * @param {string} title
 * @param {string} type
 * @returns {string|null}
 */
function extractAuthor(url, title, type) {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');

    // Tweets: extract @handle from x.com/twitter.com URLs
    if (type === 'tweet' || hostname === 'x.com' || hostname === 'twitter.com') {
      const pathParts = parsed.pathname.split('/').filter(Boolean);
      if (pathParts.length >= 1 && pathParts[0] !== 'i' && pathParts[0] !== 'search') {
        return '@' + pathParts[0];
      }
    }

    // YouTube: try to extract channel
    if (hostname === 'youtube.com' || hostname === 'youtu.be') {
      const pathParts = parsed.pathname.split('/').filter(Boolean);
      // /@channelname or /c/channelname or /channel/...
      for (let i = 0; i < pathParts.length; i++) {
        if (pathParts[i].startsWith('@')) return pathParts[i];
        if ((pathParts[i] === 'c' || pathParts[i] === 'channel') && pathParts[i + 1]) {
          return pathParts[i + 1];
        }
      }
    }
  } catch {
    // ignore parse errors
  }

  return null;
}

/**
 * Format a freshness indicator emoji.
 * @param {number} freshnessScore - 0 to 1 (1 = fresh)
 * @returns {string}
 */
function formatFreshnessIndicator(freshnessScore) {
  if (freshnessScore == null || freshnessScore >= 0.7) return '';
  if (freshnessScore >= 0.3) return '📅';
  return '⚠️ aging';
}

/**
 * Format a date for display.
 * Current year: "Mon DD", older: "Mon DD YYYY"
 * @param {string} dateStr - ISO date string or YYYY-MM-DD
 * @returns {string}
 */
function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const month = MONTHS[d.getUTCMonth()];
    const day = d.getUTCDate();
    const year = d.getUTCFullYear();
    const currentYear = new Date().getFullYear();
    if (year === currentYear) {
      return `${month} ${day}`;
    }
    return `${month} ${day} ${year}`;
  } catch {
    return dateStr;
  }
}

/**
 * Build a single citation object from a search result.
 * @param {Object} result - KB search result
 * @param {number} index - 1-based citation index
 * @param {Object} options
 * @returns {Object}
 */
function buildCitation(result, index, options = {}) {
  const maxExcerpt = options.maxExcerpt || 200;
  const excerpt = result.excerpt
    ? result.excerpt.substring(0, maxExcerpt)
    : (result.summary ? result.summary.substring(0, maxExcerpt) : '');

  return {
    index,
    title: result.title || 'Untitled',
    url: result.url || null,
    type: result.type || 'other',
    author: extractAuthor(result.url, result.title, result.type),
    saved_at: result.saved_at || null,
    freshness: result.freshness != null ? result.freshness : null,
    credibility: result.credibility != null ? result.credibility : null,
    score: result.score != null ? result.score : (result.similarity || null),
    stale: result.freshness != null ? result.freshness < 0.3 : false,
    excerpt,
  };
}

/**
 * Format citations in footnote style (best for Telegram).
 */
function formatFootnote(query, citations, options = {}) {
  if (citations.length === 0) {
    return {
      response: `No results found for "${query}".`,
      footnotes: '',
      citationBlock: `No results found for "${query}".`,
    };
  }

  const showFreshness = options.showFreshness !== false;

  // Build the excerpt block with [N] markers
  const excerptParts = [];
  for (const c of citations) {
    if (c.excerpt) {
      excerptParts.push(`${c.excerpt} [${c.index}]`);
    }
  }

  const excerptBlock = excerptParts.length > 0
    ? '> ' + excerptParts.join(' ')
    : '';

  // Build source lines
  const sourceLines = [];
  for (const c of citations) {
    const emoji = TYPE_EMOJI[c.type] || '📎';
    const date = formatDate(c.saved_at);
    const domain = extractDomain(c.url) || '';

    let label;
    if (c.type === 'tweet' && c.author) {
      label = `${c.author} on ${c.title !== 'Untitled' ? c.title : domain}`;
      // Keep it short for tweets: just show @handle
      label = c.author;
    } else {
      label = c.title || 'Untitled';
    }

    let line = `[${c.index}] ${emoji} ${label}`;
    if (date) line += ` (${date})`;
    if (domain) line += ` ${domain}`;
    if (c.credibility != null && c.credibility >= 0.8) line += ' ⭐';
    if (showFreshness && c.freshness != null) {
      const indicator = formatFreshnessIndicator(c.freshness);
      if (indicator) line += ` ${indicator}`;
    }

    sourceLines.push(line);
  }

  const footnotes = sourceLines.join('\n');

  const response = `Found ${citations.length} relevant source${citations.length > 1 ? 's' : ''}:\n\n${excerptBlock}\n\nSources:\n${footnotes}`;

  return { response, footnotes, citationBlock: response };
}

/**
 * Format citations in compact style (for LLM context injection).
 */
function formatCompact(query, citations) {
  if (citations.length === 0) {
    return {
      response: `No results found for "${query}".`,
      footnotes: '',
      citationBlock: `No results found for "${query}".`,
    };
  }

  const lines = [];
  for (const c of citations) {
    const authorPart = c.author ? ` "${c.author}"` : (c.title ? ` "${c.title}"` : '');
    const datePart = c.saved_at || '';
    const scorePart = c.score != null ? `, score:${c.score}` : '';
    const url = c.url || '';
    lines.push(`[${c.index}] ${c.type}${authorPart} (${datePart}${scorePart}) ${url}`);
  }

  const response = lines.join('\n');
  return { response, footnotes: response, citationBlock: response };
}

/**
 * Format citations in inline style (for rich text).
 */
function formatInline(query, citations) {
  if (citations.length === 0) {
    return {
      response: `No results found for "${query}".`,
      footnotes: '',
      citationBlock: `No results found for "${query}".`,
    };
  }

  const parts = [];
  for (const c of citations) {
    const date = formatDate(c.saved_at);
    const source = `(Source: ${c.title || 'Untitled'}${date ? ', ' + date : ''})`;
    if (c.excerpt) {
      parts.push(`${c.excerpt} ${source}`);
    } else {
      parts.push(source);
    }
  }

  const response = parts.join('\n\n');
  return { response, footnotes: '', citationBlock: response };
}

/**
 * Format search results with citations.
 *
 * @param {string} query - The search query
 * @param {Array} results - KB search results (same shape as formatResponse receives)
 * @param {Object} options
 * @param {string} options.style - 'footnote' (default) | 'inline' | 'compact'
 * @param {boolean} options.showFreshness - Show freshness warnings (default true)
 * @param {number} options.maxExcerpt - Max chars per excerpt (default 200)
 * @returns {Object} { response, citations, footnotes, citationBlock }
 */
function formatCitedResponse(query, results, options = {}) {
  const style = options.style || 'footnote';

  if (!results || results.length === 0) {
    return {
      response: `No results found for "${query}".`,
      citations: [],
      footnotes: '',
      citationBlock: `No results found for "${query}".`,
    };
  }

  // Build citation objects
  const citations = results.map((r, i) => buildCitation(r, i + 1, options));

  let formatted;
  switch (style) {
    case 'compact':
      formatted = formatCompact(query, citations);
      break;
    case 'inline':
      formatted = formatInline(query, citations);
      break;
    case 'footnote':
    default:
      formatted = formatFootnote(query, citations, options);
      break;
  }

  return {
    response: formatted.response,
    citations,
    footnotes: formatted.footnotes,
    citationBlock: formatted.citationBlock,
  };
}

module.exports = {
  formatCitedResponse,
  extractDomain,
  extractAuthor,
  formatFreshnessIndicator,
  formatDate,
  buildCitation,
};

