import copy
import json
from types import SimpleNamespace

import httpx
import pytest

from supagraf.enrich.story_images import CATALOG_PATH, match_rule, parse_image, run_images

CATALOG = json.loads(CATALOG_PATH.read_text(encoding='utf-8'))


def page():
    meta = {k: {'value': v} for k, v in {
        'Artist': '<a href="https://example.com">Author</a>',
        'LicenseShortName': 'CC BY-SA 4.0',
        'LicenseUrl': 'https://creativecommons.org/licenses/by-sa/4.0/',
    }.items()}
    return {'title': 'File:test.jpg', 'imageinfo': [{
        'url': 'https://upload.wikimedia.org/wikipedia/commons/a/test.jpg',
        'descriptionurl': 'https://commons.wikimedia.org/wiki/File:test.jpg',
        'width': 1200, 'height': 800, 'mime': 'image/jpeg', 'extmetadata': meta,
    }]}


def test_concrete_subject_only_and_ambiguity_abstains():
    assert match_rule('Zmiana Kodeksu wyborczego', CATALOG)['id'] == 'elections'
    assert match_rule('Jakość wody w kąpieliskach', CATALOG)['id'] == 'bathing'
    assert match_rule('Sprawozdanie komisji', CATALOG) is None
    assert match_rule('Kodeks wyborczy i elektrownie wiatrowe', CATALOG) is None


def test_license_attribution_is_plain_and_preserved():
    result = parse_image(page(), CATALOG[0])
    assert result['author'] == 'Author'
    assert result['license'] == 'CC BY-SA 4.0'
    assert result['source_url'].startswith('https://commons.wikimedia.org/')


@pytest.mark.parametrize('field,value', [
    ('LicenseShortName', 'CC BY-NC-ND 4.0'), ('Artist', ''),
    ('LicenseUrl', 'https://evil.example/license'), ('Restrictions', 'permission required'),
])
def test_missing_or_restricted_rights_abstain(field, value):
    candidate = page()
    candidate['imageinfo'][0]['extmetadata'][field] = {'value': value}
    assert parse_image(candidate, CATALOG[0]) is None


def test_untrusted_image_host_abstains():
    candidate = page()
    candidate['imageinfo'][0]['url'] = 'https://example.com/a.jpg'
    assert parse_image(candidate, CATALOG[0]) is None


class Client:
    def __init__(self):
        self.saved = []
        self.table_name = None

    def table(self, name):
        self.table_name = name
        return self

    def select(self, *_):
        return self

    def eq(self, *_):
        return self

    def in_(self, *_):
        return self

    def execute(self):
        if self.table_name == 'prints':
            return SimpleNamespace(data=[{'id': 1, 'number': '123', 'title': 'Kodeks wyborczy', 'short_title': None}])
        return SimpleNamespace(data=copy.deepcopy(self.saved))

    def upsert(self, payload, **_):
        self.saved = [payload]
        return self


def test_idempotence_and_dry_run(monkeypatch):
    import supagraf.enrich.scoped_prints as scoped
    import supagraf.enrich.story_images as images
    monkeypatch.setattr(scoped, 'build_plan', lambda **_: SimpleNamespace(rows=[{'id': 1}]))
    calls = []
    monkeypatch.setattr(images, 'fetch_image', lambda *args: calls.append(True) or parse_image(page(), CATALOG[1]))
    client = Client()
    assert run_images(sitting=64, client=client, dry_run=True)['matched'] == 1
    assert not client.saved
    assert run_images(sitting=64, client=client)['matched'] == 1
    client.saved[0]["checked_at"] = client.saved[0]["checked_at"].replace("+00:00", "Z")
    import re
    client.saved[0]["checked_at"] = re.sub(r"\.(\d{5})\d", r".\1", client.saved[0]["checked_at"])
    assert run_images(sitting=64, client=client)['skipped'] == 1
    assert len(calls) == 2
    old = copy.deepcopy(client.saved)
    def fail(*_):
        raise httpx.ConnectError('offline')
    monkeypatch.setattr(images, 'fetch_image', fail)
    assert run_images(sitting=64, client=client, force=True)['failed'] == 1
    assert client.saved == old
