"""Resolve exact known institutions before bounded general-provider search."""
from __future__ import annotations
import hashlib
import re
from pathlib import Path
from .models import Plan, Candidate
from .providers import search_commons, search_pixabay

# Reviewed source identity, not a generated claim or a photograph search guess.
AUTHENTIC_SOURCES = {
    'echr': {
        'aliases': ('etpc', 'echr', 'european court of human rights', 'europejski trybunał praw człowieka', 'cour européenne des droits'),
        'files': ["File:Cour européenne des droits de l'homme (Strasbourg) (1).jpg",
                  "File:Cour européenne des droits de l'homme (Strasbourg) (2).jpg"],
    },
}

def find_authentic(plan: Plan, directory: Path) -> list[Candidate]:
    identity = plan.required_identity.casefold()
    for entry in AUTHENTIC_SOURCES.values():
        if any(re.search(r'(?<!\w)' + re.escape(alias) + r'(?!\w)', identity) for alias in entry['aliases']):
            found = []
            for source_file in entry['files']:
                found.extend(search_commons(source_file, directory, limit=1))
            if found:
                return found[:2]
    for query in (plan.search_queries[:2] or [plan.required_identity or plan.subject]):
        query = query[:100].strip()
        if plan.required_identity:
            found = search_commons(query, directory, limit=2)
        else:
            found = search_pixabay(query, directory, limit=2)
            if not found:
                found = search_commons(query, directory, limit=2)
        if found:
            return found
    return []


def provider_fingerprint() -> str:
    return hashlib.sha256(Path(__file__).read_bytes() + Path(__file__).with_name('providers.py').read_bytes()).hexdigest()
