"""
routes.py
---------
All HTTP endpoints for the FlashSale API.

Endpoints
---------
GET  /                  → Simple HTML dashboard (browser-friendly)
GET  /products          → JSON list of all products
GET  /products/<id>     → JSON single product
POST /buy               → Place an order  (JSON body required)
GET  /orders            → JSON list of all orders (admin view)
"""

import os

from flask import Blueprint, jsonify, request

from flashsale import models
from flashsale.config import MAX_ORDER_QUANTITY
from flashsale.logger import get_logger

log = get_logger(__name__)

bp = Blueprint("main", __name__)


@bp.route("/health", methods=["GET"])
def health():
    """Kubernetes probe endpoint. v2 intentionally fails for rollback demos."""
    version = os.environ.get("APP_VERSION", "v1")
    if version == "v2":
        return jsonify({
            "status": "unhealthy",
            "version": version,
            "reason": "Intentional v2 failure for rollback demo",
        }), 500

    return jsonify({"status": "ok", "version": version}), 200


# ─────────────────────────────────────────────────────────────────────────────
# Dashboard (browser-friendly HTML)
# ─────────────────────────────────────────────────────────────────────────────

@bp.route("/", methods=["GET"])
def index():
    """Simple HTML page showing current products."""
    from flask import render_template
    products = models.get_all_products()
    return render_template("index.html", products=products)


@bp.route("/profile", methods=["GET"])
def profile():
    """User profile page."""
    from flask import render_template
    return render_template("profile.html")


# ─────────────────────────────────────────────────────────────────────────────
# Products
# ─────────────────────────────────────────────────────────────────────────────

@bp.route("/products", methods=["GET"])
def list_products():
    """
    GET /products
    Returns all products with their current stock levels.

    Response 200:
        [
          {"id": 1, "name": "...", "price": 29.99, "stock": 50},
          ...
        ]
    """
    log.info("GET /products requested from %s", request.remote_addr)
    products = models.get_all_products()
    return jsonify(products), 200


@bp.route("/products/<int:product_id>", methods=["GET"])
def get_product(product_id: int):
    """
    GET /products/<id>
    Returns a single product.

    Response 200: {"id": 1, "name": "...", "price": 29.99, "stock": 50}
    Response 404: {"error": "Product not found"}
    """
    log.info("GET /products/%s requested from %s", product_id, request.remote_addr)
    product = models.get_product_by_id(product_id)
    if product is None:
        return jsonify({"error": "Product not found"}), 404
    return jsonify(product), 200


# ─────────────────────────────────────────────────────────────────────────────
# Buy  (core flash-sale logic)
# ─────────────────────────────────────────────────────────────────────────────

@bp.route("/buy", methods=["POST"])
def buy():
    """
    POST /buy
    Place an order for a product.

    Request body (JSON):
        {"product_id": 1, "quantity": 2}

    Response 201 (success):
        {
          "message": "Order placed successfully",
          "order_id": 42,
          "product": "Wireless Earbuds – Flash Deal",
          "quantity": 2,
          "remaining_stock": 48
        }

    Response 400 (bad request):
        {"error": "<reason>"}

    Response 404 (product not found):
        {"error": "Product not found"}

    Response 409 (out of stock):
        {"error": "Out of stock", "available": 0}
    """
    log.info("POST /buy from %s", request.remote_addr)

    # ── 1. Parse & validate JSON body ────────────────────────────────────────
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    product_id = data.get("product_id")
    quantity   = data.get("quantity", 1)

    if product_id is None:
        return jsonify({"error": "Missing required field: product_id"}), 400

    if not isinstance(product_id, int) or product_id < 1:
        return jsonify({"error": "product_id must be a positive integer"}), 400

    if not isinstance(quantity, int) or quantity < 1:
        return jsonify({"error": "quantity must be a positive integer"}), 400

    if quantity > MAX_ORDER_QUANTITY:
        return jsonify(
            {"error": f"quantity cannot exceed {MAX_ORDER_QUANTITY} per order"}
        ), 400

    # ── 2. Check product exists ───────────────────────────────────────────────
    product = models.get_product_by_id(product_id)
    if product is None:
        return jsonify({"error": "Product not found"}), 404

    # ── 3. Check stock (pre-flight — real check is atomic in create_order) ───
    if product["stock"] == 0:
        log.warning("Product %s is out of stock", product_id)
        return jsonify({"error": "Out of stock", "available": 0}), 409

    # ── 4. Attempt atomic purchase ────────────────────────────────────────────
    order_id = models.create_order(product_id, quantity)

    if order_id is None:
        # Stock was exhausted between the pre-flight check and the UPDATE
        product = models.get_product_by_id(product_id)   # refresh
        available = product["stock"] if product else 0
        return jsonify({"error": "Out of stock", "available": available}), 409

    # ── 5. Return success payload ─────────────────────────────────────────────
    updated = models.get_product_by_id(product_id)
    return jsonify(
        {
            "message":         "Order placed successfully",
            "order_id":        order_id,
            "product":         product["name"],
            "quantity":        quantity,
            "remaining_stock": updated["stock"],
        }
    ), 201


# ─────────────────────────────────────────────────────────────────────────────
# Orders (admin view)
# ─────────────────────────────────────────────────────────────────────────────

@bp.route("/orders", methods=["GET"])
def list_orders():
    """
    GET /orders
    Returns all placed orders (most-recent first).
    """
    log.info("GET /orders requested from %s", request.remote_addr)
    orders = models.get_all_orders()
    return jsonify(orders), 200
