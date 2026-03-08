"""동적 아이콘 검색 (Iconify API 연동 - Azure/K8s 강화)"""
import httpx
import os
from pathlib import Path

ICONS_DIR = Path(os.getenv("ICONS_DIR", "/Volumes/OpenClawSSD/projects/archgen/icons"))

# 자체 컬러를 가진 팩 (preview에 color 파라미터 금지)
COLORED_PREFIXES = {
    'logos', 'devicon', 'devicon-plain', 'vscode-icons',
    'flat-color-icons', 'skill-icons', 'noto', 'noto-v1',
    'emojione', 'twemoji',
}

# 인프라 관련 우선 팩 (검색 결과 정렬용)
INFRA_PRIORITY_PREFIXES = ['skill-icons', 'logos', 'devicon', 'simple-icons', 'mdi', 'carbon']


def make_preview_url(icon_id: str) -> str:
    """아이콘 ID → 색상 포함 preview URL"""
    parts = icon_id.split(":")
    if len(parts) != 2:
        return f"https://api.iconify.design/{icon_id}.svg"
    prefix, name = parts
    color_param = "" if prefix in COLORED_PREFIXES else "&color=%23e2e8f0"
    return f"https://api.iconify.design/{prefix}/{name}.svg?height=48{color_param}"


# AKS / Azure / K8s / GCP / 인프라 키워드 매핑 (상세화)
KEYWORD_MAPPING = {
    # Azure
    "azure_aks":            ["azure-kubernetes", "kubernetes", "aks"],
    "azure_sql":            ["azure-sql", "mssql", "sql-database"],
    "azure_storage":        ["azure-storage", "azure-blob", "storage"],
    "azure_functions":      ["azure-functions", "serverless", "lambda"],
    "azure_app_service":    ["azure-app-service", "web-app", "azure"],
    "azure_acr":            ["azure-container-registry", "docker-registry", "docker"],
    "azure_redis":          ["azure-redis", "redis", "cache"],
    "azure_lb":             ["azure-load-balancer", "load-balancer", "nginx"],
    "azure_apim":           ["azure-api-management", "api-gateway", "api"],
    "azure_cosmos":         ["azure-cosmosdb", "cosmosdb", "nosql"],
    "azure_servicebus":     ["azure-service-bus", "message-queue", "rabbitmq"],
    "azure_frontdoor":      ["azure-front-door", "cdn", "cloudflare"],
    "azure_vnet":           ["azure-virtual-network", "network", "vpc"],
    "azure_keyvault":       ["azure-key-vault", "secret", "vault"],
    "azure_monitor":        ["azure-monitor", "monitoring", "grafana"],
    "azure_devops":         ["azure-devops", "ci-cd", "pipeline"],
    "microsoft":            ["microsoft", "azure", "windows"],

    # GCP
    "gcp_gke":              ["google-kubernetes-engine", "kubernetes", "gke"],
    "gcp_cloudrun":         ["google-cloud-run", "serverless", "cloud-run"],
    "gcp_cloudsql":         ["google-cloud-sql", "postgresql", "mysql"],
    "gcp_storage":          ["google-cloud-storage", "storage", "gcs"],
    "gcp_pubsub":           ["google-cloud-pubsub", "message-queue", "kafka"],
    "gcp_bigquery":         ["google-bigquery", "bigquery", "analytics"],
    "gcp_firestore":        ["firebase", "firestore", "nosql"],
    "gcp_functions":        ["google-cloud-functions", "serverless", "lambda"],
    "gcp_cdn":              ["google-cloud-cdn", "cdn", "cloudflare"],
    "gcp_loadbalancer":     ["google-cloud-load-balancer", "load-balancer", "nginx"],

    # Kubernetes
    "k8s_pod":              ["kubernetes", "docker", "container"],
    "k8s_deployment":       ["kubernetes", "deploy", "helm"],
    "k8s_service":          ["kubernetes", "service", "network"],
    "k8s_ingress":          ["nginx", "traefik", "ingress"],
    "k8s_namespace":        ["kubernetes", "namespace", "folder"],
    "k8s_configmap":        ["config", "settings", "gear"],
    "k8s_secret":           ["secret", "vault", "lock"],
    "k8s_pvc":              ["storage", "disk", "database"],
    "k8s_statefulset":      ["kubernetes", "stateful", "database"],
    "k8s_daemonset":        ["kubernetes", "daemon", "monitor"],
    "k8s_hpa":              ["kubernetes", "autoscaling", "scale"],
    "kubernetes":           ["kubernetes", "k8s", "helm"],
    "helm":                 ["helm", "kubernetes", "package"],
    "istio":                ["istio", "service-mesh", "envoy"],
    "keda":                 ["keda", "kubernetes", "autoscaler"],

    # AWS
    "aws_ec2":              ["amazon-ec2", "aws-ec2", "server"],
    "aws_eks":              ["amazon-eks", "kubernetes", "cluster"],
    "aws_ecs":              ["amazon-ecs", "aws-ecs", "docker"],
    "aws_lambda":           ["aws-lambda", "serverless", "function"],
    "aws_s3":               ["amazon-s3", "aws-s3", "storage"],
    "aws_rds":              ["amazon-rds", "aws-rds", "postgresql"],
    "aws_dynamodb":         ["amazon-dynamodb", "nosql", "dynamodb"],
    "aws_elasticache":      ["aws-elasticache", "redis", "cache"],
    "aws_sqs":              ["amazon-sqs", "message-queue", "kafka"],
    "aws_sns":              ["amazon-sns", "notification", "bell"],
    "aws_cloudfront":       ["aws-cloudfront", "cdn", "cloudflare"],
    "aws_alb":              ["load-balancer", "nginx", "haproxy"],
    "aws_apigateway":       ["aws-api-gateway", "api", "gateway"],
    "aws_route53":          ["amazon-route53", "dns", "route53"],
    "aws_cloudwatch":       ["aws-cloudwatch", "monitoring", "grafana"],

    # Database / Cache
    "postgresql":           ["postgresql", "postgres", "database"],
    "mysql":                ["mysql", "database", "sql"],
    "mongodb":              ["mongodb", "nosql", "document"],
    "redis":                ["redis", "cache", "memory"],
    "elasticsearch":        ["elasticsearch", "opensearch", "search"],
    "kafka":                ["apache-kafka", "kafka", "message-queue"],
    "rabbitmq":             ["rabbitmq", "message-queue", "amqp"],
    "cassandra":            ["apache-cassandra", "cassandra", "nosql"],
    "clickhouse":           ["clickhouse", "database", "analytics"],

    # Infrastructure tools
    "nginx":                ["nginx", "web-server", "proxy"],
    "apache":               ["apache", "web-server", "httpd"],
    "docker":               ["docker", "container", "whale"],
    "prometheus":           ["prometheus", "monitoring", "metrics"],
    "grafana":              ["grafana", "dashboard", "chart"],
    "terraform":            ["terraform", "iac", "infrastructure"],
    "ansible":              ["ansible", "automation", "devops"],
    "jenkins":              ["jenkins", "ci-cd", "pipeline"],
    "github":               ["github", "git", "octocat"],
    "gitlab":               ["gitlab", "git", "ci-cd"],
    "vault":                ["vault", "secret", "hashicorp"],
    "traefik":              ["traefik", "proxy", "load-balancer"],
    "podman":               ["podman", "container", "docker"],

    # General concepts
    "internet":             ["globe", "internet", "network"],
    "user":                 ["user", "person", "account"],
    "browser":              ["browser", "chrome", "web"],
    "mobile":               ["mobile", "phone", "android"],
    "api":                  ["api", "rest", "json"],
    "server":               ["server", "computer", "host"],
    "database":             ["database", "storage", "sql"],
    "cdn":                  ["cdn", "cloudflare", "network"],
    "loadbalancer":         ["load-balancer", "balance", "nginx"],
    "scheduler":            ["cron", "clock", "schedule"],
    "monitoring":           ["monitoring", "grafana", "alert"],
}


class IconSearch:
    async def search(self, node_type: str, context: str = "") -> list:
        """Iconify API 실시간 검색 (AKS/K8s/Azure/GCP 강화)"""
        keywords = self._generate_keywords(node_type, context)
        results = []
        seen = set()

        async with httpx.AsyncClient(timeout=10.0) as client:
            for keyword in keywords[:3]:
                try:
                    resp = await client.get(
                        "https://api.iconify.design/search",
                        params={
                            "query": keyword,
                            "limit": 8,
                            "prefixes": ",".join(INFRA_PRIORITY_PREFIXES),
                        },
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        for icon_id in data.get("icons", []):
                            if icon_id not in seen:
                                seen.add(icon_id)
                                parts = icon_id.split(":")
                                if len(parts) == 2:
                                    prefix, name = parts
                                    results.append({
                                        "id": icon_id,
                                        "name": name,
                                        "source": prefix,
                                        "preview_url": make_preview_url(icon_id),
                                        "download_url": f"https://api.iconify.design/{prefix}/{name}.svg",
                                    })
                except Exception:
                    pass

        # 인프라 팩 우선순위 정렬
        def sort_key(r):
            try:
                prefix = r["id"].split(":")[0]
                return INFRA_PRIORITY_PREFIXES.index(prefix)
            except ValueError:
                return 99

        results.sort(key=sort_key)
        return results[:16]

    def _generate_keywords(self, node_type: str, context: str = "") -> list:
        """node_type + context → 검색 키워드 목록"""
        # 정확한 매핑 먼저
        normalized = node_type.lower().replace(" ", "_").replace("-", "_")
        if normalized in KEYWORD_MAPPING:
            return KEYWORD_MAPPING[normalized]

        # 부분 매칭
        for key, keywords in KEYWORD_MAPPING.items():
            if key in normalized or normalized in key:
                return keywords

        # context 활용 (예: "ALB" → "Application Load Balancer")
        keywords = [node_type.replace("_", "-")]
        if context:
            keywords.append(context.split()[0].lower() if context.split() else "")
        words = node_type.replace("_", " ").replace("-", " ").split()
        keywords.extend(words[:2])
        return [k for k in keywords if k]

    async def download_and_cache(self, icon_url: str, node_id: str) -> str:
        """선택된 아이콘 다운로드 → cache/ 저장"""
        cache_dir = ICONS_DIR / "cache"
        cache_dir.mkdir(exist_ok=True)

        filename = f"{node_id}.svg"
        cache_path = cache_dir / filename

        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(icon_url)
            if resp.status_code == 200:
                cache_path.write_bytes(resp.content)

        return f"cache/{filename}"
