"""
logger.py
---------
Sets up a rotating file logger + a coloured console handler.
Import `get_logger` and call it with __name__ in any module.
"""

import logging
import os
from logging.handlers import RotatingFileHandler

from flashsale.config import LOG_PATH


def _ensure_log_dir() -> None:
    """Make sure the logs directory exists before we try to write to it."""
    log_dir = os.path.dirname(LOG_PATH)
    os.makedirs(log_dir, exist_ok=True)


def setup_logging() -> None:
    """
    Called once at app startup.
    - File handler  : rotating, max 5 MB × 3 backups
    - Console handler: outputs to stdout with a short format
    """
    _ensure_log_dir()

    root = logging.getLogger()
    root.setLevel(logging.DEBUG)

    fmt = logging.Formatter(
        fmt="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    # ── Rotating file handler ────────────────────────────────────────────────
    fh = RotatingFileHandler(LOG_PATH, maxBytes=5 * 1024 * 1024, backupCount=3)
    fh.setLevel(logging.DEBUG)
    fh.setFormatter(fmt)

    # ── Console handler ──────────────────────────────────────────────────────
    ch = logging.StreamHandler()
    ch.setLevel(logging.INFO)
    ch.setFormatter(fmt)

    root.addHandler(fh)
    root.addHandler(ch)


def get_logger(name: str) -> logging.Logger:
    """Return a named logger (call with __name__)."""
    return logging.getLogger(name)
