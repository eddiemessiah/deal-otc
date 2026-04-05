/**
 * Entity extraction for knowledge base content.
 * Uses curated keyword matching focused on AI/tech domain.
 * Fast, deterministic, no LLM calls.
 */

const KNOWN_ENTITIES = {
  company: {
    'OpenAI': ['openai', 'open ai'],
    'Anthropic': ['anthropic'],
    'Google': ['google', 'alphabet'],
    'DeepMind': ['deepmind', 'deep mind'],
    'Meta': ['meta platforms', 'meta ai'],
    'Microsoft': ['microsoft'],
    'Apple': ['apple'],
    'Amazon': ['amazon', 'aws'],
    'NVIDIA': ['nvidia'],
    'Tesla': ['tesla'],
    'xAI': ['xai', 'x\\.ai'],
    'Mistral AI': ['mistral ai', 'mistral'],
    'Stability AI': ['stability ai'],
    'Midjourney': ['midjourney'],
    'Runway': ['runway ml', 'runway'],
    'Scale AI': ['scale ai'],
    'Databricks': ['databricks'],
    'Hugging Face': ['hugging face', 'huggingface'],
    'Cohere': ['cohere'],
    'Perplexity': ['perplexity ai', 'perplexity'],
    'Anysphere': ['anysphere'],
    'Replit': ['replit'],
    'Character.AI': ['character\\.ai', 'character ai'],
    'Inflection AI': ['inflection ai', 'inflection'],
    'Salesforce': ['salesforce'],
    'Oracle': ['oracle'],
    'Intel': ['intel'],
    'AMD': ['amd'],
    'Qualcomm': ['qualcomm'],
    'Samsung': ['samsung'],
    'ByteDance': ['bytedance', 'byte dance'],
    'Baidu': ['baidu'],
    'Alibaba': ['alibaba'],
    'Tencent': ['tencent'],
    'Adobe': ['adobe'],
    'Palantir': ['palantir'],
    'Snowflake': ['snowflake'],
    'Stripe': ['stripe'],
    'OpenRouter': ['openrouter'],
  },
  person: {
    'Sam Altman': ['sam altman'],
    'Dario Amodei': ['dario amodei'],
    'Daniela Amodei': ['daniela amodei'],
    'Elon Musk': ['elon musk', 'musk'],
    'Satya Nadella': ['satya nadella', 'nadella'],
    'Sundar Pichai': ['sundar pichai', 'pichai'],
    'Mark Zuckerberg': ['mark zuckerberg', 'zuckerberg'],
    'Jensen Huang': ['jensen huang'],
    'Tim Cook': ['tim cook'],
    'Demis Hassabis': ['demis hassabis', 'hassabis'],
    'Ilya Sutskever': ['ilya sutskever', 'sutskever'],
    'Andrej Karpathy': ['andrej karpathy', 'karpathy'],
    'Yann LeCun': ['yann lecun', 'lecun'],
    'Geoffrey Hinton': ['geoffrey hinton', 'hinton'],
    'Fei-Fei Li': ['fei-fei li', 'fei fei li'],
    'Greg Brockman': ['greg brockman'],
    'Mira Murati': ['mira murati'],
    'Jan Leike': ['jan leike'],
    'Chris Lattner': ['chris lattner'],
    'George Hotz': ['george hotz', 'geohot'],
    'Emad Mostaque': ['emad mostaque'],
    'Arthur Mensch': ['arthur mensch'],
    'Aidan Gomez': ['aidan gomez'],
    'Noam Shazeer': ['noam shazeer'],
    'Jack Clark': ['jack clark'],
    'Connor Leahy': ['connor leahy'],
    'Jim Fan': ['jim fan'],
    'Mark Gurman': ['mark gurman', 'gurman'],
  },
  product: {
    'ChatGPT': ['chatgpt', 'chat gpt'],
    'GPT-4': ['gpt-4', 'gpt4', 'gpt-4o', 'gpt4o'],
    'GPT-5': ['gpt-5', 'gpt5'],
    'Claude': ['claude'],
    'Gemini': ['gemini'],
    'Llama': ['llama'],
    'Sora': ['sora'],
    'DALL-E': ['dall-e', 'dalle'],
    'GitHub Copilot': ['github copilot', 'copilot'],
    'Cursor': ['cursor'],
    'Stable Diffusion': ['stable diffusion'],
    'Whisper': ['whisper'],
    'Codex': ['codex'],
    'Vision Pro': ['vision pro'],
    'Siri': ['siri'],
    'Alexa': ['alexa'],
    'Grok': ['grok'],
    'Flux': ['flux'],
    'Opus': ['opus'],
    'Sonnet': ['sonnet'],
    'Haiku': ['haiku'],
  }
};

// Pre-compile regex patterns for each entity (done once at module load)
const ENTITY_PATTERNS = {};
for (const [type, entities] of Object.entries(KNOWN_ENTITIES)) {
  ENTITY_PATTERNS[type] = [];
  for (const [name, aliases] of Object.entries(entities)) {
    // Build alternation pattern from all aliases, sorted longest-first to prefer longer matches
    const sorted = [...aliases].sort((a, b) => b.length - a.length);
    const pattern = sorted.map(a => a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    ENTITY_PATTERNS[type].push({
      name,
      regex: new RegExp(`\\b(?:${pattern})\\b`, 'i'),
    });
  }
}

/**
 * Extract entities (companies, people, products) from content.
 * Returns deduplicated array of { name, type }.
 */
function extractEntities(content, title = '') {
  if (!content) return [];

  const text = `${title} ${content}`.toLowerCase();
  const found = new Map(); // "type:name" → { name, type }

  for (const [type, patterns] of Object.entries(ENTITY_PATTERNS)) {
    for (const { name, regex } of patterns) {
      const key = `${type}:${name}`;
      if (found.has(key)) continue;
      if (regex.test(text)) {
        found.set(key, { name, type });
      }
    }
  }

  return Array.from(found.values());
}

module.exports = { extractEntities, KNOWN_ENTITIES };

