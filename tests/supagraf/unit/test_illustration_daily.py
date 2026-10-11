import copy
from types import SimpleNamespace

from PIL import Image

from supagraf.enrich.illustrations import daily
from supagraf.enrich.illustrations.models import Candidate, Plan, Review

PRINTS = [
    {"id": 1, "term": 10, "number": "100", "title": "O ochronie jezior", "short_title": "Czyste jeziora",
     "impact_punch": "Gminy muszą badać wodę.", "summary_plain": ""},
    {"id": 2, "term": 10, "number": "101", "title": "Sprawozdanie komisji", "short_title": None,
     "impact_punch": None, "summary_plain": None},
    {"id": 3, "term": 10, "number": "102", "title": "Kąpieliska", "short_title": None,
     "impact_punch": None, "summary_plain": None},
]


class Client:
    def __init__(self, images):
        self.images, self.table_name = images, None

    def table(self, name):
        self.table_name = name
        return self

    def __getattr__(self, _name):  # select/eq/in_/order are filters the fake ignores
        return lambda *_a, **_k: self

    def execute(self):
        data = PRINTS if self.table_name == "prints" else list(self.images.values())
        return SimpleNamespace(data=copy.deepcopy(data))

    def upsert(self, payload, **_):
        self.images[payload["print_id"]] = payload
        return self


class Storage:
    def __init__(self):
        self.uploads = []

    def upload(self, path, data, content_type):
        self.uploads.append((path, content_type))
        return f"https://db.example/storage/v1/object/public/illustrations/{path}"


def fakes(monkeypatch, tmp_path, *, gpu_fails=False):
    import supagraf.enrich.scoped_prints as scoped
    monkeypatch.setattr(scoped, "build_plan", lambda **_: SimpleNamespace(rows=[{"id": 1}, {"id": 2}, {"id": 3}]))
    calls = {"plan": 0, "generate": 0, "review": 0}

    def planner(article):
        calls["plan"] += 1
        if article.number == "101":
            return Plan(route="none", subject="", reason="Procedural document.")
        return Plan(route="generate", subject="Jezioro", reason="Generic scene.", prompt="Quiet lake, no people, no text.")

    def generator(plan, directory):
        calls["generate"] += 1
        if gpu_fails:
            raise RuntimeError("down")
        out = []
        for index, colour in enumerate(("blue", "green")):
            path = directory / f"candidate-0{index + 1}.jpg"
            Image.new("RGB", (1536, 1024), colour).save(path)
            out.append(Candidate(id=f"generated-{index}", provider="sfgpu_qwen_image", local_path=str(path), metadata={"seed": index}))
        return out

    def reviewer(article, plan, candidate):
        calls["review"] += 1
        return Review(status="approved", reason="ok", semantic_relevance=True, physical_geometry_ok=True)

    kwargs = dict(planner=planner, reviewer=reviewer, generator=generator, generator_fingerprint="test",
                  authentic_search=lambda *_: [], authentic_fingerprint="test", output_dir=tmp_path)
    return calls, kwargs


def test_publishes_approved_records_abstentions_and_never_repeats(monkeypatch, tmp_path):
    existing = {3: {"print_id": 3, "status": "matched", "subject_hash": "x", "catalog_hash": "commons", "image": {"url": "c"}}}
    client, storage = Client(existing), Storage()
    calls, kwargs = fakes(monkeypatch, tmp_path)
    stats = daily.run_illustrations(sitting=64, client=client, storage=storage, limit=5, **kwargs)
    assert (stats["published"], stats["no_image"], stats["failed"]) == (1, 1, 0)
    published = client.images[1]
    assert published["status"] == "matched" and published["catalog_hash"] == daily.POLICY
    assert published["image"]["provider"] == "generated" and published["image"]["width"] == 1536
    assert published["image"]["url"].endswith(".jpg") and storage.uploads[0][1] == "image/jpeg"
    assert client.images[2]["status"] == "no_match" and client.images[2]["image"] is None
    assert client.images[3]["catalog_hash"] == "commons"  # Commons match untouched
    assert calls["review"] == 1  # second candidate not reviewed once the first passed
    # Second run: every print is decided; no planner, GPU or review calls.
    before = dict(calls)
    assert daily.run_illustrations(sitting=64, client=client, storage=storage, limit=5, **kwargs)["pending"] == 0
    assert calls == before


def test_gpu_failure_writes_nothing_and_is_retried(monkeypatch, tmp_path):
    client = Client({})
    _calls, kwargs = fakes(monkeypatch, tmp_path, gpu_fails=True)
    stats = daily.run_illustrations(sitting=64, client=client, storage=Storage(), limit=5, **kwargs)
    assert stats["failed"] == 2 and stats["no_image"] == 1
    assert set(client.images) == {2}


def test_changed_subject_reopens_a_decided_print():
    row = PRINTS[0]
    decided = {1: {"status": "no_match", "catalog_hash": daily.POLICY, "subject_hash": daily.subject_hash(row)}}
    assert daily.pending_rows([row], decided) == []
    assert daily.pending_rows([{**row, "short_title": "Inny tytuł"}], decided)
