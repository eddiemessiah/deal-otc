# Example: Ingest and Query

## Ingest an Article

```bash
node scripts/ingest.js "https://example.com/blog/how-rag-systems-work" --tags "ai,rag"
```

Expected result shape:

```json
{
  "success": true,
  "source_id": 42,
  "title": "How RAG Systems Work",
  "type": "article",
  "chunks": 12,
  "embedded": 12,
  "tags": ["ai", "rag"],
  "strategy_used": "summarize"
}
```

## Query with Citations

```bash
node scripts/query.js "what do I know about fine-tuning LLMs?" --cited --limit 5
```

Expected behavior:
- Returns ranked results with similarity, freshness, and credibility information.
- Includes citation-friendly output when `--cited` is enabled.
- Uses the same embedding configuration as ingest time.

