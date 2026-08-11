from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: str = "development"
    database_url: str
    redis_url: str
    s3_endpoint_url: str
    s3_bucket: str
    s3_access_key_id: str
    s3_secret_access_key: str
    oidc_issuer: str
    oidc_audience: str


@lru_cache
def get_settings() -> Settings:
    return Settings()
