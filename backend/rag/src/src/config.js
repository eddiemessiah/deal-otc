const fs = require('fs');
const path = require('path');
const os = require('os');
const { createClient } = require('@supabase/supabase-js');

let _sharedConfig = null;
function _loadSharedConfig() {
  if (_sharedConfig) return _sharedConfig;
  try {
    _sharedConfig = require('../../../shared/config');
  } catch {
    _sharedConfig = { loadApiCredentials: () => null, loadEmbeddingCredentials: () => null };
  }
  return _sharedConfig;
}

function loadApiCredentials() {
  return _loadSharedConfig().loadApiCredentials();
}

function loadEmbeddingCredentials() {
  return _loadSharedConfig().loadEmbeddingCredentials();
}

const SKILL_ROOT = path.join(__dirname, '..');

/**
 * Read a single variable from a .env-style file.
 * Returns the string value or null.
 */
function readEnvFromFile(envName, filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    for (const rawLine of content.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (!match || match[1] !== envName) continue;
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      return value || null;
    }
  } catch { /* file not found or unreadable */ }
  return null;
}

/**
 * Resolve an env var by checking, in order:
 *   1. process.env
 *   2. skill-local .env  (skills/knowledge-base/.env)
 *   3. ~/.openclaw/.env
 */
function resolveEnv(envName) {
  if (process.env[envName]) return process.env[envName];
  const localEnv = path.join(SKILL_ROOT, '.env');
  const local = readEnvFromFile(envName, localEnv);
  if (local) return local;
  const globalEnv = path.join(os.homedir(), '.openclaw', '.env');
  return readEnvFromFile(envName, globalEnv);
}

// Keep legacy name for callers that import it directly.
const loadFromEnvFile = (envName) => readEnvFromFile(envName, path.join(os.homedir(), '.openclaw', '.env'));

function getDataDir() {
  const dataDir = resolveEnv('KB_DATA_DIR') || path.join(SKILL_ROOT, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  return dataDir;
}

function getDbPath() {
  return path.join(getDataDir(), 'knowledge.db');
}

function getOllamaUrl() {
  return resolveEnv('OLLAMA_URL') || 'http://localhost:11434';
}

/**
 * Return the Slack channel to cross-post ingested content to.
 * Checked in order: --slack-channel CLI flag (passed by caller), KB_SLACK_CHANNEL env var.
 * Returns null when not configured, signalling callers to skip Slack.
 */
function getSlackChannel(cliOverride) {
  if (cliOverride) return String(cliOverride).trim() || null;
  return resolveEnv('KB_SLACK_CHANNEL') || null;
}

function loadSupabaseConfig() {
  const url = resolveEnv('SUPABASE_URL');
  const key = resolveEnv('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return null;
  return { url, key };
}

let _supabaseClient = null;

function getSupabaseClient() {
  if (_supabaseClient) return _supabaseClient;
  const config = loadSupabaseConfig();
  if (!config) {
    throw new Error(
      'Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY ' +
      'in environment, skills/knowledge-base/.env, or ~/.openclaw/.env'
    );
  }
  _supabaseClient = createClient(config.url, config.key);
  return _supabaseClient;
}

module.exports = {
  loadApiCredentials,
  loadEmbeddingCredentials,
  getDataDir,
  getDbPath,
  getOllamaUrl,
  getSlackChannel,
  loadSupabaseConfig,
  getSupabaseClient,
  resolveEnv,
  readEnvFromFile,
  loadFromEnvFile,
};

