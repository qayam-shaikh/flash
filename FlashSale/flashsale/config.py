"""
config.py
---------
Central configuration for the FlashSale app.
All settings are collected here so you only need to change one file.
"""

import os

# ── Paths ────────────────────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# SQLite database file lives inside the package
DATABASE_PATH = os.path.join(BASE_DIR, "flashsale.db")

# Log file location
LOG_PATH = os.path.join(BASE_DIR, "logs", "flashsale.log")

# ── Flask ────────────────────────────────────────────────────────────────────
SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-change-in-prod")
DEBUG = os.environ.get("FLASK_DEBUG", "true").lower() == "true"

# ── Flash-Sale rules ─────────────────────────────────────────────────────────
# Maximum units a single order can request
MAX_ORDER_QUANTITY = 10
