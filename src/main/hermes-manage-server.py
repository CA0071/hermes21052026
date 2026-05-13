#!/usr/bin/env python3
"""
Hermes Management + Proxy Server — standalone, no Electron required.
Listens on port 8644:
  POST /manage  -> management API (memory, soul, tools, etc.)
  everything else -> reverse-proxied to hermes-agent on port 8642 (streaming-safe)

Usage: python3 hermes-manage-server.py
"""

import http.client
import http.server
import json
import os
import re
import sqlite3
import subprocess
import sys
import threading
from pathlib import Path

HERMES_HOME = Path(os.environ.get("HERMES_HOME", Path.home() / ".hermes"))
MANAGE_PORT = 8644        # cloudflared points here
AGENT_PORT  = 8642        # hermes-agent listens here
ENTRY_DELIMITER = "\n§\n"
MEMORY_CHAR_LIMIT = 2200
USER_CHAR_LIMIT = 1375
DEFAULT_SOUL = (
    "You are Hermes, a helpful AI assistant. You are friendly, knowledgeable, "
    "and always eager to help.\n\nYou communicate clearly and concisely. When asked "
    "to perform tasks, you think step-by-step and explain your reasoning. You are "
    "honest about your limitations and ask for clarification when needed.\n\n"
    "You strive to be helpful while being safe and responsible. You respect the "
    "user's privacy and handle sensitive information carefully.\n"
)

# ── Toolset definitions ───────────────────────────────────
TOOLSET_DEFS = [
    {"key": "web",            "label": "Web Search",           "description": "Search the web and extract content from URLs"},
    {"key": "browser",        "label": "Browser",              "description": "Navigate, click, type, and interact with web pages"},
    {"key": "terminal",       "label": "Terminal",             "description": "Execute shell commands and scripts"},
    {"key": "file",           "label": "File Operations",      "description": "Read, write, search, and manage files"},
    {"key": "code_execution", "label": "Code Execution",       "description": "Execute Python and shell code directly"},
    {"key": "vision",         "label": "Vision",               "description": "Analyze images and visual content"},
    {"key": "image_gen",      "label": "Image Generation",     "description": "Generate images with DALL-E and other models"},
    {"key": "tts",            "label": "Text-to-Speech",       "description": "Convert text to spoken audio"},
    {"key": "skills",         "label": "Skills",               "description": "Create, manage, and execute reusable skills"},
    {"key": "memory",         "label": "Memory",               "description": "Store and recall persistent knowledge"},
    {"key": "session_search", "label": "Session Search",       "description": "Search across past conversations"},
    {"key": "clarify",        "label": "Clarifying Questions", "description": "Ask the user for clarification when needed"},
    {"key": "delegation",     "label": "Delegation",           "description": "Spawn sub-agents for parallel tasks"},
    {"key": "cronjob",        "label": "Cron Jobs",            "description": "Create and manage scheduled tasks"},
    {"key": "moa",            "label": "Mixture of Agents",    "description": "Coordinate multiple AI models together"},
    {"key": "todo",           "label": "Task Planning",        "description": "Create and manage to-do lists for complex tasks"},
]

# ── Path helpers ──────────────────────────────────────────

PROFILE_NAME_RE = re.compile(r"^[a-z0-9_][a-z0-9_-]{0,63}$")

def profile_home(profile=None):
    if profile and profile != "default" and PROFILE_NAME_RE.match(profile):
        return HERMES_HOME / "profiles" / profile
    return HERMES_HOME

def profile_paths(profile=None):
    home = profile_home(profile)
    return {"home": home, "env_file": home / ".env", "config_file": home / "config.yaml"}

def safe_write(path, content):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")

# ── API key ───────────────────────────────────────────────

def load_api_key():
    env_file = HERMES_HOME / ".env"
    if not env_file.exists():
        return ""
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        if k.strip() == "API_SERVER_KEY":
            return v.strip().strip("\"'")
    return ""

# ── Env ──────────────────────────────────────────────────

def read_env(profile=None):
    env_file = profile_paths(profile)["env_file"]
    if not env_file.exists():
        return {}
    result = {}
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line.startswith("#") or "=" not in line:
            continue
        eq = line.index("=")
        k = line[:eq].strip()
        v = line[eq+1:].strip().strip("\"'")
        if v:
            result[k] = v
    return result

def set_env(key, value, profile=None):
    env_file = profile_paths(profile)["env_file"]
    if not env_file.exists():
        safe_write(env_file, f"{key}={value}\n")
        return
    lines = env_file.read_text(encoding="utf-8").split("\n")
    found = False
    pattern = re.compile(rf"^#?\s*{re.escape(key)}\s*=")
    for i, line in enumerate(lines):
        if pattern.match(line.strip()):
            lines[i] = f"{key}={value}"
            found = True
            break
    if not found:
        lines.append(f"{key}={value}")
    safe_write(env_file, "\n".join(lines))

# ── Config ───────────────────────────────────────────────

def get_config_value(key, profile=None):
    config_file = profile_paths(profile)["config_file"]
    if not config_file.exists():
        return None
    content = config_file.read_text(encoding="utf-8")
    m = re.search(rf'^\s*{re.escape(key)}:\s*["\']?([^"\'\n#]+)["\']?', content, re.M)
    return m.group(1).strip() if m else None

def set_config_value(key, value, profile=None):
    config_file = profile_paths(profile)["config_file"]
    if not config_file.exists():
        return
    content = config_file.read_text(encoding="utf-8")
    pattern = re.compile(rf'^(\s*#?\s*{re.escape(key)}:\s*)["\']?[^"\'\n#]*["\']?', re.M)
    content = pattern.sub(rf'\g<1>"{value}"', content)
    safe_write(config_file, content)

def get_model_config(profile=None):
    config_file = profile_paths(profile)["config_file"]
    defaults = {"provider": "auto", "model": "", "baseUrl": ""}
    if not config_file.exists():
        return defaults
    content = config_file.read_text(encoding="utf-8")
    pm = re.search(r'^\s*provider:\s*["\']?([^"\'\n#]+)["\']?', content, re.M)
    mm = re.search(r'^\s*default:\s*["\']?([^"\'\n#]+)["\']?', content, re.M)
    bm = re.search(r'^\s*base_url:\s*["\']?([^"\'\n#]+)["\']?', content, re.M)
    return {
        "provider": pm.group(1).strip() if pm else defaults["provider"],
        "model": mm.group(1).strip() if mm else defaults["model"],
        "baseUrl": bm.group(1).strip() if bm else defaults["baseUrl"],
    }

def set_model_config(provider, model, base_url, profile=None):
    config_file = profile_paths(profile)["config_file"]
    if not config_file.exists():
        return
    content = config_file.read_text(encoding="utf-8")
    content = re.sub(r'^(\s*provider:\s*)["\']?[^"\'\n#]*["\']?', rf'\g<1>"{provider}"', content, flags=re.M)
    content = re.sub(r'^(\s*default:\s*)["\']?[^"\'\n#]*["\']?', rf'\g<1>"{model}"', content, flags=re.M)
    if re.search(r'^\s*base_url:\s*', content, re.M):
        content = re.sub(r'^(\s*base_url:\s*)["\']?[^"\'\n#]*["\']?', rf'\g<1>"{base_url}"', content, flags=re.M)
    elif base_url and provider != "auto":
        content = re.sub(r'^(\s*provider:\s*"[^"]*"\s*\n)', rf'\g<1>  base_url: "{base_url}"\n', content, flags=re.M)
    safe_write(config_file, content)

def get_hermes_home(profile=None):
    return str(profile_paths(profile)["home"])

def get_platform_enabled(profile=None):
    platforms = ["telegram", "discord", "slack", "whatsapp", "signal"]
    config_file = profile_paths(profile)["config_file"]
    if not config_file.exists():
        return {}
    content = config_file.read_text(encoding="utf-8")
    result = {}
    for p in platforms:
        m = re.search(rf'^\s+{re.escape(p)}:\s*\n\s+enabled:\s*(true|false)', content, re.M)
        result[p] = (m.group(1) == "true") if m else False
    return result

def set_platform_enabled(platform, enabled, profile=None):
    platforms = ["telegram", "discord", "slack", "whatsapp", "signal"]
    if platform not in platforms:
        return
    config_file = profile_paths(profile)["config_file"]
    if not config_file.exists():
        return
    content = config_file.read_text(encoding="utf-8")
    val = "true" if enabled else "false"
    existing = re.compile(rf'^(\s+{re.escape(platform)}:\s*\n\s+enabled:\s*)(?:true|false)', re.M)
    if existing.search(content):
        content = existing.sub(rf'\g<1>{val}', content)
    else:
        entry = f"  {platform}:\n    enabled: {val}\n"
        content += f"\nplatforms:\n{entry}" if "\nplatforms:" not in content else entry
    safe_write(config_file, content)

# ── Memory ───────────────────────────────────────────────

def memory_path(profile=None): return profile_home(profile) / "memories" / "MEMORY.md"
def user_path(profile=None):   return profile_home(profile) / "memories" / "USER.md"

def parse_entries(content):
    if not content.strip():
        return []
    return [{"index": i, "content": e.strip()} for i, e in enumerate(content.split(ENTRY_DELIMITER)) if e.strip()]

def serialize_entries(entries):
    return ENTRY_DELIMITER.join(e["content"] for e in entries)

def get_session_stats(profile=None):
    db_path = profile_home(profile) / "state.db"
    if not db_path.exists():
        return {"totalSessions": 0, "totalMessages": 0}
    try:
        con = sqlite3.connect(str(db_path))
        s = con.execute("SELECT COUNT(*) FROM sessions").fetchone()[0]
        m = con.execute("SELECT COUNT(*) FROM messages").fetchone()[0]
        con.close()
        return {"totalSessions": s, "totalMessages": m}
    except Exception:
        return {"totalSessions": 0, "totalMessages": 0}

def read_memory(profile=None):
    def read_file(p):
        if not p.exists():
            return {"content": "", "exists": False, "lastModified": None}
        c = p.read_text(encoding="utf-8")
        return {"content": c, "exists": True, "lastModified": int(p.stat().st_mtime)}
    mem = read_file(memory_path(profile))
    user = read_file(user_path(profile))
    return {
        "memory": {**mem, "entries": parse_entries(mem["content"]),
                   "charCount": len(mem["content"]), "charLimit": MEMORY_CHAR_LIMIT},
        "user": {**user, "charCount": len(user["content"]), "charLimit": USER_CHAR_LIMIT},
        "stats": get_session_stats(profile),
    }

def add_memory_entry(content, profile=None):
    fp = memory_path(profile)
    existing = fp.read_text(encoding="utf-8") if fp.exists() else ""
    entries = parse_entries(existing)
    entries.append({"index": len(entries), "content": content.strip()})
    new_content = serialize_entries(entries)
    if len(new_content) > MEMORY_CHAR_LIMIT:
        return {"success": False, "error": f"Would exceed memory limit ({len(new_content)}/{MEMORY_CHAR_LIMIT} chars)"}
    safe_write(fp, new_content)
    return {"success": True}

def update_memory_entry(index, content, profile=None):
    fp = memory_path(profile)
    existing = fp.read_text(encoding="utf-8") if fp.exists() else ""
    entries = parse_entries(existing)
    if index < 0 or index >= len(entries):
        return {"success": False, "error": "Entry not found"}
    entries[index]["content"] = content.strip()
    new_content = serialize_entries(entries)
    if len(new_content) > MEMORY_CHAR_LIMIT:
        return {"success": False, "error": "Would exceed memory limit"}
    safe_write(fp, new_content)
    return {"success": True}

def remove_memory_entry(index, profile=None):
    fp = memory_path(profile)
    existing = fp.read_text(encoding="utf-8") if fp.exists() else ""
    entries = parse_entries(existing)
    if index < 0 or index >= len(entries):
        return False
    entries.pop(index)
    safe_write(fp, serialize_entries(entries))
    return True

def write_user_profile(content, profile=None):
    if len(content) > USER_CHAR_LIMIT:
        return {"success": False, "error": f"Exceeds limit ({len(content)}/{USER_CHAR_LIMIT} chars)"}
    safe_write(user_path(profile), content)
    return {"success": True}

# ── Soul ─────────────────────────────────────────────────

def soul_path(profile=None): return profile_home(profile) / "SOUL.md"

def read_soul(profile=None):
    p = soul_path(profile)
    return p.read_text(encoding="utf-8") if p.exists() else ""

def write_soul(content, profile=None):
    safe_write(soul_path(profile), content)
    return True

def reset_soul(profile=None):
    safe_write(soul_path(profile), DEFAULT_SOUL)
    return DEFAULT_SOUL

# ── Skills ───────────────────────────────────────────────

def parse_skill_frontmatter(content):
    result = {"name": "", "description": ""}
    if not content.startswith("---"):
        m = re.search(r"^#\s+(.+)", content, re.M)
        if m:
            result["name"] = m.group(1).strip()
        m2 = re.search(r"^(?!#)(?!---).+", content, re.M)
        if m2:
            result["description"] = m2.group(0).strip()[:120]
        return result
    end = content.find("---", 3)
    if end == -1:
        return result
    fm = content[3:end]
    nm = re.search(r'^\s*name:\s*["\']?([^"\'\n]+)["\']?\s*$', fm, re.M)
    if nm:
        result["name"] = nm.group(1).strip()
    dm = re.search(r'^\s*description:\s*["\']?([^"\'\n]+)["\']?\s*$', fm, re.M)
    if dm:
        result["description"] = dm.group(1).strip()
    return result

def list_installed_skills(profile=None):
    base = profile_home(profile) / "skills"
    results = []
    if not base.exists():
        return results
    for cat_dir in sorted(base.iterdir()):
        if not cat_dir.is_dir():
            continue
        for skill_dir in sorted(cat_dir.iterdir()):
            if not skill_dir.is_dir():
                continue
            skill_file = skill_dir / "SKILL.md"
            if skill_file.exists():
                meta = parse_skill_frontmatter(skill_file.read_text(encoding="utf-8"))
                results.append({
                    "name": meta["name"] or skill_dir.name,
                    "category": cat_dir.name,
                    "description": meta["description"],
                    "path": str(skill_file),
                })
    return results

def list_bundled_skills(): return []
def get_skill_content(skill_path): p = Path(skill_path); return p.read_text(encoding="utf-8") if p.exists() else ""

def install_skill(identifier, profile=None):
    python = str(HERMES_HOME / "venv" / "bin" / "python")
    if not Path(python).exists():
        python = "python3"
    result = subprocess.run([python, "-m", "hermes", "skill", "install", identifier],
                            capture_output=True, text=True, timeout=60)
    if result.returncode != 0:
        raise Exception(result.stderr or result.stdout)
    return True

def uninstall_skill(name, profile=None):
    python = str(HERMES_HOME / "venv" / "bin" / "python")
    if not Path(python).exists():
        python = "python3"
    result = subprocess.run([python, "-m", "hermes", "skill", "remove", name],
                            capture_output=True, text=True, timeout=30)
    return result.returncode == 0

# ── Sessions ─────────────────────────────────────────────

def get_db(profile=None):
    db_path = profile_home(profile) / "state.db"
    if not db_path.exists():
        return None
    con = sqlite3.connect(str(db_path))
    con.row_factory = sqlite3.Row
    return con

def list_sessions(limit=50, offset=0, profile=None):
    con = get_db(profile)
    if not con:
        return []
    try:
        try:
            rows = con.execute(
                "SELECT id, started_at, source, message_count, model, title "
                "FROM sessions ORDER BY started_at DESC LIMIT ? OFFSET ?",
                (limit or 50, offset or 0)).fetchall()
        except sqlite3.OperationalError:
            rows = con.execute(
                "SELECT id, created_at as started_at, NULL as source, 0 as message_count, '' as model, NULL as title "
                "FROM sessions ORDER BY created_at DESC LIMIT ? OFFSET ?",
                (limit or 50, offset or 0)).fetchall()
        return [
            {
                "id": dict(r)["id"],
                "title": dict(r).get("title") or "",
                "startedAt": dict(r).get("started_at") or 0,
                "source": dict(r).get("source") or "cli",
                "messageCount": dict(r).get("message_count") or 0,
                "model": dict(r).get("model") or "",
            }
            for r in rows
        ]
    finally:
        con.close()

def get_session_messages(session_id, profile=None):
    con = get_db(profile)
    if not con:
        return []
    try:
        rows = con.execute(
            "SELECT id, role, content, created_at FROM messages WHERE session_id=? ORDER BY created_at ASC",
            (session_id,)).fetchall()
        return [dict(r) for r in rows]
    finally:
        con.close()

def search_sessions(query, limit=20, profile=None):
    con = get_db(profile)
    if not con:
        return []
    try:
        try:
            rows = con.execute(
                "SELECT DISTINCT s.id, s.started_at, s.source, s.message_count, s.model, s.title "
                "FROM sessions s "
                "JOIN messages m ON m.session_id=s.id WHERE m.content LIKE ? "
                "ORDER BY s.started_at DESC LIMIT ?",
                (f"%{query}%", limit or 20)).fetchall()
        except sqlite3.OperationalError:
            rows = con.execute(
                "SELECT DISTINCT s.id, s.created_at as started_at, NULL as source, 0 as message_count, '' as model, NULL as title "
                "FROM sessions s "
                "JOIN messages m ON m.session_id=s.id WHERE m.content LIKE ? "
                "ORDER BY s.created_at DESC LIMIT ?",
                (f"%{query}%", limit or 20)).fetchall()
        return [
            {
                "id": dict(r)["id"],
                "title": dict(r).get("title") or "",
                "startedAt": dict(r).get("started_at") or 0,
                "source": dict(r).get("source") or "cli",
                "messageCount": dict(r).get("message_count") or 0,
                "model": dict(r).get("model") or "",
            }
            for r in rows
        ]
    finally:
        con.close()

def list_cached_sessions(limit=50, offset=0, profile=None): return list_sessions(limit, offset, profile)
def sync_session_cache(profile=None): return list_sessions(50, 0, profile)

def update_session_title(session_id, title, profile=None):
    con = get_db(profile)
    if not con:
        return False
    try:
        con.execute("UPDATE sessions SET title=? WHERE id=?", (title, session_id))
        con.commit()
        return True
    finally:
        con.close()

# ── Profiles ─────────────────────────────────────────────

def get_active_profile_name():
    active_file = HERMES_HOME / "active_profile"
    try:
        return active_file.read_text(encoding="utf-8").strip() or "default"
    except Exception:
        return "default"

def read_profile_config(home):
    config_file = Path(home) / "config.yaml"
    if not config_file.exists():
        return {"provider": "auto", "model": ""}
    content = config_file.read_text(encoding="utf-8")
    pm = re.search(r'^\s*provider:\s*["\']?([^"\'\n#]+)["\']?', content, re.M)
    mm = re.search(r'^\s*default:\s*["\']?([^"\'\n#]+)["\']?', content, re.M)
    return {
        "provider": pm.group(1).strip() if pm else "auto",
        "model": mm.group(1).strip() if mm else "",
    }

def count_skills_in(home):
    skills_dir = Path(home) / "skills"
    if not skills_dir.exists():
        return 0
    count = 0
    try:
        for cat in skills_dir.iterdir():
            if cat.is_dir():
                for skill in cat.iterdir():
                    if skill.is_dir() and (skill / "SKILL.md").exists():
                        count += 1
    except Exception:
        pass
    return count

def list_profiles():
    active_name = get_active_profile_name()
    profiles_dir = HERMES_HOME / "profiles"
    results = []

    cfg = read_profile_config(HERMES_HOME)
    results.append({
        "name": "default",
        "path": str(HERMES_HOME),
        "isDefault": True,
        "isActive": active_name == "default",
        "model": cfg["model"],
        "provider": cfg["provider"],
        "hasEnv": (HERMES_HOME / ".env").exists(),
        "hasSoul": (HERMES_HOME / "SOUL.md").exists(),
        "skillCount": count_skills_in(HERMES_HOME),
        "gatewayRunning": False,
    })

    if profiles_dir.exists():
        for entry in sorted(profiles_dir.iterdir()):
            if entry.is_dir():
                cfg = read_profile_config(entry)
                results.append({
                    "name": entry.name,
                    "path": str(entry),
                    "isDefault": False,
                    "isActive": active_name == entry.name,
                    "model": cfg["model"],
                    "provider": cfg["provider"],
                    "hasEnv": (entry / ".env").exists(),
                    "hasSoul": (entry / "SOUL.md").exists(),
                    "skillCount": count_skills_in(entry),
                    "gatewayRunning": False,
                })
    return results

def create_profile(name, clone=False):
    target = HERMES_HOME / "profiles" / name
    target.mkdir(parents=True, exist_ok=True)
    if clone:
        import shutil
        for f in ["SOUL.md", ".env", "config.yaml"]:
            src = HERMES_HOME / f
            if src.exists():
                shutil.copy2(src, target / f)
    return True

def delete_profile(name):
    import shutil
    target = HERMES_HOME / "profiles" / name
    if target.exists():
        shutil.rmtree(target)
    return True

def set_active_profile(name):
    safe_write(HERMES_HOME / "active_profile", name)
    return True

# ── Tools ────────────────────────────────────────────────

def parse_enabled_toolsets(content):
    enabled = set()
    in_pt = False
    in_cli = False
    for line in content.split("\n"):
        trimmed = line.rstrip()
        if re.match(r'^\s*platform_toolsets\s*:', trimmed):
            in_pt = True
            in_cli = False
            continue
        if in_pt and re.match(r'^\s+cli\s*:', trimmed):
            in_cli = True
            continue
        if in_pt and re.match(r'^\S', trimmed) and trimmed:
            in_pt = False
            in_cli = False
            continue
        if in_cli and re.match(r'^\s{4}\S', trimmed) and not re.match(r'^\s{4,}-', trimmed):
            in_cli = False
            continue
        if in_cli:
            m = re.match(r'^\s+-\s+["\']?(\w+)["\']?', trimmed)
            if m:
                enabled.add(m.group(1))
    return enabled

def get_toolsets(profile=None):
    config_file = profile_paths(profile)["config_file"]
    if not config_file.exists():
        return [{"key": d["key"], "label": d["label"], "description": d["description"], "enabled": True} for d in TOOLSET_DEFS]
    content = config_file.read_text(encoding="utf-8")
    enabled_set = parse_enabled_toolsets(content)
    has_pt = "platform_toolsets" in content
    return [
        {
            "key": d["key"],
            "label": d["label"],
            "description": d["description"],
            "enabled": d["key"] in enabled_set if has_pt else True,
        }
        for d in TOOLSET_DEFS
    ]

def set_toolset_enabled(key, enabled, profile=None):
    config_file = profile_paths(profile)["config_file"]
    if not config_file.exists():
        return False
    content = config_file.read_text(encoding="utf-8")
    current_enabled = parse_enabled_toolsets(content)
    if enabled:
        current_enabled.add(key)
    else:
        current_enabled.discard(key)

    toolset_lines = "\n".join(f"      - {k}" for k in sorted(current_enabled))
    new_section = f"  cli:\n{toolset_lines}"

    if "platform_toolsets" in content:
        lines = content.split("\n")
        result = []
        in_pt = False
        in_cli = False
        cli_inserted = False
        for line in lines:
            trimmed = line.rstrip()
            if re.match(r'^\s*platform_toolsets\s*:', trimmed):
                in_pt = True
                result.append(line)
                continue
            if in_pt and re.match(r'^\s+cli\s*:', trimmed):
                in_cli = True
                result.append(new_section)
                cli_inserted = True
                continue
            if in_cli:
                if re.match(r'^\s+-\s', trimmed):
                    continue
                if re.match(r'^\s{4}\S', trimmed) or re.match(r'^\S', trimmed) or trimmed == "":
                    in_cli = False
                    result.append(line)
                    continue
                continue
            if in_pt and re.match(r'^\S', trimmed) and trimmed:
                in_pt = False
                if not cli_inserted:
                    result.append(new_section)
                    cli_inserted = True
            result.append(line)
        safe_write(config_file, "\n".join(result))
    else:
        new_content = content.rstrip() + f"\n\nplatform_toolsets:\n{new_section}\n"
        safe_write(config_file, new_content)
    return True

# ── Cron ─────────────────────────────────────────────────

def cron_path(profile=None): return profile_home(profile) / "cron" / "jobs.json"

def read_cron(profile=None):
    p = cron_path(profile)
    if not p.exists():
        return []
    try:
        parsed = json.loads(p.read_text(encoding="utf-8"))
        return parsed if isinstance(parsed, list) else parsed.get("jobs", [])
    except Exception:
        return []

def write_cron(jobs, profile=None):
    safe_write(cron_path(profile), json.dumps(jobs, indent=2))

def normalize_job(job):
    if not job.get("id"):
        return None
    enabled = job.get("enabled", True) is not False
    state = "active"
    if job.get("state") == "paused" or not enabled:
        state = "paused"
    elif job.get("state") == "completed":
        state = "completed"
    schedule = job.get("schedule", "")
    if isinstance(schedule, dict):
        schedule = schedule.get("value", "?")
    schedule = job.get("schedule_display") or schedule or "?"
    deliver = job.get("deliver", ["local"])
    if isinstance(deliver, str):
        deliver = [deliver] if deliver else ["local"]
    elif not isinstance(deliver, list):
        deliver = ["local"]
    skills = job.get("skills") or []
    if not isinstance(skills, list):
        skills = [skills] if skills else []
    return {
        "id": str(job["id"]),
        "name": job.get("name") or "(unnamed)",
        "schedule": schedule,
        "prompt": job.get("prompt") or "",
        "state": state,
        "enabled": enabled,
        "next_run_at": job.get("next_run_at"),
        "last_run_at": job.get("last_run_at"),
        "last_status": job.get("last_status"),
        "last_error": job.get("last_error"),
        "repeat": job.get("repeat"),
        "deliver": deliver,
        "skills": skills,
        "script": job.get("script"),
    }

def list_cron_jobs(include_disabled=False, profile=None):
    results = []
    for job in read_cron(profile):
        n = normalize_job(job)
        if n is None:
            continue
        if not include_disabled and not n["enabled"]:
            continue
        results.append(n)
    return results

def create_cron_job(schedule, prompt=None, name=None, deliver=None, profile=None):
    import uuid
    jobs = read_cron(profile)
    deliver_list = [deliver] if deliver and isinstance(deliver, str) else (deliver or ["local"])
    job = {
        "id": str(uuid.uuid4()),
        "schedule": schedule,
        "prompt": prompt or "",
        "name": name or "(unnamed)",
        "deliver": deliver_list,
        "enabled": True,
        "state": "active",
        "skills": [],
        "script": None,
        "next_run_at": None,
        "last_run_at": None,
        "last_status": None,
        "last_error": None,
        "repeat": None,
    }
    jobs.append(job)
    write_cron(jobs, profile)
    return normalize_job(job)

def remove_cron_job(job_id, profile=None):
    write_cron([j for j in read_cron(profile) if j.get("id") != job_id], profile)
    return True

def pause_cron_job(job_id, profile=None):
    jobs = read_cron(profile)
    for j in jobs:
        if j.get("id") == job_id:
            j["enabled"] = False
            j["state"] = "paused"
    write_cron(jobs, profile)
    return True

def resume_cron_job(job_id, profile=None):
    jobs = read_cron(profile)
    for j in jobs:
        if j.get("id") == job_id:
            j["enabled"] = True
            j["state"] = "active"
    write_cron(jobs, profile)
    return True

def trigger_cron_job(job_id, profile=None): return True

# ── Models ───────────────────────────────────────────────

def models_path(): return HERMES_HOME / "models.json"

def read_models():
    p = models_path()
    if not p.exists():
        return []
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return []

def write_models(models): safe_write(models_path(), json.dumps(models, indent=2))
def list_models(): return read_models()

def add_model(name, provider, model, base_url):
    import uuid
    models = read_models()
    entry = {"id": str(uuid.uuid4()), "name": name, "provider": provider,
             "model": model, "baseUrl": base_url}
    models.append(entry)
    write_models(models)
    return entry

def remove_model(model_id):
    write_models([m for m in read_models() if m.get("id") != model_id])
    return True

def update_model(model_id, fields):
    models = read_models()
    for m in models:
        if m.get("id") == model_id:
            m.update(fields)
    write_models(models)
    return True

# ── MCP ──────────────────────────────────────────────────

def list_mcp_servers(profile=None):
    config_file = profile_paths(profile)["config_file"]
    if not config_file.exists():
        return []
    content = config_file.read_text(encoding="utf-8")
    m = re.search(r'^\s*mcp_servers:\s*\n((?:\s+.+\n?)*)', content, re.M)
    if not m:
        return []
    servers, current = [], {}
    for line in m.group(1).splitlines():
        nm = re.match(r'^\s{2}(\w+):\s*$', line)
        if nm:
            if current:
                servers.append(current)
            current = {"name": nm.group(1)}
        elif current:
            km = re.match(r'^\s{4}(\w+):\s*["\']?([^"\'\n#]+)["\']?', line)
            if km:
                current[km.group(1)] = km.group(2).strip()
    if current:
        servers.append(current)
    return servers

# ── Auto Connect ─────────────────────────────────────────

def get_auto_connect():
    desktop = HERMES_HOME / "desktop.json"
    if not desktop.exists():
        return False
    try:
        return json.loads(desktop.read_text(encoding="utf-8")).get("autoConnect", False)
    except Exception:
        return False

def set_auto_connect(enabled):
    desktop = HERMES_HOME / "desktop.json"
    try:
        data = json.loads(desktop.read_text(encoding="utf-8")) if desktop.exists() else {}
    except Exception:
        data = {}
    data["autoConnect"] = enabled
    safe_write(desktop, json.dumps(data, indent=2))
    return True

# ── Gateway / Tunnel ─────────────────────────────────────

def get_gateway_status():
    return True  # We're running, so the server is up

def get_tunnel_status():
    return {"status": "active", "url": None}

def get_tunnel_config():
    desktop = HERMES_HOME / "desktop.json"
    try:
        data = json.loads(desktop.read_text(encoding="utf-8")) if desktop.exists() else {}
    except Exception:
        data = {}
    return {
        "mode": data.get("tunnelMode", "quick"),
        "tunnelName": data.get("tunnelName", ""),
        "hostname": data.get("tunnelHostname", ""),
    }

def save_tunnel_config(mode, tunnel_name, hostname):
    desktop = HERMES_HOME / "desktop.json"
    try:
        data = json.loads(desktop.read_text(encoding="utf-8")) if desktop.exists() else {}
    except Exception:
        data = {}
    data["tunnelMode"] = mode
    data["tunnelName"] = tunnel_name
    data["tunnelHostname"] = hostname
    safe_write(desktop, json.dumps(data, indent=2))
    return True

# ── Method dispatch ──────────────────────────────────────

def dispatch(method, params):
    p = params or {}
    prof = p.get("profile")
    if method == "readMemory":          return read_memory(prof)
    if method == "addMemoryEntry":      return add_memory_entry(p["content"], prof)
    if method == "updateMemoryEntry":   return update_memory_entry(int(p["index"]), p["content"], prof)
    if method == "removeMemoryEntry":   return remove_memory_entry(int(p["index"]), prof)
    if method == "writeUserProfile":    return write_user_profile(p["content"], prof)
    if method == "readSoul":            return read_soul(prof)
    if method == "writeSoul":           return write_soul(p["content"], prof)
    if method == "resetSoul":           return reset_soul(prof)
    if method == "getToolsets":         return get_toolsets(prof)
    if method == "setToolsetEnabled":   return set_toolset_enabled(p["key"], bool(p["enabled"]), prof)
    if method == "listInstalledSkills": return list_installed_skills(prof)
    if method == "listBundledSkills":   return list_bundled_skills()
    if method == "getSkillContent":     return get_skill_content(p["skillPath"])
    if method == "installSkill":        return install_skill(p["identifier"], prof)
    if method == "uninstallSkill":      return uninstall_skill(p["name"], prof)
    if method == "listSessions":        return list_sessions(p.get("limit"), p.get("offset"), prof)
    if method == "getSessionMessages":  return get_session_messages(p["sessionId"], prof)
    if method == "searchSessions":      return search_sessions(p["query"], p.get("limit"), prof)
    if method == "listCachedSessions":  return list_cached_sessions(p.get("limit"), p.get("offset"), prof)
    if method == "syncSessionCache":    return sync_session_cache(prof)
    if method == "updateSessionTitle":  return update_session_title(p["sessionId"], p["title"], prof)
    if method == "listProfiles":        return list_profiles()
    if method == "createProfile":       return create_profile(p["name"], bool(p.get("clone", False)))
    if method == "deleteProfile":       return delete_profile(p["name"])
    if method == "setActiveProfile":    return set_active_profile(p["name"])
    if method == "listCronJobs":        return list_cron_jobs(bool(p.get("includeDisabled")), prof)
    if method == "createCronJob":       return create_cron_job(p["schedule"], p.get("prompt"), p.get("name"), p.get("deliver"), prof)
    if method == "removeCronJob":       return remove_cron_job(p["jobId"], prof)
    if method == "pauseCronJob":        return pause_cron_job(p["jobId"], prof)
    if method == "resumeCronJob":       return resume_cron_job(p["jobId"], prof)
    if method == "triggerCronJob":      return trigger_cron_job(p["jobId"], prof)
    if method == "getEnv":              return read_env(prof)
    if method == "setEnv":              return set_env(p["key"], p["value"], prof)
    if method == "getConfig":           return get_config_value(p["key"], prof)
    if method == "setConfig":           return set_config_value(p["key"], p["value"], prof)
    if method == "getHermesHome":       return get_hermes_home(prof)
    if method == "getModelConfig":      return get_model_config(prof)
    if method == "setModelConfig":      return set_model_config(p["provider"], p["model"], p.get("baseUrl", ""), prof)
    if method == "getPlatformEnabled":  return get_platform_enabled(prof)
    if method == "setPlatformEnabled":  return set_platform_enabled(p["platform"], bool(p["enabled"]), prof)
    if method == "getAutoConnect":      return get_auto_connect()
    if method == "setAutoConnect":      return set_auto_connect(bool(p["enabled"]))
    if method == "listModels":          return list_models()
    if method == "addModel":            return add_model(p["name"], p["provider"], p["model"], p.get("baseUrl", ""))
    if method == "removeModel":         return remove_model(p["id"])
    if method == "updateModel":         return update_model(p["id"], p["fields"])
    if method == "listMcpServers":      return list_mcp_servers(prof)
    if method == "getGatewayStatus":    return get_gateway_status()
    if method == "getTunnelStatus":     return get_tunnel_status()
    if method == "getTunnelConfig":     return get_tunnel_config()
    if method == "saveTunnelConfig":    return save_tunnel_config(p.get("mode", "quick"), p.get("tunnelName", ""), p.get("hostname", ""))
    raise ValueError(f"Unknown method: {method}")

# ── Reverse proxy to hermes-agent ────────────────────────

CHUNK_SIZE = 65536

def proxy_to_agent(handler):
    """Forward the request to hermes-agent and stream the response back."""
    try:
        conn = http.client.HTTPConnection("127.0.0.1", AGENT_PORT, timeout=300)
        length = int(handler.headers.get("Content-Length", 0))
        body = handler.rfile.read(length) if length > 0 else b""

        forward_headers = {}
        for k, v in handler.headers.items():
            if k.lower() not in ("host", "transfer-encoding"):
                forward_headers[k] = v

        conn.request(handler.command, handler.path, body=body, headers=forward_headers)
        resp = conn.getresponse()

        handler.send_response(resp.status)
        for k, v in resp.getheaders():
            if k.lower() not in ("transfer-encoding",):
                handler.send_header(k, v)
        handler.end_headers()

        while True:
            chunk = resp.read(CHUNK_SIZE)
            if not chunk:
                break
            handler.wfile.write(chunk)
            handler.wfile.flush()

        conn.close()
    except Exception as e:
        try:
            handler.send_error(502, f"Proxy error: {e}")
        except Exception:
            pass

# ── HTTP Server ──────────────────────────────────────────

API_KEY = ""

class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

    def send_json(self, code, data):
        body = json.dumps(data).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def _handle(self):
        # Management API
        if self.path == "/manage" and self.command == "POST":
            if API_KEY:
                auth = self.headers.get("Authorization", "")
                if auth != f"Bearer {API_KEY}":
                    self.send_json(401, {"error": "Unauthorized"})
                    return
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length).decode("utf-8")
            try:
                req = json.loads(raw)
            except Exception:
                self.send_json(400, {"error": "Invalid JSON"})
                return
            try:
                result = dispatch(req.get("method", ""), req.get("params", {}))
                self.send_json(200, {"result": result})
            except Exception as e:
                self.send_json(500, {"error": str(e)})
            return

        # Everything else → proxy to hermes-agent
        proxy_to_agent(self)

    def do_GET(self):    self._handle()
    def do_POST(self):   self._handle()
    def do_PUT(self):    self._handle()
    def do_DELETE(self): self._handle()
    def do_PATCH(self):  self._handle()

def main():
    global API_KEY
    API_KEY = load_api_key()
    server = http.server.ThreadingHTTPServer(("0.0.0.0", MANAGE_PORT), Handler)
    print(f"Hermes proxy+management server on port {MANAGE_PORT}", flush=True)
    print(f"  /manage  -> management API (auth: {'enabled' if API_KEY else 'disabled'})", flush=True)
    print(f"  /*       -> proxy to hermes-agent on port {AGENT_PORT}", flush=True)
    print(f"  HERMES_HOME: {HERMES_HOME}", flush=True)
    server.serve_forever()

if __name__ == "__main__":
    main()
