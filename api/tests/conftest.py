"""Shared test fixtures: an in-memory fake of the Supabase query-builder
chain (table().select/insert/update/upsert().eq().limit().execute()) so
agent logic can be tested without a real Postgres/Supabase instance.
"""

import uuid
from dataclasses import dataclass, field

import pytest


@dataclass
class FakeResult:
    data: object


class FakeQuery:
    def __init__(self, rows: list[dict], op: str, payload=None):
        self._rows = rows
        self._op = op
        self._payload = payload
        self._filters: list[tuple[str, object]] = []
        self._limit: int | None = None
        self._single = False
        self._on_conflict: str | None = None

    def eq(self, column: str, value):
        self._filters.append((column, value))
        return self

    def limit(self, n: int):
        self._limit = n
        return self

    def single(self):
        self._single = True
        return self

    def order(self, *_args, **_kwargs):
        return self

    def contains(self, *_args, **_kwargs):
        return self

    def ilike(self, *_args, **_kwargs):
        return self

    def _matches(self, row: dict) -> bool:
        return all(row.get(col) == val for col, val in self._filters)

    def execute(self) -> FakeResult:
        if self._op == "select":
            matched = [r for r in self._rows if self._matches(r)]
            if self._single:
                # Mirrors supabase-py: .single() unwraps to a dict, not a list.
                return FakeResult(matched[0] if matched else None)
            if self._limit is not None:
                matched = matched[: self._limit]
            return FakeResult(matched)

        if self._op == "insert":
            payloads = self._payload if isinstance(self._payload, list) else [self._payload]
            inserted = []
            for p in payloads:
                row = {**p}
                row.setdefault("id", str(uuid.uuid4()))
                self._rows.append(row)
                inserted.append(row)
            return FakeResult(inserted)

        if self._op == "update":
            matched = [r for r in self._rows if self._matches(r)]
            for r in matched:
                r.update(self._payload)
            return FakeResult(matched)

        if self._op == "upsert":
            key = self._on_conflict
            existing = next((r for r in self._rows if key and r.get(key) == self._payload.get(key)), None)
            if existing is not None:
                existing.update(self._payload)
                return FakeResult([existing])
            row = {**self._payload}
            self._rows.append(row)
            return FakeResult([row])

        raise NotImplementedError(self._op)


class FakeTableHandle:
    def __init__(self, rows: list[dict]):
        self._rows = rows

    def select(self, *_args, **_kwargs) -> FakeQuery:
        return FakeQuery(self._rows, "select")

    def insert(self, payload) -> FakeQuery:
        return FakeQuery(self._rows, "insert", payload)

    def update(self, payload) -> FakeQuery:
        return FakeQuery(self._rows, "update", payload)

    def upsert(self, payload, on_conflict: str | None = None) -> FakeQuery:
        query = FakeQuery(self._rows, "upsert", payload)
        query._on_conflict = on_conflict
        return query


@dataclass
class FakeSupabase:
    tables: dict[str, list[dict]] = field(default_factory=dict)

    def table(self, name: str) -> FakeTableHandle:
        return FakeTableHandle(self.tables.setdefault(name, []))

    def rpc(self, *_args, **_kwargs) -> FakeQuery:
        return FakeQuery([], "select")


@pytest.fixture
def fake_supabase() -> FakeSupabase:
    return FakeSupabase()
