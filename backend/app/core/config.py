from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # App
    APP_NAME: str = "Mnemo"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = True
    API_PREFIX: str = "/api/v1"
    AUTO_CREATE_TABLES: bool = True

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://mti_user:MTI_Secure_2026!@localhost:5432/mti_assistant"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # JWT
    JWT_SECRET: str = "mnemo_jwt_secret_2026_change_in_prod"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    # API Keys
    DASHSCOPE_API_KEY: str = ""
    DEEPSEEK_API_KEY: str = ""
    MINIMAX_API_KEY: str = ""

    # CORS
    CORS_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://106.53.10.184",
        "http://106.53.10.184:3000",
    ]

    class Config:
        env_file = ".env"
        case_sensitive = True


@lru_cache
def get_settings() -> Settings:
    return Settings()
