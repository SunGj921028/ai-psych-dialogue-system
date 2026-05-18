from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class FakeMessage:
    content: str | None


@dataclass
class FakeChoice:
    message: FakeMessage


@dataclass
class FakeResponse:
    choices: list[FakeChoice]


class FakeCompletions:
    def __init__(self, client: FakeLLMClient) -> None:
        self._client = client

    async def create(self, **kwargs: Any) -> FakeResponse:
        self._client.create_calls.append(kwargs)
        if self._client.exc is not None:
            raise self._client.exc
        return FakeResponse(choices=[FakeChoice(message=FakeMessage(self._client.content))])


class FakeChat:
    def __init__(self, client: FakeLLMClient) -> None:
        self.completions = FakeCompletions(client)


class FakeLLMClient:
    def __init__(self, content: str | None = "", exc: Exception | None = None) -> None:
        self.content = content
        self.exc = exc
        self.calls: list[dict[str, Any]] = []
        self.create_calls: list[dict[str, Any]] = []
        self.chat = FakeChat(self)

    def __call__(self, provider: str = "default") -> FakeLLMClient:
        self.calls.append({"provider": provider})
        return self
