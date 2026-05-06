# Flash Sale Resilient DevOps Control Panel

A complete local Minikube demo for traffic spikes, HPA autoscaling, real-time pod metrics, faulty deployment detection, automatic rollback, and incident notification in a custom React UI.

## Project Structure

```text
app/        Flask FlashSale workload with per-pod SQLite and v1/v2 health behavior
backend/    Express control API that reads kubectl metrics and controls k6
frontend/   Vite React dashboard
k8s/        Deployment, Service, and HPA manifests
scripts/    k6 load script and helper scripts
Jenkinsfile Jenkins rollback simulation
```

## Prerequisites

- Minikube
- kubectl
- Docker
- Node.js 18+ and npm
- Python 3.10+ for local app checks
- k6

No cloud services, Grafana, or Prometheus are required.

## 1. Start Minikube

```bash
minikube start --driver=docker --cpus=4 --memory=4096
```

## 2. Enable Metrics Server

```bash
minikube addons enable metrics-server
kubectl get deployment metrics-server -n kube-system
```

Metrics can take a minute or two to become available.

## 3. Build Docker Images Inside Minikube

```bash
eval $(minikube docker-env)

docker build --build-arg APP_VERSION=v1 -t myapp:v1 ./app
docker build --build-arg APP_VERSION=v2 -t myapp:v2 ./app
```

## 4. Apply Kubernetes Configs

```bash
kubectl apply -f k8s/
kubectl rollout status deployment/myapp
kubectl get pods
kubectl get hpa
```

Open the demo app directly:

```bash
minikube service myapp-service --url
```

## 5. Start Backend

Install dependencies once:

```bash
cd backend
npm install
```

Start the backend. Use the Minikube service URL as the k6 target. k6 posts real FlashSale purchases to `/buy`; `409 Out of stock` is expected once a pod's local stock is exhausted.

```bash
export LOAD_TARGET_URL=$(minikube service myapp-service --url)
export K6_VUS=20
export K6_RAMP_UP=45s
npm start
```

Backend runs at:

```text
http://localhost:4000
```

Useful backend checks:

```bash
curl http://localhost:4000/api/pods
curl http://localhost:4000/api/incident/latest
```

## 6. Start Frontend

In another terminal:

```bash
cd frontend
npm install
npm run dev
```

Open:

```text
http://localhost:5173
```

## 7. Run Load Test

From the dashboard, click **Chaos Mode**.

Or run k6 directly:

```bash
export TARGET_URL=$(minikube service myapp-service --url)
k6 run scripts/load.js
```

The workload uses per-pod SQLite. When HPA creates more pods, each pod starts with its own seeded product stock and order history. This keeps the demo lightweight, but it is not shared production persistence.

Watch metrics:

```bash
kubectl top pods
kubectl get hpa -w
kubectl get pods -w
```

HPA checks metrics on a delay, so CPU rises first and pods appear later.

## 8. Stop Load Test

From the dashboard, click **Cool Mode**.

Cool Mode stops the backend-managed k6 process and also cleans up leftover local k6 runs for this project's `scripts/load.js`. If k6 was started directly in a terminal, stop it with `Ctrl+C`.

HPA scale-down also takes time, so pods will reduce after CPU cools down. Metrics usually lag by 30-90 seconds. This project sets a short 30-second scale-down stabilization window in `k8s/hpa.yaml` so the demo contracts faster than the Kubernetes default.

If CPU stays high after Cool Mode, check for leftover k6 processes:

```bash
pgrep -af "k6|scripts/load.js"
```

Stop them if needed:

```bash
pkill -f "k6 run"
```

If HPA shows a value like `500%/55%`, that means the pod is using CPU relative to its request. This project requests `100m` CPU and limits pods to `500m`, so a pod using `500m` appears as `500%`.

## 9. Deploy Buggy Version

```bash
kubectl patch deployment myapp \
  -p '{"spec":{"template":{"spec":{"containers":[{"name":"myapp","image":"myapp:v2","env":[{"name":"APP_VERSION","value":"v2"},{"name":"FLASK_DEBUG","value":"false"},{"name":"FLASHSALE_DB_PATH","value":"/data/flashsale.db"},{"name":"FLASHSALE_LOG_PATH","value":"/data/logs/flashsale.log"}]}]}}}}'
kubectl rollout status deployment/myapp --timeout=60s
```

The v2 `/health` endpoint returns `500`, so probes and health checks should fail.

## 10. Rollback

Manual rollback:

```bash
kubectl rollout undo deployment/myapp
kubectl rollout status deployment/myapp
```

Send an incident to the dashboard:

```bash
bash scripts/simulate-incident.sh "$(git log -1 --pretty=format:%an)" v2 "Health check failed after deployment"
```

The dashboard will show the emergency deployment failure popup and auto-dismiss it after a few seconds.

## Jenkins Simulation

The `Jenkinsfile` builds the requested version, deploys it, checks rollout and `/health`, rolls back on failure, and posts an incident to the backend.

For a local manual simulation of the same behavior:

```bash
AUTHOR=$(git log -1 --pretty=format:%an 2>/dev/null || echo local-user)
VERSION=v2
BACKEND_URL=http://localhost:4000

kubectl patch deployment myapp \
  -p "{\"spec\":{\"template\":{\"spec\":{\"containers\":[{\"name\":\"myapp\",\"image\":\"myapp:${VERSION}\",\"env\":[{\"name\":\"APP_VERSION\",\"value\":\"${VERSION}\"},{\"name\":\"FLASK_DEBUG\",\"value\":\"false\"},{\"name\":\"FLASHSALE_DB_PATH\",\"value\":\"/data/flashsale.db\"},{\"name\":\"FLASHSALE_LOG_PATH\",\"value\":\"/data/logs/flashsale.log\"}]}]}}}}"

if ! kubectl rollout status deployment/myapp --timeout=60s; then
  kubectl rollout undo deployment/myapp
  curl -sS -X POST "${BACKEND_URL}/api/incident" \
    -H "Content-Type: application/json" \
    -d "{\"author\":\"${AUTHOR}\",\"version\":\"${VERSION}\",\"reason\":\"Rollout failed health probes\",\"action\":\"Auto rollback\",\"restored\":\"System restored to last stable version\"}"
fi
```

## API Reference

### `GET /api/pods`

Returns:

```json
{
  "pods": [
    {
      "name": "myapp-abc123",
      "cpu": 42,
      "memory": "96Mi",
      "status": "Running",
      "ready": "1/1",
      "restarts": 0
    }
  ],
  "mode": "cool",
  "targetUrl": "http://192.168.49.2:30080",
  "timestamp": "2026-05-06T00:00:00.000Z"
}
```

### `POST /api/mode`

```bash
curl -X POST http://localhost:4000/api/mode \
  -H "Content-Type: application/json" \
  -d '{"mode":"chaos"}'
```

```bash
curl -X POST http://localhost:4000/api/mode \
  -H "Content-Type: application/json" \
  -d '{"mode":"cool"}'
```

### `POST /api/incident`

```bash
curl -X POST http://localhost:4000/api/incident \
  -H "Content-Type: application/json" \
  -d '{"author":"Qayam","version":"v2","reason":"Health check failed"}'
```

### `GET /api/incident/latest`

```bash
curl http://localhost:4000/api/incident/latest
```

## Local App Health Check

```bash
cd app
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
APP_VERSION=v1 FLASHSALE_DB_PATH=/tmp/flashsale-local.db gunicorn --bind 127.0.0.1:5000 run:app
curl http://localhost:5000/health
curl http://localhost:5000/products
```

In another run:

```bash
APP_VERSION=v2 FLASHSALE_DB_PATH=/tmp/flashsale-local-v2.db gunicorn --bind 127.0.0.1:5000 run:app
curl -i http://localhost:5000/health
```

Expected: v1 returns `200`, v2 returns `500`.

FlashSale app endpoints:

```bash
curl http://localhost:5000/products
curl -X POST http://localhost:5000/buy \
  -H "Content-Type: application/json" \
  -d '{"product_id":1,"quantity":1}'
curl http://localhost:5000/orders
```
