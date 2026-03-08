"""CLI 출력 파서: kubectl/az/gcloud/terraform → JSON IR"""
import asyncio
import json
import yaml
import uuid
from datetime import datetime
from typing import Optional

from core.llm import get_llm_client, get_model_name


class CLIParser:
    def __init__(self):
        self.client = get_llm_client()
        self.model = get_model_name()

    def detect_format(self, raw: str) -> str:
        """출력 형식 자동 감지"""
        stripped = raw.strip()

        # kubectl JSON
        if stripped.startswith("{") and '"apiVersion"' in stripped:
            return "kubectl_json"
        if stripped.startswith("[") and '"apiVersion"' in stripped:
            return "kubectl_json_list"

        # kubectl YAML
        if "apiVersion:" in stripped and "kind:" in stripped:
            return "kubectl_yaml"

        # Azure resource list
        if '"type": "Microsoft.' in stripped or '"type":"Microsoft.' in stripped:
            return "azure_resource_list"

        # GCP
        if '"selfLink"' in stripped and "compute.googleapis" in stripped:
            return "gcp_resource_list"
        if '"clusterIpv4Cidr"' in stripped:
            return "gcp_gke_list"

        # Terraform
        if '"format_version"' in stripped and '"values"' in stripped:
            return "terraform_state"

        # Docker Compose
        if "services:" in stripped and "image:" in stripped:
            return "docker_compose"

        # docker ps JSON (--format json)
        try:
            lines = [l.strip() for l in stripped.splitlines() if l.strip()]
            if lines and lines[0].startswith("{") and '"Image"' in lines[0]:
                return "docker_ps_json"
        except Exception:
            pass

        # docker ps 테이블 출력
        if stripped.startswith("CONTAINER ID") and "IMAGE" in stripped and "NAMES" in stripped:
            return "docker_ps_table"

        return "unknown"

    async def parse(self, raw: str) -> dict:
        """CLI 출력 → JSON IR"""
        fmt = self.detect_format(raw)

        if fmt in ("kubectl_json", "kubectl_json_list"):
            return self._parse_kubectl_json(raw)
        elif fmt == "kubectl_yaml":
            return self._parse_kubectl_yaml(raw)
        elif fmt == "azure_resource_list":
            return self._parse_azure_resource_list(raw)
        elif fmt == "docker_compose":
            return self._parse_docker_compose(raw)
        elif fmt == "docker_ps_json":
            return self._parse_docker_ps_json(raw)
        elif fmt == "docker_ps_table":
            return self._parse_docker_ps_table(raw)
        else:
            # LLM fallback
            return await self._llm_parse(raw, fmt)

    def _parse_kubectl_json(self, raw: str) -> dict:
        """kubectl get all -o json 파싱"""
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            return self._empty_ir("kubectl output")

        items = data.get("items", [data]) if isinstance(data, dict) else data

        nodes = []
        edges = []
        namespaces: dict = {}

        kind_to_type = {
            "Deployment": "k8s_deployment",
            "StatefulSet": "k8s_statefulset",
            "DaemonSet": "k8s_daemonset",
            "Service": "k8s_service",
            "Ingress": "k8s_ingress",
            "Pod": "k8s_pod",
            "ConfigMap": "k8s_configmap",
            "PersistentVolumeClaim": "k8s_pvc",
            "HorizontalPodAutoscaler": "k8s_hpa",
        }

        for item in items:
            kind = item.get("kind", "")
            metadata = item.get("metadata", {})
            name = metadata.get("name", "unknown")
            namespace = metadata.get("namespace", "default")
            spec = item.get("spec", {})

            node_type = kind_to_type.get(kind, "k8s_pod")
            node_id = f"node-{uuid.uuid4().hex[:8]}"

            # 레플리카 정보
            replicas = spec.get("replicas", "")
            sublabel = f"{replicas} replicas" if replicas else ""

            nodes.append({
                "id": node_id,
                "label": name,
                "sublabel": sublabel,
                "type": node_type,
                "icon": f"kubernetes/{node_type.replace('k8s_', '')}.svg",
                "parent": f"grp-ns-{namespace}",
                "position": {"x": len(nodes) * 200, "y": 0},
                "tags": [],
                "metadata": {"kind": kind, "namespace": namespace},
            })

            if namespace not in namespaces:
                namespaces[namespace] = []
            namespaces[namespace].append(node_id)

        # 네임스페이스 그룹 생성
        groups = []
        for i, (ns, node_ids) in enumerate(namespaces.items()):
            groups.append({
                "id": f"grp-ns-{ns}",
                "label": f"Namespace: {ns}",
                "cloud": "kubernetes",
                "color": "#326CE5",
                "bg_opacity": 0.06,
                "position": {"x": i * 900, "y": 0},
                "size": {"width": 800, "height": 600},
                "children": node_ids,
            })

        return {
            "meta": {
                "title": "Kubernetes Cluster",
                "version": "1.0",
                "created_at": datetime.utcnow().isoformat() + "Z",
                "source_type": "cli",
                "theme": "light",
            },
            "groups": groups,
            "nodes": nodes,
            "edges": edges,
            "legend": [],
        }

    def _parse_kubectl_yaml(self, raw: str) -> dict:
        """kubectl YAML 파싱"""
        items = []
        for doc in yaml.safe_load_all(raw):
            if doc:
                items.append(json.dumps(doc))

        combined = '{"items": [' + ','.join(items) + ']}'
        return self._parse_kubectl_json(combined)

    def _parse_azure_resource_list(self, raw: str) -> dict:
        """az resource list --output json 파싱"""
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            return self._empty_ir("Azure resources")

        if not isinstance(data, list):
            data = [data]

        type_map = {
            "Microsoft.ContainerService/managedClusters": ("azure_aks", "azure/aks.svg"),
            "Microsoft.Sql/servers": ("azure_sql", "azure/sql.svg"),
            "Microsoft.Storage/storageAccounts": ("azure_storage", "azure/storage.svg"),
            "Microsoft.Network/loadBalancers": ("azure_lb", "azure/loadbalancer.svg"),
            "Microsoft.Network/applicationGateways": ("azure_app_gateway", "azure/appgateway.svg"),
            "Microsoft.Cache/Redis": ("azure_redis", "azure/redis.svg"),
            "Microsoft.ContainerRegistry/registries": ("azure_acr", "azure/acr.svg"),
        }

        nodes = []
        resource_groups: dict = {}

        for item in data:
            resource_type = item.get("type", "")
            name = item.get("name", "unknown")
            rg = item.get("resourceGroup", "default")
            location = item.get("location", "")

            type_info = type_map.get(resource_type, ("azure_resource", "azure/resource.svg"))
            node_id = f"node-{uuid.uuid4().hex[:8]}"

            nodes.append({
                "id": node_id,
                "label": name,
                "sublabel": location,
                "type": type_info[0],
                "icon": type_info[1],
                "parent": f"grp-rg-{rg}",
                "position": {"x": len(nodes) * 200, "y": 0},
                "tags": [],
                "metadata": {"resource_type": resource_type, "resource_group": rg},
            })

            if rg not in resource_groups:
                resource_groups[rg] = []
            resource_groups[rg].append(node_id)

        groups = []
        for i, (rg, node_ids) in enumerate(resource_groups.items()):
            groups.append({
                "id": f"grp-rg-{rg}",
                "label": f"Resource Group: {rg}",
                "cloud": "azure",
                "color": "#0078D4",
                "bg_opacity": 0.06,
                "position": {"x": i * 900, "y": 0},
                "size": {"width": 800, "height": 600},
                "children": node_ids,
            })

        return {
            "meta": {
                "title": "Azure Infrastructure",
                "version": "1.0",
                "created_at": datetime.utcnow().isoformat() + "Z",
                "source_type": "cli",
                "theme": "light",
            },
            "groups": groups,
            "nodes": nodes,
            "edges": [],
            "legend": [],
        }

    def _parse_docker_compose(self, raw: str) -> dict:
        """docker-compose.yml 파싱"""
        try:
            data = yaml.safe_load(raw)
        except yaml.YAMLError:
            return self._empty_ir("Docker Compose")

        services = data.get("services", {})
        nodes = []
        edges = []

        for i, (service_name, service_conf) in enumerate(services.items()):
            image = service_conf.get("image", "")
            ports = service_conf.get("ports", [])
            port_str = str(ports[0]) if ports else ""

            node_id = f"node-{uuid.uuid4().hex[:8]}"
            nodes.append({
                "id": node_id,
                "label": service_name,
                "sublabel": image,
                "type": "docker_container",
                "icon": "logos/docker.svg",
                "position": {"x": i * 200, "y": 200},
                "tags": [],
                "port": port_str,
                "metadata": {"image": image},
            })

            # depends_on → 엣지 생성
            for dep in service_conf.get("depends_on", []):
                edges.append({
                    "id": f"edge-{uuid.uuid4().hex[:8]}",
                    "from": f"node-{service_name}",
                    "to": f"node-{dep}",
                    "style": "solid",
                    "color": "#888888",
                    "arrow": "forward",
                    "line_type": "general",
                })

        return {
            "meta": {
                "title": "Docker Compose Services",
                "version": "1.0",
                "created_at": datetime.utcnow().isoformat() + "Z",
                "source_type": "cli",
                "theme": "light",
            },
            "groups": [],
            "nodes": nodes,
            "edges": edges,
            "legend": [],
        }

    def _parse_docker_ps_json(self, raw: str) -> dict:
        """docker ps --format json (NDJSON) 파싱"""
        nodes = []
        for line in raw.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                item = json.loads(line)
            except json.JSONDecodeError:
                continue

            name = item.get("Names", "unknown").lstrip("/")
            image = item.get("Image", "")
            state = item.get("State", "unknown")
            ports = item.get("Ports", "")
            container_id = item.get("ID", "")

            status_color = "#4ade80" if state == "running" else "#f87171"
            node_id = f"node-{uuid.uuid4().hex[:8]}"
            nodes.append({
                "id": node_id,
                "label": name,
                "sublabel": image,
                "type": "docker_container",
                "icon": "logos/docker.svg",
                "position": {"x": len(nodes) * 220, "y": 200},
                "tags": [state],
                "port": ports.split(",")[0].strip() if ports else "",
                "metadata": {"container_id": container_id[:12], "state": state, "image": image},
                "status_color": status_color,
            })

        return {
            "meta": {
                "title": "Docker Containers",
                "version": "1.0",
                "created_at": datetime.utcnow().isoformat() + "Z",
                "source_type": "cli",
                "theme": "light",
            },
            "groups": [],
            "nodes": nodes,
            "edges": [],
            "legend": [],
        }

    def _parse_docker_ps_table(self, raw: str) -> dict:
        """docker ps 테이블 출력 파싱"""
        lines = [l for l in raw.splitlines() if l.strip()]
        if not lines:
            return self._empty_ir("Docker containers")

        # 헤더 파싱으로 컬럼 위치 확인
        header = lines[0]
        col_starts = []
        for col in ["CONTAINER ID", "IMAGE", "COMMAND", "CREATED", "STATUS", "PORTS", "NAMES"]:
            idx = header.find(col)
            if idx != -1:
                col_starts.append((col, idx))
        col_starts.sort(key=lambda x: x[1])

        def extract_col(line: str, col_name: str) -> str:
            positions = {c: i for c, i in col_starts}
            start = positions.get(col_name, -1)
            if start == -1:
                return ""
            # 다음 컬럼 시작 전까지
            col_order = [c for c, _ in col_starts]
            idx = col_order.index(col_name)
            if idx + 1 < len(col_starts):
                end = col_starts[idx + 1][1]
                return line[start:end].strip()
            return line[start:].strip()

        nodes = []
        for row in lines[1:]:
            if not row.strip():
                continue
            name = extract_col(row, "NAMES")
            image = extract_col(row, "IMAGE")
            status = extract_col(row, "STATUS")
            ports = extract_col(row, "PORTS")
            container_id = extract_col(row, "CONTAINER ID")

            state = "running" if status.lower().startswith("up") else "exited"
            status_color = "#4ade80" if state == "running" else "#f87171"

            node_id = f"node-{uuid.uuid4().hex[:8]}"
            nodes.append({
                "id": node_id,
                "label": name or container_id[:12],
                "sublabel": image,
                "type": "docker_container",
                "icon": "logos/docker.svg",
                "position": {"x": len(nodes) * 220, "y": 200},
                "tags": [state],
                "port": ports.split(",")[0].strip() if ports else "",
                "metadata": {"container_id": container_id[:12], "state": state, "status": status, "image": image},
                "status_color": status_color,
            })

        return {
            "meta": {
                "title": "Docker Containers",
                "version": "1.0",
                "created_at": datetime.utcnow().isoformat() + "Z",
                "source_type": "cli",
                "theme": "light",
            },
            "groups": [],
            "nodes": nodes,
            "edges": [],
            "legend": [],
        }

    async def _llm_parse(self, raw: str, detected_format: str) -> dict:
        """알 수 없는 형식 → LLM으로 전체 분석 (스레드풀 실행)"""
        from core.parser import SYSTEM_PROMPT, TextParser

        def _call():
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": f"다음 CLI 출력을 분석하여 JSON IR로 변환하세요 (감지된 형식: {detected_format}):\n\n{raw[:8000]}"},
                ],
                response_format={"type": "json_object"},
                temperature=0.1,
            )
            return response.choices[0].message.content

        raw_content = await asyncio.to_thread(_call)
        parser = TextParser()
        return parser._validate_and_fix(raw_content) or self._empty_ir("unknown format")

    def _empty_ir(self, title: str) -> dict:
        return {
            "meta": {"title": title, "version": "1.0", "created_at": datetime.utcnow().isoformat() + "Z", "source_type": "cli", "theme": "light"},
            "groups": [], "nodes": [], "edges": [], "legend": [],
        }
