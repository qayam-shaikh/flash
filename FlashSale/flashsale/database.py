"""
database.py
-----------
Low-level SQLite helpers.

Design choices:
- check_same_thread=False  → Flask can reuse the connection across threads
  (safe here because we use an explicit BEGIN / COMMIT / ROLLBACK pattern).
- Row factory = sqlite3.Row  → rows behave like dicts (row["name"] works).
"""

import sqlite3

from flashsale.config import DATABASE_PATH
from flashsale.logger import get_logger

log = get_logger(__name__)


def get_connection() -> sqlite3.Connection:
    """
    Open (or create) the SQLite database and return a connection.
    The connection uses WAL journal mode for better concurrency.
    """
    conn = sqlite3.connect(DATABASE_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row          # dict-like access
    conn.execute("PRAGMA journal_mode=WAL;")  # better concurrent reads
    conn.execute("PRAGMA foreign_keys=ON;")   # enforce FK constraints
    return conn


def init_db() -> None:
    """
    Create tables and seed sample products if the database is empty.
    Safe to call multiple times — uses CREATE TABLE IF NOT EXISTS.
    """
    log.info("Initialising database at %s", DATABASE_PATH)
    conn = get_connection()
    with conn:
        # ── products table ───────────────────────────────────────────────────
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS products (
                id    INTEGER PRIMARY KEY AUTOINCREMENT,
                name  TEXT    NOT NULL,
                price REAL    NOT NULL CHECK(price >= 0),
                stock INTEGER NOT NULL CHECK(stock >= 0)
            );
            """
        )

        # ── orders table ─────────────────────────────────────────────────────
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS orders (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id  INTEGER NOT NULL REFERENCES products(id),
                quantity    INTEGER NOT NULL CHECK(quantity > 0),
                created_at  TEXT    NOT NULL   -- stored as ISO-8601 string
            );
            """
        )

        # ── seed data (only if products table is empty) ──────────────────────
        row_count = conn.execute("SELECT COUNT(*) FROM products;").fetchone()[0]
        if row_count == 0:
            log.info("Seeding sample products …")
            sample_products = [
                ("Wireless Earbuds – Flash Deal",  29.99, 50),
                ("USB-C Hub 7-in-1",               19.99, 30),
                ("Mechanical Keyboard",            89.99, 20),
                ("LED Gaming Mouse",               24.99, 100),
                ("Portable Power Bank 20000mAh",   34.99,  5),
            ]
            conn.executemany(
                "INSERT INTO products (name, price, stock) VALUES (?, ?, ?);",
                sample_products,
            )
            log.info("Seeded %d products.", len(sample_products))
    conn.close()
