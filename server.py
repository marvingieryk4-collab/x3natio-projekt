#!/usr/bin/env python3
"""
X3 Nation Server
Serves the Apple Liquid Glass web interface, provides Discord OAuth2 verification
with Level 5 / Donator / Tester role checks, SQLite xp.db level lookup,
and serves firmware assets.
"""

import os
import sys
import json
import sqlite3
import datetime
import urllib.request
import urllib.parse
import urllib.error
from http.server import HTTPServer, SimpleHTTPRequestHandler

PORT = int(os.environ.get('PORT', '8080'))
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_FILE = os.path.join(BASE_DIR, 'config.json')
LOGINS_FILE = os.path.join(BASE_DIR, 'data', 'logins.json')
CODES_FILE = os.path.join(BASE_DIR, 'data', 'tester_codes.json')
DB_PATH = os.path.join(BASE_DIR, 'data', 'xp.db')

def parse_env_file(filepath):
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

def load_logins():
    try:
        if os.path.exists(LOGINS_FILE):
            with open(LOGINS_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
    except Exception:
        pass
    return []

def save_login(entry):
    try:
        os.makedirs(os.path.dirname(LOGINS_FILE), exist_ok=True)
        logins = load_logins()
        logins.insert(0, entry)
        if len(logins) > 100:
            logins = logins[:100]
        with open(LOGINS_FILE, 'w', encoding='utf-8') as f:
            json.dump(logins, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"[!] Error saving login: {e}")

def load_tester_codes():
    try:
        if os.path.exists(CODES_FILE):
            with open(CODES_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
    except Exception:
        pass
    initial_codes = [
        {"code": "X3-TEST-BC40", "createdAt": "26.11.2026, 19:23:23", "status": "active", "redeemedBy": None},
        {"code": "X3-TEST-BBB1", "createdAt": "26.11.2026, 19:23:37", "status": "active", "redeemedBy": None},
        {"code": "X3-TEST-7F4B", "createdAt": "24.11.2026, 19:15:00", "status": "active", "redeemedBy": None},
        {"code": "X3-BETA-9A12", "createdAt": "24.11.2026, 18:30:00", "status": "active", "redeemedBy": None}
    ]
    save_tester_codes(initial_codes)
    return initial_codes

def save_tester_codes(codes):
    try:
        os.makedirs(os.path.dirname(CODES_FILE), exist_ok=True)
        with open(CODES_FILE, 'w', encoding='utf-8') as f:
            json.dump(codes, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"[!] Error saving tester codes: {e}")

def load_config():
    cfg = {
        "discord": {
            "clientId": "1574073012175634627",
            "clientSecret": "bv7Kkk6aVCT7giGuolSE303BlKKglT31",
            "botToken": "MTU3NDA3MzAxMjE3NTYzNDYyNw.Gy7csL.RQnwOJjDqWHiezr4HOYBgmRjwGfm1b5rwaDRTY",
            "redirectUri": f"http://localhost:{PORT}/api/discord/callback",
            "guildId": "1573877864636616896",
            "ownerIds": ["1533609473145573408", "1021777834827591702"],
            "ownerId": "1021777834827591702",
            "donatorRoleId": "1574795941431742634",
            "testerRoleId": "1574795943507787776",
            "requiredRoleId": "1574103558570381545",
            "roleName": "Level 5 Pilot",
            "requiredLevel": 5,
            "inviteUrl": "https://discord.gg/9GtgZVB5g4"
        },
        "app": {
            "name": "X3 Nation",
            "version": "1.0.0",
            "domain": "x3nation.de",
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
            print(f"[!] Error loading config: {e}")

    # Fallback to local .env if present
    env = parse_env_file(os.path.join(BASE_DIR, '.env'))
    discord_cfg = cfg["discord"]
    for k, v in [
        ("CLIENT_ID", "clientId"),
        ("CLIENT_SECRET", "clientSecret"),
        ("DISCORD_TOKEN", "botToken"),
        ("GUILD_ID", "guildId"),
        ("OWNER_ID", "ownerId"),
        ("LEVEL_5_ROLE_ID", "requiredRoleId"),
        ("DONATOR_ROLE_ID", "donatorRoleId"),
        ("TESTER_ROLE_ID", "testerRoleId")
    ]:
        if env.get(k) and not discord_cfg.get(v):
            discord_cfg[v] = env[k]

    return cfg

def save_config(cfg):
    with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
        json.dump(cfg, f, indent=2)

def get_user_level_from_db(user_id):
    """Retrieve Level from SQLite database if present."""
    if os.path.exists(DB_PATH):
        try:
            conn = sqlite3.connect(DB_PATH, timeout=3)
            c = conn.cursor()
            c.execute("SELECT level, xp FROM xp WHERE user_id = ?", (int(user_id),))
            row = c.fetchone()
            conn.close()
            if row:
                return int(row[0]), int(row[1])
        except Exception:
            pass
    return 0, 0

class X3RequestHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
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

        if path == '/api/logins':
            logins = load_logins()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(logins).encode('utf-8'))
            return

        elif path == '/api/tester-codes':
            codes = load_tester_codes()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(codes).encode('utf-8'))
            return

        elif path == '/api/config':
            cfg = load_config()
            discord_cfg = cfg.get("discord", {})
            safe_config = {
                "clientId": discord_cfg.get("clientId", ""),
                "guildId": discord_cfg.get("guildId", ""),
                "requiredRoleId": discord_cfg.get("requiredRoleId", "1574103558570381545"),
                "level5RoleId": discord_cfg.get("requiredRoleId", "1574103558570381545"),
                "donatorRoleId": discord_cfg.get("donatorRoleId", "1574795941431742634"),
                "testerRoleId": discord_cfg.get("testerRoleId", "1574795943507787776"),
                "ownerId": discord_cfg.get("ownerId", "1021777834827591702"),
                "roleName": discord_cfg.get("roleName", "Level 5 Pilot"),
                "inviteUrl": discord_cfg.get("inviteUrl", "https://discord.gg/9GtgZVB5g4"),
                "requiredLevel": discord_cfg.get("requiredLevel", 5),
                "isConfigured": bool(discord_cfg.get("clientId") and discord_cfg.get("guildId"))
            }
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.end_headers()
            self.wfile.write(json.dumps(safe_config).encode('utf-8'))
            return

        elif path == '/api/discord/login':
            cfg = load_config()
            discord_cfg = cfg.get("discord", {})
            client_id = discord_cfg.get("clientId")
            host = self.headers.get('Host', f'localhost:{PORT}')
            scheme = 'http'
            redirect_uri = f"{scheme}://{host}/api/discord/callback"

            params = {
                "client_id": client_id,
                "response_type": "code",
                "redirect_uri": redirect_uri,
                "scope": "identify guilds guilds.members.read guilds.join"
            }
            discord_auth_url = f"https://discord.com/oauth2/authorize?{urllib.parse.urlencode(params)}"
            self.send_response(302)
            self.send_header('Location', discord_auth_url)
            self.end_headers()
            return

        elif path == '/api/discord/callback':
            cfg = load_config()
            discord_cfg = cfg.get("discord", {})
            code = query.get('code', [None])[0]

            if not code:
                err = query.get('error_description', ['Abgebrochen oder kein Code erhalten'])[0]
                self.send_response(302)
                self.send_header('Location', f'/?auth=error&reason={urllib.parse.quote(err)}')
                self.end_headers()
                return

            host = self.headers.get('Host', f'localhost:{PORT}')
            scheme = 'http'
            redirect_uri = f"{scheme}://{host}/api/discord/callback"

            try:
                # Exchange code for token
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

                # Get user profile
                user_req = urllib.request.Request(
                    "https://discord.com/api/v10/users/@me",
                    headers={"Authorization": f"Bearer {access_token}"}
                )
                with urllib.request.urlopen(user_req) as resp:
                    user_info = json.loads(resp.read().decode('utf-8'))

                user_id = str(user_info.get("id"))
                username = user_info.get("username", "")
                avatar_hash = user_info.get("avatar")
                avatar_url = f"https://cdn.discordapp.com/avatars/{user_id}/{avatar_hash}.png?size=128" if avatar_hash else None

                # Check guild member roles
                guild_id = discord_cfg.get("guildId")
                req_role = str(discord_cfg.get("requiredRoleId", "1574103558570381545"))
                donator_role = str(discord_cfg.get("donatorRoleId", "1574795941431742634"))
                tester_role = str(discord_cfg.get("testerRoleId", "1574795943507787776"))
                owner_ids = [str(i) for i in discord_cfg.get("ownerIds", ["1533609473145573408", "1021777834827591702"])]
                bot_token = discord_cfg.get("botToken")

                user_roles = []
                is_member = False

                # 1. Try with user token
                member_req = urllib.request.Request(
                    f"https://discord.com/api/v10/users/@me/guilds/{guild_id}/member",
                    headers={"Authorization": f"Bearer {access_token}"}
                )
                try:
                    with urllib.request.urlopen(member_req) as resp:
                        member_info = json.loads(resp.read().decode('utf-8'))
                        user_roles = [str(r) for r in member_info.get("roles", [])]
                        is_member = True
                except urllib.error.HTTPError as e:
                    # Not a member yet: Auto-add user to the guild via guilds.join
                    if bot_token:
                        try:
                            join_data = json.dumps({"access_token": access_token}).encode('utf-8')
                            join_req = urllib.request.Request(
                                f"https://discord.com/api/v10/guilds/{guild_id}/members/{user_id}",
                                data=join_data,
                                headers={
                                    "Authorization": f"Bot {bot_token}",
                                    "Content-Type": "application/json"
                                },
                                method="PUT"
                            )
                            with urllib.request.urlopen(join_req) as jresp:
                                if jresp.status in [201, 204]:
                                    is_member = True
                        except Exception as jerr:
                            print(f"[!] Guild auto-add error: {jerr}")

                    # 2. Fallback to bot token query
                    if bot_token and not is_member:
                        bot_member_req = urllib.request.Request(
                            f"https://discord.com/api/v10/guilds/{guild_id}/members/{user_id}",
                            headers={"Authorization": f"Bot {bot_token}"}
                        )
                        try:
                            with urllib.request.urlopen(bot_member_req) as bresp:
                                member_info = json.loads(bresp.read().decode('utf-8'))
                                user_roles = [str(r) for r in member_info.get("roles", [])]
                                is_member = True
                        except Exception:
                            is_member = False

                if not is_member:
                    self.send_response(302)
                    self.send_header('Location', f'/?auth=error&reason=not_in_guild&user={urllib.parse.quote(username)}')
                    self.end_headers()
                    return

                # Evaluate Access (Owner, Donator, Tester, Level 5, or SQLite DB Level)
                db_level, _ = get_user_level_from_db(user_id)
                has_access = False
                granted_role = "Level 5 Pilot"

                if user_id in owner_ids:
                    has_access = True
                    granted_role = "Owner"
                elif donator_role in user_roles:
                    has_access = True
                    granted_role = "Donator"
                elif tester_role in user_roles:
                    has_access = True
                    granted_role = "Tester"
                elif req_role in user_roles or db_level >= 5:
                    has_access = True
                    granted_role = f"Level {max(5, db_level)} Pilot"

                if has_access:
                    # Record live login event
                    save_login({
                        "timestamp": datetime.datetime.now().strftime("%d.%m.%Y, %H:%M:%S"),
                        "username": user_info.get("global_name", username) or username,
                        "userId": user_id,
                        "role": granted_role,
                        "browser": self.headers.get('User-Agent', 'Browser')[:45],
                        "method": "Discord OAuth2"
                    })
                    u_data = urllib.parse.quote(json.dumps({
                        "username": username,
                        "global_name": user_info.get("global_name", username),
                        "id": user_id,
                        "avatar": avatar_hash,
                        "avatar_url": avatar_url,
                        "verified": True,
                        "level": max(5, db_level),
                        "roleName": granted_role
                    }))
                    self.send_response(302)
                    self.send_header('Location', f'/?auth=success&data={u_data}')
                    self.end_headers()
                    return
                else:
                    self.send_response(302)
                    self.send_header('Location', f'/?auth=error&reason=missing_level_5&user={urllib.parse.quote(username)}')
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

        if path == '/api/logins':
            content_length = int(self.headers.get('Content-Length', 0))
            if content_length > 0:
                body = self.rfile.read(content_length).decode('utf-8')
                try:
                    entry = json.loads(body)
                    save_login(entry)
                except Exception as e:
                    print(f"[!] Error recording login POST: {e}")
            logins = load_logins()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(logins).encode('utf-8'))
            return

        elif path == '/api/tester-codes':
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            try:
                data = json.loads(body)
                action = data.get('action')
                codes = load_tester_codes()

                if action == 'generate':
                    code_val = str(data.get('code', '')).strip().upper()
                    created_at = data.get('createdAt') or datetime.datetime.now().strftime("%d.%m.%Y, %H:%M:%S")
                    new_item = {
                        "code": code_val,
                        "createdAt": created_at,
                        "status": "active",
                        "redeemedBy": None
                    }
                    if not any(c.get('code') == code_val for c in codes):
                        codes.insert(0, new_item)
                        save_tester_codes(codes)
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json; charset=utf-8')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(json.dumps({"success": True, "codes": codes}).encode('utf-8'))
                    return

                elif action == 'revoke':
                    code_val = str(data.get('code', '')).strip().upper()
                    codes = [c for c in codes if c.get('code', '').strip().upper() != code_val]
                    save_tester_codes(codes)
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json; charset=utf-8')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(json.dumps({"success": True, "codes": codes}).encode('utf-8'))
                    return

                elif action == 'redeem':
                    code_val = str(data.get('code', '')).strip().upper()
                    username = str(data.get('username', 'Pilot'))
                    matched = None
                    for c in codes:
                        if c.get('code', '').strip().upper() == code_val:
                            matched = c
                            break

                    if matched and matched.get('status') == 'active':
                        matched['status'] = 'redeemed'
                        matched['redeemedBy'] = username
                        save_tester_codes(codes)
                        self.send_response(200)
                        self.send_header('Content-Type', 'application/json; charset=utf-8')
                        self.send_header('Access-Control-Allow-Origin', '*')
                        self.end_headers()
                        self.wfile.write(json.dumps({
                            "success": True,
                            "message": "Tester-Berechtigung erfolgreich freigeschaltet!",
                            "code": code_val
                        }).encode('utf-8'))
                        return
                    else:
                        self.send_response(200)
                        self.send_header('Content-Type', 'application/json; charset=utf-8')
                        self.send_header('Access-Control-Allow-Origin', '*')
                        self.end_headers()
                        self.wfile.write(json.dumps({
                            "success": False,
                            "message": "Ungültiger oder bereits eingelöster Code."
                        }).encode('utf-8'))
                        return

            except Exception as e:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
                return

        elif path == '/api/config':
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            try:
                data = json.loads(body)
                cfg = load_config()
                if "discord" not in cfg:
                    cfg["discord"] = {}
                for k in ["clientId", "clientSecret", "guildId", "requiredRoleId", "roleName", "redirectUri", "botToken"]:
                    if k in data:
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
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    server_address = ('', PORT)
    httpd = HTTPServer(server_address, X3RequestHandler)
    print(f"[*] X3 Nation Server running at http://localhost:{PORT}/")
    print(f"[*] Discord OAuth2 & Level 5 Role Check active.")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[*] Server stopped.")

if __name__ == '__main__':
    run()
