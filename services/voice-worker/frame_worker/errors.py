"""Voice API error model: {"error": {"code", "message", "details"}} (SRS §5)."""

from __future__ import annotations

from typing import Any

CODES = {
    "UNAUTHORIZED": 401,
    "NOT_FOUND": 404,
    "UNSUPPORTED_CONTROL": 422,
    "TEXT_TOO_LONG": 422,
    "REFERENCE_TOO_SHORT": 422,
    "LANGUAGE_UNSUPPORTED": 422,
    "MODEL_NOT_INSTALLED": 503,
    "OUT_OF_MEMORY": 507,
    "BUSY": 429,
    "CANCELLED": 409,
    "ENGINE_ERROR": 500,
    "INVALID_AUDIO": 422,
    "INVALID_REQUEST": 400,
}


class ApiError(Exception):
    def __init__(self, code: str, message: str, details: Any = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = details

    @property
    def status(self) -> int:
        return CODES.get(self.code, 500)

    def body(self) -> dict:
        err: dict[str, Any] = {"code": self.code, "message": self.message}
        if self.details is not None:
            err["details"] = self.details
        return {"error": err}
