"""File heartbeat for the worker's Kubernetes liveness probe.

The worker has no HTTP server, so it touches a file on every poll and every
lease heartbeat; the probe fails when the file stops changing, which means
the loop is stuck, and Kubernetes restarts the container.
"""

from __future__ import annotations

import os
from pathlib import Path

_PATH = Path(
    os.environ.get("BOOKWISE_WORKER_LIVENESS_FILE", "/tmp/bookwise-worker-alive")
)


def mark_alive() -> None:
    """Record that the worker loop is still making progress."""

    try:
        _PATH.touch()
    except OSError:
        # A read-only or missing directory must never stop processing.
        pass
