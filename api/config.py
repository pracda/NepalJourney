from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    ENV: str = "development"

    # Supabase
    SUPABASE_URL: str = ""
    SUPABASE_ANON_KEY: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""

    # JWT
    JWT_SECRET: str = ""
    JWT_ALGORITHM: str = "HS256"

    # LLM / speech providers
    ANTHROPIC_API_KEY: str = ""
    OPENAI_API_KEY: str = ""

    # Redis
    REDIS_URL: str = "redis://localhost:6379"

    # Cache TTLs (seconds)
    GUIDE_LIST_CACHE_TTL: int = 30    # short — availability changes must propagate fast
    GUIDE_MATCH_CACHE_TTL: int = 60   # embedding queries are expensive; slightly longer

    # CORS — comma-separated in env, parsed to a list
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:8081"

    # Rate limiting
    RATE_LIMIT_REQUESTS_PER_MINUTE: int = 60
    AI_RATE_LIMIT_REQUESTS_PER_MINUTE: int = 10

    # LLM retry / circuit breaker
    LLM_MAX_RETRIES: int = 3
    LLM_RETRY_BASE_DELAY: float = 1.0   # seconds; doubles each attempt
    LLM_TIMEOUT_SECONDS: float = 30.0

    # Email notifications via Resend (https://resend.com)
    RESEND_API_KEY: str = ""
    EMAIL_FROM: str = "Nepal Journey <noreply@nepaljourney.ai>"
    GUIDE_SUPPORT_EMAIL: str = "guides@nepaljourney.ai"

    # Observability
    SENTRY_DSN: str = ""

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    @property
    def is_production(self) -> bool:
        return self.ENV == "production"


settings = Settings()
