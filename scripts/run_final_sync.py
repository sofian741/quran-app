#!/usr/bin/env python3
"""Run the final audio sync with conservative retries for the legacy QF API."""
from __future__ import annotations

import time
from urllib.error import HTTPError, URLError

import sync_qud_audio as base
import sync_final_reciters as final

_original_request_json = base.request_json


def request_json_with_retry(url: str):
    if not url.startswith(final.QF_BASE):
        return _original_request_json(url)
    last_error = None
    for attempt in range(6):
        try:
            return _original_request_json(url)
        except HTTPError as exc:
            last_error = exc
            if exc.code not in {429, 500, 502, 503, 504}:
                raise
        except URLError as exc:
            last_error = exc
        delay = min(20, 2 ** attempt)
        print(f"QF request retry {attempt + 1}/6 after {last_error}; sleeping {delay}s", flush=True)
        time.sleep(delay)
    raise last_error


base.request_json = request_json_with_retry
final.base.request_json = request_json_with_retry

if __name__ == "__main__":
    final.main()
