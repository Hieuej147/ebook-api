from contextvars import ContextVar

current_auth_token: ContextVar[str | None] = ContextVar('auth_token', default=None)