import importlib.util
import json
import logging
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock

SPEC = importlib.util.spec_from_file_location(
    "poll_pruebas", Path(__file__).resolve().parents[2] / "scripts/deploy/poll-pruebas.py"
)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
OLD, NEW = "a" * 40, "b" * 40


class PollTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.poller = MODULE.Poller("not-a-real-token", Path(self.temp.name) / "state.json", logging.getLogger("test"))
        self.poller.deployed_sha = Mock(return_value=OLD)
        self.poller.healthy = Mock(return_value=True)
        self.poller.backup = Mock()
        self.compose = {
            "composeId": MODULE.COMPOSE_ID, "appName": MODULE.APP_NAME,
            "branch": MODULE.BRANCH, "owner": "obiticadev", "repository": "presupuestos-isf",
            "sourceType": "github", "githubId": MODULE.GITHUB_ID,
            "composePath": "./compose.yaml", "composeStatus": "done", "deployments": [],
            "autoDeploy": True,
        }
        self.remote = NEW
        self.calls = []

        def api(endpoint, data=None):
            self.calls.append((endpoint, data))
            if endpoint.startswith("compose.one"):
                return self.compose
            if endpoint.startswith("github.getGithubBranches"):
                return [{"name": MODULE.BRANCH, "commit": {"sha": self.remote}}]
            return {"success": True}
        self.poller.api = Mock(side_effect=api)

    def deploys(self):
        return [data for endpoint, data in self.calls if endpoint == "compose.deploy"]

    def test_unchanged_does_not_backup_or_deploy(self):
        self.remote = OLD
        self.poller.run()
        self.poller.backup.assert_not_called()
        self.assertEqual(self.deploys(), [])

    def test_changed_backs_up_and_only_deploys_tests(self):
        self.poller.run()
        self.poller.backup.assert_called_once()
        self.assertEqual(self.deploys()[0]["composeId"], MODULE.COMPOSE_ID)
        self.assertEqual(json.loads(self.poller.state_file.read_text())["pending"]["sha"], NEW)

    def test_rejects_master_or_different_service(self):
        for key, value in [("branch", "master"), ("composeId", "production"), ("appName", "production")]:
            with self.subTest(key=key):
                original = self.compose[key]
                self.compose[key] = value
                with self.assertRaises(RuntimeError):
                    self.poller.run()
                self.compose[key] = original
        self.assertEqual(self.deploys(), [])

    def test_running_skips(self):
        self.compose["composeStatus"] = "running"
        self.poller.run()
        self.assertEqual(self.deploys(), [])

    def test_disabled_in_dokploy_skips(self):
        self.compose["autoDeploy"] = False
        self.poller.run()
        self.assertEqual(self.deploys(), [])
        self.poller.backup.assert_not_called()

    def test_failed_backup_prevents_deploy(self):
        self.poller.backup.side_effect = RuntimeError("backup failed")
        with self.assertRaises(RuntimeError):
            self.poller.run()
        self.assertEqual(self.deploys(), [])

    def test_pending_does_not_queue_twice(self):
        self.poller.run()
        self.poller.run()
        self.assertEqual(len(self.deploys()), 1)

    def test_success_is_confirmed_before_advancing_state(self):
        self.poller.run()
        self.poller.deployed_sha.return_value = NEW
        self.compose["deployments"] = [{"deploymentId": "new", "status": "done", "createdAt": "2026-11-17"}]
        self.poller.run()
        state = json.loads(self.poller.state_file.read_text())
        self.assertEqual(state["last_success_sha"], NEW)
        self.assertNotIn("pending", state)
        self.assertEqual(len(self.deploys()), 1)

    def test_failed_deploy_does_not_retry_same_commit(self):
        self.poller.run()
        self.compose["composeStatus"] = "error"
        self.compose["deployments"] = [{"deploymentId": "new", "status": "error", "createdAt": "2026-11-17"}]
        self.poller.run()
        self.poller.run()
        self.assertEqual(len(self.deploys()), 1)
        self.remote = "c" * 40
        self.poller.run()
        self.assertEqual(len(self.deploys()), 2)


if __name__ == "__main__":
    unittest.main()
