#!/usr/bin/env python3
"""
X3 Nation Server
Serves the Apple Liquid Glass web interface, provides Discord OAuth2 verification
with Discord-only login, Level 5 / Tester / Donator role gating for firmware,
and server-side sessions. Secrets are loaded from the bot .env outside the web root.
"""

import os
import sys
import json
import time
import base64
import sqlite3
import secrets
import urllib.request
import urllib.parse
import urllib.error
from http.cookies import SimpleCookie
from http.server import HTTPServer, SimpleHTTPRequestHandler

PORT = 8080
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_FILE = os.path.join(BASE_DIR, 'config.json')
BOT_DIR = os.path.join(BASE_DIR, '..', 'bot')
BOT_ENV_FILE = os.path.join(BOT_DIR, '.env')

# Server-side login sessions. The browser only receives an opaque HttpOnly cookie.
# No user data or permissions are stored in localStorage / sessionStorage anymore.
SESSION_COOKIE = 'x3_session'
SESSION_TTL = 24 * 60 * 60
SESSIONS = {}

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
    Evaluates whether the user may use the firmware / flasher.
    Every Discord-authenticated user may view the portal; only the users below
    may download and flash firmware:
    1. Level >= requiredLevel (from Bot DB or a Discord Level role)
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
    def send_json(self, status, payload):
        body = json.dumps(payload).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def redirect_to(self, url):
        self.send_response(302)
        self.send_header('Location', url)
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()

    def is_secure_request(self, cfg):
        forwarded = self.headers.get('X-Forwarded-Proto', '').lower()
        return forwarded == 'https' or self.get_redirect_uri(cfg).startswith('https://')

    def get_session_user(self):
        raw = self.headers.get('Cookie', '')
        if not raw:
            return None
        try:
            cookie = SimpleCookie()
            cookie.load(raw)
            morsel = cookie.get(SESSION_COOKIE)
            if not morsel:
                return None
            token = morsel.value
            session = SESSIONS.get(token)
            if not session:
                return None
            if session['expires'] < time.time():
                SESSIONS.pop(token, None)
                return None
            return session['user']
        except Exception:
            return None

    def create_session(self, user, cfg):
        token = secrets.token_urlsafe(32)
        SESSIONS[token] = {"user": user, "expires": time.time() + SESSION_TTL}
        cookie = f"{SESSION_COOKIE}={token}; Path=/; Max-Age={SESSION_TTL}; HttpOnly; SameSite=Lax"
        if self.is_secure_request(cfg):
            cookie += "; Secure"
        return cookie

    def clear_session(self):
        raw = self.headers.get('Cookie', '')
        if raw:
            try:
                cookie = SimpleCookie()
                cookie.load(raw)
                morsel = cookie.get(SESSION_COOKIE)
                if morsel:
                    SESSIONS.pop(morsel.value, None)
            except Exception:
                pass
        return f"{SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax"

    def is_sensitive_path(self, path):
        lower = path.lower()
        return (
            lower in ('/config.json', '/.env', '/server.py')
            or lower.startswith('/bot/')
            or lower.endswith('.env')
        )

    def get_redirect_uri(self, cfg):
        discord_cfg = cfg.get("discord", {})
        host_header = self.headers.get('Host', '').lower()
        host = host_header.split(':')[0]
        # Production domain: x3nation.de
        if host in ['x3nation.de', 'www.x3nation.de']:
            return "https://x3nation.de/api/discord/callback"
        # Local / LAN dynamic fallback
        raw_host = host_header or f'localhost:{PORT}'
        return f"http://{raw_host}/api/discord/callback"

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

        # Never serve secrets or server code as static files.
        if self.is_sensitive_path(path):
            self.send_error(404, 'Not Found')
            return

        if path == '/api/config':
            cfg = load_config()
            discord_cfg = cfg.get("discord", {})
            client_id = discord_cfg.get("clientId", "1574073012175634627")
            has_secret = bool(discord_cfg.get("clientSecret"))
            self.send_json(200, {
                "clientId": client_id,
                "guildId": discord_cfg.get("guildId", "1573877864636616896"),
                "requiredLevel": discord_cfg.get("requiredLevel", 5),
                "isConfigured": bool(client_id and has_secret),
                "discordOnly": True
            })
            return

        if path == '/api/session':
            user = self.get_session_user()
            self.send_json(200, {"user": user})
            return

        if path == '/api/logout':
            cookie = self.clear_session()
            self.send_response(302)
            self.send_header('Location', '/')
            self.send_header('Set-Cookie', cookie)
            self.end_headers()
            return

        # Firmware files are only available to authorized roles.
        if path.startswith('/firmware/'):
            user = self.get_session_user()
            if not user:
                self.send_json(401, {"error": "Discord-Anmeldung erforderlich."})
                return
            if not user.get('canFlash'):
                self.send_json(403, {"error": "Für Firmware/Flasher ist Level 5, Tester oder Donator erforderlich."})
                return

        elif path == '/api/discord/login':
            cfg = load_config()
            discord_cfg = cfg.get("discord", {})
            client_id = discord_cfg.get("clientId", "1574073012175634627")

            if not discord_cfg.get("clientSecret"):
                self.redirect_to('/?auth=error&reason=not_configured')
                return

            params = {
                "client_id": client_id,
                "response_type": "code",
                "redirect_uri": self.get_redirect_uri(cfg),
                "scope": "identify guilds guilds.members.read",
                "prompt": "consent"
            }
            discord_auth_url = f"https://discord.com/oauth2/authorize?{urllib.parse.urlencode(params)}"
            self.redirect_to(discord_auth_url)
            return

        elif path == '/api/discord/callback':
            cfg = load_config()
            discord_cfg = cfg.get("discord", {})
            redirect_uri = self.get_redirect_uri(cfg)
            code = query.get('code', [None])[0]

            if not code:
                err = query.get('error_description', ['Anmeldung bei Discord abgebrochen.'])[0]
                self.redirect_to(f'/?auth=error&reason={urllib.parse.quote(err)}')
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

                # Roles live on the X3 Nation server. Read the member object via
                # the user token, with the bot token as fallback for role lookup.
                member_info = {"roles": []}
                in_server = False
                if guild_id:
                    member_req = urllib.request.Request(
                        f"https://discord.com/api/v10/users/@me/guilds/{guild_id}/member",
                        headers={"Authorization": f"Bearer {access_token}"}
                    )
                    try:
                        with urllib.request.urlopen(member_req) as resp:
                            member_info = json.loads(resp.read().decode('utf-8'))
                            in_server = True
                    except urllib.error.HTTPError as e:
                        if e.code not in (404, 403):
                            raise

                # Any Discord login may view the portal. Only these roles may flash.
                can_flash, role_badge, user_lvl, eval_reason = evaluate_user_access(user_info, member_info, cfg)

                bot_token = discord_cfg.get("botToken")
                if bot_token and guild_id and not can_flash:
                    try:
                        mem_req = urllib.request.Request(
                            f"https://discord.com/api/v10/guilds/{guild_id}/members/{user_id}",
                            headers={"Authorization": f"Bot {bot_token}", "User-Agent": "X3NationAuth/1.0"}
                        )
                        with urllib.request.urlopen(mem_req) as resp:
                            member_info = json.loads(resp.read().decode('utf-8'))
                            in_server = True
                        can_flash, role_badge, user_lvl, eval_reason = evaluate_user_access(user_info, member_info, cfg)
                    except Exception:
                        pass

                avatar_hash = user_info.get("avatar")
                user = {
                    "username": username,
                    "global_name": user_info.get("global_name", username),
                    "id": user_id,
                    "avatar": avatar_hash,
                    "avatar_url": f"https://cdn.discordapp.com/avatars/{user_id}/{avatar_hash}.png?size=128" if avatar_hash else None,
                    "verified": True,
                    "level": user_lvl,
                    "canFlash": bool(can_flash),
                    "inServer": in_server,
                    "roleName": role_badge if can_flash else ("X3 Nation Member" if in_server else "Discord Member"),
                    "authReason": eval_reason
                }

                self.send_response(302)
                self.send_header('Location', '/?auth=success')
                self.send_header('Set-Cookie', self.create_session(user, cfg))
                self.end_headers()
                return

            except Exception as e:
                print(f"[!] Discord Auth Error: {e}")
                self.redirect_to(f'/?auth=error&reason={urllib.parse.quote(str(e))}')
                return

        return super().do_GET()

    def do_POST(self):
        # Configuration and token verification are server-only now.
        # There is intentionally no client-writable config endpoint.
        self.send_json(403, {"error": "Forbidden"})

def run():
    os.chdir(BASE_DIR)
    server_address = ('', PORT)
    httpd = HTTPServer(server_address, X3RequestHandler)
    print("=" * 60)
    print(f"[*] X3 Nation Web Server running at http://localhost:{PORT}/")
    print(f"[*] Discord OAuth2 & BLE Flasher active.")
    print("[*] Discord login required. Firmware gate: Level 5+, Tester, Donator or Staff.")
    print("=" * 60)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[*] Server stopped.")

if __name__ == '__main__':
    run()
