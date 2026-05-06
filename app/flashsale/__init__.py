"""
flashsale/__init__.py
---------------------
Application factory.  Import and call create_app() to get a Flask instance.

Using the factory pattern makes it easy to:
  - Run with different configs (test vs. prod)
  - Avoid circular imports
"""

from flask import Flask

from flashsale.config import DEBUG, SECRET_KEY
from flashsale.database import init_db
from flashsale.logger import setup_logging


def create_app() -> Flask:
    """Create and configure the Flask application."""

    # ── Logging (do this first so everything below is captured) ──────────────
    setup_logging()

    app = Flask(__name__, template_folder="templates", static_folder="static")
    app.secret_key = SECRET_KEY
    app.config["DEBUG"] = DEBUG

    # ── Database setup ────────────────────────────────────────────────────────
    with app.app_context():
        init_db()

    # ── Register blueprints ───────────────────────────────────────────────────
    from flashsale.routes import bp
    app.register_blueprint(bp)

    # ── Generic error handlers ────────────────────────────────────────────────
    from flask import jsonify

    @app.errorhandler(404)
    def not_found(e):
        return jsonify({"error": "Endpoint not found"}), 404

    @app.errorhandler(405)
    def method_not_allowed(e):
        return jsonify({"error": "Method not allowed"}), 405

    @app.errorhandler(500)
    def internal_error(e):
        return jsonify({"error": "Internal server error"}), 500

    return app
