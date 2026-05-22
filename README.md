# CI/CD Pipeline Assignment — Sample App

A production-grade CI/CD pipeline that builds, tests, and deploys a
containerized Node.js application to Kubernetes via Jenkins.

---

## Project Structure

```
.
├── app/
│   ├── app.js              # Express application with Prometheus metrics
│   ├── app.test.js         # Jest test suite (/, /health, /metrics)
│   ├── Dockerfile          # Multi-stage Docker build (non-root user)
│   ├── package.json
│   ├── package-lock.json
│   ├── .env.example
│   └── .dockerignore
├── jenkins/
│   └── Jenkinsfile         # Declarative CI/CD pipeline (6 stages)
├── k8s/
│   ├── deployment.yaml     # Kubernetes Deployment (2 replicas, rolling update)
│   └── service.yaml        # NodePort Service (port 30080)
├── monitoring/
│   ├── prometheus.yml          # Prometheus scrape config (Kubernetes)
│   ├── prometheus-local.yml    # Prometheus scrape config (local docker-compose)
│   ├── grafana-provisioning/
│   │   ├── datasources/datasource.yml
│   │   └── dashboards/dashboard.yml
│   └── grafana-dashboards/
│       └── sample-app.json # Grafana dashboard
├── docker-compose.monitoring.yml
└── README.md
```

---

## Quick Start (Local)

### 1. Run the app
```bash
cd app
npm install
npm start
# http://localhost:3000
```

### 2. Run tests
```bash
npm test
```

### 3. Build and run with Docker
```bash
cd app
docker build -t sample-app .
docker run -p 3000:3000 sample-app
```

### 4. Local monitoring stack
```bash
docker compose -f docker-compose.monitoring.yml up -d
# App:        http://localhost:3000
# Prometheus: http://localhost:9090
# Grafana:    http://localhost:3001  (admin/admin)
```

---

## Application Endpoints

| Endpoint | Description |
|---|---|
| `GET /` | App info — hostname, version, PID |
| `GET /health` | Liveness/readiness probe — status, uptime, timestamp |
| `GET /metrics` | Prometheus metrics in text exposition format |

### Exposed Metrics

| Metric | Type | Description |
|---|---|---|
| `sample_app_http_requests_total` | Counter | Total HTTP requests by method, route, status code |
| `sample_app_http_request_duration_seconds` | Histogram | Request latency in seconds |
| `sample_app_active_requests` | Gauge | In-flight requests at any moment |
| `sample_app_nodejs_*` | Various | Heap, GC, event loop, active handles (built-in) |

---

## CI/CD Pipeline (Jenkins)

### Prerequisites

| Item | Details |
|---|---|
| Jenkins | v2.400+ with Pipeline, Docker Pipeline, Kubernetes, Credentials Binding plugins |
| Credential | `DOCKER_CREDS_ID` — Docker Hub username/password |
| Credential | `KUBECONFIG_CREDENTIALS_ID` — kubeconfig secret file (for K8s deploy) |
| Agent | Kubernetes agent with `docker:24-dind` sidecar (configured in Jenkinsfile) |

### Pipeline Stages

```
Checkout → Build → Test → Security Scan → Push Image → Deploy to Kubernetes
```

| Stage | What it does |
|---|---|
| Checkout | Pulls latest code; logs branch, build number, git SHA |
| Build | Multi-stage Docker build; tagged `<build_number>-<git_sha>` |
| Test | Runs Jest inside an ephemeral Node container |
| Security Scan | Trivy scans image for HIGH/CRITICAL CVEs before push |
| Push Image | Pushes to Docker Hub; also tags `latest` on `main` branch |
| Deploy to K8s | Injects image tag into `deployment.yaml` via `sed`, applies via `kubectl` |

### Jenkins Setup

1. Create a new **Pipeline** job in Jenkins.
2. Set **Pipeline script from SCM** → point to this repository.
3. Set **Script Path** to `jenkins/Jenkinsfile`.
4. Add credentials in **Manage Jenkins > Credentials**:
   - `DOCKER_CREDS_ID` — Docker Hub (`nidhey27`)
   - `KUBECONFIG_CREDENTIALS_ID` — kubeconfig secret file for EKS

### Build Parameters

Each stage can be toggled independently via checkboxes at build time:

| Parameter | Default | Purpose |
|---|---|---|
| `RUN_BUILD` | `true` | Build Docker image |
| `RUN_TEST` | `true` | Run Jest tests |
| `RUN_SECURITY_SCAN` | `true` | Trivy CVE scan |
| `RUN_PUSH` | `true` | Push image to Docker Hub |
| `RUN_DEPLOY` | `false` | Deploy to Kubernetes (requires kubeconfig) |

---

## EKS Deployment Decision

> **Why EKS is not live-deployed in this assignment:**
>
> AWS EKS (Elastic Kubernetes Service) is a paid service. Running even a minimal
> cluster (control plane + 2 worker nodes) costs approximately **$0.10/hour for
> the control plane** plus EC2 instance costs — roughly $150–200/month for a
> demo cluster. For an assignment submission, incurring this cost is not
> justified.
>
> **What is provided instead:**
> - `k8s/deployment.yaml` — production-ready Deployment manifest with rolling
>   updates, liveness/readiness probes, resource limits, and Prometheus
>   annotations. The `IMAGE_PLACEHOLDER` field is substituted at deploy time by
>   the Jenkins pipeline using `sed`.
> - `k8s/service.yaml` — NodePort Service on port `30080`. Change `type` to
>   `LoadBalancer` on EKS to automatically provision an AWS ELB.
>
> **To deploy on a real EKS cluster:**
> ```bash
> export IMAGE=nidhey27/sample-app:latest
> sed "s|IMAGE_PLACEHOLDER|${IMAGE}|g" k8s/deployment.yaml | kubectl apply -f -
> kubectl apply -f k8s/service.yaml
> kubectl rollout status deployment/sample-app
> kubectl get svc sample-app-svc
> ```

---

## Kubernetes Manifests

### Key features configured

| Feature | Detail |
|---|---|
| Rolling update | `maxSurge: 1, maxUnavailable: 0` — zero downtime deploys |
| Liveness probe | Restarts stuck pods automatically |
| Readiness probe | No traffic sent until pod passes health check |
| Resource limits | CPU 250m / Memory 256Mi — prevents noisy-neighbour issues |
| Prometheus annotations | Pods auto-scraped by Prometheus on `/metrics` port 3000 |
| Service type | `NodePort` on port `30080` — no cloud provider needed for demo. Change to `LoadBalancer` on EKS to get an AWS ELB automatically. |

---

## Monitoring

### Local Stack

```bash
docker compose -f docker-compose.monitoring.yml up -d
```

Prometheus scrapes the app at `http://app:3000/metrics` using `prometheus-local.yml`.
Grafana datasource and dashboard are auto-provisioned on startup — no manual setup needed.

### Grafana Dashboard (`monitoring/grafana-dashboards/sample-app.json`)

| Panel | Metric |
|---|---|
| App Health | `up{job='sample-app'}` |
| Active Requests | `sample_app_active_requests` |
| Heap Used (MB) | `sample_app_nodejs_heap_size_used_bytes` |
| Process Memory RSS | `sample_app_process_resident_memory_bytes` |
| CPU Usage | `rate(sample_app_process_cpu_seconds_total[1m])` |
| HTTP Request Rate | `rate(sample_app_http_requests_total[1m])` |
| Request Latency p99 | `histogram_quantile(0.99, ...)` |
| Event Loop Lag | `rate(sample_app_nodejs_eventloop_lag_seconds[1m])` |

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | App listening port |
| `APP_VERSION` | `1.0.0` | Version string returned in `/` response |

---

## Git Repository

```
https://github.com/nidhey27/immverse-ai-assignment
```

---

## Write-up: CI/CD Pipeline Steps

### Step 1 — Source Code Management
GitHub repository with the Node.js application, Dockerfile, test suite, and all
pipeline configuration. Branch protection on `main` ensures all changes go
through the full Jenkins pipeline before merging.

### Step 2 — Dockerize the Application
Multi-stage Dockerfile: a `builder` stage installs only production dependencies,
then a clean `runtime` stage copies only what is needed. App runs as a non-root
user (`appuser`). A `HEALTHCHECK` instruction lets Docker and Kubernetes detect
unhealthy containers automatically.

### Step 3 — CI Pipeline (Jenkins)
Declarative Jenkinsfile with six stages running on a Kubernetes pod agent with a
Docker-in-Docker sidecar. Images are tagged with both the Jenkins build number
and the short git SHA for full traceability. Each stage can be toggled via build
parameters. `disableConcurrentBuilds(abortPrevious: true)` cancels stale builds
when a new commit is pushed, preventing out-of-order deploys.

### Step 4 — Container Registry
Images are pushed to Docker Hub (`nidhey27/sample-app`) using Jenkins credentials
injected at runtime — never hardcoded in source. The `main` branch also gets a
`latest` tag. For production, the registry URL and credential can be swapped to
Amazon ECR with no changes to pipeline logic.

### Step 5 — Deployment
Deployment targets Kubernetes with 2 replicas and a `RollingUpdate` strategy so
there is always at least one healthy pod serving traffic during a release. The
image tag is injected at deploy time via `sed`, keeping the manifest file static
and the pipeline the single source of truth for which image version is running.

### Step 6 — Monitoring
Prometheus scrapes the app on `/metrics` via pod annotations (Kubernetes) or
static config (local). The app exposes custom metrics — request count, latency
histogram, active requests — via `prom-client` plus built-in Node.js runtime
metrics. Grafana datasource and dashboard are auto-provisioned, requiring no
manual setup.
