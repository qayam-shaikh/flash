"""
models.py
---------
Data-access layer (thin wrapper around raw SQL).

Each function opens its *own* connection so Flask worker threads stay
independent.  All stock-decrement operations use a single atomic UPDATE
with a WHERE guard (stock >= quantity) to prevent negative stock — this is
the safe concurrent pattern without needing application-level locks.
"""

from datetime import datetime, timezone
from typing import Optional

from flashsale.database import get_connection
from flashsale.logger import get_logger

log = get_logger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Products
# ─────────────────────────────────────────────────────────────────────────────

def get_all_products() -> list[dict]:
    """Return every product as a list of plain dicts."""
    conn = get_connection()
    rows = conn.execute(
        "SELECT id, name, price, stock FROM products ORDER BY id;"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_product_by_id(product_id: int) -> Optional[dict]:
    """Return a single product dict or None if not found."""
    conn = get_connection()
    row = conn.execute(
        "SELECT id, name, price, stock FROM products WHERE id = ?;",
        (product_id,),
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def search_products(query: str) -> list[dict]:
    """Return products whose names match the search query (case-insensitive)."""
    conn = get_connection()
    # Using lower() and LIKE for a simple search
    rows = conn.execute(
        "SELECT id, name, price, stock FROM products WHERE LOWER(name) LIKE LOWER(?) ORDER BY id;",
        (f"%{query}%",),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ─────────────────────────────────────────────────────────────────────────────
# Orders
# ─────────────────────────────────────────────────────────────────────────────

def create_order(product_id: int, quantity: int) -> Optional[int]:
    """
    Atomically reduce stock and create an order record.

    Returns the new order id on success, or None if stock was insufficient.

    The key trick:
        UPDATE products SET stock = stock - ?
        WHERE id = ? AND stock >= ?

    SQLite processes this as a single statement.  If no row is updated
    (rowcount == 0) it means stock was already too low — we rollback and
    signal failure.  No negative stock is ever written.
    """
    conn = get_connection()
    now_iso = datetime.now(timezone.utc).isoformat()

    try:
        conn.execute("BEGIN;")

        # ── Atomic stock decrement (only if enough stock) ─────────────────
        cur = conn.execute(
            """
            UPDATE products
            SET    stock = stock - ?
            WHERE  id    = ?
              AND  stock >= ?;
            """,
            (quantity, product_id, quantity),
        )

        if cur.rowcount == 0:
            # Either product doesn't exist or stock is too low
            conn.execute("ROLLBACK;")
            log.warning(
                "Order FAILED — product_id=%s qty=%s (out of stock or not found)",
                product_id,
                quantity,
            )
            return None

        # ── Insert order record ───────────────────────────────────────────
        cur = conn.execute(
            """
            INSERT INTO orders (product_id, quantity, created_at)
            VALUES (?, ?, ?);
            """,
            (product_id, quantity, now_iso),
        )
        order_id = cur.lastrowid
        conn.execute("COMMIT;")

        log.info(
            "Order #%s created — product_id=%s qty=%s at %s",
            order_id,
            product_id,
            quantity,
            now_iso,
        )
        return order_id

    except Exception:
        conn.execute("ROLLBACK;")
        log.exception("Unexpected error in create_order; transaction rolled back.")
        raise
    finally:
        conn.close()


def get_all_orders() -> list[dict]:
    """Return all orders joined with product name."""
    conn = get_connection()
    rows = conn.execute(
        """
        SELECT  o.id,
                o.product_id,
                p.name  AS product_name,
                o.quantity,
                o.created_at
        FROM    orders   o
        JOIN    products p ON p.id = o.product_id
        ORDER BY o.id DESC;
        """
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]
