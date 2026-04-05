-- Knowledge Base RAG: Supabase Schema Migration
-- Run this against your Supabase project to create the required tables and RPC function.
-- Requires the pgvector extension (enabled by default on Supabase).

-- Enable pgvector if not already enabled
CREATE EXTENSION IF NOT EXISTS vector;

-- Sources table: stores ingested content metadata
CREATE TABLE IF NOT EXISTS sources (
  id            bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  url           text UNIQUE,
  title         text,
  source_type   text NOT NULL DEFAULT 'article',
  summary       text,
  raw_content   text,
  content_hash  text,
  tags          jsonb DEFAULT '[]'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sources_url ON sources (url);
CREATE INDEX IF NOT EXISTS idx_sources_type ON sources (source_type);
CREATE INDEX IF NOT EXISTS idx_sources_hash ON sources (content_hash);

-- Chunks table: stores embedded text chunks for vector search
CREATE TABLE IF NOT EXISTS chunks (
  id                  bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  source_id           bigint NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  chunk_index         integer NOT NULL,
  content             text NOT NULL,
  embedding           vector(1536),
  embedding_dim       integer,
  embedding_provider  text,
  embedding_model     text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chunks_source ON chunks (source_id);
CREATE INDEX IF NOT EXISTS idx_chunks_embedding ON chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Source links table: connects related sources (e.g. tweet -> linked article)
CREATE TABLE IF NOT EXISTS source_links (
  id            bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  source_id     bigint NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  linked_url    text NOT NULL,
  link_type     text NOT NULL DEFAULT 'reference',
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, linked_url)
);

CREATE INDEX IF NOT EXISTS idx_source_links_source ON source_links (source_id);

-- Entities table: extracted people, companies, products, topics
CREATE TABLE IF NOT EXISTS entities (
  id          bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  source_id   bigint NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  name        text NOT NULL,
  type        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_entities_source ON entities (source_id);
CREATE INDEX IF NOT EXISTS idx_entities_name ON entities (name);

-- match_chunks RPC: vector similarity search used by db.js
-- Returns chunks ordered by cosine similarity to the query embedding.
CREATE OR REPLACE FUNCTION match_chunks(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.3,
  match_count int DEFAULT 10,
  filter_source_type text DEFAULT NULL
)
RETURNS TABLE (
  id              bigint,
  source_id       bigint,
  chunk_index     integer,
  content         text,
  embedding       vector(1536),
  similarity      float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.source_id,
    c.chunk_index,
    c.content,
    c.embedding,
    1 - (c.embedding <=> query_embedding) AS similarity
  FROM chunks c
  JOIN sources s ON s.id = c.source_id
  WHERE c.embedding IS NOT NULL
    AND 1 - (c.embedding <=> query_embedding) > match_threshold
    AND (filter_source_type IS NULL OR s.source_type = filter_source_type)
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

