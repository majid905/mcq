# Monitoring

The API exposes Prometheus metrics at `GET /metrics` (outside `/v1`; nginx only proxies `/v1`, `/docs` and
`/openapi.json`, so it is not reachable from the internet). Set `METRICS_TOKEN` in the API environment to also
require `Authorization: Bearer <token>`.

What it reports (`apps/api/src/metrics/`):

* `mcq_http_request_duration_seconds` histogram by `method`, `route` (template such as `/v1/exams/:id/start`, never a real id) and `status`.
* `mcq_queue_backlog{queue}` and `mcq_queue_oldest_age_seconds{queue}` for `submit` (scoring), `stats` and `import`. The oldest age of `submit` is the scoring lag.
* `mcq_redis_memory_used_ratio`, `mcq_redis_up`, `mcq_database_up`.
* Node process metrics (CPU, heap, event-loop lag, GC) with the prefix `mcq_`.

## Start it

```bash
cd deploy/monitoring
GRAFANA_PASSWORD='choose-one' docker compose up -d
ssh -L 3100:127.0.0.1:3100 -L 9090:127.0.0.1:9090 user@server      # then open http://localhost:3100 (admin / your password)
```

Everything binds to `127.0.0.1`; do not publish Grafana without a login proxy. Dashboard "MCQ platform: overview" is provisioned
automatically (`grafana/dashboards/mcq-overview.json`, regenerate by editing the JSON in Grafana and exporting it).
Prometheus reaches the API at `host.docker.internal:3050` (the production port); edit `prometheus.yml` for other setups or add every API
instance as a target when you run more than one.

## Alerts

`alerts.yml` implements the table in `docs/08-QUALITY-SECURITY-DEPLOY.md` section 4: p95 latency over 500 ms, 5xx over 1 %, submit backlog over
2,000 or scoring lag over 60 s, MySQL and Redis down, Redis above 75 %, payment webhook 5xx, API down, backup older than 36 h.
Two rules (MySQL connections, MySQL host CPU) need `mysqld_exporter` and `node_exporter` on the database host; they stay silent until those exist.
Alertmanager has no receiver configured: fill in Telegram, Slack or e-mail in `alertmanager.yml`, otherwise alerts show only in the UI.

Validate changes: `docker run --rm --entrypoint promtool -v "$PWD:/m:ro" prom/prometheus:v2.55.1 check rules /m/alerts.yml`.

## Not done

* Sentry (needs a project and DSN) for api/web/admin/mobile.
* A Grafana panel per MySQL metric (needs `mysqld_exporter`).
* Uptime checks from outside (use any external pinger against `https://<host>/v1/health`).
