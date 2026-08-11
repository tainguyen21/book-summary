import asyncio
from collections.abc import Awaitable, Callable
from typing import cast

import boto3
import redis
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError

from bookwise.config import Settings

router = APIRouter()

HealthCheck = Callable[[Settings], Awaitable[None]]


class DependencyUnavailableError(Exception):
    """Raised when a required health dependency cannot be reached."""


async def check_database(settings: Settings) -> None:
    def run() -> None:
        engine = create_engine(settings.database_url)
        try:
            with engine.connect() as connection:
                connection.execute(text("SELECT 1"))
        finally:
            engine.dispose()

    try:
        await asyncio.to_thread(run)
    except SQLAlchemyError as error:
        raise DependencyUnavailableError from error


async def check_redis(settings: Settings) -> None:
    def run() -> None:
        client = redis.Redis.from_url(settings.redis_url)
        try:
            client.ping()
        finally:
            client.close()

    try:
        await asyncio.to_thread(run)
    except redis.RedisError as error:
        raise DependencyUnavailableError from error


async def check_storage(settings: Settings) -> None:
    def run() -> None:
        client = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint_url,
            aws_access_key_id=settings.s3_access_key_id,
            aws_secret_access_key=settings.s3_secret_access_key,
        )
        client.head_bucket(Bucket=settings.s3_bucket)

    try:
        await asyncio.to_thread(run)
    except (BotoCoreError, ClientError) as error:
        raise DependencyUnavailableError from error


def get_settings(request: Request) -> Settings:
    return cast(Settings, request.app.state.settings)


@router.get("/health/live")
def live() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/health/ready")
async def ready(request: Request) -> JSONResponse:
    settings = get_settings(request)
    checks: tuple[tuple[str, HealthCheck], ...] = (
        ("database", check_database),
        ("redis", check_redis),
        ("storage", check_storage),
    )
    components: dict[str, str] = {}

    for name, check in checks:
        try:
            await check(settings)
        except DependencyUnavailableError:
            components[name] = "unavailable"
        else:
            components[name] = "ok"

    if all(status == "ok" for status in components.values()):
        return JSONResponse({"status": "ok", "components": components})

    return JSONResponse(
        {"status": "unavailable", "components": components},
        status_code=503,
    )
