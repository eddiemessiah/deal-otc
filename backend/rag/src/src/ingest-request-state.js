const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getDataDir } = require('./config');

const REQUEST_STATE_DIR = path.join(getDataDir(), 'request-checkpoints');
const REQUEST_STALE_MS = 15 * 60 * 1000;
const DEFAULT_WAIT_TIMEOUT_MS = 30 * 1000;
const DEFAULT_WAIT_POLL_MS = 500;

function nowIso() {
  return new Date().toISOString();
}

function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function ensureStateDir(stateDir = REQUEST_STATE_DIR) {
  fs.mkdirSync(stateDir, { recursive: true });
  return stateDir;
}

function hashKey(key) {
  return crypto.createHash('sha256').update(String(key || '')).digest('hex');
}

function getRequestPaths(key, opts = {}) {
  const stateDir = ensureStateDir(opts.stateDir);
  const base = path.join(stateDir, hashKey(key));
  return {
    checkpointPath: `${base}.json`,
    lockPath: `${base}.lock`,
  };
}

function parseTimestamp(value) {
  if (!value) return null;
  const ms = Date.parse(String(value));
  return Number.isFinite(ms) ? ms : null;
}

function readJson(pathname) {
  try {
    return JSON.parse(fs.readFileSync(pathname, 'utf8'));
  } catch {
    return null;
  }
}

function writeJsonAtomic(pathname, data) {
  const tmpPath = `${pathname}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
  fs.renameSync(tmpPath, pathname);
}

function buildTelegramRequestKey({ messageId, threadId }) {
  const normalizedMessageId = String(messageId || '').trim();
  if (!normalizedMessageId) return null;
  const normalizedThreadId = String(threadId || '').trim() || 'unknown';
  return `telegram:${normalizedThreadId}:${normalizedMessageId}`;
}

function readRequestCheckpoint(key, opts = {}) {
  if (!key) return null;
  return readJson(getRequestPaths(key, opts).checkpointPath);
}

function isCheckpointActive(checkpoint, opts = {}) {
  if (!checkpoint || checkpoint.status !== 'in_progress') return false;
  const isPidAliveFn = opts.isPidAliveFn || isPidAlive;
  const staleMs = opts.staleMs || REQUEST_STALE_MS;
  const updatedAtMs = parseTimestamp(checkpoint.updated_at) || parseTimestamp(checkpoint.started_at);
  if (!Number.isFinite(updatedAtMs)) return false;
  const ownerPid = Number(checkpoint.owner_pid || 0);
  if (!Number.isFinite(ownerPid) || ownerPid <= 0) return false;
  return (Date.now() - updatedAtMs) <= staleMs && isPidAliveFn(ownerPid);
}

function releaseRequestLock(key, opts = {}) {
  if (!key) return;
  const pid = opts.pidOverride || process.pid;
  const { lockPath } = getRequestPaths(key, opts);
  try {
    const ownerPid = Number(fs.readFileSync(lockPath, 'utf8').trim());
    if (ownerPid === pid) {
      fs.unlinkSync(lockPath);
    }
  } catch {}
}

function tryClearStaleLock(lockPath, { staleMs = REQUEST_STALE_MS, isPidAliveFn = isPidAlive } = {}) {
  try {
    const ownerPid = Number(fs.readFileSync(lockPath, 'utf8').trim());
    const stat = fs.statSync(lockPath);
    const ageMs = Date.now() - stat.mtimeMs;
    const alive = Number.isFinite(ownerPid) && ownerPid > 0 && isPidAliveFn(ownerPid);
    if (alive && ageMs <= staleMs) return false;
    fs.unlinkSync(lockPath);
    return true;
  } catch {
    return true;
  }
}

function claimRequestExecution(key, payload = {}, opts = {}) {
  if (!key) return { status: 'disabled', checkpoint: null, previousCheckpoint: null };

  const pid = opts.pidOverride || process.pid;
  const staleMs = opts.staleMs || REQUEST_STALE_MS;
  const isPidAliveFn = opts.isPidAliveFn || isPidAlive;
  const { checkpointPath, lockPath } = getRequestPaths(key, opts);
  const previousCheckpoint = readJson(checkpointPath);

  if (previousCheckpoint?.status === 'completed') {
    return { status: 'completed', checkpoint: previousCheckpoint, previousCheckpoint };
  }

  if (isCheckpointActive(previousCheckpoint, { staleMs, isPidAliveFn })) {
    return { status: 'in_progress', checkpoint: previousCheckpoint, previousCheckpoint };
  }

  try {
    fs.writeFileSync(lockPath, String(pid), { flag: 'wx' });
  } catch (err) {
    if (err.code !== 'EEXIST') {
      return { status: 'error', checkpoint: previousCheckpoint, previousCheckpoint, error: err.message };
    }
    if (tryClearStaleLock(lockPath, { staleMs, isPidAliveFn })) {
      return claimRequestExecution(key, payload, opts);
    }
    const latestCheckpoint = readJson(checkpointPath);
    if (latestCheckpoint?.status === 'completed') {
      return { status: 'completed', checkpoint: latestCheckpoint, previousCheckpoint: latestCheckpoint };
    }
    return { status: 'in_progress', checkpoint: latestCheckpoint, previousCheckpoint: latestCheckpoint };
  }

  const checkpoint = {
    key,
    status: 'in_progress',
    owner_pid: pid,
    started_at: nowIso(),
    updated_at: nowIso(),
    ...payload,
  };
  writeJsonAtomic(checkpointPath, checkpoint);
  return { status: 'claimed', checkpoint, previousCheckpoint };
}

function markRequestCompleted(key, payload = {}, opts = {}) {
  if (!key) return null;
  const current = readRequestCheckpoint(key, opts) || {};
  const checkpoint = {
    ...current,
    ...payload,
    key,
    status: 'completed',
    completed_at: nowIso(),
    updated_at: nowIso(),
  };
  writeJsonAtomic(getRequestPaths(key, opts).checkpointPath, checkpoint);
  releaseRequestLock(key, opts);
  return checkpoint;
}

function markRequestFailed(key, payload = {}, opts = {}) {
  if (!key) return null;
  const current = readRequestCheckpoint(key, opts) || {};
  const checkpoint = {
    ...current,
    ...payload,
    key,
    status: 'failed',
    failed_at: nowIso(),
    updated_at: nowIso(),
  };
  writeJsonAtomic(getRequestPaths(key, opts).checkpointPath, checkpoint);
  releaseRequestLock(key, opts);
  return checkpoint;
}

async function waitForCompletedRequest(key, opts = {}) {
  if (!key) return null;
  const timeoutMs = opts.timeoutMs || DEFAULT_WAIT_TIMEOUT_MS;
  const pollMs = opts.pollMs || DEFAULT_WAIT_POLL_MS;
  const startedAt = Date.now();
  while ((Date.now() - startedAt) < timeoutMs) {
    const checkpoint = readRequestCheckpoint(key, opts);
    if (checkpoint?.status === 'completed') return checkpoint;
    if (checkpoint?.status === 'failed' && !isCheckpointActive(checkpoint, opts)) return checkpoint;
    await new Promise(resolve => setTimeout(resolve, pollMs));
  }
  return null;
}

module.exports = {
  REQUEST_STALE_MS,
  buildTelegramRequestKey,
  claimRequestExecution,
  isCheckpointActive,
  markRequestCompleted,
  markRequestFailed,
  readRequestCheckpoint,
  releaseRequestLock,
  waitForCompletedRequest,
};

