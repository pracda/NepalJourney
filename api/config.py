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

    # CORS - comma separated in env, parsed to a list here
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:8081"

    # Rate limiting
    RATE_LIMIT_REQUESTS_PER_MINUTE: int = 60
    AI_RATE_LIMIT_REQUESTS_PER_MINUTE: int = 10

    # Observability
    SENTRY_DSN: str = ""

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]


settings = Settings()
