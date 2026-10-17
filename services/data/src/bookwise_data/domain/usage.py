"""Model usage records and configurable cost estimation."""

from __future__ import annotations

import json
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from enum import StrEnum

_COST_QUANTUM = Decimal("0.000001")
_TOKENS_PER_MILLION = Decimal(1_000_000)


class ModelPricingError(ValueError):
    """``BOOKWISE_MODEL_PRICING_JSON`` is malformed."""


class UsageOperation(StrEnum):
    """Which generation step a provider call served."""

    EVIDENCE = "evidence"
    SUMMARY = "summary"
    EMBEDDING = "embedding"


@dataclass(frozen=True, slots=True)
class ModelUsage:
    """Token counts reported by one successful provider call."""

    operation: UsageOperation
    provider: str
    model: str
    input_tokens: int
    output_tokens: int


# Providers call this after each successful request; it must not raise.
UsageSink = Callable[[ModelUsage], None]


@dataclass(frozen=True, slots=True)
class ModelPrice:
    """USD price per million input and output tokens for one model."""

    input_per_mtok: Decimal
    output_per_mtok: Decimal


def parse_model_pricing(raw: str) -> dict[str, ModelPrice]:
    """Parse ``{"model": {"input_per_mtok": n, "output_per_mtok": n}}`` JSON.

    An empty string means no prices are configured. Raises ``ValueError`` for
    malformed JSON, unknown shapes, or negative prices (``ModelPricingError``).
    """

    if not raw.strip():
        return {}
    try:
        document = json.loads(raw)
    except json.JSONDecodeError as error:
        raise ModelPricingError("pricing is not valid JSON") from error
    if not isinstance(document, dict):
        raise ModelPricingError("pricing must be a JSON object keyed by model")

    pricing: dict[str, ModelPrice] = {}
    for model, entry in document.items():
        if not isinstance(entry, dict):
            raise ModelPricingError(f"pricing for {model} must be an object")
        pricing[model] = ModelPrice(
            input_per_mtok=_price(entry, "input_per_mtok", model),
            output_per_mtok=_price(entry, "output_per_mtok", model),
        )
    return pricing


def estimate_cost(
    usage: ModelUsage,
    pricing: Mapping[str, ModelPrice],
) -> Decimal | None:
    """Estimated USD cost of one call, or ``None`` when the model has no price."""

    price = pricing.get(usage.model)
    if price is None:
        return None
    cost = (
        usage.input_tokens * price.input_per_mtok
        + usage.output_tokens * price.output_per_mtok
    ) / _TOKENS_PER_MILLION
    return cost.quantize(_COST_QUANTUM, rounding=ROUND_HALF_UP)


def _price(entry: Mapping[str, object], key: str, model: str) -> Decimal:
    value = entry.get(key)
    if isinstance(value, bool) or not isinstance(value, int | float | str):
        raise ModelPricingError(f"pricing for {model} needs a numeric {key}")
    try:
        price = Decimal(str(value))
    except InvalidOperation as error:
        raise ModelPricingError(f"pricing for {model} needs a numeric {key}") from error
    if not price.is_finite() or price < 0:
        raise ModelPricingError(f"pricing for {model} needs a non-negative {key}")
    return price
