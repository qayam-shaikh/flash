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
    # threaded=True lets Flask handle multiple requests concurrently,
    # which exercises our atomic stock-decrement logic.
    app.run(host="0.0.0.0", port=5000, debug=True, threaded=True)
