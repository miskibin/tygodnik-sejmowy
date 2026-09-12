"""Keep MuPDF in one isolated process; network enrichment stays concurrent.

PyMuPDF explicitly does not support threads. Only serializable text/PNG
results cross this boundary, never Document or Page handles.
"""
from __future__ import annotations

from concurrent.futures import ProcessPoolExecutor
from functools import wraps
from importlib import import_module
from multiprocessing import get_context
from threading import Lock

_pool = None
_lock = Lock()
_in_worker = False


def _execute(module, name, args, kwargs):
    global _in_worker
    _in_worker = True
    return getattr(import_module(module), name).__wrapped__(*args, **kwargs)


def pdf_task(fn):
    @wraps(fn)
    def wrapped(*args, **kwargs):
        global _pool
        if _in_worker:
            return fn(*args, **kwargs)
        with _lock:
            if _pool is None:
                _pool = ProcessPoolExecutor(max_workers=1, mp_context=get_context("spawn"))
            pool = _pool
        return pool.submit(_execute, fn.__module__, fn.__name__, args, kwargs).result()
    return wrapped
