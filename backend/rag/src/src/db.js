const { getSupabaseClient } = require('./config');
const { logEvent } = require('../../../shared/event-log');

function bufferToPgvector(buffer) {
  if (!buffer) return null;
  const arr = Array.from(new Float32Array(buffer.buffer, buffer.byteOffset, buffer.length / 4));
  return `[${arr.join(',')}]`;
}

function parseTags(tags) {
  if (Array.isArray(tags)) return tags;
  try { return JSON.parse(tags || '[]'); } catch { return []; }
}

class KnowledgeDB {
  constructor(supabaseClient) {
    this.supabase = supabaseClient || getSupabaseClient();
  }

  async insertSource({ url, title, sourceType, summary, rawContent, contentHash, tags }) {
    const { data, error } = await this.supabase
      .from('sources')
      .insert({
        url: url || null,
        title,
        source_type: sourceType,
        summary: summary || null,
        raw_content: rawContent || null,
        content_hash: contentHash,
        tags: Array.isArray(tags) ? tags : parseTags(tags),
      })
      .select('id')
      .single();
    if (error) throw new Error(`insertSource failed: ${error.message}`);
    logEvent({ event: 'kb_insert_source', source_id: data.id, title, source_type: sourceType, url: url || null });
    return data.id;
  }

  async getSourceByHash(contentHash) {
    const { data, error } = await this.supabase
      .from('sources')
      .select('*')
      .eq('content_hash', contentHash)
      .maybeSingle();
    if (error) throw new Error(`getSourceByHash failed: ${error.message}`);
    return data || undefined;
  }

  async getSourceByUrl(url) {
    if (!url) return undefined;
    const { data, error } = await this.supabase
      .from('sources')
      .select('*')
      .eq('url', url)
      .maybeSingle();
    if (error) throw new Error(`getSourceByUrl failed: ${error.message}`);
    return data || undefined;
  }

  async getSourceById(id) {
    const { data, error } = await this.supabase
      .from('sources')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(`getSourceById failed: ${error.message}`);
    return data || undefined;
  }

  async listSources({ type, tag, limit, recent } = {}) {
    let query = this.supabase
      .from('sources')
      .select('id, url, title, source_type, summary, tags, created_at');

    if (type) query = query.eq('source_type', type);
    if (tag) query = query.contains('tags', [tag]);
    if (recent) {
      const since = new Date(Date.now() - recent * 24 * 60 * 60 * 1000).toISOString();
      query = query.gte('created_at', since);
    }

    query = query.order('created_at', { ascending: false });
    if (limit) query = query.limit(limit);

    const { data, error } = await query;
    if (error) throw new Error(`listSources failed: ${error.message}`);
    return data || [];
  }

  async deleteSource(id) {
    const { data, error } = await this.supabase
      .from('sources')
      .delete()
      .eq('id', id)
      .select('id');
    if (error) throw new Error(`deleteSource failed: ${error.message}`);
    const deleted = data && data.length > 0;
    logEvent({ event: 'kb_delete_source', source_id: id, deleted });
    return deleted;
  }

  async insertSourceLink(parentId, childId, relationship = 'linked_from', context = null) {
    const { error } = await this.supabase
      .from('source_links')
      .upsert({
        parent_id: parentId,
        child_id: childId,
        relationship,
        context: context || null,
      }, { onConflict: 'parent_id,child_id', ignoreDuplicates: true });
    if (error && !error.message.includes('duplicate')) {
      throw new Error(`insertSourceLink failed: ${error.message}`);
    }
    return !error;
  }

  async getChildSources(parentId) {
    const { data, error } = await this.supabase
      .from('source_links')
      .select(`
        relationship, context, created_at,
        sources!source_links_child_id_fkey (*)
      `)
      .eq('parent_id', parentId)
      .order('created_at');
    if (error) throw new Error(`getChildSources failed: ${error.message}`);
    return (data || []).map(row => ({
      ...row.sources,
      relationship: row.relationship,
      link_context: row.context,
      linked_at: row.created_at,
    }));
  }

  async getParentSources(childId) {
    const { data, error } = await this.supabase
      .from('source_links')
      .select(`
        relationship, context, created_at,
        sources!source_links_parent_id_fkey (*)
      `)
      .eq('child_id', childId)
      .order('created_at');
    if (error) throw new Error(`getParentSources failed: ${error.message}`);
    return (data || []).map(row => ({
      ...row.sources,
      relationship: row.relationship,
      link_context: row.context,
      linked_at: row.created_at,
    }));
  }

  async getLinkedSources(sourceId) {
    const [children, parents] = await Promise.all([
      this.getChildSources(sourceId),
      this.getParentSources(sourceId),
    ]);
    return { children, parents };
  }

  async insertEntities(sourceId, entities) {
    if (!entities || entities.length === 0) return 0;
    const rows = entities.map(e => ({
      source_id: sourceId,
      name: e.name,
      type: e.type,
    }));
    const { error } = await this.supabase.from('entities').insert(rows);
    if (error) throw new Error(`insertEntities failed: ${error.message}`);
    return entities.length;
  }

  async getSourceIdsByEntity(entityName) {
    const { data, error } = await this.supabase
      .from('entities')
      .select('source_id')
      .ilike('name', entityName);
    if (error) throw new Error(`getSourceIdsByEntity failed: ${error.message}`);
    const unique = [...new Set((data || []).map(r => r.source_id))];
    return unique;
  }

  async getEntitiesForSource(sourceId) {
    const { data, error } = await this.supabase
      .from('entities')
      .select('name, type')
      .eq('source_id', sourceId);
    if (error) throw new Error(`getEntitiesForSource failed: ${error.message}`);
    return data || [];
  }

  async getSourceCount() {
    const { count, error } = await this.supabase
      .from('sources')
      .select('*', { count: 'exact', head: true });
    if (error) throw new Error(`getSourceCount failed: ${error.message}`);
    return count || 0;
  }

  async insertChunks(sourceId, chunks) {
    const rows = chunks.map(item => ({
      source_id: sourceId,
      chunk_index: item.index,
      content: item.content,
      embedding: bufferToPgvector(item.embedding),
      embedding_dim: item.embedding_dim ?? null,
      embedding_provider: item.embedding_provider ?? null,
      embedding_model: item.embedding_model ?? null,
    }));

    const BATCH_SIZE = 50;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const { error } = await this.supabase.from('chunks').insert(batch);
      if (error) throw new Error(`insertChunks failed: ${error.message}`);
    }
    return chunks.length;
  }

  async getAllChunksWithEmbeddings({ sourceType, tags, since, sourceIds } = {}) {
    let query = this.supabase
      .from('chunks')
      .select(`
        id, source_id, chunk_index, content, embedding,
        embedding_dim, embedding_provider, embedding_model, created_at,
        sources!inner (title, url, source_type, summary, tags, created_at, freshness_score)
      `)
      .not('embedding', 'is', null);

    if (sourceType) query = query.eq('sources.source_type', sourceType);
    if (tags && tags.length > 0) {
      query = query.contains('sources.tags', tags);
    }
    if (since) {
      const sinceDate = new Date(Date.now() - since * 24 * 60 * 60 * 1000).toISOString();
      query = query.gte('sources.created_at', sinceDate);
    }
    if (sourceIds && sourceIds.length > 0) {
      query = query.in('source_id', sourceIds);
    }

    const { data, error } = await query;
    if (error) throw new Error(`getAllChunksWithEmbeddings failed: ${error.message}`);

    return (data || []).map(row => ({
      id: row.id,
      source_id: row.source_id,
      chunk_index: row.chunk_index,
      content: row.content,
      embedding: row.embedding,
      embedding_dim: row.embedding_dim,
      embedding_provider: row.embedding_provider,
      embedding_model: row.embedding_model,
      title: row.sources.title,
      url: row.sources.url,
      source_type: row.sources.source_type,
      summary: row.sources.summary,
      tags: row.sources.tags,
      created_at: row.sources.created_at,
      freshness_score: row.sources.freshness_score ?? 1.0,
    }));
  }

  async matchChunks({ queryEmbedding, threshold, limit, sourceType, sinceDays, sourceIds, tags }) {
    const embeddingStr = Array.isArray(queryEmbedding)
      ? `[${queryEmbedding.join(',')}]`
      : bufferToPgvector(queryEmbedding);

    const { data, error } = await this.supabase.rpc('match_chunks', {
      query_embedding: embeddingStr,
      match_threshold: threshold || 0.3,
      match_count: limit || 5,
      filter_source_type: sourceType || null,
      filter_since_days: sinceDays || null,
      filter_source_ids: sourceIds || null,
      filter_tags: tags && tags.length > 0 ? tags : null,
    });
    if (error) throw new Error(`matchChunks RPC failed: ${error.message}`);
    return (data || []).map(row => ({
      ...row,
      created_at: row.source_created_at,
      freshness_score: row.freshness_score ?? 1.0,
    }));
  }

  async getChunkCount() {
    const { count, error } = await this.supabase
      .from('chunks')
      .select('*', { count: 'exact', head: true });
    if (error) throw new Error(`getChunkCount failed: ${error.message}`);
    return count || 0;
  }

  async getStats() {
    const [totalSources, totalChunks, embeddedChunks, byType, topTags] = await Promise.all([
      this.getSourceCount(),
      this.getChunkCount(),
      this.supabase.from('chunks').select('*', { count: 'exact', head: true }).not('embedding', 'is', null)
        .then(r => r.count || 0),
      this.supabase.from('sources').select('source_type').then(r => {
        const counts = {};
        for (const row of (r.data || [])) {
          counts[row.source_type] = (counts[row.source_type] || 0) + 1;
        }
        return Object.entries(counts)
          .map(([source_type, count]) => ({ source_type, count }))
          .sort((a, b) => b.count - a.count);
      }),
      this.getTopTags(10),
    ]);

    return {
      total_sources: totalSources,
      total_chunks: totalChunks,
      embedded_chunks: embeddedChunks,
      chunks_missing_embeddings: totalChunks - embeddedChunks,
      by_type: byType,
      top_tags: topTags,
      db_size_bytes: 0,
      db_size_mb: 0,
    };
  }

  async getTopTags(limit = 10) {
    const { data, error } = await this.supabase.from('sources').select('tags');
    if (error) throw new Error(`getTopTags failed: ${error.message}`);
    const tagCounts = {};
    for (const s of (data || [])) {
      const tags = parseTags(s.tags);
      for (const tag of tags) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      }
    }
    return Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([tag, count]) => ({ tag, count }));
  }

  async updateFreshnessScore(sourceId, score) {
    const { error } = await this.supabase
      .from('sources')
      .update({ freshness_score: score })
      .eq('id', sourceId);
    if (error) throw new Error(`updateFreshnessScore failed: ${error.message}`);
  }

  async getAllSourcesForFreshness() {
    const { data, error } = await this.supabase
      .from('sources')
      .select('id, source_type, created_at')
      .order('created_at', { ascending: true });
    if (error) throw new Error(`getAllSourcesForFreshness failed: ${error.message}`);
    return data || [];
  }

  close() {
    // No-op for Supabase (stateless HTTP client)
  }
}

module.exports = KnowledgeDB;
module.exports.parseTags = parseTags;
module.exports.bufferToPgvector = bufferToPgvector;

