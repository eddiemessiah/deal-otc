#!/usr/bin/env node
/**
 * Ingest content into the knowledge base and cross-post to Slack.
 *
 * Purpose: keep untrusted page content out of the main agent loop.
 * This script:
 *   1) runs ingest.js (which already sanitizes extracted content)
 *   2) posts a small, sanitized summary + link to Slack #ai_trends
 *
 * Usage:
 *   node scripts/ingest-and-crosspost.js "<url_or_path_or_text>" [ingest options...] [--no-slack]
 */

const path = require('path');
const { execFileSync } = require('child_process');
const { KnowledgeDB, EmbeddingGenerator, extractContent, isTwitterUrl, loadEmbeddingCredentials } = require('../src');
const { logEvent } = require('../../../shared/event-log');
const { normalizeUrl } = require('../src/extractor');
const { ingestLinkedUrls } = require('./ingest');
const {
  buildTelegramRequestKey,
  claimRequestExecution,
  markRequestCompleted,
  markRequestFailed,
  waitForCompletedRequest,
} = require('../src/ingest-request-state');

const { getSlackChannel } = require('../src/config');

const INGEST_SCRIPT = path.join(__dirname, 'ingest.js');
const ROOT_SLACK_POST = path.resolve(__dirname, '..', '..', '..', 'tools', 'slack-post.js');
const ROOT_TELEGRAM_CONFIG = path.resolve(__dirname, '..', '..', '..', 'config', 'telegram.json');
const SLACK_PREFIX = process.env.KB_SLACK_PREFIX || 'Sharing this article: ';
const URL_REGEX = /https?:\/\/[^\s<>"')\]]+/g;
const RECENT_DUPLICATE_WINDOW_MS = 3 * 60 * 1000;
const REQUEST_WAIT_TIMEOUT_MS = 20 * 1000;

function formatSlackCrosspostText(lines) {
  return `${SLACK_PREFIX}${lines.join('\n')}`;
}

function extractXHandle(url) {
  const raw = String(url || '').trim();
  if (!raw) return null;
  const match = raw.match(/^https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/([^/?#]+)/i);
  if (!match || !match[1]) return null;
  return `@${match[1]}`;
}

function summarizeUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    return parsed.hostname.replace(/^www\./i, '');
  } catch {
    return raw;
  }
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanRelayTopic(title, handle) {
  let text = String(title || '').replace(/\s+/g, ' ').trim();
  if (!text) return null;

  text = text
    .replace(/^Tweet by @[A-Za-z0-9_.]+:?\s*/i, '')
    .replace(/^Post by @[A-Za-z0-9_.]+:?\s*/i, '')
    .trim();

  if (handle) {
    const escapedHandle = escapeRegExp(handle);
    text = text.replace(new RegExp(`^${escapedHandle}\\s*[:\\-]\\s*`, 'i'), '').trim();
  }

  return text || null;
}

function formatRelaySubject(result, source) {
  const url = resolveCrosspostUrl(source) || normalizeCandidateUrl(result?.url);
  const handle = extractXHandle(url);
  const title = source?.title || result?.title || null;
  const topic = cleanRelayTopic(title, handle);

  if (handle && topic) return `${handle} on ${topic}`;
  if (handle) return handle;
  if (topic) return topic;
  return summarizeUrl(url) || `source ${result?.source_id || 'unknown'}`;
}

function formatChunkLabel(result, source) {
  const chunkCount = Number(result?.chunks ?? source?.chunk_count);
  if (!Number.isFinite(chunkCount) || chunkCount <= 0) return null;

  let label = `${chunkCount} chunk${chunkCount === 1 ? '' : 's'}`;

  const linked = result?.linked_urls?.filter(l => l.status === 'ingested');
  if (linked?.length > 0) {
    const linkedChunks = linked.reduce((sum, l) => sum + (l.chunks || 0), 0);
    label += ` + ${linked.length} linked article${linked.length === 1 ? '' : 's'} (${linkedChunks} chunks)`;
  }

  return label;
}

function formatSlackStatus(result, { noSlack = false, slackSkipped = false } = {}) {
  if (result?.dry_run) return 'Dry run';
  if (noSlack || slackSkipped) return 'Slack skipped';
  if (result?.slack_warning) return 'Slack warning';
  if (result?.success || result?.error === 'duplicate') return 'Slack ✅';
  return null;
}

function extractOneSentenceSummary(result, source) {
  const raw = source?.summary || result?.summary || '';
  if (!raw) return null;

  // Strip metadata lines that tweet extraction prepends
  const cleaned = raw
    .replace(/^Author:\s*.+$/m, '')
    .replace(/^Date:\s*.+$/m, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return null;

  // Take up to two sentences so the confirmation describes the actual content
  const sentences = [];
  const re = /(.+?[.!?])(?:\s|$)/g;
  let m;
  while ((m = re.exec(cleaned)) !== null && sentences.length < 2) {
    sentences.push(m[1]);
  }
  const excerpt = sentences.length > 0 ? sentences.join(' ') : cleaned;
  const maxLen = 280;
  if (excerpt.length <= maxLen) return excerpt;
  return excerpt.substring(0, maxLen - 1).replace(/\s+\S*$/, '') + '…';
}

function formatOverlapWarning(result) {
  if (!result?.overlap) return null;
  const pct = result.overlap.similarity;
  const title = (result.overlap.title || '').substring(0, 50);
  return `⚠️ ${pct}% similar to "${title}"`;
}

function formatSubstanceWarning(result) {
  if (!result?.substance_warning) return null;
  return `⚠️ ${result.substance_warning}`;
}

function parseSourceTimestamp(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)
    ? raw.replace(' ', 'T') + 'Z'
    : raw;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function isRecentDuplicate(result, source, { now = Date.now(), windowMs = RECENT_DUPLICATE_WINDOW_MS } = {}) {
  if (result?.error !== 'duplicate') return false;
  const createdAtMs = parseSourceTimestamp(source?.created_at);
  if (!Number.isFinite(createdAtMs)) return false;
  const ageMs = now - createdAtMs;
  return ageMs >= 0 && ageMs <= windowMs;
}

function isSameRequestReplay(result) {
  return Boolean(result?.replayed_same_request);
}

function formatIngestRelayLine(result, source, opts = {}) {
  // Same-message retries should present as the original save completing rather
  // than a separate duplicate. Keep a short recency fallback for legacy callers
  // that have not yet started passing source message IDs.
  const status = (isSameRequestReplay(result) || isRecentDuplicate(result, source))
    ? 'Ingested'
    : (result?.error === 'duplicate' ? 'Already in KB' : 'Ingested');
  const parts = [
    status,
    formatRelaySubject(result, source),
    formatChunkLabel(result, source),
    formatSlackStatus(result, opts),
    extractOneSentenceSummary(result, source),
    formatOverlapWarning(result),
    formatSubstanceWarning(result),
  ].filter(Boolean);
  return parts.join(' · ');
}

function formatIngestFailureLine(detail) {
  const message = String(detail?.error || 'Unknown ingest error').replace(/\s+/g, ' ').trim();
  return `Ingest failed · ${message}`;
}

function normalizeCandidateUrl(rawUrl) {
  const candidate = String(rawUrl || '').trim();
  if (!candidate) return null;
  try {
    return normalizeUrl(candidate);
  } catch {
    return candidate;
  }
}

/**
 * Resolve a best-effort canonical URL for Slack cross-post.
 * Fallback is needed for text ingests where source.url may be null.
 */
function resolveCrosspostUrl(source) {
  const direct = normalizeCandidateUrl(source?.url);
  if (direct) return direct;

  const fallbackText = [source?.summary, source?.raw_content];
  for (const text of fallbackText) {
    if (typeof text !== 'string' || !text.trim()) continue;
    const matches = text.match(URL_REGEX);
    if (!matches) continue;
    for (const match of matches) {
      const normalized = normalizeCandidateUrl(match);
      if (normalized) return normalized;
    }
  }

  return null;
}

function parseArgs(argv) {
  const parsed = {
    noSlack: false,
    slackChannel: null,
    human: true,
    sendTelegramFinal: false,
    sourceMessageId: null,
    sourceThreadId: null,
    passThrough: [],
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--no-slack') {
      parsed.noSlack = true;
    } else if (arg === '--slack-channel' && argv[i + 1]) {
      parsed.slackChannel = String(argv[++i]).trim();
    } else if (arg === '--json') {
      parsed.human = false;
    } else if (arg === '--human') {
      parsed.human = true;
    } else if (arg === '--send-telegram-final') {
      parsed.sendTelegramFinal = true;
    } else if (arg === '--source-message-id' && argv[i + 1]) {
      parsed.sourceMessageId = String(argv[++i]).trim();
    } else if (arg === '--source-thread-id' && argv[i + 1]) {
      parsed.sourceThreadId = String(argv[++i]).trim();
    } else {
      parsed.passThrough.push(arg);
    }
  }

  return parsed;
}

function buildRequestContext(parsedArgs) {
  const sourceMessageId = String(parsedArgs?.sourceMessageId || '').trim();
  if (!sourceMessageId) return null;
  const sourceThreadId = String(parsedArgs?.sourceThreadId || '').trim() || 'unknown';
  return {
    key: buildTelegramRequestKey({ messageId: sourceMessageId, threadId: sourceThreadId }),
    source_message_id: sourceMessageId,
    source_thread_id: sourceThreadId,
  };
}

function loadTelegramFinalDestination(threadId) {
  const normalizedThreadId = String(threadId || '').trim();
  if (!normalizedThreadId) return null;
  try {
    const config = require(ROOT_TELEGRAM_CONFIG);
    const target = String(config?.notifyGroup || '').trim();
    if (!target) return null;
    return { target, threadId: normalizedThreadId };
  } catch {
    return null;
  }
}

function deliverTelegramFinalLine(finalLine, destination, sendFn) {
  const message = String(finalLine || '').trim();
  if (!message) return false;
  if (!destination?.target) return false;
  const sendTelegramDirect = sendFn || require('../../../shared/telegram-delivery').sendTelegramDirect;
  sendTelegramDirect(destination.target, destination.threadId || null, message);
  return true;
}

function maybeDeliverTelegramFinalLine(finalLine, parsedArgs, requestContext, checkpoint, sendFn) {
  if (!parsedArgs?.human || !parsedArgs?.sendTelegramFinal) return false;
  if (!String(finalLine || '').trim()) return false;
  if (checkpoint?.telegram_final_sent) return true;

  const destination = loadTelegramFinalDestination(
    requestContext?.source_thread_id || checkpoint?.source_thread_id || parsedArgs?.sourceThreadId
  );
  if (!destination) {
    logEvent({
      event: 'kb_ingest_telegram_final',
      ok: false,
      reason: 'missing_destination',
      request_key: requestContext?.key || checkpoint?.key || null,
    }, { level: 'warn' });
    return false;
  }

  try {
    deliverTelegramFinalLine(finalLine, destination, sendFn);
    logEvent({
      event: 'kb_ingest_telegram_final',
      ok: true,
      request_key: requestContext?.key || checkpoint?.key || null,
      target: destination.target,
      thread_id: destination.threadId,
      preview: String(finalLine).slice(0, 120),
    });
    return true;
  } catch (err) {
    logEvent({
      event: 'kb_ingest_telegram_final',
      ok: false,
      request_key: requestContext?.key || checkpoint?.key || null,
      target: destination.target,
      thread_id: destination.threadId,
      error: err.message,
      preview: String(finalLine).slice(0, 120),
    }, { level: 'error' });
    return false;
  }
}

function buildCachedOutput(checkpoint, { human = true } = {}) {
  if (human) {
    return checkpoint?.final_line || formatIngestRelayLine(checkpoint?.result || {}, checkpoint?.source || {}, {
      noSlack: Boolean(checkpoint?.no_slack),
    });
  }
  return JSON.stringify(checkpoint?.result || {});
}

async function loadSourceById(sourceId) {
  if (!sourceId) return null;
  let db;
  try {
    db = new KnowledgeDB();
    return await db.getSourceById(sourceId) || null;
  } finally {
    if (db) db.close();
  }
}

function toCheckpointSource(source) {
  if (!source) return null;
  return {
    id: source.id,
    url: source.url,
    title: source.title,
    summary: source.summary,
    created_at: source.created_at,
    source_type: source.source_type,
  };
}

async function resumeTweetLinkedUrls(input, sourceId) {
  if (!sourceId || !isTwitterUrl(input)) return [];
  const extracted = extractContent(input, {});
  if (!extracted?.external_urls?.length) return [];

  let db;
  try {
    db = new KnowledgeDB();
    const creds = loadEmbeddingCredentials();
    const embedder = new EmbeddingGenerator(creds.key, creds.provider);
    return await ingestLinkedUrls(db, embedder, {
      embedding_dim: embedder.getDimension(),
      embedding_provider: embedder.provider,
      embedding_model: embedder.getModel(),
    }, Number(sourceId), extracted.external_urls);
  } finally {
    if (db) db.close();
  }
}

function runIngest(passThroughArgs, execFn) {
  const exec = execFn || execFileSync;
  try {
    const out = exec(process.execPath, [INGEST_SCRIPT, ...passThroughArgs], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 10 * 60 * 1000, // ingest can be slow (browser/firecrawl/youtube)
    });
    const trimmed = String(out || '').trim();
    if (!trimmed) throw new Error('ingest.js returned empty output');
    return JSON.parse(trimmed);
  } catch (err) {
    // execFileSync throws on non-zero exit. The real error details (extraction_log,
    // strategy failures) are in stdout as JSON, not in err.message which is generic.
    const stdout = String(err.stdout || '').trim();
    if (stdout) {
      try {
        const parsed = JSON.parse(stdout);
        const wrapped = new Error(parsed.error || 'Ingestion failed');
        wrapped.ingestResult = parsed;
        throw wrapped;
      } catch (parseErr) {
        if (parseErr.ingestResult) throw parseErr;
      }
    }
    throw err;
  }
}

function isLockBusyError(detail) {
  return /another ingest is already running/i.test(String(detail?.error || ''));
}

async function runIngestWithBusyRetry(passThroughArgs, opts = {}) {
  const maxWaitMs = opts.maxWaitMs || REQUEST_WAIT_TIMEOUT_MS;
  const pollMs = opts.pollMs || 2000;
  const startedAt = Date.now();

  while (true) {
    try {
      return runIngest(passThroughArgs);
    } catch (err) {
      const detail = err.ingestResult || { error: err.message };
      if (!isLockBusyError(detail) || (Date.now() - startedAt) >= maxWaitMs) {
        throw err;
      }
      await new Promise(resolve => setTimeout(resolve, pollMs));
    }
  }
}

async function maybePostToSlack(ingestResult, channel) {
  if (!ingestResult?.success) return null;
  if (!channel) return null;
  const startedAt = Date.now();

  // Pull canonical URL/summary from the DB (ingest.js output is intentionally small).
  let db;
  let source = null;
  try {
    db = new KnowledgeDB();
    source = await db.getSourceById(ingestResult.source_id);
  } finally {
    if (db) db.close();
  }

  const url = resolveCrosspostUrl(source);
  if (!url) {
    throw new Error(`No URL found for source_id ${ingestResult.source_id}`);
  }

  const lines = [url].filter(Boolean);

  // slack-post.js redacts secrets; we also avoid including raw extracted content here.
  const { slackPost } = require(ROOT_SLACK_POST);
  try {
    const posted = await slackPost({ channel, text: formatSlackCrosspostText(lines) });
    logEvent({
      event: 'kb_crosspost_slack',
      ok: true,
      channel,
      source_id: ingestResult.source_id || null,
      duration_ms: Date.now() - startedAt,
      text_len: formatSlackCrosspostText(lines).length,
    });
    return posted;
  } catch (err) {
    logEvent({
      event: 'kb_crosspost_slack',
      ok: false,
      channel,
      source_id: ingestResult.source_id || null,
      duration_ms: Date.now() - startedAt,
      error: err.message,
    }, { level: 'error' });
    throw err;
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const startedAt = Date.now();
  if (argv.length === 0 || argv[0] === '--help') {
    console.log(JSON.stringify({
      error: 'Usage: node scripts/ingest-and-crosspost.js "<url_or_path_or_text>" [--tags "t1,t2"] [--title "Title"] [--type article|video|pdf|text|tweet] [--no-browser] [--dry-run] [--no-slack] [--slack-channel <channel>] [--source-message-id "<id>"] [--source-thread-id "<thread>"] [--send-telegram-final] [--json]'
    }));
    process.exit(1);
  }

  const parsedArgs = parseArgs(argv);
  const { noSlack, human, passThrough } = parsedArgs;
  const resolvedSlackChannel = noSlack ? null : getSlackChannel(parsedArgs.slackChannel);
  const requestContext = buildRequestContext(parsedArgs);
  const input = String(passThrough[0] || '').trim();

  let requestClaim = { status: 'disabled', checkpoint: null, previousCheckpoint: null };
  if (requestContext?.key) {
    const requestPayload = {
      input,
      normalized_input: normalizeCandidateUrl(input),
      no_slack: Boolean(noSlack),
      source_message_id: requestContext.source_message_id,
      source_thread_id: requestContext.source_thread_id,
    };
    requestClaim = claimRequestExecution(requestContext.key, requestPayload);
    if (requestClaim.status === 'completed') {
      const cachedOutput = buildCachedOutput(requestClaim.checkpoint, { human });
      const delivered = maybeDeliverTelegramFinalLine(
        requestClaim.checkpoint?.final_line || cachedOutput,
        parsedArgs,
        requestContext,
        requestClaim.checkpoint
      );
      if (delivered) {
        markRequestCompleted(requestContext.key, {
          telegram_final_sent: true,
          telegram_final_delivered_at: new Date().toISOString(),
        });
      }
      console.log(cachedOutput);
      process.exit(0);
    }
    if (requestClaim.status === 'in_progress') {
      const completed = await waitForCompletedRequest(requestContext.key, { timeoutMs: REQUEST_WAIT_TIMEOUT_MS });
      if (completed?.status === 'completed') {
        const cachedOutput = buildCachedOutput(completed, { human });
        const delivered = maybeDeliverTelegramFinalLine(
          completed?.final_line || cachedOutput,
          parsedArgs,
          requestContext,
          completed
        );
        if (delivered) {
          markRequestCompleted(requestContext.key, {
            telegram_final_sent: true,
            telegram_final_delivered_at: new Date().toISOString(),
          });
        }
        console.log(cachedOutput);
        process.exit(0);
      }
      requestClaim = claimRequestExecution(requestContext.key, requestPayload);
      if (requestClaim.status === 'completed') {
        const cachedOutput = buildCachedOutput(requestClaim.checkpoint, { human });
        const delivered = maybeDeliverTelegramFinalLine(
          requestClaim.checkpoint?.final_line || cachedOutput,
          parsedArgs,
          requestContext,
          requestClaim.checkpoint
        );
        if (delivered) {
          markRequestCompleted(requestContext.key, {
            telegram_final_sent: true,
            telegram_final_delivered_at: new Date().toISOString(),
          });
        }
        console.log(cachedOutput);
        process.exit(0);
      }
    }
    if (requestClaim.status === 'in_progress' || requestClaim.status === 'error') {
      const detail = { error: 'This KB save is already being processed. Try again in a moment.' };
      console.log(human ? formatIngestFailureLine(detail) : JSON.stringify(detail));
      process.exit(1);
    }
  }

  let result;
  try {
    result = await runIngestWithBusyRetry(passThrough, {
      maxWaitMs: requestContext?.key ? REQUEST_WAIT_TIMEOUT_MS : 4000,
    });
  } catch (err) {
    const detail = err.ingestResult || { error: err.message };
    const failureLine = human ? formatIngestFailureLine(detail) : JSON.stringify(detail);
    const telegramFinalSent = maybeDeliverTelegramFinalLine(
      human ? failureLine : null,
      parsedArgs,
      requestContext
    );
    if (requestContext?.key) {
      markRequestFailed(requestContext.key, {
        error: detail.error || err.message,
        has_extraction_log: Boolean(detail.extraction_log),
        final_line: human ? failureLine : null,
        telegram_final_sent: telegramFinalSent || undefined,
        telegram_final_delivered_at: telegramFinalSent ? new Date().toISOString() : undefined,
      });
    }
    logEvent({
      event: 'kb_ingest_crosspost_end',
      ok: false,
      reason: 'ingest_failed',
      error: detail.error || err.message,
      has_extraction_log: Boolean(detail.extraction_log),
      duration_ms: Date.now() - startedAt,
    }, { level: 'error' });
    console.log(failureLine);
    process.exit(1);
  }

  if (result?.error === 'duplicate' && requestClaim.previousCheckpoint && requestClaim.previousCheckpoint.status !== 'completed') {
    result.replayed_same_request = true;
    try {
      const linkedResults = await resumeTweetLinkedUrls(input, result.source_id);
      if (linkedResults.length > 0) {
        result.linked_urls = linkedResults;
      }
    } catch (err) {
      logEvent({
        event: 'kb_ingest_replay_resume',
        ok: false,
        source_id: result.source_id || null,
        error: err.message,
      }, { level: 'warn' });
    }
  }

  // Best-effort Slack post. If Slack fails, still return ingest result.
  // Also cross-post when ingest reports a duplicate (it was saved, but Slack step may not have happened).
  // If no Slack channel is configured (neither --slack-channel nor KB_SLACK_CHANNEL), skip gracefully.
  const shouldSlack = Boolean(resolvedSlackChannel)
    && !result?.dry_run
    && (result?.success || result?.error === 'duplicate')
    && result?.source_id
    && !Boolean(requestClaim.previousCheckpoint?.slack_posted);
  const slackSkipped = !noSlack && !resolvedSlackChannel && !result?.dry_run;
  let slackPosted = false;
  if (shouldSlack) {
    try {
      await maybePostToSlack({ success: true, source_id: result.source_id }, resolvedSlackChannel);
      slackPosted = true;
      if (result?.error === 'duplicate') {
        result.slack_note = 'Slack cross-post completed on duplicate ingest.';
      }
    } catch (err) {
      result.slack_warning = `Slack cross-post failed: ${err.message}`;
    }
  }

  let source = null;
  if (result?.source_id) {
    source = await loadSourceById(result.source_id);
  }

  const duplicateRecent = isRecentDuplicate(result, source);
  const completedSuccessfully = Boolean(result?.success || result?.replayed_same_request);
  const finalLine = human ? formatIngestRelayLine(result, source, { noSlack, slackSkipped }) : null;
  const telegramFinalSent = maybeDeliverTelegramFinalLine(
    finalLine,
    parsedArgs,
    requestContext,
    requestClaim.previousCheckpoint
  );

  logEvent({
    event: 'kb_ingest_crosspost_end',
    ok: completedSuccessfully,
    dry_run: Boolean(result?.dry_run),
    no_slack: Boolean(noSlack),
    source_id: result?.source_id || null,
    duplicate_recent: duplicateRecent || undefined,
    replayed_same_request: Boolean(result?.replayed_same_request) || undefined,
    duplicate_detected: result?.error === 'duplicate' || undefined,
    has_slack_warning: Boolean(result?.slack_warning),
    duration_ms: Date.now() - startedAt,
  }, { level: (completedSuccessfully || result?.error === 'duplicate') ? 'info' : 'error' });

  if (requestContext?.key) {
    markRequestCompleted(requestContext.key, {
      source_id: result?.source_id || null,
      no_slack: Boolean(noSlack),
      slack_posted: Boolean(slackPosted || requestClaim.previousCheckpoint?.slack_posted),
      telegram_final_sent: telegramFinalSent || requestClaim.previousCheckpoint?.telegram_final_sent || undefined,
      telegram_final_delivered_at: telegramFinalSent ? new Date().toISOString() : undefined,
      result,
      source: toCheckpointSource(source),
      final_line: finalLine,
    });
  }

  console.log(human ? finalLine : JSON.stringify(result));
}

if (require.main === module) {
  main();
}

module.exports = {
  SLACK_PREFIX,
  formatSlackCrosspostText,
  formatSlackStatus,
  resolveCrosspostUrl,
  parseArgs,
  buildRequestContext,
  loadTelegramFinalDestination,
  deliverTelegramFinalLine,
  maybeDeliverTelegramFinalLine,
  buildCachedOutput,
  formatIngestRelayLine,
  formatIngestFailureLine,
  extractOneSentenceSummary,
  isSameRequestReplay,
  isRecentDuplicate,
  isLockBusyError,
  runIngest,
  runIngestWithBusyRetry,
  maybePostToSlack,
};

