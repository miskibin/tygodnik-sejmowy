from pathlib import Path
from supagraf.enrich.illustrations.gallery import render_gallery


def test_gallery_escapes_untrusted_titles_and_does_not_link_outside_assets(tmp_path):
    report = {"articles": [{"article": {"number": "123", "title": '<script>alert(1)</script>'}, "plan": {"route": "generate"}, "candidates": [{"candidate": {"local_path": str(tmp_path.parent / 'secret.png'), "source_url": 'javascript:alert(1)'}, "review": {"status": "needs_review"}}]}]}
    rendered = render_gallery(report, tmp_path).read_text(encoding='utf8')
    assert '<script>alert(1)</script>' not in rendered
    assert 'javascript:alert' not in rendered
    assert 'secret.png' not in rendered
    assert 'Wymaga oceny' in rendered
    assert 'niedostępny' in rendered


def test_gallery_links_valid_download_and_marks_generated_preview(tmp_path):
    (tmp_path / 'photo.png').write_bytes(b'png')
    report = {"articles": [{"article": {"number": "123", "title": 'Temat'}, "plan": {"route": "generate"}, "candidates": [{"candidate": {"local_path": str(tmp_path / 'photo.png'), "provider": 'flux'}, "review": {"status": "approved"}}]}]}
    rendered = render_gallery(report, tmp_path).read_text(encoding='utf8')
    assert 'href="photo.png"' in rendered
    assert 'kontrolę automatyczną' in rendered
    assert 'nie jest publikacją' in rendered
