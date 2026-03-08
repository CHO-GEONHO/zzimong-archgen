#!/usr/bin/env python3
"""
ArchGen 아이콘 라이브러리 다운로더
Iconify CDN에서 150+ 아이콘을 카테고리별로 다운로드
사용법: python3 scripts/download_icons.py
"""
import asyncio
import json
import sys
from pathlib import Path

try:
    import httpx
except ImportError:
    print("httpx 설치 중...")
    import subprocess
    subprocess.run([sys.executable, "-m", "pip", "install", "httpx"], check=True)
    import httpx

ICONS_DIR = Path("/Volumes/OpenClawSSD/projects/archgen/icons")

# ─── 아이콘 정의: (로컬_경로, iconify_prefix, iconify_name, 화이트_강제) ───
ICON_LIST = [
    # ── AWS ──
    ("aws/ec2.svg",              "logos", "aws-ec2",                      False),
    ("aws/ecs.svg",              "logos", "aws-ecs",                      False),
    ("aws/eks.svg",              "logos", "amazon-eks",                   False),
    ("aws/lambda.svg",           "logos", "aws-lambda",                   False),
    ("aws/fargate.svg",          "logos", "aws-fargate",                  False),
    ("aws/s3.svg",               "logos", "aws-s3",                       False),
    ("aws/rds.svg",              "logos", "aws-rds",                      False),
    ("aws/aurora.svg",           "logos", "aws-aurora",                   False),
    ("aws/dynamodb.svg",         "logos", "aws-dynamodb",                 False),
    ("aws/elasticache.svg",      "logos", "aws-elasticache",              False),
    ("aws/redshift.svg",         "logos", "aws-redshift",                 False),
    ("aws/cloudfront.svg",       "logos", "aws-cloudfront",               False),
    ("aws/alb.svg",              "logos", "aws-elastic-load-balancing",   False),
    ("aws/api-gateway.svg",      "logos", "aws-api-gateway",              False),
    ("aws/route53.svg",          "logos", "aws-route-53",                 False),
    ("aws/cloudwatch.svg",       "logos", "aws-cloudwatch",               False),
    ("aws/iam.svg",              "logos", "aws-iam",                      False),
    ("aws/cognito.svg",          "logos", "aws-cognito",                  False),
    ("aws/waf.svg",              "logos", "aws-waf",                      False),
    ("aws/sqs.svg",              "simple-icons", "amazonsqs",             False),
    ("aws/sns.svg",              "simple-icons", "amazonsns",             False),
    ("aws/kinesis.svg",          "logos", "aws-kinesis",                  False),
    ("aws/ecr.svg",              "logos", "aws-ecr",                      False),
    ("aws/codepipeline.svg",     "logos", "aws-codepipeline",             False),
    ("aws/secrets-manager.svg",  "logos", "aws-secrets-manager",         False),
    ("aws/step-functions.svg",   "logos", "aws-step-functions",           False),
    ("aws/glue.svg",             "logos", "aws-glue",                     False),
    ("aws/athena.svg",           "logos", "aws-athena",                   False),
    ("aws/vpc.svg",              "logos", "aws-vpc",                      False),
    ("aws/cloudformation.svg",   "logos", "aws-cloudformation",           False),
    ("aws/general.svg",          "logos", "amazon-web-services",          False),

    # ── Azure ──
    ("azure/aks.svg",            "logos", "microsoft-azure",              False),
    ("azure/sql.svg",            "logos", "azure-sql-database",           False),
    ("azure/storage.svg",        "logos", "azure-storage-blob",           False),
    ("azure/functions.svg",      "logos", "azure-functions",              False),
    ("azure/app-service.svg",    "logos", "azure-app-service",            False),
    ("azure/container-reg.svg",  "logos", "azure-container-registry",     False),
    ("azure/redis.svg",          "logos", "azure-redis-cache",            False),
    ("azure/lb.svg",             "logos", "azure-load-balancer",          False),
    ("azure/api-mgmt.svg",       "logos", "azure-api-management",         False),
    ("azure/cosmos-db.svg",      "logos", "azure-cosmos-db",              False),
    ("azure/service-bus.svg",    "logos", "azure-service-bus",            False),
    ("azure/event-hub.svg",      "logos", "azure-event-hubs",             False),
    ("azure/cdn.svg",            "logos", "azure-cdn",                    False),
    ("azure/general.svg",        "logos", "microsoft-azure",              False),

    # ── GCP ──
    ("gcp/gke.svg",              "logos", "google-kubernetes-engine",     False),
    ("gcp/cloud-run.svg",        "logos", "google-cloud-run",             False),
    ("gcp/cloud-sql.svg",        "logos", "google-cloud-sql",             False),
    ("gcp/cloud-storage.svg",    "logos", "google-cloud-storage",         False),
    ("gcp/pubsub.svg",           "logos", "google-cloud-pub-sub",         False),
    ("gcp/bigquery.svg",         "logos", "google-bigquery",              False),
    ("gcp/cloud-functions.svg",  "logos", "google-cloud-functions",       False),
    ("gcp/firebase.svg",         "logos", "firebase",                     False),
    ("gcp/cloud-cdn.svg",        "logos", "google-cloud-cdn",             False),
    ("gcp/general.svg",          "logos", "google-cloud",                 False),

    # ── Kubernetes / Cloud Native ──
    ("kubernetes/k8s.svg",       "logos", "kubernetes",                   False),
    ("kubernetes/helm.svg",      "logos", "helm",                         False),
    ("kubernetes/istio.svg",     "logos", "istio",                        False),
    ("kubernetes/argocd.svg",    "logos", "argo",                         False),
    ("kubernetes/flux.svg",      "logos", "flux",                         False),
    ("kubernetes/keda.svg",      "simple-icons", "keda",                  True),
    ("kubernetes/containerd.svg","simple-icons", "containerd",            True),
    ("kubernetes/docker.svg",    "logos", "docker-icon",                  False),
    ("kubernetes/podman.svg",    "logos", "podman",                       False),

    # ── Databases ──
    ("databases/mysql.svg",      "logos", "mysql",                        False),
    ("databases/postgresql.svg", "logos", "postgresql",                   False),
    ("databases/mongodb.svg",    "logos", "mongodb-icon",                 False),
    ("databases/redis.svg",      "logos", "redis",                        False),
    ("databases/elasticsearch.svg","logos","elasticsearch",               False),
    ("databases/clickhouse.svg", "simple-icons", "clickhouse",            False),
    ("databases/cassandra.svg",  "logos", "apache-cassandra",             False),
    ("databases/mariadb.svg",    "logos", "mariadb-icon",                 False),
    ("databases/neo4j.svg",      "logos", "neo4j",                        False),
    ("databases/influxdb.svg",   "logos", "influxdb",                     False),
    ("databases/sqlite.svg",     "logos", "sqlite",                       False),
    ("databases/kafka.svg",      "logos", "apache-kafka",                 False),
    ("databases/rabbitmq.svg",   "logos", "rabbitmq-icon",                False),

    # ── Monitoring / Observability ──
    ("monitoring/grafana.svg",   "logos", "grafana",                      False),
    ("monitoring/prometheus.svg","logos", "prometheus-icon",              False),
    ("monitoring/datadog.svg",   "logos", "datadog",                      False),
    ("monitoring/sentry.svg",    "logos", "sentry-icon",                  False),
    ("monitoring/elk.svg",       "logos", "elasticsearch",                False),
    ("monitoring/kibana.svg",    "logos", "kibana",                       False),
    ("monitoring/jaeger.svg",    "simple-icons", "jaegertracing",         True),
    ("monitoring/otel.svg",      "simple-icons", "opentelemetry",         True),
    ("monitoring/pagerduty.svg", "logos", "pagerduty-icon",               False),
    ("monitoring/newrelic.svg",  "logos", "new-relic",                    False),

    # ── DevOps / CI-CD ──
    ("devops/github.svg",        "logos", "github-icon",                  False),
    ("devops/gitlab.svg",        "logos", "gitlab",                       False),
    ("devops/jenkins.svg",       "logos", "jenkins",                      False),
    ("devops/terraform.svg",     "logos", "terraform-icon",               False),
    ("devops/ansible.svg",       "logos", "ansible",                      False),
    ("devops/pulumi.svg",        "logos", "pulumi-icon",                  False),
    ("devops/vault.svg",         "logos", "vault-icon",                   False),
    ("devops/github-actions.svg","simple-icons", "githubactions",         True),
    ("devops/sonarqube.svg",     "simple-icons", "sonarqube",             True),

    # ── Networking ──
    ("networking/nginx.svg",     "logos", "nginx",                        False),
    ("networking/traefik.svg",   "logos", "traefikproxy",                 False),
    ("networking/envoy.svg",     "logos", "envoy",                        False),
    ("networking/cloudflare.svg","logos", "cloudflare",                   False),
    ("networking/haproxy.svg",   "simple-icons", "haproxy",               True),
    ("networking/openvpn.svg",   "simple-icons", "openvpn",               True),
    ("networking/wireguard.svg", "simple-icons", "wireguard",             True),

    # ── Generic / Conceptual ──
    ("generic/internet.svg",     "mdi",   "web",                          True),
    ("generic/user.svg",         "mdi",   "account-circle-outline",       True),
    ("generic/server.svg",       "mdi",   "server",                       True),
    ("generic/database.svg",     "carbon","data-base",                    True),
    ("generic/storage.svg",      "mdi",   "database",                     True),
    ("generic/api.svg",          "mdi",   "api",                          True),
    ("generic/microservice.svg", "mdi",   "puzzle-outline",               True),
    ("generic/queue.svg",        "mdi",   "queue-first-in-last-out",      True),
    ("generic/cache.svg",        "mdi",   "memory",                       True),
    ("generic/lb.svg",           "mdi",   "scale-balance",                True),
    ("generic/cdn.svg",          "mdi",   "lightning-bolt",               True),
    ("generic/scheduler.svg",    "mdi",   "clock-outline",                True),
    ("generic/mobile.svg",       "mdi",   "cellphone",                    True),
    ("generic/monitor.svg",      "mdi",   "chart-line",                   True),
    ("generic/alert.svg",        "mdi",   "bell-outline",                 True),
    ("generic/vpn.svg",          "mdi",   "vpn",                          True),
    ("generic/firewall.svg",     "mdi",   "shield-outline",               True),
    ("generic/filesystem.svg",   "mdi",   "folder-network",               True),
    ("generic/batch.svg",        "mdi",   "application-cog",              True),
]

# ── manifest: node_type → 로컬 아이콘 경로 ──
MANIFEST = {
    # AWS
    "aws_ec2": "aws/ec2.svg",        "aws_ecs": "aws/ecs.svg",
    "aws_eks": "aws/eks.svg",        "aws_lambda": "aws/lambda.svg",
    "aws_fargate": "aws/fargate.svg","aws_s3": "aws/s3.svg",
    "aws_rds": "aws/rds.svg",        "aws_aurora": "aws/aurora.svg",
    "aws_dynamodb": "aws/dynamodb.svg","aws_elasticache": "aws/elasticache.svg",
    "aws_redis": "aws/elasticache.svg","aws_redshift": "aws/redshift.svg",
    "aws_cloudfront": "aws/cloudfront.svg","aws_alb": "aws/alb.svg",
    "aws_nlb": "aws/alb.svg",        "aws_elb": "aws/alb.svg",
    "aws_api_gateway": "aws/api-gateway.svg","aws_route53": "aws/route53.svg",
    "aws_cloudwatch": "aws/cloudwatch.svg","aws_iam": "aws/iam.svg",
    "aws_cognito": "aws/cognito.svg","aws_waf": "aws/waf.svg",
    "aws_sqs": "aws/sqs.svg",        "aws_sns": "aws/sns.svg",
    "aws_kinesis": "aws/kinesis.svg","aws_ecr": "aws/ecr.svg",
    "aws_codepipeline": "aws/codepipeline.svg",
    "aws_secrets_manager": "aws/secrets-manager.svg",
    "aws_step_functions": "aws/step-functions.svg",
    "aws_glue": "aws/glue.svg",      "aws_athena": "aws/athena.svg",
    "aws_vpc": "aws/vpc.svg",        "aws_cloudformation": "aws/cloudformation.svg",

    # Azure
    "azure_aks": "azure/aks.svg",     "azure_sql": "azure/sql.svg",
    "azure_storage": "azure/storage.svg","azure_functions": "azure/functions.svg",
    "azure_app_service": "azure/app-service.svg",
    "azure_container_registry": "azure/container-reg.svg",
    "azure_redis": "azure/redis.svg", "azure_lb": "azure/lb.svg",
    "azure_api_mgmt": "azure/api-mgmt.svg","azure_cosmos_db": "azure/cosmos-db.svg",
    "azure_service_bus": "azure/service-bus.svg",

    # GCP
    "gcp_gke": "gcp/gke.svg",         "gcp_cloud_run": "gcp/cloud-run.svg",
    "gcp_cloud_sql": "gcp/cloud-sql.svg","gcp_storage": "gcp/cloud-storage.svg",
    "gcp_pubsub": "gcp/pubsub.svg",    "gcp_bigquery": "gcp/bigquery.svg",
    "gcp_cloud_functions": "gcp/cloud-functions.svg","gcp_firebase": "gcp/firebase.svg",

    # Kubernetes
    "k8s_pod": "kubernetes/k8s.svg",   "k8s_deployment": "kubernetes/k8s.svg",
    "k8s_service": "kubernetes/k8s.svg","k8s_ingress": "networking/nginx.svg",
    "kubernetes": "kubernetes/k8s.svg", "helm": "kubernetes/helm.svg",
    "istio": "kubernetes/istio.svg",    "argocd": "kubernetes/argocd.svg",
    "docker": "kubernetes/docker.svg",  "container": "kubernetes/docker.svg",

    # Databases
    "mysql": "databases/mysql.svg",     "postgresql": "databases/postgresql.svg",
    "mongodb": "databases/mongodb.svg", "redis": "databases/redis.svg",
    "elasticsearch": "databases/elasticsearch.svg",
    "kafka": "databases/kafka.svg",     "rabbitmq": "databases/rabbitmq.svg",
    "clickhouse": "databases/clickhouse.svg",

    # Monitoring
    "grafana": "monitoring/grafana.svg","prometheus": "monitoring/prometheus.svg",
    "datadog": "monitoring/datadog.svg","sentry": "monitoring/sentry.svg",
    "kibana": "monitoring/kibana.svg",

    # Networking
    "nginx": "networking/nginx.svg",    "traefik": "networking/traefik.svg",
    "cloudflare": "networking/cloudflare.svg","haproxy": "networking/haproxy.svg",

    # DevOps
    "terraform": "devops/terraform.svg","ansible": "devops/ansible.svg",
    "vault": "devops/vault.svg",        "jenkins": "devops/jenkins.svg",
    "github": "devops/github.svg",      "gitlab": "devops/gitlab.svg",

    # Generic
    "internet": "generic/internet.svg", "user": "generic/user.svg",
    "browser": "generic/user.svg",      "server": "generic/server.svg",
    "database": "generic/database.svg", "storage": "generic/storage.svg",
    "api": "generic/api.svg",           "microservice": "generic/microservice.svg",
    "queue": "generic/queue.svg",       "cache": "generic/cache.svg",
    "load_balancer": "generic/lb.svg",  "cdn": "generic/cdn.svg",
    "scheduler": "generic/scheduler.svg","mobile": "generic/mobile.svg",
    "monitoring": "generic/monitor.svg","firewall": "generic/firewall.svg",
    "batch": "generic/batch.svg",
}


async def download_icon(client: httpx.AsyncClient, local_path: str, prefix: str, name: str, force_white: bool) -> bool:
    target = ICONS_DIR / local_path
    target.parent.mkdir(parents=True, exist_ok=True)

    if target.exists():
        return True

    params = {"height": "64"}
    if force_white:
        params["color"] = "%23ffffff"

    url = f"https://api.iconify.design/{prefix}/{name}.svg"
    try:
        resp = await client.get(url, params=params, timeout=10)
        if resp.status_code == 200 and len(resp.content) > 100:
            target.write_bytes(resp.content)
            return True
        else:
            print(f"  ✗ {local_path} ({resp.status_code})")
            return False
    except Exception as e:
        print(f"  ✗ {local_path}: {e}")
        return False


async def main():
    print(f"아이콘 다운로드 시작 ({len(ICON_LIST)}개)...")
    ICONS_DIR.mkdir(parents=True, exist_ok=True)

    ok = 0
    fail = 0

    async with httpx.AsyncClient() as client:
        # 카테고리별로 순차 처리 (API rate limit 방지)
        batch_size = 10
        for i in range(0, len(ICON_LIST), batch_size):
            batch = ICON_LIST[i:i + batch_size]
            tasks = [download_icon(client, *item) for item in batch]
            results = await asyncio.gather(*tasks)
            for item, result in zip(batch, results):
                if result:
                    ok += 1
                    print(f"  ✓ {item[0]}")
                else:
                    fail += 1
            await asyncio.sleep(0.3)  # rate limit 방지

    # manifest.json 저장
    manifest_path = ICONS_DIR / "manifest.json"
    manifest_path.write_text(json.dumps(MANIFEST, ensure_ascii=False, indent=2))
    print(f"\n✓ manifest.json 저장 ({len(MANIFEST)}개 매핑)")

    # 카테고리별 집계
    categories = {}
    for f in ICONS_DIR.rglob("*.svg"):
        cat = f.parent.name
        categories[cat] = categories.get(cat, 0) + 1

    print(f"\n완료: {ok}개 성공, {fail}개 실패")
    print("카테고리별:")
    for cat, cnt in sorted(categories.items()):
        print(f"  {cat}: {cnt}개")


if __name__ == "__main__":
    asyncio.run(main())
