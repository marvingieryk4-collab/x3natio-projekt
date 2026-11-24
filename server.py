#!/usr/bin/env python3
"""
X3 Nation Server
Serves the Apple Liquid Glass web interface, provides Discord OAuth2 verification,
and serves pre-packaged firmware files.
"""

import os
import sys
import json
import urllib.request
import urllib.parse
import urllib.error
from http.server import HTTPServer, SimpleHTTPRequestHandler

PORT = 8080
CONFIG_FILE = os.path.join(os.path.dirname(__file__), 'config.json')

def load_config():
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"[!] Error loading config: {e}")
    return {
        "discord": {
            "clientId": "",
            "clientSecret": "",
            "redirectUri": f"http://localhost:{PORT}/api/discord/callback",
            "guildId": "",
            "requiredRoleId": "",
            "roleName": "X3 Nation Member"
        },
        "app": {
            "name": "X3 Nation",
            "version": "1.0.0",
            "developerMode": True
        }
    }

def save_config(cfg):
    with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
        json.dump(cfg, f, indent=2)

class X3RequestHandler(SimpleHTTPRequestHandler):
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
            safe_config = {
                "clientId": discord_cfg.get("clientId", ""),
                "guildId": discord_cfg.get("guildId", ""),
                "requiredRoleId": discord_cfg.get("requiredRoleId", ""),
                "roleName": discord_cfg.get("roleName", "X3 Nation Member"),
                "redirectUri": discord_cfg.get("redirectUri", f"http://localhost:{PORT}/api/discord/callback"),
                "isConfigured": bool(discord_cfg.get("clientId") and discord_cfg.get("guildId") and discord_cfg.get("requiredRoleId"))
            }
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(safe_config).encode('utf-8'))
            return

        elif path == '/api/discord/login':
            cfg = load_config()
            discord_cfg = cfg.get("discord", {})
            client_id = discord_cfg.get("clientId")
            redirect_uri = discord_cfg.get("redirectUri", f"http://localhost:{PORT}/api/discord/callback")

            if not client_id:
                self.send_response(302)
                self.send_header('Location', '/?auth=error&reason=not_configured')
                self.end_headers()
                return

            params = {
                "client_id": client_id,
                "response_type": "code",
                "redirect_uri": redirect_uri,
                "scope": "identify guilds guilds.members.read"
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

            try:
                # Exchange code for token
                token_data = urllib.parse.urlencode({
                    "client_id": discord_cfg.get("clientId"),
                    "client_secret": discord_cfg.get("clientSecret"),
                    "grant_type": "authorization_code",
                    "code": code,
                    "redirect_uri": discord_cfg.get("redirectUri", f"http://localhost:{PORT}/api/discord/callback")
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

                # Check guild member roles
                guild_id = discord_cfg.get("guildId")
                req_role = str(discord_cfg.get("requiredRoleId"))

                if guild_id and req_role:
                    member_req = urllib.request.Request(
                        f"https://discord.com/api/v10/users/@me/guilds/{guild_id}/member",
                        headers={"Authorization": f"Bearer {access_token}"}
                    )
                    try:
                        with urllib.request.urlopen(member_req) as resp:
                            member_info = json.loads(resp.read().decode('utf-8'))
                        user_roles = [str(r) for r in member_info.get("roles", [])]
                        has_role = req_role in user_roles
                    except urllib.error.HTTPError as e:
                        has_role = False
                else:
                    has_role = True

                if has_role:
                    avatar_hash = user_info.get("avatar")
                    user_id = user_info.get("id")
                    avatar_url = f"https://cdn.discordapp.com/avatars/{user_id}/{avatar_hash}.png?size=64" if avatar_hash else None
                    u_data = urllib.parse.quote(json.dumps({
                        "username": user_info.get("username"),
                        "global_name": user_info.get("global_name", user_info.get("username")),
                        "id": user_id,
                        "avatar": avatar_hash,
                        "avatar_url": avatar_url,
                        "verified": True,
                        "roleName": discord_cfg.get("roleName", "X3 Nation Member")
                    }))
                    self.send_response(302)
                    self.send_header('Location', f'/?auth=success&data={u_data}')
                    self.end_headers()
                    return
                else:
                    self.send_response(302)
                    self.send_header('Location', f'/?auth=error&reason=missing_role&user={urllib.parse.quote(user_info.get("username", ""))}')
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
                for k in ["clientId", "clientSecret", "guildId", "requiredRoleId", "roleName", "redirectUri"]:
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
    print(f"[*] Web Bluetooth & Discord OAuth ready.")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[*] Server stopped.")

if __name__ == '__main__':
    run()
