"""Application settings, loaded from environment variables and an optional `.env` file."""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

API_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(API_ROOT / ".env", ".env"),
        env_prefix="LEADFLOW_",
        extra="ignore",
        populate_by_name=True,
    )

    # --- server ---
    host: str = "127.0.0.1"
    port: int = 8000
    reload: bool = False
    log_level: str = "info"
    cors_origins: list[str] = Field(
        default_factory=lambda: ["http://localhost:5173", "http://127.0.0.1:5173"]
    )
    # Built React dashboard; served at "/" when present.
    web_dist: Path = API_ROOT.parent / "web" / "dist"

    # --- database ---
    # SQLite works out of the box; use postgresql+asyncpg://user:pass@host/db in production.
    database_url: str = f"sqlite+aiosqlite:///{(API_ROOT / 'leadflow.db').as_posix()}"
    seed_demo_data: bool = True

    # --- LLM ---
    # "auto" picks Claude if an Anthropic key is set, else Gemini if a Google key is set.
    # Without any key the agent runs on a deterministic built-in policy (same tools, same graph).
    llm_provider: Literal["auto", "anthropic", "gemini", "none"] = "auto"
    anthropic_api_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices("LEADFLOW_ANTHROPIC_API_KEY", "ANTHROPIC_API_KEY"),
    )
    anthropic_base_url: str = "https://api.anthropic.com"
    anthropic_model: str = "claude-opus-5"
    gemini_api_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices(
            "LEADFLOW_GEMINI_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY"
        ),
    )
    gemini_model: str = "gemini-3.5-flash"
    llm_max_tokens: int = 16000

    # --- business rules ---
    company_name: str = "LeadFlow AI"
    business_timezone: str = "UTC"
    business_start_hour: int = 9
    business_end_hour: int = 17
    meeting_minutes: int = 30
    booking_horizon_days: int = 10
    qualified_score: int = 60

    # --- email (optional; emails are recorded in the outbox either way) ---
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_from: str = "LeadFlow AI <agent@leadflow.local>"
    smtp_starttls: bool = True

    @property
    def llm_brain(self) -> Literal["claude", "gemini"] | None:
        """Which LLM drives the agent, or None for the built-in policy."""
        wants = self.llm_provider
        if wants in ("auto", "anthropic") and self.anthropic_api_key:
            return "claude"
        if wants in ("auto", "gemini") and self.gemini_api_key:
            return "gemini"
        return None

    @property
    def llm_enabled(self) -> bool:
        return self.llm_brain is not None

    @property
    def llm_model(self) -> str | None:
        return {"claude": self.anthropic_model, "gemini": self.gemini_model}.get(
            self.llm_brain or ""
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
