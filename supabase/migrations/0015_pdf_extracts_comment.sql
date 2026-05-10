-- 0015_pdf_extracts_comment.sql
-- Document the dual semantics of pdf_extracts.text after the paddle-primary
-- switch: text holds markdown when paddle was used (ocr_used=true; majority),
-- plain text when pypdf fallback ran (ocr_used=false; rare). model_version
-- distinguishes the two paths and is part of the PK so old rows survive.

comment on column pdf_extracts.text is
  'Markdown when ocr_used=true (paddle); plain text when ocr_used=false (pypdf fallback). model_version distinguishes the path.';
comment on column pdf_extracts.ocr_used is
  'true when paddle-vl-1.5 produced the row (primary path). false only on pypdf fallback when paddle raised.';
comment on column pdf_extracts.model_version is
  'Extraction backend identity, e.g. paddle-vl-1.5-primary or pypdf-6.10.2-fallback. Bump invalidates cache by adding new rows.';
