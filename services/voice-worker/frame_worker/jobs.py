"""Job queue (FR-VWK-03, API-01): one job at a time on the GPU, idempotency keys, cancellation, progress events."""

from __future__ import annotations

import itertools
import threading
import time
import traceback
import uuid
from collections import OrderedDict
from dataclasses import dataclass, field
from typing import Any, Callable

from .errors import ApiError


class Cancelled(Exception):
    pass


@dataclass
class Job:
    id: str
    kind: str
    request: dict
    state: str = "queued"  # queued | running | succeeded | failed | cancelled
    progress: float = 0.0
    message: str = ""
    result: Any = None
    error: dict | None = None
    created: float = field(default_factory=time.time)
    started: float | None = None
    finished: float | None = None
    idempotency_key: str | None = None
    _cancel: threading.Event = field(default_factory=threading.Event, repr=False)

    def check(self) -> None:
        """Called by engines between steps; raises Cancelled when the job was cancelled."""
        if self._cancel.is_set():
            raise Cancelled()

    def report(self, progress: float, message: str = "") -> None:
        self.progress = max(0.0, min(1.0, progress))
        self.message = message
        _notify(self)


_listeners: list[Callable[[Job], None]] = []


def _notify(job: Job) -> None:
    for fn in list(_listeners):
        try:
            fn(job)
        except Exception:  # noqa: BLE001 — a broken listener must not break the queue
            pass


class JobQueue:
    def __init__(self, runner: Callable[[Job], Any], keep: int = 500):
        self._runner = runner
        self._jobs: "OrderedDict[str, Job]" = OrderedDict()
        self._by_key: dict[str, str] = {}
        self._pending: list[str] = []
        self._cv = threading.Condition()
        self._keep = keep
        self._seq = itertools.count(1)
        self._thread = threading.Thread(target=self._loop, name="frame-gpu-queue", daemon=True)
        self._thread.start()

    @staticmethod
    def listen(fn: Callable[[Job], None]) -> Callable[[], None]:
        _listeners.append(fn)
        return lambda: _listeners.remove(fn) if fn in _listeners else None

    def submit(self, kind: str, request: dict, idempotency_key: str | None = None) -> Job:
        with self._cv:
            if idempotency_key and idempotency_key in self._by_key:
                job = self._jobs.get(self._by_key[idempotency_key])
                if job is not None:
                    if job.kind != kind:
                        raise ApiError("INVALID_REQUEST", "Idempotency key reused for a different request kind")
                    return job
            job = Job(id=f"job_{next(self._seq):06d}_{uuid.uuid4().hex[:8]}", kind=kind, request=request, idempotency_key=idempotency_key)
            self._jobs[job.id] = job
            if idempotency_key:
                self._by_key[idempotency_key] = job.id
            self._pending.append(job.id)
            self._trim()
            self._cv.notify()
        _notify(job)
        return job

    def get(self, job_id: str) -> Job:
        job = self._jobs.get(job_id)
        if job is None:
            raise ApiError("NOT_FOUND", f"Job {job_id} not found")
        return job

    def position(self, job: Job) -> int:
        with self._cv:
            return self._pending.index(job.id) + 1 if job.id in self._pending else 0

    def cancel(self, job_id: str) -> bool:
        job = self.get(job_id)
        with self._cv:
            if job.state == "queued":
                self._pending.remove(job.id)
                job.state = "cancelled"
                job.error = {"code": "CANCELLED", "message": "Cancelled before it started"}
                job.finished = time.time()
                _notify(job)
                return True
        if job.state == "running":
            job._cancel.set()
            return True
        return False

    def busy(self) -> int:
        with self._cv:
            return len(self._pending) + sum(1 for j in self._jobs.values() if j.state == "running")

    def _trim(self) -> None:
        while len(self._jobs) > self._keep:
            jid, j = next(iter(self._jobs.items()))
            if j.state in ("queued", "running"):
                break
            self._jobs.pop(jid)
            if j.idempotency_key:
                self._by_key.pop(j.idempotency_key, None)

    def _loop(self) -> None:
        while True:
            with self._cv:
                while not self._pending:
                    self._cv.wait()
                job = self._jobs[self._pending.pop(0)]
                job.state = "running"
                job.started = time.time()
            _notify(job)
            try:
                job.result = self._runner(job)
                job.state = "succeeded"
                job.progress = 1.0
            except Cancelled:
                job.state = "cancelled"
                job.error = {"code": "CANCELLED", "message": "Cancelled"}
            except ApiError as e:
                job.state = "failed"
                job.error = e.body()["error"]
            except Exception as e:  # noqa: BLE001 — report every engine failure as a job error
                job.state = "failed"
                job.error = {"code": "ENGINE_ERROR", "message": str(e) or e.__class__.__name__, "details": traceback.format_exc(limit=3)}
            job.finished = time.time()
            _notify(job)
