"""Portable, escaped review gallery for pipeline output; no framework/runtime needed."""
from __future__ import annotations

import html
import json
from pathlib import Path
from urllib.parse import quote

LABELS = {'approved':'Przeszedł kontrolę automatyczną','rejected':'Odrzucony','needs_review':'Wymaga oceny','generate':'Lokalna generacja','authentic':'Autentyczna fotografia','none':'Bez ilustracji'}

def render_gallery(report: dict, output_dir: Path) -> Path:
    root = Path(output_dir).resolve()
    root.mkdir(parents=True, exist_ok=True)
    esc = lambda x: html.escape(str(x), quote=True)
    sections = []
    for row in report.get('articles', []):
        article, plan = row['article'], row.get('plan') or {}
        cards = []
        for entry in row.get('candidates', []):
            candidate, review = entry['candidate'], entry.get('review') or {}
            local = Path(candidate['local_path'])
            if not local.is_absolute():
                local = root / local
            try:
                relative = local.resolve().relative_to(root)
                url = quote(relative.as_posix()) if local.is_file() else ''
            except ValueError:
                url = ''
            status = review.get('status', 'needs_review')
            status_label = ('Wybrany · ' if candidate.get('id') == row.get('selected_candidate_id') else '') + LABELS.get(status, status)
            visual = f'<a href="{url}"><img src="{url}" alt="{esc(candidate.get("caption") or plan.get("subject", "Ilustracja"))}"></a>' if url else '<p>Plik obrazu niedostępny.</p>'
            source = candidate.get('source_url', '')
            attribution = esc(' · '.join(str(candidate.get(k) or '') for k in ('provider', 'author', 'license')))
            if source.startswith('https://'):
                attribution += f' · <a href="{esc(source)}" rel="noreferrer">źródło</a>'
            reason = review.get('reason') or review.get('reasons') or review.get('issues') or ''
            if isinstance(reason, list):
                reason = '; '.join(map(str, reason))
            cards.append(f'<article class="card"><div class="visual">{visual}</div><div class="copy"><strong class="{esc(status)}">{esc(status_label)}</strong><p>{esc(reason)}</p><small>{attribution}</small><details><summary>Wynik kontroli</summary><pre>{esc(json.dumps(review,ensure_ascii=False,indent=2))}</pre></details></div></article>')
        if row.get('candidate_error'):
            cards.insert(0, '<p>Źródło lub generator niedostępny: ' + esc(row['candidate_error']) + '</p>')
        if not cards:
            cards.append('<p>Brak zaakceptowanego obrazu. Pipeline nie wstawia zastępczej ilustracji na siłę.</p>')
        sections.append(f'<section><small>Druk {esc(article.get("term",10))}/{esc(article["number"])} · {esc(LABELS.get(plan.get("route"),plan.get("route","")))}</small><h2>{esc(article["title"])}</h2><p>{esc(plan.get("reason", ""))}</p><div class="grid">{"".join(cards)}</div><details><summary>Plan ilustracji</summary><pre>{esc(json.dumps(plan,ensure_ascii=False,indent=2))}</pre></details></section>')
    document = '''<!doctype html><html lang="pl"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Pipeline ilustracji — Tygodnik Sejmowy</title><style>
*{box-sizing:border-box}body{margin:0;background:#fff;color:#09090b;font:16px/1.6 system-ui,sans-serif}main{max-width:1180px;margin:auto;padding:36px 24px}h1{font-size:36px;letter-spacing:-.04em;line-height:1.15}h2{font-size:25px;line-height:1.3}section{border-top:1px solid #d4d4d8;margin-top:32px;padding:28px 0}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.card{border:1px solid #e4e4e7;border-radius:6px;overflow:hidden}.visual{background:#f4f4f5;aspect-ratio:3/2}.visual img{width:100%;height:100%;object-fit:contain}.visual a{display:block;width:100%;height:100%}.copy{padding:16px}small{color:#71717a}a{color:inherit}p{margin:10px 0}.approved{color:#13715a}.rejected{color:#a12535}.needs_review{color:#825700}summary{cursor:pointer}details{margin-top:16px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;background:#fafafa;padding:12px}@media(max-width:650px){main{padding:24px 16px}.grid{grid-template-columns:1fr}h1{font-size:30px}}
</style><main><h1>Pipeline ilustracji</h1><p>DeepSeek dobiera temat i sposób ilustracji, a następnie kontroluje gotowe obrazy. Sceny wygenerowane są ilustracyjne; konkretne instytucje wymagają potwierdzonej fotografii.</p><p><small>To podgląd wyników. Akceptacja automatyczna nie jest publikacją ani gwarancją bezbłędności obrazu.</small></p>'''
    target = root / 'index.html'
    target.write_text(document + ''.join(sections) + '</main></html>', encoding='utf-8')
    return target
