"""
run.py
------
Entry point.  Run with:

    python run.py

or via Flask CLI:

    flask --app run:app run --debug
"""

from flashsale import create_app

# Webhook trigger test commit
app = create_app()

if __name__ == "__main__":
# Intentionally broken indentation to trigger crash and rollback
app.run(host="0.0.0.0", port=5000, debug=True, threaded=True)
