"""Model manager: one resident model, OOM recovery (FR-VWK-03, AC-17 logic on CPU)."""

import pytest

from frame_worker.errors import ApiError
from frame_worker.models import ModelManager


def test_one_model_resident_and_swap():
    m = ModelManager("cpu")
    a = m.get("a", lambda: object())
    assert m.loaded == "a" and m.get("a", lambda: object()) is a
    m.get("b", lambda: object())
    assert m.loaded == "b"


def test_out_of_memory_unloads_and_is_coded():
    m = ModelManager("cpu")
    m.get("big", lambda: object())

    def boom():
        raise RuntimeError("CUDA out of memory. Tried to allocate 2.00 GiB")

    with pytest.raises(ApiError) as e:
        m.run(boom)
    assert e.value.code == "OUT_OF_MEMORY"
    assert m.loaded is None
    # Recovers: the next load and run succeed.
    m.get("small", lambda: object())
    assert m.run(lambda: 42) == 42


def test_loader_failure_leaves_nothing_loaded():
    m = ModelManager("cpu")

    def bad():
        raise FileNotFoundError("model repo not found")

    with pytest.raises(ApiError) as e:
        m.get("x", bad)
    assert e.value.code == "MODEL_NOT_INSTALLED"
    assert m.loaded is None
