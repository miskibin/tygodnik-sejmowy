import hashlib
import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace

import pytest
from PIL import Image


def test_publisher_validates_all_assets_before_any_write(tmp_path, monkeypatch):
    source = Path(__file__).resolve().parents[3] / 'scripts/illustrations/publish_selected.py'
    spec = importlib.util.spec_from_file_location('editorial_publish_under_test', source)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    writes = []
    class DB:
        def table(self, *_): return self
        def select(self, *_): return self
        def eq(self, *_): return self
        def limit(self, *_): return self
        def execute(self): return SimpleNamespace(data=[{'id': 123, 'title': 'Lake', 'short_title': None}])
        def upsert(self, *args, **kwargs): writes.append(args); return self
    monkeypatch.setattr(module, 'supabase', lambda: DB())
    assets = tmp_path / 'term-10'
    assets.mkdir()
    image = assets / 'lake.png'
    Image.new('RGB', (60, 40)).save(image)
    item = {'term': 10, 'number': '1', 'url': '/editorial/term-10/lake.png', 'sha256': hashlib.sha256(image.read_bytes()).hexdigest(), 'provider': 'generated', 'caption': 'Lake', 'alt': 'Lake'}
    item['metadata'] = {'model': 'test-model', 'review_sha256': 'abc'}
    manifest = tmp_path / 'manifest.json'
    manifest.write_text(json.dumps([item, {**item, 'number': '2', 'sha256': '0' * 64}]))
    with pytest.raises(ValueError, match='asset hash mismatch'):
        module.publish(manifest, tmp_path, dry_run=False, rollback_dir=tmp_path / 'rollback')
    assert writes == []
    manifest.write_text(json.dumps([item]))
    assert module.publish(manifest, tmp_path, dry_run=True)[0]['image']['metadata'] == item['metadata']
