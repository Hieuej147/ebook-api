import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncIterator
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.checkpoint.memory import MemorySaver
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver


def _driver() -> str:
    configured = os.getenv("STORE_DRIVER")
    if configured:
        return configured.lower()
    return "postgres" if os.getenv("DATABASE_URL") else "sqlite"


def _psycopg_url(database_url: str) -> str:
    """Translate Prisma's `?schema=` option into psycopg's search_path."""
    parsed = urlsplit(database_url)
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    schema = query.pop("schema", None) or os.getenv("PG_SCHEMA")
    if schema and schema != "public":
        query["options"] = f"-csearch_path={schema}"
    return urlunsplit(
        (parsed.scheme, parsed.netloc, parsed.path, urlencode(query), parsed.fragment)
    )


@asynccontextmanager
async def create_checkpointer() -> AsyncIterator[
    tuple[BaseCheckpointSaver, dict[str, str]]
]:
    """Create the LangGraph saver from the same env driver used by Nest."""
    driver = _driver()

    if driver == "memory":
        yield MemorySaver(), {"driver": "memory"}
        return

    if driver == "postgres":
        database_url = os.getenv("DATABASE_URL")
        if not database_url:
            raise RuntimeError(
                "DATABASE_URL is required when STORE_DRIVER=postgres"
            )
        async with AsyncPostgresSaver.from_conn_string(
            _psycopg_url(database_url)
        ) as saver:
            await saver.setup()
            yield saver, {"driver": "postgres"}
        return

    if driver != "sqlite":
        raise RuntimeError(
            "STORE_DRIVER must be one of: memory, sqlite, postgres"
        )

    default_path = (
        Path(__file__).resolve().parent.parent
        / ".data"
        / "conversation-threads.sqlite"
    )
    sqlite_path = Path(
        os.getenv("SQLITE_PATH", str(default_path))
    ).expanduser().resolve()
    sqlite_path.parent.mkdir(parents=True, exist_ok=True)
    async with AsyncSqliteSaver.from_conn_string(str(sqlite_path)) as saver:
        await saver.setup()
        yield saver, {"driver": "sqlite", "sqlitePath": str(sqlite_path)}
