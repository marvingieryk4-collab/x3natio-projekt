#!/usr/bin/env python3
"""
X3 Nation Server
Serves the Apple Liquid Glass web interface, provides Discord OAuth2 verification
with Level 50, Donator, and Tester role gating, and serves firmware files.
"""

import os
import sys
import json
import time
import base64
import sqlite3
import urllib.request
import urllib.parse
import urllib.error
from http.server import HTTPServer, SimpleHTTPRequestHandler

PORT = 8080
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_FILE = os.path.join(BASE_DIR, 'config.json')
BOT_DIR = os.path.join(BASE_DIR, '..', 'bot')
BOT_ENV_FILE = os.path.join(BOT_DIR, '.env')

def parse_env_file(filepath):
    """Parse standard KEY=VALUE environment files."""
    env = {}
    if os.path.exists(filepath):
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith('#') or '=' not in line:
                        continue
                    k, v = line.split('=', 1)
                    env[k.strip()] = v.strip().strip('"').strip("'")
        except Exception as e:
            print(f"[!] Warning reading env file {filepath}: {e}")
    return env

def update_env_file(filepath, updates):
    """Update or append variables in a .env file while preserving other lines."""
    lines = []
    found_keys = set()
    if os.path.exists(filepath):
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                lines = f.readlines()
        except Exception:
            lines = []

    new_lines = []
    for line in lines:
        stripped = line.strip()
        if stripped and not stripped.startswith('#') and '=' in stripped:
            key = stripped.split('=', 1)[0].strip()
            if key in updates:
                new_lines.append(f"{key}={updates[key]}\n")
                found_keys.add(key)
                continue
        new_lines.append(line)

    for k, v in updates.items():
        if k not in found_keys:
            new_lines.append(f"{k}={v}\n")

    try:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.writelines(new_lines)
    except Exception as e:
        print(f"[!] Warning writing env file {filepath}: {e}")

def load_config():
    cfg = {
        "discord": {
            "clientId": "",
            "clientSecret": "",
            "redirectUri": f"http://localhost:{PORT}/api/discord/callback",
            "guildId": "",
            "botToken": "",
            "ownerId": "",
            "donatorRoleId": "",
            "testerRoleId": "",
            "requiredRoleId": "",
            "roleName": "X3 Nation Member",
            "requiredLevel": 5
        },
        "app": {
            "name": "X3 Nation",
            "version": "1.0.0",
            "developerMode": True
        }
    }

    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                loaded = json.load(f)
                if "discord" in loaded:
                    cfg["discord"].update(loaded["discord"])
                if "app" in loaded:
                    cfg["app"].update(loaded["app"])
        except Exception as e:
            print(f"[!] Error loading config.json: {e}")

    # Merge with bot .env file
    bot_env = parse_env_file(BOT_ENV_FILE)
    local_env = parse_env_file(os.path.join(BASE_DIR, '.env'))
    env = {**bot_env, **local_env}

    discord_cfg = cfg["discord"]
    if env.get("DISCORD_TOKEN") and not discord_cfg.get("botToken"):
        discord_cfg["botToken"] = env["DISCORD_TOKEN"]
    if env.get("GUILD_ID") and not discord_cfg.get("guildId"):
        discord_cfg["guildId"] = env["GUILD_ID"]
    if env.get("OWNER_ID") and not discord_cfg.get("ownerId"):
        discord_cfg["ownerId"] = env["OWNER_ID"]
    if env.get("CLIENT_ID") and not discord_cfg.get("clientId"):
        discord_cfg["clientId"] = env["CLIENT_ID"]
    if env.get("CLIENT_SECRET") and not discord_cfg.get("clientSecret"):
        discord_cfg["clientSecret"] = env["CLIENT_SECRET"]

    # If clientId is still empty but botToken exists, attempt to extract client ID from token
    if not discord_cfg.get("clientId") and discord_cfg.get("botToken"):
        try:
            first_part = discord_cfg["botToken"].split('.')[0]
            # Add padding
            padding = len(first_part) % 4
            if padding:
                first_part += '=' * (4 - padding)
            decoded_id = base64.b64decode(first_part).decode('utf-8')
            if decoded_id.isdigit():
                discord_cfg["clientId"] = decoded_id
        except Exception:
            pass

    return cfg

def save_config(cfg):
    try:
        with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
            json.dump(cfg, f, indent=2)
    except Exception as e:
        print(f"[!] Error saving config.json: {e}")

    # Keep bot .env in sync
    discord_cfg = cfg.get("discord", {})
    env_updates = {}
    if discord_cfg.get("botToken"):
        env_updates["DISCORD_TOKEN"] = discord_cfg["botToken"]
    if discord_cfg.get("guildId"):
        env_updates["GUILD_ID"] = discord_cfg["guildId"]
    if discord_cfg.get("ownerId"):
        env_updates["OWNER_ID"] = discord_cfg["ownerId"]
    if discord_cfg.get("clientId"):
        env_updates["CLIENT_ID"] = discord_cfg["clientId"]
    if discord_cfg.get("clientSecret"):
        env_updates["CLIENT_SECRET"] = discord_cfg["clientSecret"]

    if env_updates:
        update_env_file(BOT_ENV_FILE, env_updates)

def get_user_level_from_db(user_id):
    """Retrieve XP and Level for a user from the bot's SQLite database."""
    db_candidates = [
        os.path.join(BOT_DIR, 'data', 'xp.db'),
        os.path.join(BASE_DIR, 'data', 'xp.db')
    ]
    for db_path in db_candidates:
        if os.path.exists(db_path):
            try:
                conn = sqlite3.connect(db_path, timeout=5)
                cur = conn.cursor()
                cur.execute("SELECT level, xp FROM xp WHERE user_id = ?", (int(user_id),))
                row = cur.fetchone()
                conn.close()
                if row:
                    return int(row[0]), int(row[1])
            except Exception as e:
                print(f"[!] xp.db query error: {e}")
    return 0, 0

# Cache for Discord Guild Roles mapping: role_id -> role_name
_guild_roles_cache = {
    "timestamp": 0,
    "guild_id": None,
    "roles": {}
}

def get_guild_roles(guild_id, bot_token):
    """Fetch roles for the guild from Discord API using the Bot Token."""
    now = time.time()
    if _guild_roles_cache["guild_id"] == guild_id and (now - _guild_roles_cache["timestamp"] < 300):
        return _guild_roles_cache["roles"]

    if not guild_id or not bot_token:
        return _guild_roles_cache.get("roles", {})

    try:
        req = urllib.request.Request(
            f"https://discord.com/api/v10/guilds/{guild_id}/roles",
            headers={
                "Authorization": f"Bot {bot_token}",
                "User-Agent": "X3NationAuth/1.0"
            }
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            roles_map = {str(r["id"]): str(r["name"]) for r in data}
            _guild_roles_cache["timestamp"] = now
            _guild_roles_cache["guild_id"] = guild_id
            _guild_roles_cache["roles"] = roles_map
            return roles_map
    except Exception as e:
        print(f"[!] Warning fetching guild roles via Bot Token: {e}")
        return _guild_roles_cache.get("roles", {})

def evaluate_user_access(user_info, member_info, cfg):
    """
    Evaluates whether the user is eligible for access based on:
    1. Level >= 50 (from Bot DB or Discord Level role)
    2. Donator role
    3. Tester role
    4. Staff/Admin/Owner bypass
    """
    user_id = str(user_info.get("id"))
    user_roles = [str(r) for r in member_info.get("roles", [])]
    discord_cfg = cfg.get("discord", {})
    guild_id = discord_cfg.get("guildId")
    bot_token = discord_cfg.get("botToken")
    owner_id = str(discord_cfg.get("ownerId", ""))
    req_level = int(discord_cfg.get("requiredLevel", 5))

    # 1. Owner bypass
    if owner_id and user_id == owner_id:
        return True, "👑 Owner", 100, "Owner Bypass"

    # 2. Database Level Check
    db_level, db_xp = get_user_level_from_db(user_id)
    if db_level >= req_level:
        return True, f"Level {db_level} Pilot", db_level, f"Bot Database Level {db_level}"

    # 3. Resolve role names via Bot API
    role_names = []
    if guild_id and bot_token:
        roles_map = get_guild_roles(guild_id, bot_token)
        role_names = [roles_map[rid] for rid in user_roles if rid in roles_map]

    # 4. Check Donator Role
    for rname in role_names:
        if "donator" in rname.lower():
            return True, "💎 Donator", db_level, "Donator Role"

    donator_id = str(discord_cfg.get("donatorRoleId", "")).strip()
    if donator_id and donator_id in user_roles:
        return True, "💎 Donator", db_level, "Donator Role ID"

    # 5. Check Tester Role
    for rname in role_names:
        if "tester" in rname.lower():
            return True, "🧪 Tester", db_level, "Tester Role"

    tester_id = str(discord_cfg.get("testerRoleId", "")).strip()
    if tester_id and tester_id in user_roles:
        return True, "🧪 Tester", db_level, "Tester Role ID"

    # 6. Check Level Roles in Discord (e.g. "Level 5", "Level 10", ..., "Level 100")
    for rname in role_names:
        clean = rname.strip().lower()
        if clean.startswith("level "):
            parts = clean.split("level ")
            if len(parts) > 1:
                lvl_token = parts[1].split()[0]
                if lvl_token.isdigit() and int(lvl_token) >= req_level:
                    effective_lvl = max(db_level, int(lvl_token))
                    return True, rname, effective_lvl, f"Discord Role {rname}"

    # 7. Staff / Admin Bypass
    for rname in role_names:
        if any(term in rname.lower() for term in ["owner", "manager", "admin", "moderator", "staff"]):
            return True, rname, db_level, "Staff Role"

    # 8. Check legacy requiredRoleId if explicitly configured
    legacy_role_id = str(discord_cfg.get("requiredRoleId", "")).strip()
    if legacy_role_id and legacy_role_id in user_roles:
        return True, discord_cfg.get("roleName", "X3 Nation Member"), db_level, "Required Role ID"

    # No rule matched
    return False, None, db_level, f"Requirements not met (Needs Level {req_level}, Donator or Tester)"

class X3RequestHandler(SimpleHTTPRequestHandler):
    def get_redirect_uri(self, cfg):
        discord_cfg = cfg.get("discord", {})
        configured_uri = discord_cfg.get("redirectUri", "").strip()
        host = self.headers.get('Host', f'localhost:{PORT}')
        # If no explicit non-localhost URI is configured, dynamically use current request host
        if not configured_uri or "localhost:8080" in configured_uri:
            return f"http://{host}/api/discord/callback"
        return configured_uri

    def end_headers(self):
        # Enable CORS and caching headers
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        if path == '/api/config':
            cfg = load_config()
            discord_cfg = cfg.get("discord", {})
            redirect_uri = self.get_redirect_uri(cfg)
            client_id = discord_cfg.get("clientId", "")
            has_secret = bool(discord_cfg.get("clientSecret"))
            guild_id = discord_cfg.get("guildId", "")
            has_bot_token = bool(discord_cfg.get("botToken"))
            is_configured = bool(client_id and has_secret and guild_id)

            safe_config = {
                "clientId": client_id,
                "guildId": guild_id,
                "hasSecret": has_secret,
                "hasBotToken": has_bot_token,
                "requiredLevel": discord_cfg.get("requiredLevel", 5),
                "redirectUri": redirect_uri,
                "isConfigured": is_configured,
                "missingFields": [
                    f for f, has in [
                        ("Client ID", bool(client_id)),
                        ("Client Secret", has_secret),
                        ("Server ID (Guild ID)", bool(guild_id))
                    ] if not has
                ]
            }
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(safe_config).encode('utf-8'))
            return

        elif path == '/api/discord/dev-login':
            # Instant test login for development & testing
            role = query.get('role', ['tester'])[0].lower()
            lvl = int(query.get('level', ['5'])[0]) if query.get('level', ['5'])[0].isdigit() else 5
            badge_map = {
                'donator': '💎 Donator',
                'tester': '🧪 Tester',
                'level5': 'Level 5 Pilot',
                'owner': '👑 Owner'
            }
            badge = badge_map.get(role, f'Level {lvl} Pilot')
            u_data = urllib.parse.quote(json.dumps({
                "username": f"TestPilot_{role}",
                "global_name": f"X3 Pilot ({badge})",
                "id": "1234567890",
                "avatar": None,
                "avatar_url": None,
                "verified": True,
                "level": lvl,
                "roleName": badge,
                "authReason": f"Test Mode: {badge}"
            }))
            self.send_response(302)
            self.send_header('Location', f'/?auth=success&data={u_data}')
            self.end_headers()
            return

        elif path == '/api/discord/login':
            cfg = load_config()
            discord_cfg = cfg.get("discord", {})
            client_id = discord_cfg.get("clientId")
            redirect_uri = self.get_redirect_uri(cfg)

            if not client_id or not discord_cfg.get("clientSecret"):
                self.send_response(302)
                self.send_header('Location', '/?auth=error&reason=not_configured')
                self.end_headers()
                return

            # OAuth2 scopes: identify (name, profilbild, id), guilds (servers), guilds.members.read (server rollen)
            params = {
                "client_id": client_id,
                "response_type": "code",
                "redirect_uri": redirect_uri,
                "scope": "identify guilds guilds.members.read",
                "prompt": "consent"
            }
            discord_auth_url = f"https://discord.com/oauth2/authorize?{urllib.parse.urlencode(params)}"
            self.send_response(302)
            self.send_header('Location', discord_auth_url)
            self.end_headers()
            return

        elif path == '/api/discord/callback':
            cfg = load_config()
            discord_cfg = cfg.get("discord", {})
            redirect_uri = self.get_redirect_uri(cfg)
            code = query.get('code', [None])[0]

            if not code:
                err = query.get('error_description', ['Abgebrochen oder kein Code erhalten'])[0]
                self.send_response(302)
                self.send_header('Location', f'/?auth=error&reason={urllib.parse.quote(err)}')
                self.end_headers()
                return

            try:
                # Exchange code for access token
                token_data = urllib.parse.urlencode({
                    "client_id": discord_cfg.get("clientId"),
                    "client_secret": discord_cfg.get("clientSecret"),
                    "grant_type": "authorization_code",
                    "code": code,
                    "redirect_uri": redirect_uri
                }).encode('utf-8')

                token_req = urllib.request.Request(
                    "https://discord.com/api/v10/oauth2/token",
                    data=token_data,
                    headers={"Content-Type": "application/x-www-form-urlencoded"}
                )
                with urllib.request.urlopen(token_req) as resp:
                    tokens = json.loads(resp.read().decode('utf-8'))

                access_token = tokens.get("access_token")

                # Get user profile (Name, Avatar, ID)
                user_req = urllib.request.Request(
                    "https://discord.com/api/v10/users/@me",
                    headers={"Authorization": f"Bearer {access_token}"}
                )
                with urllib.request.urlopen(user_req) as resp:
                    user_info = json.loads(resp.read().decode('utf-8'))

                guild_id = discord_cfg.get("guildId")
                user_id = user_info.get("id")
                username = user_info.get("username", "Member")

                # Check membership in the specified guild
                member_info = {"roles": []}
                if guild_id:
                    member_req = urllib.request.Request(
                        f"https://discord.com/api/v10/users/@me/guilds/{guild_id}/member",
                        headers={"Authorization": f"Bearer {access_token}"}
                    )
                    try:
                        with urllib.request.urlopen(member_req) as resp:
                            member_info = json.loads(resp.read().decode('utf-8'))
                    except urllib.error.HTTPError as e:
                        if e.code in [404, 403]:
                            self.send_response(302)
                            self.send_header('Location', f'/?auth=error&reason=not_in_server&user={urllib.parse.quote(username)}')
                            self.end_headers()
                            return
                        raise

                # Evaluate Access
                has_access, role_badge, user_lvl, eval_reason = evaluate_user_access(user_info, member_info, cfg)

                if has_access:
                    avatar_hash = user_info.get("avatar")
                    avatar_url = f"https://cdn.discordapp.com/avatars/{user_id}/{avatar_hash}.png?size=128" if avatar_hash else None
                    u_data = urllib.parse.quote(json.dumps({
                        "username": user_info.get("username"),
                        "global_name": user_info.get("global_name", user_info.get("username")),
                        "id": user_id,
                        "avatar": avatar_hash,
                        "avatar_url": avatar_url,
                        "verified": True,
                        "level": user_lvl,
                        "roleName": role_badge or "X3 Pilot",
                        "authReason": eval_reason
                    }))
                    self.send_response(302)
                    self.send_header('Location', f'/?auth=success&data={u_data}')
                    self.end_headers()
                    return
                else:
                    self.send_response(302)
                    self.send_header('Location', f'/?auth=error&reason=insufficient_permissions&user={urllib.parse.quote(username)}&level={user_lvl}')
                    self.end_headers()
                    return

            except Exception as e:
                print(f"[!] Discord Auth Error: {e}")
                self.send_response(302)
                self.send_header('Location', f'/?auth=error&reason={urllib.parse.quote(str(e))}')
                self.end_headers()
                return

        return super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path == '/api/config':
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            try:
                data = json.loads(body)
                cfg = load_config()
                if "discord" not in cfg:
                    cfg["discord"] = {}
                for k in ["clientId", "clientSecret", "guildId", "botToken", "ownerId", "donatorRoleId", "testerRoleId", "requiredRoleId", "roleName", "redirectUri", "requiredLevel"]:
                    if k in data and data[k] is not None:
                        cfg["discord"][k] = data[k]
                save_config(cfg)
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"success": True}).encode('utf-8'))
            except Exception as e:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
            return

        self.send_response(404)
        self.end_headers()

def run():
    os.chdir(BASE_DIR)
    server_address = ('', PORT)
    httpd = HTTPServer(server_address, X3RequestHandler)
    print("=" * 60)
    print(f"[*] X3 Nation Web Server running at http://localhost:{PORT}/")
    print(f"[*] Discord OAuth2 & BLE Flasher active.")
    print(f"[*] Access Gating: Level 50+, Donator, Tester, or Staff")
    print("=" * 60)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[*] Server stopped.")

if __name__ == '__main__':
    run()
