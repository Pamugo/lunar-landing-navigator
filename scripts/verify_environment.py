#!/usr/bin/env python3
"""Verificador integral del entorno e infraestructura del proyecto Lunar Landing Site Navigator.

Propietario: qa-verification-agent.
Usa exclusivamente la libreria estandar de Python para poder ejecutarse en Fase 0 antes de
instalar dependencias de terceros.

Uso:
    python scripts/verify_environment.py [--json] [--strict]
"""

from __future__ import annotations

import argparse
import ast
import importlib.util
import io
import json
import re
import shutil
import sys
import unittest
from dataclasses import asdict, dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


@dataclass
class CheckResult:
    category: str
    item: str
    status: str  # "PASS" | "WARN" | "FAIL"
    detail: str


def _parse_frontmatter(text: str) -> dict[str, str] | None:
    if not text.startswith("---\n"):
        return None
    end = text.find("\n---\n", 4)
    if end == -1:
        return None
    block = text[4:end]
    result: dict[str, str] = {}
    current_key: str | None = None
    for raw_line in block.splitlines():
        line = raw_line.rstrip()
        if not line or line.lstrip().startswith("#"):
            continue
        if not raw_line.startswith((" ", "\t")) and ":" in line:
            key, val = line.split(":", 1)
            current_key = key.strip()
            val = val.strip()
            result[current_key] = "" if val in (">-", "|", ">") else val
        elif current_key is not None:
            result[current_key] = (result[current_key] + " " + line.strip()).strip()
    return result


def check_docs(results: list[CheckResult]) -> None:
    cat = "1. Documentacion y Gobernanza"
    required_files = [
        "AGENTS.md",
        "CLAUDE.md",
        "README.md",
        ".gitignore",
        ".agents/skills.json",
        "docs/CHALLENGE_SPEC.md",
        "docs/ARCHITECTURE.md",
        "docs/MATH_MODELS.md",
        "docs/VALIDATION_LOG.md",
    ]
    for rel in required_files:
        path = ROOT / rel
        if path.is_file() and path.stat().st_size > 10:
            results.append(CheckResult(cat, rel, "PASS", f"Existe ({path.stat().st_size} B)"))
        else:
            results.append(CheckResult(cat, rel, "FAIL", "No existe o esta vacio"))

    spec_path = ROOT / "docs/CHALLENGE_SPEC.md"
    if spec_path.is_file():
        spec_text = spec_path.read_text(encoding="utf-8")
        expected_ids = [f"RF-0{i}" for i in range(1, 8)] + [f"RT-0{i}" for i in range(1, 5)]
        missing = [req_id for req_id in expected_ids if req_id not in spec_text]
        if not missing:
            results.append(CheckResult(cat, "Matriz RF-01..07 / RT-01..04", "PASS", "11/11 IDs trazados en CHALLENGE_SPEC.md"))
        else:
            results.append(CheckResult(cat, "Matriz RF-01..07 / RT-01..04", "FAIL", f"Faltan IDs: {missing}"))

    math_path = ROOT / "docs/MATH_MODELS.md"
    if math_path.is_file():
        math_text = math_path.read_text(encoding="utf-8")
        has_radius = "1737.4" in math_text or "1 737 400" in math_text
        has_formula = "tan" in math_text and "cos" in math_text and "sin" in math_text
        if has_radius and has_formula:
            results.append(CheckResult(cat, "Ecuaciones MATH_MODELS.md", "PASS", "Incluye R=1737.4 km y formula esferica de horizonte"))
        else:
            results.append(CheckResult(cat, "Ecuaciones MATH_MODELS.md", "FAIL", "Faltan constantes o formula de horizonte"))

    claude_path = ROOT / "CLAUDE.md"
    if claude_path.is_file():
        claude_text = claude_path.read_text(encoding="utf-8")
        if "@AGENTS.md" in claude_text:
            results.append(CheckResult(cat, "Sincronizacion CLAUDE.md -> @AGENTS.md", "PASS", "Importa @AGENTS.md"))
        else:
            results.append(CheckResult(cat, "Sincronizacion CLAUDE.md -> @AGENTS.md", "FAIL", "CLAUDE.md no importa @AGENTS.md"))


def check_structure(results: list[CheckResult]) -> None:
    cat = "2. Estructura del Repositorio"
    expected_paths = [
        "backend/pyproject.toml",
        "backend/app/main.py",
        "backend/app/models/schemas.py",
        "backend/app/services",
        "backend/app/api",
        "backend/tests/test_horizon_geometry.py",
        "backend/tests/oracles/horizon_oracle.py",
        "frontend/package.json",
        "frontend/tsconfig.json",
        "frontend/vite.config.ts",
        "frontend/src/components",
        "frontend/src/services/apiClient.ts",
        "frontend/src/types/contracts.ts",
        "frontend/tests/contracts.test.ts",
        "data/ephemeris",
        "data/lola_dem",
        "data/curated_sites.json",
        "scripts/verify_environment.py",
    ]
    for rel in expected_paths:
        path = ROOT / rel
        if path.exists():
            results.append(CheckResult(cat, rel, "PASS", "Presente"))
        else:
            results.append(CheckResult(cat, rel, "FAIL", "Ruta inexistente"))


def check_skills_agents_commands(results: list[CheckResult]) -> None:
    cat_skills = "3. Skills Especializadas (skills/*/SKILL.md)"
    expected_skills = [
        "lunar-ephemeris",
        "lola-topography-horizon",
        "mission-comparison-ux",
        "spaceapps-compliance",
    ]
    for skill_name in expected_skills:
        rel = f"skills/{skill_name}/SKILL.md"
        path = ROOT / rel
        if not path.is_file():
            results.append(CheckResult(cat_skills, rel, "FAIL", "No existe"))
            continue
        fm = _parse_frontmatter(path.read_text(encoding="utf-8"))
        if fm and fm.get("name") == skill_name and len(fm.get("description", "")) > 20:
            results.append(CheckResult(cat_skills, rel, "PASS", f"name='{skill_name}', description valida"))
        else:
            results.append(CheckResult(cat_skills, rel, "FAIL", "Frontmatter YAML ausente o invalido"))

    cat_agents = "4. Subagentes (.claude/agents/*.md)"
    expected_agents = [
        "lead-architect-auditor",
        "astro-terrain-specialist",
        "fullstack-visualizer",
        "qa-verification-agent",
    ]
    for agent_name in expected_agents:
        rel = f".claude/agents/{agent_name}.md"
        path = ROOT / rel
        if not path.is_file():
            results.append(CheckResult(cat_agents, rel, "FAIL", "No existe"))
            continue
        fm = _parse_frontmatter(path.read_text(encoding="utf-8"))
        if fm and fm.get("name") == agent_name and fm.get("description"):
            results.append(CheckResult(cat_agents, rel, "PASS", f"Agente '{agent_name}' configurado"))
        else:
            results.append(CheckResult(cat_agents, rel, "FAIL", "Frontmatter YAML ausente o invalido"))

    cat_cmds = "5. Comandos Slash (.claude/commands/*.md)"
    expected_cmds = ["verify-env", "verify-physics", "audit-challenge", "plan-feature"]
    for cmd_name in expected_cmds:
        rel = f".claude/commands/{cmd_name}.md"
        path = ROOT / rel
        if not path.is_file():
            results.append(CheckResult(cat_cmds, rel, "FAIL", "No existe"))
            continue
        fm = _parse_frontmatter(path.read_text(encoding="utf-8"))
        if fm and fm.get("description"):
            results.append(CheckResult(cat_cmds, rel, "PASS", f"/{cmd_name} configurado"))
        else:
            results.append(CheckResult(cat_cmds, rel, "FAIL", "Frontmatter 'description' ausente"))


def check_curated_sites(results: list[CheckResult]) -> None:
    cat = "6. Sitios Curados (data/curated_sites.json)"
    path = ROOT / "data/curated_sites.json"
    if not path.is_file():
        results.append(CheckResult(cat, "data/curated_sites.json", "FAIL", "Archivo no encontrado"))
        return

    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        results.append(CheckResult(cat, "data/curated_sites.json", "FAIL", f"JSON invalido: {exc}"))
        return

    sites = payload.get("sites", [])
    if len(sites) >= 6:
        results.append(CheckResult(cat, "Numero de sitios curados (>= 6)", "PASS", f"{len(sites)} sitios cargados"))
    else:
        results.append(CheckResult(cat, "Numero de sitios curados (>= 6)", "FAIL", f"Solo {len(sites)} sitios"))

    required_keys = {
        "id",
        "name",
        "category",
        "lat_deg",
        "lon_deg",
        "elevation_m",
        "default_hardware_id",
        "region",
        "mission",
        "description_tech",
        "description_edu",
        "source",
        "verification_status",
        "quickmap_url",
        "moontrek_url",
    }
    hw_profiles = payload.get("hardware_profiles", [])
    if len(hw_profiles) >= 4:
        results.append(CheckResult(cat, "Perfiles de hardware CSA/NASA (>= 4)", "PASS", f"{len(hw_profiles)} perfiles cargados"))
    else:
        results.append(CheckResult(cat, "Perfiles de hardware CSA/NASA (>= 4)", "FAIL", f"Solo {len(hw_profiles)} perfiles"))
    ids_seen: set[str] = set()
    errors: list[str] = []
    for idx, site in enumerate(sites):
        missing = required_keys - set(site.keys())
        if missing:
            errors.append(f"sitio[{idx}] sin claves {sorted(missing)}")
            continue
        sid = site["id"]
        if sid in ids_seen:
            errors.append(f"id duplicado: {sid}")
        ids_seen.add(sid)
        lat = float(site["lat_deg"])
        lon = float(site["lon_deg"])
        if not (-90.0 <= lat <= 90.0):
            errors.append(f"{sid}: lat_deg fuera de [-90, 90]: {lat}")
        if not (-180.0 <= lon <= 180.0):
            errors.append(f"{sid}: lon_deg fuera de [-180, 180]: {lon}")

    mandatory_ids = {
        "apollo-11",
        "apollo-17",
        "shackleton-rim",
        "malapert-massif",
        "cabeus-crater",
    }
    missing_mandatory = mandatory_ids - ids_seen
    has_leibnitz_or_nobile = bool({"mons-mouton-leibnitz-beta", "nobile-rim-1"} & ids_seen)
    if missing_mandatory or not has_leibnitz_or_nobile:
        errors.append(f"faltan sitios requeridos: {sorted(missing_mandatory)}")

    if not errors:
        results.append(
            CheckResult(
                cat,
                "Esquema y rangos selenograficos MOON_ME",
                "PASS",
                f"IDs validos: {', '.join(sorted(ids_seen))}",
            )
        )
    else:
        results.append(CheckResult(cat, "Esquema y rangos selenograficos MOON_ME", "FAIL", "; ".join(errors)))


def check_contract_parity(results: list[CheckResult]) -> None:
    cat = "7. Paridad de Contratos (Python AST <-> TypeScript)"
    py_path = ROOT / "backend/app/models/schemas.py"
    ts_path = ROOT / "frontend/src/types/contracts.ts"
    if not py_path.is_file() or not ts_path.is_file():
        results.append(CheckResult(cat, "Archivos de contrato", "FAIL", "Falta schemas.py o contracts.ts"))
        return

    py_tree = ast.parse(py_path.read_text(encoding="utf-8"), filename=str(py_path))
    py_version: str | None = None
    py_models: dict[str, list[str]] = {}
    py_enums: set[str] = set()

    for node in py_tree.body:
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if (
                    isinstance(target, ast.Name)
                    and target.id == "CONTRACT_VERSION"
                    and isinstance(node.value, ast.Constant)
                    and isinstance(node.value.value, str)
                ):
                    py_version = node.value.value
        elif isinstance(node, ast.ClassDef) and not node.name.startswith("_"):
            base_names = [
                b.id if isinstance(b, ast.Name) else getattr(b, "attr", "")
                for b in node.bases
            ]
            if "Enum" in base_names:
                py_enums.add(node.name)
            else:
                fields = [
                    stmt.target.id
                    for stmt in node.body
                    if isinstance(stmt, ast.AnnAssign)
                    and isinstance(stmt.target, ast.Name)
                    and not stmt.target.id.startswith("_")
                ]
                py_models[node.name] = fields

    ts_text = ts_path.read_text(encoding="utf-8")
    ver_match = re.search(r'export\s+const\s+CONTRACT_VERSION\s*=\s*"([^"]+)"', ts_text)
    ts_version = ver_match.group(1) if ver_match else None

    if py_version and py_version == ts_version:
        results.append(CheckResult(cat, "CONTRACT_VERSION", "PASS", f"v{py_version} coincide en Python y TS"))
    else:
        results.append(CheckResult(cat, "CONTRACT_VERSION", "FAIL", f"Python={py_version!r} vs TS={ts_version!r}"))

    ts_types = set(re.findall(r"export\s+type\s+(\w+)\s*=", ts_text))
    ts_interfaces: dict[str, list[str]] = {}
    for match in re.finditer(r"export\s+interface\s+(\w+)\s*\{([^}]*)\}", ts_text, re.DOTALL):
        iface_name = match.group(1)
        body = match.group(2)
        props = re.findall(r"^\s*(\w+)\??\s*:", body, re.MULTILINE)
        ts_interfaces[iface_name] = props

    missing_enums = sorted(py_enums - ts_types)
    if not missing_enums:
        results.append(CheckResult(cat, "Enums exportados en TS", "PASS", f"{len(py_enums)} enums sincronizados"))
    else:
        results.append(CheckResult(cat, "Enums exportados en TS", "FAIL", f"Faltan en TS: {missing_enums}"))

    mismatches: list[str] = []
    for model_name, py_fields in py_models.items():
        if model_name not in ts_interfaces:
            mismatches.append(f"falta interface {model_name}")
            continue
        ts_fields = ts_interfaces[model_name]
        if py_fields != ts_fields:
            mismatches.append(f"{model_name}: py={py_fields} vs ts={ts_fields}")

    if not mismatches:
        results.append(
            CheckResult(
                cat,
                "Modelos Pydantic <-> Interfaces TS",
                "PASS",
                f"{len(py_models)} modelos y sus campos coinciden exactamente",
            )
        )
    else:
        results.append(CheckResult(cat, "Modelos Pydantic <-> Interfaces TS", "FAIL", "; ".join(mismatches)))


def check_no_refraction_guard(results: list[CheckResult]) -> None:
    cat = "8. Guardia Fisica RT-03 (Sin Refraccion Atmosferica)"
    offending: list[str] = []
    for folder in (ROOT / "backend/app", ROOT / "frontend/src"):
        if not folder.exists():
            continue
        for file_path in folder.rglob("*"):
            if not file_path.is_file() or file_path.suffix not in {".py", ".ts", ".tsx"}:
                continue
            for lineno, line in enumerate(file_path.read_text(encoding="utf-8").splitlines(), start=1):
                stripped = line.strip()
                if stripped.startswith(("#", "//", "*", '"""', "'''")):
                    continue
                if "refract" in stripped.lower():
                    # Solo se permite el campo informativo refraction: False / false / AIRLESS en el contrato o sello
                    if any(
                        allowed in stripped
                        for allowed in (
                            "refraction: bool = Field(default=False",
                            "refraction: false",
                            "refraction: str",
                            '"refraction": "AIRLESS"',
                            'refraction: "AIRLESS"',
                            'refraction="AIRLESS"',
                            "refraction=False",
                            "scientificSeal.refraction",
                        )
                    ):
                        continue
                    offending.append(f"{file_path.relative_to(ROOT)}:{lineno}")

    if not offending:
        results.append(CheckResult(cat, "Escaneo de terminos de refraccion", "PASS", "0 modelos de refraccion en codigo"))
    else:
        results.append(CheckResult(cat, "Escaneo de terminos de refraccion", "FAIL", f"Revisar: {offending}"))


def check_physics_suite(results: list[CheckResult]) -> None:
    cat = "9. Suite de Oraculos Fisicos (backend/tests)"
    backend_dir = str(ROOT / "backend")
    if backend_dir not in sys.path:
        sys.path.insert(0, backend_dir)

    loader = unittest.TestLoader()
    suite = loader.discover(start_dir=str(ROOT / "backend/tests"), top_level_dir=backend_dir)
    stream = io.StringIO()
    runner = unittest.TextTestRunner(stream=stream, verbosity=1)
    test_result = runner.run(suite)

    ran = test_result.testsRun
    skipped = len(test_result.skipped)
    failed = len(test_result.failures) + len(test_result.errors)
    if failed == 0 and ran > 0:
        results.append(
            CheckResult(
                cat,
                "unittest discover backend/tests",
                "PASS",
                f"{ran} ejecutados, {ran - skipped} en verde, {skipped} omitidos (oraculos Sprint 1), 0 fallos",
            )
        )
    else:
        results.append(
            CheckResult(
                cat,
                "unittest discover backend/tests",
                "FAIL",
                f"Ejecutados={ran}, Fallos/Errores={failed}\n{stream.getvalue()}",
            )
        )


def check_toolchains(results: list[CheckResult]) -> None:
    cat = "10. Herramientas y Dependencias (Runtime)"
    py_ver = f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"
    if sys.version_info >= (3, 12):
        results.append(CheckResult(cat, "Python >= 3.12", "PASS", f"Python {py_ver} ({sys.executable})"))
    else:
        results.append(CheckResult(cat, "Python >= 3.12", "FAIL", f"Python {py_ver} (< 3.12)"))

    for pkg in ("pydantic", "fastapi", "numpy", "scipy", "skyfield", "rasterio", "pyproj", "pytest"):
        found = importlib.util.find_spec(pkg) is not None
        if found:
            results.append(CheckResult(cat, f"Paquete Python '{pkg}'", "PASS", "Instalado"))
        else:
            results.append(
                CheckResult(
                    cat,
                    f"Paquete Python '{pkg}'",
                    "WARN",
                    "Pendiente de instalar para Sprint 1 (cd backend && pip install -e .[dev])",
                )
            )

    for binary in ("git", "node", "npm"):
        which = shutil.which(binary)
        if not which and binary in {"node", "npm"}:
            ext = ".exe" if binary == "node" else ".cmd"
            fallback = Path(r"C:\Program Files\nodejs") / f"{binary}{ext}"
            if fallback.is_file():
                which = str(fallback)
        if which:
            results.append(CheckResult(cat, f"Binario '{binary}'", "PASS", which))
        else:
            status = "FAIL" if binary == "git" else "WARN"
            msg = "No encontrado en PATH (requerido en Sprint 2 para frontend)" if status == "WARN" else "Requerido"
            results.append(CheckResult(cat, f"Binario '{binary}'", status, msg))


def main() -> int:
    parser = argparse.ArgumentParser(description="Verifica el entorno del Lunar Landing Site Navigator.")
    parser.add_argument("--json", action="store_true", help="Emite la salida en formato JSON.")
    parser.add_argument("--strict", action="store_true", help="Trata los WARN como errores (exit 1).")
    args = parser.parse_args()

    results: list[CheckResult] = []
    check_docs(results)
    check_structure(results)
    check_skills_agents_commands(results)
    check_curated_sites(results)
    check_contract_parity(results)
    check_no_refraction_guard(results)
    check_physics_suite(results)
    check_toolchains(results)

    n_pass = sum(1 for r in results if r.status == "PASS")
    n_warn = sum(1 for r in results if r.status == "WARN")
    n_fail = sum(1 for r in results if r.status == "FAIL")

    if args.json:
        print(
            json.dumps(
                {
                    "summary": {"pass": n_pass, "warn": n_warn, "fail": n_fail},
                    "results": [asdict(r) for r in results],
                },
                indent=2,
                ensure_ascii=False,
            )
        )
    else:
        print("=" * 88)
        print(" LUNAR LANDING SITE NAVIGATOR — VERIFICACION DEL ENTORNO (Fase 0)")
        print("=" * 88)
        current_cat = ""
        for r in results:
            if r.category != current_cat:
                current_cat = r.category
                print(f"\n[{current_cat}]")
            print(f"  [{r.status:4s}] {r.item:<48s} -> {r.detail}")
        print("\n" + "-" * 88)
        print(f" RESUMEN: {n_pass} PASS | {n_warn} WARN | {n_fail} FAIL")
        print("-" * 88)

    if n_fail > 0 or (args.strict and n_warn > 0):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
