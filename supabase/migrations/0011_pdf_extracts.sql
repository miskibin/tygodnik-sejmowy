-- 0011_pdf_extracts.sql
-- SHA-256 keyed cache for PDF text extraction. Composite PK (sha256, model_version)
-- so model bumps cohabit instead of overwriting (audit + rollback friendly).

create table if not exists pdf_extracts (
  sha256              text        not null,
  model_version       text        not null,                    -- 'pypdf-5.1.0' or 'ppocr-vl-1.5'
  text                text        not null,
  page_count          integer     not null check (page_count >= 0),
  ocr_used            boolean     not null,
  char_count_per_page integer[]   not null,
  extracted_at        timestamptz not null default now(),
  primary key (sha256, model_version),
  check (array_length(char_count_per_page, 1) = page_count or page_count = 0)
);

-- Lookup by sha alone (latest extraction across versions)
create index if not exists pdf_extracts_sha_idx on pdf_extracts(sha256, extracted_at desc);
