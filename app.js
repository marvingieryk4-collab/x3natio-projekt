/**
 * X3 Nation — Core Application Logic
 * Integrates Web Bluetooth OTA Flashing via flasher.js,
 * Circular Scooter Gauge visualization, Collapsible Protocol Terminal,
 * Universal Discord OAuth2 & Role Gate (GitHub Pages & Server-ready),
 * Level 5 Verification, and Apple Liquid Glass design.
 *
 * Credits: N-SAK for OTA profiles and NBC session crypto.
 */

(function () {
    'use strict';

    const CIRCUMFERENCE = 816.81; // 2 * PI * 130

    // Discord Credentials & Role Configuration (from bot .env + setup.py)
    const DISCORD_CONFIG = {
        clientId:      '1574073012175634627',
        guildId:       '1573877864636616896',
        ownerIds:      ['1533609473145573408', '1021777834827591702'],    // Whitelisted Owner IDs
        ownerId:       '1021777834827591702',                              // Primary Owner ID fallback
        level5RoleId:  '1574103558570381545',    // "Level 5" role
        donatorRoleId: '1574795941431742634',    // "💎 Donator" role
        testerRoleId:  '1574795943507787776',    // "🧪 Tester" role
        inviteUrl:     'https://discord.gg/9GtgZVB5g4',
        // Helper to check if a user ID is in the whitelisted owners list
        isOwnerId(id) {
            return this.ownerIds.includes(String(id));
        },
        // Role IDs -> human-readable display name mapping
        roleDisplayNames: {
            '1574103558570381545': 'Level 5 Pilot',
            '1574795941431742634': 'Donator',
            '1574795943507787776': 'Tester'
        }
    };

    // Access tier constants for clean role logic
    const ACCESS_TIER = {
        OWNER:   'owner',
        DONATOR: 'donator',
        TESTER:  'tester',
        LEVEL5:  'level5'
    };

    // Determine access tier from user data object
    function resolveAccessTier(userData) {
        if (userData.isOwner) return ACCESS_TIER.OWNER;
        if (userData.tier)   return userData.tier;
        const r = userData.roleName || '';
        if (r === 'Owner')       return ACCESS_TIER.OWNER;
        if (r === 'Donator')     return ACCESS_TIER.DONATOR;
        if (r === 'Tester')      return ACCESS_TIER.TESTER;
        return ACCESS_TIER.LEVEL5;
    }

    // Application State
    const state = {
        authenticated: false,
        user: null,
        activeTab: 'g3',
        connectedSession: null,
        connectedDeviceName: null,
        activePreset: 'vcu', // 'vcu' or 'mcu'
        firmwareBytes: null,
        firmwareMeta: {
            name: 'X3 Nation VCU with Love',
            type: 'vcu',
            size: 0
        },
        isFlashing: false
    };

    // DOM Elements Cache
    const dom = {
        authStage: document.getElementById('auth-stage'),
        mainStage: document.getElementById('main-stage'),
        btnLoginDiscord: document.getElementById('btn-discord-login'),
        btnLockSession: document.getElementById('btn-lock-session'),
        authAlert: document.getElementById('auth-alert'),
        authAlertMsg: document.getElementById('auth-alert-msg'),
        authAlertActions: document.getElementById('auth-alert-actions'),
        btnOpenCredits: document.getElementById('btn-open-credits'),
        btnOpenAdmin: document.getElementById('btn-open-admin'),
        btnOpenTesterGate: document.getElementById('btn-open-tester-gate'),
        btnOpenDisclaimerDirect: document.getElementById('btn-open-disclaimer-direct'),

        // Top-Right User Profile
        userProfilePill: document.getElementById('user-profile-pill'),
        userAvatarImg: document.getElementById('user-avatar-img'),
        userAvatarFallback: document.getElementById('user-avatar-fallback'),
        userDisplayName: document.getElementById('user-display-name'),
        userRoleBadge: document.getElementById('user-role-badge'),
        
        // Navigation & Tabs
        navTabs: document.querySelectorAll('.nav-tab'),
        tabPanels: {
            g3: document.getElementById('tab-panel-g3'),
            zt3: document.getElementById('tab-panel-zt3'),
            f3: document.getElementById('tab-panel-f3')
        },
        
        // BLE
        btnBleConnect: document.getElementById('btn-ble-connect'),
        btnBleConnectLabel: document.getElementById('btn-ble-connect-label'),
        btnBleDisconnect: document.getElementById('btn-ble-disconnect'),
        bleStatusIndicator: document.getElementById('ble-status-indicator'),
        bleStatusText: document.getElementById('ble-status-text'),
        connStateBadge: document.getElementById('conn-state-badge'),
        telemDevice: document.getElementById('telem-device'),
        telemSession: document.getElementById('telem-session'),

        // Firmware & Flashing
        presetCards: document.querySelectorAll('.preset-card'),
        autoPartitionText: document.getElementById('auto-partition-text'),
        btnStartFlash: document.getElementById('btn-start-flash'),
        
        // Circular Gauge
        gaugeCircleFill: document.getElementById('gauge-circle-fill'),
        gaugeScooterImg: document.getElementById('gauge-scooter-img'),
        gaugePctNumber: document.getElementById('gauge-pct-number'),
        flashStatusText: document.getElementById('flash-status-text'),
        flashPageCount: document.getElementById('flash-page-count'),
        flashPhaseBadge: document.getElementById('flash-phase-badge'),

        // Collapsible Terminal
        terminalCollapsible: document.getElementById('terminal-collapsible'),
        terminalToggleHeader: document.getElementById('terminal-toggle-header'),
        terminalPreviewStatus: document.getElementById('terminal-preview-status'),
        terminalOutput: document.getElementById('terminal-output'),
        btnCopyLog: document.getElementById('btn-copy-log'),
        btnClearLog: document.getElementById('btn-clear-log'),

        // Modals
        modalCredits: document.getElementById('modal-credits'),
        modalAdmin: document.getElementById('modal-admin'),
        modalTesterGate: document.getElementById('modal-tester-gate'),
        modalTesterCockpit: document.getElementById('modal-tester-cockpit'),
        modalDisclaimer: document.getElementById('modal-disclaimer'),

        // Admin Components
        adminTabBtns: document.querySelectorAll('.admin-tab-btn'),
        adminTabContents: document.querySelectorAll('.admin-tab-content'),
        securityEventTbody: document.getElementById('security-event-tbody'),
        loginAuditTbody: document.getElementById('login-audit-tbody'),
        testerCodesTbody: document.getElementById('tester-codes-tbody'),
        btnGenTesterCode: document.getElementById('btn-gen-tester-code'),
        threatIndicator: document.getElementById('threat-indicator'),
        threatStatusLabel: document.getElementById('threat-status-label'),
        threatSummaryLabel: document.getElementById('threat-summary-label'),

        // Tester Gate Form
        testerCodeForm: document.getElementById('tester-code-form'),
        inputTesterCode: document.getElementById('input-tester-code'),
        testerGateFeedback: document.getElementById('tester-gate-feedback'),
        btnUnlockAllTabs: document.getElementById('btn-unlock-all-tabs'),

        // Disclaimer
        disclaimerTimerCount: document.getElementById('disclaimer-timer-count'),
        disclaimerProgressFill: document.getElementById('disclaimer-progress-fill'),
        btnAcceptDisclaimer: document.getElementById('btn-accept-disclaimer'),
        btnAcceptDisclaimerLabel: document.getElementById('btn-accept-disclaimer-label')
    };

    /* ============================================================
       Logging System (Strictly Zero Emojis)
       ============================================================ */
    function log(message, type = 'info') {
        const d = new Date();
        const timeStr = [
            String(d.getHours()).padStart(2, '0'),
            String(d.getMinutes()).padStart(2, '0'),
            String(d.getSeconds()).padStart(2, '0')
        ].join(':');

        const line = document.createElement('div');
        line.className = 'log-line';
        
        let typeClass = 'log-info';
        let prefix = '[INFO]';
        if (type === 'success') { typeClass = 'log-success'; prefix = '[OK]'; }
        else if (type === 'warn') { typeClass = 'log-warn'; prefix = '[WARN]'; }
        else if (type === 'error') { typeClass = 'log-error'; prefix = '[ERR]'; }
        else if (type === 'ble') { typeClass = 'log-info'; prefix = '[BLE]'; }
        else if (type === 'ota') { typeClass = 'log-info'; prefix = '[OTA]'; }

        line.innerHTML = `<span class="log-time">[${timeStr}]</span> <span class="${typeClass}">${prefix} ${escapeHtml(message)}</span>`;
        dom.terminalOutput.appendChild(line);
        dom.terminalOutput.scrollTop = dom.terminalOutput.scrollHeight;

        // Update preview in header
        if (dom.terminalPreviewStatus) {
            dom.terminalPreviewStatus.textContent = `— ${message.slice(0, 48)}`;
        }
    }

    function escapeHtml(str) {
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    /* ============================================================
       Alert Display System
       ============================================================ */
    function showAuthAlert(type, message, showInvite = false) {
        dom.authAlert.className = `auth-alert-box auth-alert-${type}`;
        dom.authAlert.style.display = 'flex';
        dom.authAlertMsg.textContent = message;

        if (dom.authAlertActions) {
            dom.authAlertActions.style.display = showInvite ? 'flex' : 'none';
        }
    }

    /* ============================================================
       Gauge Progress Calculation
       ============================================================ */
    function setGaugeProgress(pct) {
        pct = Math.max(0, Math.min(100, Math.round(pct)));
        const offset = CIRCUMFERENCE - (pct / 100) * CIRCUMFERENCE;
        dom.gaugeCircleFill.style.strokeDashoffset = offset;
        dom.gaugePctNumber.textContent = `${pct}%`;
    }

    /* ============================================================
       Stage Transitions (Apple Lateral Slide Animation)
       ============================================================ */
    function enterCockpit(user) {
        state.authenticated = true;
        state.user = user;
        
        // Definitive owner resolution (strictly whitelisted Discord user IDs only)
        const isOwner = DISCORD_CONFIG.isOwnerId(user.id);
        user.isOwner = isOwner;
        if (isOwner) {
            user.tier = ACCESS_TIER.OWNER;
            user.roleName = 'Owner';
        } else if (user.tier === ACCESS_TIER.OWNER || user.roleName === 'Owner') {
            // Strip owner status if user ID does not match the whitelist
            user.tier = ACCESS_TIER.LEVEL5;
            user.roleName = 'Level 5 Pilot';
        }

        const tier   = resolveAccessTier(user);

        // Role badge text & color based on actual tier
        let badgeText, badgeColor;
        switch (tier) {
            case ACCESS_TIER.OWNER:
                badgeText  = 'Owner / Admin';
                badgeColor = '#a855f7';
                break;
            case ACCESS_TIER.DONATOR:
                badgeText  = 'Donator';
                badgeColor = '#06b6d4';
                break;
            case ACCESS_TIER.TESTER:
                badgeText  = 'Tester';
                badgeColor = '#10b981';
                break;
            default:
                badgeText  = 'Level 5 Pilot';
                badgeColor = '#818cf8';
        }

        // Toggle Top-Right Action Pills (Owner: Admin Watchdog / Non-Owner: Tester Code)
        if (isOwner) {
            if (dom.btnOpenAdmin)       dom.btnOpenAdmin.style.display = 'inline-flex';
            if (dom.btnOpenTesterGate)  dom.btnOpenTesterGate.style.display = 'none';
        } else {
            if (dom.btnOpenAdmin)       dom.btnOpenAdmin.style.display = 'none';
            if (dom.btnOpenTesterGate)  dom.btnOpenTesterGate.style.display = 'inline-flex';
        }

        // Update profile pill in Navbar
        if (user.avatar_url) {
            dom.userAvatarImg.src = user.avatar_url;
            dom.userAvatarImg.style.display = 'block';
            dom.userAvatarFallback.style.display = 'none';
        } else {
            dom.userAvatarImg.style.display = 'none';
            dom.userAvatarFallback.style.display = 'block';
        }
        const displayName = user.nickname || user.global_name || user.username || 'X3 Operator';
        dom.userDisplayName.textContent = displayName;
        dom.userRoleBadge.textContent = badgeText;
        dom.userRoleBadge.style.color = badgeColor;

        // Slide auth gate left, slide cockpit in from right
        dom.authStage.classList.add('slide-out');
        setTimeout(() => {
            dom.mainStage.classList.add('active');
            if (window.refreshLiquidGlass) window.refreshLiquidGlass();
        }, 80);

        log(`Sitzung autorisiert: ${displayName} [${badgeText}]`, 'success');

        // Telemetry
        LoginAudit.record(user, user.verified ? 'Discord OAuth2' : 'Bypass Key');
        SecurityWatchdog.logEvent(
            'safe', 'Login',
            `Autorisiert: ${displayName} [${badgeText}]`,
            displayName
        );

        // Mandatory disclaimer — only if not accepted yet
        if (!localStorage.getItem('x3_disclaimer_accepted')) {
            openDisclaimerGate();
        }
    }

    function exitToAuth() {
        state.authenticated = false;
        state.user = null;
        sessionStorage.removeItem('x3_session');

        // Reverse Slide Animation
        dom.mainStage.classList.remove('active');
        setTimeout(() => {
            dom.authStage.classList.remove('slide-out');
            if (window.refreshLiquidGlass) {
                window.refreshLiquidGlass();
            }
        }, 120);

        log('Sitzung gesperrt. Zurück zum Portal.', 'warn');
    }

    /* ============================================================
       Discord OAuth2 & Role Gate (GitHub Pages & Server-ready)
       ============================================================ */
    function loginWithDiscord() {
        const isLocalHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        
        if (isLocalHost) {
            // Local server with /api endpoints
            window.location.href = '/api/discord/login';
        } else {
            // Static hosting (GitHub Pages, etc.) — Client-side Implicit Grant
            // Preserve current protocol (http: or https:)
            const redirectUri = window.location.origin + window.location.pathname;
            const params = new URLSearchParams({
                client_id: DISCORD_CONFIG.clientId,
                redirect_uri: redirectUri,
                response_type: 'token',
                scope: 'identify guilds guilds.members.read'
            });
            window.location.href = `https://discord.com/oauth2/authorize?${params.toString()}`;
        }
    }

    async function verifyDiscordTokenClientSide(accessToken) {
        showAuthAlert('loading', 'Prüfe Discord Profil & Berechtigungen...');

        try {
            // 1. Fetch Discord user profile
            const userRes = await fetch('https://discord.com/api/v10/users/@me', {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            if (!userRes.ok) throw new Error('Konnte Discord Profil nicht abrufen');
            const user = await userRes.json();

            const userId    = String(user.id);
            const username  = user.global_name || user.username;
            const avatarUrl = user.avatar
                ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`
                : null;

            // 2. Fetch guild member data (roles + nickname)
            const memberRes = await fetch(
                `https://discord.com/api/v10/users/@me/guilds/${DISCORD_CONFIG.guildId}/member`,
                { headers: { 'Authorization': `Bearer ${accessToken}` } }
            );

            if (memberRes.status === 404 || !memberRes.ok) {
                showAuthAlert('warning',
                    `Du bist noch nicht auf dem X3 Nation Discord Server (${username}). ` +
                    'Tritt zuerst bei, um Level 5 zu erreichen.', true);
                SecurityWatchdog.logEvent('warn', 'Server-Mitgliedschaft fehlt', username, 'Abgewiesen');
                return;
            }

            const member    = await memberRes.json();
            const roleIds   = (member.roles || []).map(r => String(r));
            const nickname  = member.nick || username;

            // 3. Role resolution — priority: Owner (strictly ID whitelisted) > Donator > Tester > Level 5
            const isOwner    = DISCORD_CONFIG.isOwnerId(userId);
            const hasDonator = roleIds.includes(DISCORD_CONFIG.donatorRoleId);
            const hasTester  = roleIds.includes(DISCORD_CONFIG.testerRoleId);
            const hasLevel5  = roleIds.includes(DISCORD_CONFIG.level5RoleId);

            // 4. Determine access
            if (!isOwner && !hasDonator && !hasTester && !hasLevel5) {
                // Build helpful message: how many XP remaining?
                showAuthAlert('error',
                    `Zugriff verweigert — ${nickname} hat noch keine Level 5 Rolle auf dem X3 Nation Server. ` +
                    'Chatte aktiv ~1 Stunde auf dem Server, um Level 5 zu erreichen.', true);
                log(`Zugriff abgewiesen: ${username} — keine Berechtigung [Rollen IDs: ${roleIds.slice(0,5).join(', ') || 'keine'}]`, 'warn');
                SecurityWatchdog.logEvent('warn', 'Zugriff verweigert', username, 'Keine Level-5 Rolle');
                return;
            }

            // 5. Resolve exact tier & display badge
            let tier, roleName, roleBadgeColor;
            if (isOwner) {
                tier = ACCESS_TIER.OWNER;
                roleName = 'Owner';
                roleBadgeColor = '#a855f7'; // purple
            } else if (hasDonator) {
                tier = ACCESS_TIER.DONATOR;
                roleName = 'Donator';
                roleBadgeColor = '#06b6d4'; // cyan
            } else if (hasTester) {
                tier = ACCESS_TIER.TESTER;
                roleName = 'Tester';
                roleBadgeColor = '#10b981'; // emerald
            } else {
                tier = ACCESS_TIER.LEVEL5;
                roleName = 'Level 5 Pilot';
                roleBadgeColor = '#818cf8'; // indigo
            }

            const userData = {
                username:     username,
                nickname:     nickname,
                global_name:  user.global_name || user.username,
                id:           userId,
                avatar_url:   avatarUrl,
                verified:     true,
                tier:         tier,
                isOwner:      isOwner,
                roleName:     roleName,
                roleBadgeColor: roleBadgeColor,
                allRoleIds:   roleIds,
                level:        hasLevel5 || hasDonator || hasTester || isOwner ? 5 : 0
            };

            sessionStorage.setItem('x3_session', JSON.stringify(userData));
            showAuthAlert('success',
                `Zugriff gestattet — ${nickname} [${roleName}]. Willkommen im X3 Nation Cockpit.`);
            log(`Discord OAuth verifiziert: ${username} [${roleName}] | Rollen: ${roleIds.length}`, 'success');

            setTimeout(() => enterCockpit(userData), 750);

        } catch (err) {
            console.error('OAuth verification error:', err);
            showAuthAlert('error', `Verbindungsfehler zur Discord API: ${err.message}`);
            SecurityWatchdog.logEvent('danger', 'OAuth Ausnahme', err.message, 'Fehler');
        }
    }

    async function checkUrlAuth() {
        // Ensure auth stage is visible (may be hidden behind disclaimer gate)
        if (!state.authenticated) {
            dom.authStage.classList.remove('slide-out');
            dom.authStage.style.display = 'flex';
            if (window.refreshLiquidGlass) window.refreshLiquidGlass();
        }

        // 1. Check for client-side OAuth2 Implicit Flow hash (GitHub Pages / Static)
        if (window.location.hash && window.location.hash.includes('access_token=')) {
            const hashParams = new URLSearchParams(window.location.hash.substring(1));
            const accessToken = hashParams.get('access_token');
            if (accessToken) {
                window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
                await verifyDiscordTokenClientSide(accessToken);
                return;
            }
        }

        // 2. Check for backend callback query params (?auth=success or ?auth=error)
        const params = new URLSearchParams(window.location.search);
        const authStatus = params.get('auth');
        
        if (authStatus === 'success') {
            const rawData = params.get('data');
            let userData = {
                username: 'Discord Member',
                verified: true,
                tier: ACCESS_TIER.LEVEL5,
                roleName: 'Level 5 Pilot'
            };
            if (rawData) {
                try {
                    const parsed = JSON.parse(decodeURIComponent(rawData));
                    // Merge and re-resolve tier from roleName if tier missing
                    userData = Object.assign(userData, parsed);
                    if (!userData.tier) {
                        if (DISCORD_CONFIG.isOwnerId(userData.id)) {
                            userData.tier = ACCESS_TIER.OWNER;
                            userData.isOwner = true;
                        } else if (userData.roleName === 'Donator') {
                            userData.tier = ACCESS_TIER.DONATOR;
                        } else if (userData.roleName === 'Tester') {
                            userData.tier = ACCESS_TIER.TESTER;
                        }
                    }
                } catch (e) {}
            }
            sessionStorage.setItem('x3_session', JSON.stringify(userData));
            window.history.replaceState({}, document.title, window.location.pathname);
            showAuthAlert('success', `Zugriff gestattet — ${userData.nickname || userData.username} [${userData.roleName}]. Willkommen.`);
            setTimeout(() => enterCockpit(userData), 600);
            return;
        }

        if (authStatus === 'error') {
            const reason = params.get('reason') || 'unbekannt';
            const user = params.get('user') || '';
            window.history.replaceState({}, document.title, window.location.pathname);
            
            if (reason === 'missing_level_5') {
                showAuthAlert('error', `Nein, du hast nicht Level 5. Du benötigst die Level 5 Rolle auf unserem Discord Server (${user || 'dein Account'}), um den Flasher freizuschalten. Chatte aktiv auf dem Server, um Level 5 zu erreichen!`, true);
            } else if (reason === 'not_in_guild') {
                showAuthAlert('warning', `Du bist noch nicht auf unserem Discord Server! Tritt zuerst der X3 Nation Community bei.`, true);
            } else if (reason === 'missing_role') {
                showAuthAlert('error', `Zugriff verweigert (${user}): Dir fehlt die erforderliche Rolle auf dem X3 Nation Discord Server.`, true);
            } else {
                showAuthAlert('error', `Authentifizierungsfehler: ${reason}`);
            }
            return;
        }

        // 3. Check existing session in sessionStorage
        const savedSession = sessionStorage.getItem('x3_session');
        if (savedSession) {
            try {
                const user = JSON.parse(savedSession);
                enterCockpit(user);
            } catch (e) {}
        }
    }

    /* ============================================================
       Tab Switching (G3, ZT3, F3) — Deeply Relaxed & Smooth
       ============================================================ */
    function initTabs() {
        dom.navTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const targetTab = tab.getAttribute('data-tab');
                if (state.activeTab === targetTab) return;
                state.activeTab = targetTab;

                dom.navTabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                Object.keys(dom.tabPanels).forEach(key => {
                    const panel = dom.tabPanels[key];
                    if (key === targetTab) {
                        panel.style.display = (key === 'g3') ? 'grid' : 'flex';
                        panel.classList.remove('tab-pane-smooth');
                        void panel.offsetWidth; // Force DOM reflow
                        panel.classList.add('tab-pane-smooth', 'active');
                    } else {
                        panel.style.display = 'none';
                        panel.classList.remove('active', 'tab-pane-smooth');
                    }
                });

                if (window.refreshLiquidGlass) {
                    window.refreshLiquidGlass();
                }
            });
        });
    }

    /* ============================================================
       Firmware Management & Loading (Fully Automatic Partition)
       ============================================================ */
    async function loadPresetFirmware(preset) {
        state.activePreset = preset;
        const targetPath = (preset === 'vcu') ? 'firmware/vcu/FIRM.bin.enc' : 'firmware/mcu/FIRM.bin.enc';
        const displayName = (preset === 'vcu') ? 'X3 Nation VCU with Love' : 'X3 Nation MCU with Love';
        const part = (preset === 'vcu') ? 'vcu' : 'mcu';

        // Automatic Partition Badge Update
        if (dom.autoPartitionText) {
            dom.autoPartitionText.textContent = (part === 'vcu') ? 'Auto: VCU Partition' : 'Auto: MCU Partition';
        }

        dom.flashStatusText.textContent = `Lade ${displayName}...`;

        try {
            log(`Lade ${displayName} (${targetPath})...`, 'info');
            const resp = await fetch(targetPath);
            if (!resp.ok) throw new Error(`HTTP ${resp.status} beim Laden von ${targetPath}`);
            const buf = await resp.arrayBuffer();
            state.firmwareBytes = new Uint8Array(buf);
            state.firmwareMeta = {
                name: displayName,
                type: part,
                size: state.firmwareBytes.length
            };
            dom.flashStatusText.textContent = `${displayName} bereit (${state.firmwareBytes.length} Bytes).`;
            log(`${displayName} bereit: ${state.firmwareBytes.length} Bytes [Auto-Partition: ${part.toUpperCase()}].`, 'success');
        } catch (err) {
            log(`Fehler beim Laden von ${displayName}: ${err.message}`, 'error');
            dom.flashStatusText.textContent = `Fehler beim Laden: ${err.message}`;
        }
    }

    function initPresets() {
        dom.presetCards.forEach(card => {
            card.addEventListener('click', () => {
                const preset = card.getAttribute('data-preset');
                dom.presetCards.forEach(c => c.classList.remove('active'));
                card.classList.add('active');
                loadPresetFirmware(preset);
            });
        });
    }

    /* ============================================================
       Scooter Bluetooth Connection (NBC Auth Stack)
       ============================================================ */
    async function connectScooter() {
        if (!navigator.bluetooth) {
            log('Web Bluetooth wird von diesem Browser nicht unterstützt. Bitte nutze Google Chrome oder Microsoft Edge.', 'error');
            alert('Web Bluetooth wird von diesem Browser nicht unterstützt (Chrome/Edge erforderlich).');
            return;
        }

        dom.btnBleConnect.disabled = true;
        dom.btnBleConnectLabel.textContent = 'Verbinde...';
        dom.bleStatusIndicator.className = 'status-indicator connecting';
        dom.bleStatusText.textContent = 'Suche Scooter...';
        dom.connStateBadge.textContent = 'Verbinden...';

        log('Starte BLE Gerätesuche (Präfixe: 1CG, 1K1, NB, Segway)...', 'ble');

        try {
            const session = await window.CfwFlasher.connect((msg) => {
                log(msg, 'ble');
                dom.bleStatusText.textContent = msg;
            });

            state.connectedSession = session;
            state.connectedDeviceName = session.bleName || 'Ninebot G3';

            dom.bleStatusIndicator.className = 'status-indicator connected';
            dom.bleStatusText.textContent = `Verbunden: ${state.connectedDeviceName}`;
            dom.connStateBadge.textContent = 'Verbunden';
            dom.connStateBadge.style.background = 'rgba(16, 185, 129, 0.15)';
            dom.connStateBadge.style.color = '#10b981';
            dom.connStateBadge.style.borderColor = 'rgba(16, 185, 129, 0.4)';

            dom.telemDevice.textContent = state.connectedDeviceName;
            dom.telemSession.textContent = 'NBC Aktiv';
            dom.telemSession.style.color = '#10b981';

            dom.btnBleConnect.style.display = 'none';
            dom.btnBleDisconnect.style.display = 'inline-flex';

            log(`Erfolgreich gekoppelt mit ${state.connectedDeviceName}. Verschlüsselte Session bereit.`, 'success');
        } catch (err) {
            log(`BLE Verbindungsfehler: ${err.message}`, 'error');
            dom.bleStatusIndicator.className = 'status-indicator';
            dom.bleStatusText.textContent = 'BLE Getrennt';
            dom.connStateBadge.textContent = 'Fehlgeschlagen';
            dom.connStateBadge.style.background = '';
            dom.connStateBadge.style.color = '';
            dom.connStateBadge.style.borderColor = '';
            dom.btnBleConnectLabel.textContent = 'Scooter verbinden';
        } finally {
            dom.btnBleConnect.disabled = false;
        }
    }

    async function disconnectScooter() {
        if (state.connectedSession) {
            try {
                await state.connectedSession.close();
            } catch (e) {}
            state.connectedSession = null;
        }

        dom.bleStatusIndicator.className = 'status-indicator';
        dom.bleStatusText.textContent = 'BLE Getrennt';
        dom.connStateBadge.textContent = 'Getrennt';
        dom.connStateBadge.style.background = '';
        dom.connStateBadge.style.color = '';
        dom.connStateBadge.style.borderColor = '';

        dom.telemDevice.textContent = '—';
        dom.telemSession.textContent = 'Inaktiv';
        dom.telemSession.style.color = '';

        dom.btnBleConnect.style.display = 'inline-flex';
        dom.btnBleConnectLabel.textContent = 'Scooter verbinden';
        dom.btnBleDisconnect.style.display = 'none';

        log('Scooter Verbindung getrennt.', 'warn');
    }

    /* ============================================================
       Flashing Execution Pipeline (Fully Automatic Partition)
       ============================================================ */
    async function startFlash() {
        if (!state.firmwareBytes || state.firmwareBytes.length === 0) {
            log('Keine Firmware geladen. Bitte wähle eine Firmware aus.', 'error');
            alert('Bitte wähle zuerst eine Firmware aus.');
            return;
        }

        // Automatic Partition derived directly from preset
        const partition = (state.activePreset === 'mcu') ? 'mcu' : 'vcu';
        state.isFlashing = true;
        dom.btnStartFlash.disabled = true;

        // Reset Gauge
        setGaugeProgress(0);
        dom.gaugeScooterImg.classList.add('flashing');
        dom.flashPhaseBadge.textContent = 'Initialisiere';
        dom.flashPhaseBadge.style.color = 'var(--accent-light)';

        log(`Starte OTA Flash-Pipeline für Auto-Partition [${partition.toUpperCase()}] (${state.firmwareBytes.length} Bytes)...`, 'ota');

        try {
            if (state.connectedSession && window.CfwFlasher.flashPartition) {
                log('Verwende bestehende NBC-Session...', 'ota');
                await window.CfwFlasher.flashPartition(
                    state.connectedSession,
                    partition,
                    state.firmwareBytes,
                    (phase) => {
                        dom.flashPhaseBadge.textContent = phase;
                        dom.flashStatusText.textContent = `Phase: ${phase}`;
                        log(`OTA Phase: ${phase}`, 'ota');
                    },
                    (done, total) => {
                        const pct = (done / total) * 100;
                        setGaugeProgress(pct);
                        dom.flashPageCount.textContent = `Seite ${done} von ${total}`;
                        dom.flashStatusText.textContent = `Flashe ${partition.toUpperCase()} Seite ${done}/${total}`;
                    }
                );
            } else {
                await window.CfwFlasher.flash(partition, state.firmwareBytes, {
                    onStatus: (msg) => {
                        dom.flashStatusText.textContent = msg;
                        log(msg, 'ota');
                    },
                    onPhase: (phase) => {
                        dom.flashPhaseBadge.textContent = phase;
                        dom.flashStatusText.textContent = `Phase: ${phase}`;
                        log(`OTA Phase: ${phase}`, 'ota');
                    },
                    onProgress: (done, total) => {
                        const pct = (done / total) * 100;
                        setGaugeProgress(pct);
                        dom.flashPageCount.textContent = `Seite ${done} von ${total}`;
                        dom.flashStatusText.textContent = `Flashe ${partition.toUpperCase()} Seite ${done}/${total}`;
                    }
                });
            }

            setGaugeProgress(100);
            dom.flashPhaseBadge.textContent = 'Fertig';
            dom.flashPhaseBadge.style.color = '#10b981';
            dom.flashStatusText.textContent = 'Flash erfolgreich abgeschlossen! Roller startet neu.';
            log('Flash erfolgreich abgeschlossen. Der Roller startet neu.', 'success');
            alert('Flash erfolgreich abgeschlossen! Der Roller startet nun neu.');
        } catch (err) {
            dom.flashPhaseBadge.textContent = 'Fehler';
            dom.flashPhaseBadge.style.color = '#ef4444';
            dom.flashStatusText.textContent = `Fehlgeschlagen: ${err.message}`;
            log(`Flash-Abbruch: ${err.message}`, 'error');
            alert(`Flash-Fehler: ${err.message}`);
        } finally {
            state.isFlashing = false;
            dom.btnStartFlash.disabled = false;
            dom.gaugeScooterImg.classList.remove('flashing');

            if (!state.connectedSession || !state.connectedSession.ble || !state.connectedSession.ble.device || !state.connectedSession.ble.device.gatt.connected) {
                disconnectScooter();
            }
        }
    }

    /* ============================================================
       SECURITY WATCHDOG & THREAT MONITOR
       ============================================================ */
    const SecurityWatchdog = {
        events: [],
        init() {
            try {
                this.events = JSON.parse(localStorage.getItem('x3_security_audit') || '[]');
            } catch (e) {
                this.events = [];
            }
            this.renderEvents();
            this.updateThreatStatus();
            this.startWatchdogProbes();
        },
        logEvent(level, eventName, source, status = 'Detektiert') {
            const entry = {
                timestamp: new Date().toLocaleTimeString('de-DE'),
                event: eventName,
                source: source || 'Unbekannt',
                status: status,
                level: level // 'safe', 'warn', 'danger'
            };
            this.events.unshift(entry);
            if (this.events.length > 60) this.events.pop();
            try {
                localStorage.setItem('x3_security_audit', JSON.stringify(this.events));
            } catch (e) {}
            this.renderEvents();
            this.updateThreatStatus();
        },
        updateThreatStatus() {
            if (!dom.threatIndicator) return;
            const hasDanger = this.events.some(e => e.level === 'danger');
            const hasWarn = this.events.some(e => e.level === 'warn');
            if (hasDanger) {
                dom.threatIndicator.className = 'threat-status-pill alert';
                dom.threatStatusLabel.textContent = 'SYSTEMSTATUS: ANOMALIE ERKANNT';
                dom.threatSummaryLabel.textContent = 'Verdächtige Eingriffe / Manipulation registriert';
            } else if (hasWarn) {
                dom.threatIndicator.className = 'threat-status-pill alert';
                dom.threatStatusLabel.textContent = 'SYSTEMSTATUS: WARNUNG';
                dom.threatSummaryLabel.textContent = 'DevTools oder abweichende Integrität erfasst';
            } else {
                dom.threatIndicator.className = 'threat-status-pill secure';
                dom.threatStatusLabel.textContent = 'SYSTEMSTATUS: SICHER';
                dom.threatSummaryLabel.textContent = 'Echtzeit-Integritätsprüfung aktiv';
            }
        },
        renderEvents() {
            if (!dom.securityEventTbody) return;
            if (this.events.length === 0) {
                dom.securityEventTbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:18px;">Keine Sicherheitsvorfälle registriert. System läuft nominal.</td></tr>`;
                return;
            }
            dom.securityEventTbody.innerHTML = this.events.map(e => `
                <tr>
                    <td class="audit-time">${escapeHtml(e.timestamp)}</td>
                    <td><strong style="color:var(--text-primary);">${escapeHtml(e.event)}</strong></td>
                    <td>${escapeHtml(e.source)}</td>
                    <td><span class="audit-badge ${e.level === 'danger' ? 'badge-danger' : (e.level === 'warn' ? 'badge-warn' : 'badge-safe')}">${escapeHtml(e.status)}</span></td>
                </tr>
            `).join('');
        },
        startWatchdogProbes() {
            // 1. DevTools detection probe
            let devtoolsOpen = false;
            const threshold = 160;
            setInterval(() => {
                const widthDiff = window.outerWidth - window.innerWidth > threshold;
                const heightDiff = window.outerHeight - window.innerHeight > threshold;
                if ((widthDiff || heightDiff) && !devtoolsOpen) {
                    devtoolsOpen = true;
                    this.logEvent('warn', 'DevTools / Console geöffnet', state.user?.username || 'Client', 'Aktiv');
                } else if (!widthDiff && !heightDiff) {
                    devtoolsOpen = false;
                }
            }, 3000);

            // 2. Global Flasher integrity probe
            setInterval(() => {
                const flasherAvailable = typeof window.CfwFlasher !== 'undefined' ||
                                         typeof window.KasaiFlasher !== 'undefined' ||
                                         typeof window.flasher !== 'undefined';
                if (!flasherAvailable && state.authenticated) {
                    this.logEvent('danger', 'flasher.js Scope fehlt / blockiert', 'Environment', 'Kritisch');
                }
            }, 10000);
        }
    };

    /* ============================================================
       LOGIN TELEMETRY AUDIT
       ============================================================ */
    const LoginAudit = {
        sessions: [],
        init() {
            try {
                this.sessions = JSON.parse(localStorage.getItem('x3_login_audit') || '[]');
            } catch (e) {
                this.sessions = [];
            }
            this.render();
        },
        record(user, method = 'Discord OAuth2') {
            const ua = navigator.userAgent;
            let browser = 'Browser';
            if (ua.includes('Firefox')) browser = 'Firefox';
            else if (ua.includes('Edg/')) browser = 'Edge';
            else if (ua.includes('Chrome/')) browser = 'Chrome';
            else if (ua.includes('Safari/')) browser = 'Safari';

            const entry = {
                timestamp: new Date().toLocaleString('de-DE'),
                username: user.global_name || user.username || 'X3 Operator',
                userId: user.id || 'N/A',
                role: user.roleName || (user.isOwner ? 'Owner' : 'Level 5 Pilot'),
                browser: `${browser} (${navigator.platform || 'Win'})`,
                method: method
            };
            this.sessions.unshift(entry);
            if (this.sessions.length > 50) this.sessions.pop();
            try {
                localStorage.setItem('x3_login_audit', JSON.stringify(this.sessions));
            } catch (e) {}
            this.render();
        },
        render() {
            if (!dom.loginAuditTbody) return;
            if (this.sessions.length === 0) {
                dom.loginAuditTbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:18px;">Bisher keine Logins verzeichnet.</td></tr>`;
                return;
            }
            dom.loginAuditTbody.innerHTML = this.sessions.map(s => `
                <tr>
                    <td class="audit-time">${escapeHtml(s.timestamp)}</td>
                    <td><strong>${escapeHtml(s.username)}</strong></td>
                    <td style="font-family:var(--font-mono);font-size:11px;">${escapeHtml(s.userId)}</td>
                    <td><span class="preset-tag" style="font-size:10px;">${escapeHtml(s.role)}</span></td>
                    <td style="font-size:11px;color:var(--text-muted);">${escapeHtml(s.browser)} [${escapeHtml(s.method)}]</td>
                </tr>
            `).join('');
        }
    };

    /* ============================================================
       TESTER CODE MANAGER
       ============================================================ */
    const TesterCodeManager = {
        codes: [],
        failedAttempts: 0,
        lastAttemptTime: 0,
        init() {
            try {
                const stored = localStorage.getItem('x3_tester_codes');
                if (stored) {
                    this.codes = JSON.parse(stored);
                } else {
                    this.codes = [
                        { code: 'X3-TEST-7F4B', createdAt: '24.11.2026 19:15', status: 'active', redeemedBy: null },
                        { code: 'X3-BETA-9A12', createdAt: '24.11.2026 18:30', status: 'active', redeemedBy: null }
                    ];
                    this.save();
                }
            } catch (e) {
                this.codes = [];
            }
            this.render();
        },
        save() {
            try {
                localStorage.setItem('x3_tester_codes', JSON.stringify(this.codes));
            } catch (e) {}
            this.render();
        },
        generate() {
            const randHex = Math.random().toString(16).substring(2, 6).toUpperCase();
            const newCode = `X3-TEST-${randHex}`;
            const now = new Date().toLocaleString('de-DE');
            this.codes.unshift({
                code: newCode,
                createdAt: now,
                status: 'active',
                redeemedBy: null
            });
            this.save();
            SecurityWatchdog.logEvent('safe', `Tester-Code generiert: ${newCode}`, 'Admin Panel', 'Erstellt');
            log(`Tester-Code generiert: ${newCode}`, 'info');
        },
        revoke(code) {
            this.codes = this.codes.filter(c => c.code !== code);
            this.save();
            SecurityWatchdog.logEvent('warn', `Tester-Code widerrufen: ${code}`, 'Admin Panel', 'Gelöscht');
            log(`Tester-Code gelöscht: ${code}`, 'warn');
        },
        redeem(rawCode, username) {
            const now = Date.now();
            if (this.failedAttempts >= 4 && now - this.lastAttemptTime < 30000) {
                SecurityWatchdog.logEvent('danger', 'Brute-Force Verdacht (Tester-Code)', username, 'Rate-Limit');
                return { success: false, message: 'Zu viele Fehlversuche. Bitte 30 Sekunden warten.' };
            }

            const code = String(rawCode || '').trim().toUpperCase();
            const match = this.codes.find(c => c.code === code && c.status === 'active');
            if (match) {
                match.status = 'redeemed';
                match.redeemedBy = username;
                this.save();
                this.failedAttempts = 0;
                SecurityWatchdog.logEvent('safe', `Tester-Code freigeschaltet: ${code}`, username, 'Eingelöst');
                return { success: true, message: 'Tester-Berechtigung erfolgreich freigeschaltet!' };
            } else {
                this.failedAttempts++;
                this.lastAttemptTime = now;
                SecurityWatchdog.logEvent('warn', `Ungültiger Tester-Code Versuch: '${code}'`, username, 'Abgewiesen');
                return { success: false, message: 'Ungültiger oder bereits eingelöster Code.' };
            }
        },
        render() {
            if (!dom.testerCodesTbody) return;
            if (this.codes.length === 0) {
                dom.testerCodesTbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:18px;">Keine Tester-Codes vorhanden. Erstelle einen mit dem Button oben.</td></tr>`;
                return;
            }
            dom.testerCodesTbody.innerHTML = this.codes.map(c => `
                <tr>
                    <td style="font-family:var(--font-mono);font-weight:600;color:var(--accent-cyan);">${escapeHtml(c.code)}</td>
                    <td class="audit-time">${escapeHtml(c.createdAt)}</td>
                    <td><span class="audit-badge ${c.status === 'active' ? 'badge-safe' : 'badge-warn'}">${c.status === 'active' ? 'Aktiv' : 'Eingelöst'}</span></td>
                    <td style="font-size:12px;">${c.redeemedBy ? escapeHtml(c.redeemedBy) : '—'}</td>
                    <td>
                        <button type="button" class="glass-btn btn-copy-code" data-code="${escapeHtml(c.code)}" style="padding:4px 8px;font-size:11px;">Kopieren</button>
                        <button type="button" class="glass-btn btn-del-code" data-code="${escapeHtml(c.code)}" style="padding:4px 8px;font-size:11px;color:#fca5a5;">Löschen</button>
                    </td>
                </tr>
            `).join('');

            dom.testerCodesTbody.querySelectorAll('.btn-copy-code').forEach(btn => {
                btn.onclick = () => {
                    const c = btn.getAttribute('data-code');
                    navigator.clipboard.writeText(c).then(() => alert(`Code ${c} in die Zwischenablage kopiert!`));
                };
            });
            dom.testerCodesTbody.querySelectorAll('.btn-del-code').forEach(btn => {
                btn.onclick = () => {
                    const c = btn.getAttribute('data-code');
                    TesterCodeManager.revoke(c);
                };
            });
        }
    };

    /* ============================================================
       HAFTUNGSAUSSCHLUSS — MANDATORY FULL-SCREEN GATE
       The disclaimer stage blocks everything. The user CANNOT
       close it, skip it, or access the auth form until it fires.
       On first visit: shown before auth. On return: shown after
       cockpit entrance. localStorage remembers acceptance.
       ============================================================ */
    let disclaimerTimer = null;

    // The disclaimer DOM is a full-screen stage, not a modal.
    // We show #disclaimer-stage (sibling to #auth-stage) and hide it after accept.
    const DISCLAIMER_EL = {
        get stage()       { return document.getElementById('disclaimer-stage'); },
        get countdown()   { return document.getElementById('disclaimer-timer-count'); },
        get bar()         { return document.getElementById('disclaimer-progress-fill'); },
        get acceptBtn()   { return document.getElementById('btn-accept-disclaimer'); },
        get acceptLabel() { return document.getElementById('btn-accept-disclaimer-label'); }
    };

    function runDisclaimerTimer(onComplete) {
        let remaining = 15;
        const btn   = DISCLAIMER_EL.acceptBtn;
        const lbl   = DISCLAIMER_EL.acceptLabel;
        const count = DISCLAIMER_EL.countdown;
        const bar   = DISCLAIMER_EL.bar;

        if (!btn) return;
        btn.disabled = true;
        btn.style.boxShadow = '';
        bar.style.width = '0%';
        bar.style.transition = 'none';
        count.textContent = '15s';
        lbl.textContent = 'Pflichtlesezeit (15s)...';

        if (disclaimerTimer) clearInterval(disclaimerTimer);

        setTimeout(() => {
            bar.style.transition = 'width 1s linear';
        }, 50);

        disclaimerTimer = setInterval(() => {
            remaining--;
            const pct = ((15 - remaining) / 15) * 100;
            bar.style.width = `${pct}%`;
            if (remaining > 0) {
                count.textContent = `${remaining}s`;
                lbl.textContent = `Pflichtlesezeit (${remaining}s)...`;
            } else {
                clearInterval(disclaimerTimer);
                disclaimerTimer = null;
                count.textContent = 'Fertig';
                bar.style.width = '100%';
                btn.disabled = false;
                lbl.textContent = 'Ich verstehe und stimme vollständig zu';
                btn.style.boxShadow = '0 0 24px rgba(129, 140, 248, 0.6)';
                if (onComplete) onComplete();
            }
        }, 1000);
    }

    function openDisclaimerGate() {
        const stage = DISCLAIMER_EL.stage;
        if (!stage) {
            // Fallback: modal approach if HTML hasn't got the stage element
            openDisclaimerModal(false);
            return;
        }
        // Hide auth and main stages; show disclaimer stage full-screen
        dom.authStage.style.display = 'none';
        dom.mainStage.classList.remove('active');
        stage.style.pointerEvents = 'auto';
        stage.style.animation = 'none';
        void stage.offsetWidth;
        stage.style.animation = 'disclaimerFadeIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards';
        stage.style.display = 'flex';

        runDisclaimerTimer(() => {
            // Timer complete — nothing extra, just unlock the button
        });

        DISCLAIMER_EL.acceptBtn.onclick = () => {
            localStorage.setItem('x3_disclaimer_accepted', String(Date.now()));
            document.documentElement.classList.add('disclaimer-done');
            stage.style.pointerEvents = 'none';
            stage.style.animation = 'disclaimerFadeOut 0.4s ease forwards';
            setTimeout(() => {
                stage.style.display = 'none';
                window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
                // Now show the auth stage (or cockpit if already authed)
                if (state.authenticated) {
                    dom.mainStage.classList.add('active');
                } else {
                    dom.authStage.classList.remove('slide-out');
                    dom.authStage.style.display = 'flex';
                    checkUrlAuth();
                }
                window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
                if (window.refreshLiquidGlass) {
                    window.refreshLiquidGlass();
                }
                log('Haftungsausschluss akzeptiert.', 'info');
                SecurityWatchdog.logEvent('safe', 'Haftungsausschluss akzeptiert',
                    state.user?.username || 'Neu-Besucher', 'Bestätigt');
            }, 400);
        };
    }

    // Fallback: modal-based disclaimer (used if no stage element)
    function openDisclaimerModal(force = false) {
        const accepted = localStorage.getItem('x3_disclaimer_accepted');
        if (accepted && !force) return;
        dom.modalDisclaimer.classList.add('active');
        runDisclaimerTimer(null);
    }

    /* ============================================================
       Modals Management
       ============================================================ */
    function initModals() {
        // Credits Modal
        dom.btnOpenCredits.addEventListener('click', () => {
            dom.modalCredits.classList.add('active');
        });

        // Direct Disclaimer Button in Auth Footer
        if (dom.btnOpenDisclaimerDirect) {
            dom.btnOpenDisclaimerDirect.addEventListener('click', () => {
                openDisclaimerGate();
            });
        }

        // Admin Panel Modal (Owner Only)
        if (dom.btnOpenAdmin) {
            dom.btnOpenAdmin.addEventListener('click', () => {
                dom.modalAdmin.classList.add('active');
                SecurityWatchdog.renderEvents();
                SecurityWatchdog.updateThreatStatus();
                LoginAudit.render();
                TesterCodeManager.render();
            });
        }

        // Admin Tab Navigation
        dom.adminTabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const target = btn.getAttribute('data-admin-tab');
                dom.adminTabBtns.forEach(b => b.classList.remove('active'));
                dom.adminTabContents.forEach(c => c.classList.remove('active'));
                btn.classList.add('active');
                const content = document.getElementById(`admin-sec-${target}`);
                if (content) content.classList.add('active');
            });
        });

        // Admin Generate Tester Code
        if (dom.btnGenTesterCode) {
            dom.btnGenTesterCode.addEventListener('click', () => {
                TesterCodeManager.generate();
            });
        }

        // Tester Gate Modal (Non-Owners)
        if (dom.btnOpenTesterGate) {
            dom.btnOpenTesterGate.addEventListener('click', () => {
                dom.modalTesterGate.classList.add('active');
                if (dom.testerGateFeedback) dom.testerGateFeedback.style.display = 'none';
                if (dom.inputTesterCode) dom.inputTesterCode.value = '';
            });
        }

        // Tester Gate Form Submit
        if (dom.testerCodeForm) {
            dom.testerCodeForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const code = dom.inputTesterCode.value.trim();
                const username = state.user?.username || 'Pilot';
                const result = TesterCodeManager.redeem(code, username);

                if (result.success) {
                    dom.testerGateFeedback.className = 'auth-alert-box auth-alert-success';
                    dom.testerGateFeedback.style.display = 'flex';
                    dom.testerGateFeedback.textContent = result.message;
                    setTimeout(() => {
                        dom.modalTesterGate.classList.remove('active');
                        dom.modalTesterCockpit.classList.add('active');
                        log(`Tester-Status aktiviert für ${username}`, 'success');
                    }, 800);
                } else {
                    dom.testerGateFeedback.className = 'auth-alert-box auth-alert-error';
                    dom.testerGateFeedback.style.display = 'flex';
                    dom.testerGateFeedback.textContent = result.message;
                }
            });
        }

        // Tester Cockpit: Unlock Tabs
        if (dom.btnUnlockAllTabs) {
            dom.btnUnlockAllTabs.addEventListener('click', () => {
                dom.navTabs.forEach(t => {
                    t.disabled = false;
                    t.style.opacity = '1';
                    t.style.cursor = 'pointer';
                });
                alert('Tester-Modus: Alle Modell-Tabs (ZT3, F3) für Vorab-Test freigeschaltet!');
                dom.modalTesterCockpit.classList.remove('active');
            });
        }

        // Disclaimer Accept Button (modal fallback path only; stage path sets its own onclick)
        if (dom.btnAcceptDisclaimer && dom.modalDisclaimer && !document.getElementById('disclaimer-stage')) {
            dom.btnAcceptDisclaimer.addEventListener('click', () => {
                localStorage.setItem('x3_disclaimer_accepted', String(Date.now()));
                if (dom.modalDisclaimer) dom.modalDisclaimer.classList.remove('active');
                log('Haftungsausschluss akzeptiert.', 'info');
                SecurityWatchdog.logEvent('safe', 'Haftungsausschluss', 'Pflichtbelehrung bestätigt', state.user?.username || 'Client');
            });
        }

        // Generic Modal Closers
        document.querySelectorAll('[data-close-modal]').forEach(el => {
            el.addEventListener('click', () => {
                const targetName = el.getAttribute('data-close-modal');
                const targetModal = document.getElementById(`modal-${targetName}`);
                if (targetModal) {
                    targetModal.classList.remove('active');
                }
            });
        });
    }

    /* ============================================================
       Event Bindings & Initialization
       ============================================================ */
    function initEvents() {
        // Discord Login Trigger (Universal: GitHub Pages & Server)
        dom.btnLoginDiscord.addEventListener('click', () => {
            loginWithDiscord();
        });

        // Lock / Return to Auth
        dom.btnLockSession.addEventListener('click', () => {
            exitToAuth();
        });

        // BLE Connect & Disconnect
        dom.btnBleConnect.addEventListener('click', connectScooter);
        dom.btnBleDisconnect.addEventListener('click', disconnectScooter);

        // Flash Trigger
        dom.btnStartFlash.addEventListener('click', startFlash);

        // Collapsible Terminal Toggle
        dom.terminalToggleHeader.addEventListener('click', () => {
            dom.terminalCollapsible.classList.toggle('collapsed');
            if (window.refreshLiquidGlass) {
                window.refreshLiquidGlass();
            }
        });

        // Terminal Log Actions
        dom.btnCopyLog.addEventListener('click', (e) => {
            e.stopPropagation();
            const lines = Array.from(dom.terminalOutput.querySelectorAll('.log-line'))
                .map(el => el.textContent)
                .join('\n');
            navigator.clipboard.writeText(lines).then(() => {
                alert('Protokoll in die Zwischenablage kopiert.');
            });
        });

        dom.btnClearLog.addEventListener('click', (e) => {
            e.stopPropagation();
            dom.terminalOutput.innerHTML = '';
            log('Aktivitätsprotokoll geleert.', 'info');
        });
    }

    // Startup Execution
    window.addEventListener('DOMContentLoaded', () => {
        SecurityWatchdog.init();
        LoginAudit.init();
        TesterCodeManager.init();

        initEvents();
        initTabs();
        initPresets();
        initModals();
        
        // Initialize gauge display to 0%
        setGaugeProgress(0);

        // Load default preset (VCU)
        loadPresetFirmware('vcu');

        // Disclaimer gate: show full-screen on first visit, hide auth stage until accepted.
        // On return visits (already accepted): skip gate, reveal auth stage, check OAuth.
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        const alreadyAccepted = localStorage.getItem('x3_disclaimer_accepted');
        if (!alreadyAccepted) {
            // First visit: open disclaimer gate
            openDisclaimerGate();
        } else {
            // Already accepted: ensure class is set, hide stage, reveal auth/main stage
            document.documentElement.classList.add('disclaimer-done');
            const stage = document.getElementById('disclaimer-stage');
            if (stage) stage.style.display = 'none';
            dom.authStage.classList.remove('slide-out');
            dom.authStage.style.display = 'flex';
            checkUrlAuth();
            window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
            if (window.refreshLiquidGlass) window.refreshLiquidGlass();
        }
    });

})();
