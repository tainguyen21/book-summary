from fastapi import FastAPI

from bookwise.api.routes.health import router as health_router
from bookwise.config import Settings, get_settings


def create_app(settings: Settings | None = None) -> FastAPI:
    app = FastAPI(title="Bookwise API")
    app.state.settings = settings or get_settings()
    app.include_router(health_router)
    return app
