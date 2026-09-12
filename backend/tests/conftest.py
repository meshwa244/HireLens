import os
import re

import pytest
import requests


def _load_base_url() -> str:
    url = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")
    if not url:
        env_path = "/app/frontend/.env"
        if os.path.exists(env_path):
            with open(env_path) as handle:
                content = handle.read()
            match = re.search(r"^EXPO_PUBLIC_BACKEND_URL=(.+)$", content, re.M)
            if match:
                url = match.group(1).strip().strip('"')
    if not url:
        raise RuntimeError("EXPO_PUBLIC_BACKEND_URL not configured")
    return url.rstrip("/")


BASE_URL = _load_base_url()


@pytest.fixture(scope="session")
def api_client():
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="session")
def base_url():
    return BASE_URL
