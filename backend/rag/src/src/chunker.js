/**
 * Text chunker for RAG.
 * Splits content into overlapping segments for better retrieval.
 */

const DEFAULT_CHUNK_SIZE = 800;    // ~800 chars per chunk
const DEFAULT_OVERLAP = 200;       // 200 char overlap between chunks
const MIN_CHUNK_SIZE = 100;        // Don't create tiny chunks

/**
 * Split text into overlapping chunks, respecting sentence boundaries.
 * @param {string} text - The text to chunk
 * @param {Object} options
 * @param {number} options.chunkSize - Target chunk size in characters (default 800)
 * @param {number} options.overlap - Overlap between chunks in characters (default 200)
 * @returns {Array<{index: number, content: string}>}
 */
function chunkText(text, options = {}) {
  const chunkSize = options.chunkSize || DEFAULT_CHUNK_SIZE;
  const overlap = options.overlap || DEFAULT_OVERLAP;

  if (!text || text.trim().length === 0) {
    return [];
  }

  // Normalize whitespace
  const cleaned = text.replace(/\s+/g, ' ').trim();

  if (cleaned.length <= chunkSize) {
    return [{ index: 0, content: cleaned }];
  }

  // Split into sentences for cleaner boundaries
  const sentences = splitSentences(cleaned);
  const chunks = [];
  let currentChunk = '';
  let chunkIndex = 0;

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];

    // If adding this sentence would exceed chunk size, finalize current chunk
    if (currentChunk.length + sentence.length > chunkSize && currentChunk.length >= MIN_CHUNK_SIZE) {
      chunks.push({ index: chunkIndex, content: currentChunk.trim() });
      chunkIndex++;

      // Start new chunk with overlap from the end of the current chunk
      currentChunk = getOverlap(currentChunk, overlap) + sentence;
    } else {
      currentChunk += (currentChunk ? ' ' : '') + sentence;
    }
  }

  // Don't forget the last chunk
  if (currentChunk.trim().length >= MIN_CHUNK_SIZE) {
    chunks.push({ index: chunkIndex, content: currentChunk.trim() });
  } else if (currentChunk.trim().length > 0 && chunks.length > 0) {
    // Append tiny remainder to last chunk
    chunks[chunks.length - 1].content += ' ' + currentChunk.trim();
  } else if (currentChunk.trim().length > 0) {
    chunks.push({ index: chunkIndex, content: currentChunk.trim() });
  }

  return chunks;
}

/**
 * Split text into sentences (handles common patterns)
 */
function splitSentences(text) {
  // Split on sentence endings, keeping the delimiter with the sentence
  const raw = text.split(/(?<=[.!?])\s+/);
  return raw.filter(s => s.trim().length > 0);
}

/**
 * Get the last N characters of text, breaking at a word boundary
 */
function getOverlap(text, overlapSize) {
  if (text.length <= overlapSize) return text;
  const slice = text.slice(-overlapSize);
  // Find the first word boundary
  const spaceIdx = slice.indexOf(' ');
  return spaceIdx > 0 ? slice.slice(spaceIdx + 1) : slice;
}

module.exports = { chunkText };

