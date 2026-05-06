FROM python:3.12-slim

ARG APP_VERSION=v1

ENV APP_VERSION=${APP_VERSION}
ENV FLASK_DEBUG=false
ENV FLASHSALE_DB_PATH=/data/flashsale.db
ENV FLASHSALE_LOG_PATH=/data/logs/flashsale.log
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /usr/src/app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY run.py ./
COPY flashsale ./flashsale

RUN mkdir -p /data/logs

EXPOSE 5000

CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "2", "--threads", "4", "--timeout", "60", "run:app"]
