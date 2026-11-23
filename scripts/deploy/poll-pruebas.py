#!/usr/bin/env python3
"""Consulta cada cinco minutos desde cron; solo puede desplegar PRUEBAS."""
import json
import logging
from logging.handlers import RotatingFileHandler
import os
from pathlib import Path
import re
import subprocess
import time
import urllib.parse
import urllib.request

COMPOSE_ID = "e3Bkaq88xSYluN9dqrdZ6"
APP_NAME = "presupuestos-isf-pruebas-1uwipl"
BRANCH = "mejoras-uso-real"
GITHUB_ID = "K5jcSFHmjAwiXHib6xriq"
CODE = Path("/etc/dokploy/compose") / APP_NAME / "code"
STATE_DIR = Path.home() / ".local/state/presupuestos-pruebas"
TOKEN_FILE = Path.home() / ".config/presupuestos-pruebas/dokploy-token"
SHA = re.compile(r"^[0-9a-f]{40}$")


class Poller:
    def __init__(self, token, state_file, logger):
        self.token = token
        self.state_file = state_file
        self.log = logger

    def api(self, endpoint, data=None):
        headers = {"x-api-key": self.token}
        if data is not None:
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(
            "http://127.0.0.1:3000/api/" + endpoint,
            data=json.dumps(data).encode() if data is not None else None,
            headers=headers,
        )
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.load(response)

    def deployed_sha(self):
        value = subprocess.check_output(
            ["git", "-c", f"safe.directory={CODE}", "-C", str(CODE), "rev-parse", "HEAD"],
            text=True, timeout=15,
        ).strip()
        if not SHA.fullmatch(value):
            raise RuntimeError("El checkout desplegado no tiene un SHA válido.")
        return value

    def healthy(self):
        with urllib.request.urlopen("http://127.0.0.1:3101/api/health", timeout=15) as response:
            return json.load(response).get("status") == "ok"

    def backup(self):
        # Solo el contenedor de copias de pruebas. Un fallo impide desplegar.
        subprocess.run(
            ["docker", "exec", APP_NAME + "-backup-1", "/scripts/backup.sh", "now"],
            check=True, timeout=180, capture_output=True, text=True,
        )

    def save(self, state):
        temporary = self.state_file.with_suffix(".tmp")
        temporary.write_text(json.dumps(state, indent=2) + "\n")
        temporary.replace(self.state_file)

    def run(self):
        compose = self.api("compose.one?composeId=" + COMPOSE_ID)
        expected = {
            "composeId": COMPOSE_ID, "appName": APP_NAME, "branch": BRANCH,
            "owner": "obiticadev", "repository": "presupuestos-isf",
            "sourceType": "github", "githubId": GITHUB_ID, "composePath": "./compose.yaml",
        }
        if any(compose.get(key) != value for key, value in expected.items()):
            raise RuntimeError("La configuración ya no corresponde a PRUEBAS; no se despliega.")
        if compose.get("randomize") or compose.get("isolatedDeployment"):
            raise RuntimeError("Se ha cambiado la persistencia de pruebas; no se despliega.")
        if not compose.get("autoDeploy"):
            self.log.info("Despliegue automático desactivado en Dokploy; no se despliega.")
            return
        state = json.loads(self.state_file.read_text()) if self.state_file.exists() else {}
        deployments = compose.get("deployments", [])
        pending = state.get("pending")
        if pending:
            new = [d for d in deployments if d["deploymentId"] not in pending["previous_ids"]]
            if not new:
                if time.time() - pending["requested_at"] > 900:
                    self.log.error("Solicitud pendiente sin despliegue registrado; revisar Dokploy. No se duplica.")
                else:
                    self.log.info("Esperando a que Dokploy registre la solicitud pendiente.")
                return
            latest = max(new, key=lambda d: d["createdAt"])
            if latest["status"] == "error":
                state["failed_sha"] = pending["sha"]
                state.pop("pending")
                self.save(state)
                self.log.error("Falló el despliegue de %s; se espera otro commit o intervención manual.", pending["sha"][:12])
                return
            if latest["status"] != "done" or compose["composeStatus"] != "done":
                self.log.info("Despliegue de pruebas en curso; no se encola otro.")
                return
            if not self.healthy():
                raise RuntimeError("Dokploy terminó, pero pruebas aún no responde con salud correcta.")
            state["last_success_sha"] = self.deployed_sha()
            state.pop("pending")
            state.pop("failed_sha", None)
            self.save(state)
            self.log.info("Despliegue confirmado y saludable: %s.", state["last_success_sha"][:12])
        elif compose["composeStatus"] not in ("done", "error"):
            self.log.info("Dokploy está ocupado o el servicio está detenido; no se despliega.")
            return

        query = urllib.parse.urlencode({"githubId": GITHUB_ID, "owner": "obiticadev", "repo": "presupuestos-isf"})
        branches = self.api("github.getGithubBranches?" + query)
        remote = next((b["commit"]["sha"] for b in branches if b["name"] == BRANCH), None)
        if not remote or not SHA.fullmatch(remote):
            raise RuntimeError("No se ha podido verificar el commit remoto de la rama de pruebas.")
        if "last_success_sha" not in state:
            if compose["composeStatus"] != "done" or not self.healthy():
                raise RuntimeError("No se puede establecer una versión inicial saludable.")
            state["last_success_sha"] = self.deployed_sha()
            self.save(state)
        if state.get("failed_sha") == remote:
            self.log.warning("El commit %s ya falló; no se repite automáticamente.", remote[:12])
            return
        if compose["composeStatus"] == "done" and remote == self.deployed_sha():
            state["last_success_sha"] = remote
            self.save(state)
            self.log.info("Sin cambios en %s (%s).", BRANCH, remote[:12])
            return
        self.backup()
        # Save intent before the API call: a network timeout must not cause duplicate deploys.
        state["pending"] = {
            "sha": remote, "requested_at": time.time(),
            "previous_ids": [d["deploymentId"] for d in deployments],
        }
        self.save(state)
        self.api("compose.deploy", {
            "composeId": COMPOSE_ID,
            "title": f"Automático (consulta cada 5 min): {remote[:12]}",
            "description": f"Rama {BRANCH}. Copia de pruebas realizada antes del despliegue.",
        })
        self.log.info("Cambio detectado; copia correcta y despliegue solicitado: %s.", remote[:12])


def main():
    import fcntl

    os.umask(0o077)
    STATE_DIR.mkdir(parents=True, exist_ok=True, mode=0o700)
    logger = logging.getLogger("presupuestos-pruebas")
    logger.setLevel(logging.INFO)
    handler = RotatingFileHandler(STATE_DIR / "poll.log", maxBytes=1_000_000, backupCount=3)
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    logger.addHandler(handler)
    with (STATE_DIR / "poll.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return
        try:
            Poller(TOKEN_FILE.read_text().strip(), STATE_DIR / "state.json", logger).run()
        except Exception as error:
            # Never include HTTP bodies, provider data, or credentials in logs.
            logger.error("Comprobación fallida (%s): %s", type(error).__name__, str(error))
            raise SystemExit(1)


if __name__ == "__main__":
    main()
