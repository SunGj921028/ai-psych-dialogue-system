# Manual Backend Checks

These files are manual checks, not automated tests.

Some checks call live LLM providers and may require provider API keys, network
access, and provider availability. They are intentionally excluded from CI.

Default deterministic backend validation lives under `backend/tests/` and should
remain the normal automated test target:

```powershell
python -m pytest backend/tests -q --basetemp=.tmp_pytest_backend -p no:cacheprovider
```

Do not run broad `python -m pytest backend` expecting only deterministic tests
unless discovery has been checked first. Manual checks should be run only when a
human explicitly wants live/provider or legacy smoke validation.

Example manual commands from the repository root:

```powershell
python backend/manual_checks/check_crisis_agent.py
python backend/manual_checks/check_summary_agent.py
python backend/manual_checks/check_conversation_agent.py
python backend/manual_checks/check_analysis_agent.py
python backend/manual_checks/check_providers.py
python backend/manual_checks/check_db_smoke.py
```
