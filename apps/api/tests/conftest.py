import os
import tempfile
from pathlib import Path

# Configure an isolated database and the offline agent before the app is imported.
_db = Path(tempfile.mkdtemp()) / "test.db"
os.environ["LEADFLOW_DATABASE_URL"] = f"sqlite+aiosqlite:///{_db.as_posix()}"
os.environ["LEADFLOW_SEED_DEMO_DATA"] = "false"
os.environ["LEADFLOW_ANTHROPIC_API_KEY"] = ""
os.environ["ANTHROPIC_API_KEY"] = ""
for _k in ("LEADFLOW_GEMINI_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY"):
    os.environ[_k] = ""

import pytest_asyncio  # noqa: E402

from leadflow.db import init_db  # noqa: E402


@pytest_asyncio.fixture(autouse=True, scope="session", loop_scope="session")
async def _database():
    await init_db()
    yield
