/**
 * X3 Nation — Core Application Logic
 * Integrates Web Bluetooth OTA Flashing via flasher.js,
 * Circular Scooter Gauge visualization, Collapsible Protocol Terminal,
 * Discord Role Gate verification, Top-Right User Profile & Avatar,
 * Fully Automatic Partition Selection, and Deeply Relaxed Tab Transitions.
 *
 * Credits: N-SAK for OTA profiles and NBC session crypto.
 */

(function () {
    'use strict';

    const CIRCUMFERENCE = 816.81; // 2 * PI * 130

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
        btnSkipAuth: document.getElementById('btn-skip-auth'),
        btnLockSession: document.getElementById('btn-lock-session'),
        authAlert: document.getElementById('auth-alert'),
        authAlertMsg: document.getElementById('auth-alert-msg'),
        btnOpenSettings: document.getElementById('btn-open-settings'),
        btnOpenCredits: document.getElementById('btn-open-credits'),

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
        modalSettings: document.getElementById('modal-settings'),
        discordConfigForm: document.getElementById('discord-config-form'),
        cfgClientId: document.getElementById('cfg-client-id'),
        cfgClientSecret: document.getElementById('cfg-client-secret'),
        cfgGuildId: document.getElementById('cfg-guild-id'),
        cfgRoleId: document.getElementById('cfg-role-id'),
        cfgRoleName: document.getElementById('cfg-role-name')
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
        
        // Update User Profile in Navbar
        if (user.avatar_url) {
            dom.userAvatarImg.src = user.avatar_url;
            dom.userAvatarImg.style.display = 'block';
            dom.userAvatarFallback.style.display = 'none';
        } else {
            dom.userAvatarImg.style.display = 'none';
            dom.userAvatarFallback.style.display = 'block';
        }
        dom.userDisplayName.textContent = user.global_name || user.username || 'X3 Operator';
        dom.userRoleBadge.textContent = user.roleName || (user.verified ? 'Verified Member' : 'Bypass Mode');

        // Animate Auth Gate to the left
        dom.authStage.classList.add('slide-out');

        // Animate Main Cockpit from the right into center
        setTimeout(() => {
            dom.mainStage.classList.add('active');
            if (window.refreshLiquidGlass) {
                window.refreshLiquidGlass();
            }
        }, 80);

        log(`Sitzung autorisiert: ${user.username || 'X3 Operator'}`, 'success');
        if (user.roleName) {
            log(`Rolle verifiziert: ${user.roleName}`, 'info');
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
       Discord Authentication & Role Gate
       ============================================================ */
    function checkUrlAuth() {
        const params = new URLSearchParams(window.location.search);
        const authStatus = params.get('auth');
        
        if (authStatus === 'success') {
            const rawData = params.get('data');
            let userData = { username: 'Discord Member', verified: true };
            if (rawData) {
                try {
                    userData = JSON.parse(decodeURIComponent(rawData));
                } catch (e) {}
            }
            sessionStorage.setItem('x3_session', JSON.stringify(userData));
            window.history.replaceState({}, document.title, window.location.pathname);
            enterCockpit(userData);
            return;
        }

        if (authStatus === 'error') {
            const reason = params.get('reason') || 'unbekannt';
            const user = params.get('user') || '';
            window.history.replaceState({}, document.title, window.location.pathname);
            
            dom.authAlert.className = 'auth-alert-box auth-alert-error';
            dom.authAlert.style.display = 'flex';
            
            if (reason === 'missing_role') {
                dom.authAlertMsg.textContent = `Zugriff verweigert (${user}): Dir fehlt die erforderliche Rolle auf dem X3 Nation Discord Server.`;
            } else if (reason === 'not_configured') {
                dom.authAlertMsg.textContent = 'Discord OAuth2 ist noch nicht konfiguriert. Bitte öffne das Setup unten oder nutze "Überspringen".';
            } else {
                dom.authAlertMsg.textContent = `Authentifizierungsfehler: ${reason}`;
            }
            return;
        }

        // Check existing session in sessionStorage
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
                        // Re-trigger smooth enter animation
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
       Modals & Configuration Management
       ============================================================ */
    function initModals() {
        // Credits Modal
        dom.btnOpenCredits.addEventListener('click', () => {
            dom.modalCredits.classList.add('active');
        });

        document.querySelectorAll('[data-close-modal="credits"]').forEach(el => {
            el.addEventListener('click', () => {
                dom.modalCredits.classList.remove('active');
            });
        });

        // Settings Modal
        dom.btnOpenSettings.addEventListener('click', async () => {
            dom.modalSettings.classList.add('active');
            try {
                const resp = await fetch('/api/config');
                if (resp.ok) {
                    const cfg = await resp.json();
                    dom.cfgClientId.value = cfg.clientId || '';
                    dom.cfgGuildId.value = cfg.guildId || '';
                    dom.cfgRoleId.value = cfg.requiredRoleId || '';
                    dom.cfgRoleName.value = cfg.roleName || '';
                }
            } catch (e) {}
        });

        document.querySelectorAll('[data-close-modal="settings"]').forEach(el => {
            el.addEventListener('click', () => {
                dom.modalSettings.classList.remove('active');
            });
        });

        // Save Discord Config
        dom.discordConfigForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const payload = {
                clientId: dom.cfgClientId.value.trim(),
                guildId: dom.cfgGuildId.value.trim(),
                requiredRoleId: dom.cfgRoleId.value.trim(),
                roleName: dom.cfgRoleName.value.trim()
            };
            if (dom.cfgClientSecret.value.trim()) {
                payload.clientSecret = dom.cfgClientSecret.value.trim();
            }

            try {
                const resp = await fetch('/api/config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if (resp.ok) {
                    dom.modalSettings.classList.remove('active');
                    alert('Discord Konfiguration erfolgreich gespeichert.');
                } else {
                    alert('Fehler beim Speichern der Konfiguration.');
                }
            } catch (err) {
                alert(`Fehler: ${err.message}`);
            }
        });
    }

    /* ============================================================
       Event Bindings & Initialization
       ============================================================ */
    function initEvents() {
        // Discord Login Trigger
        dom.btnLoginDiscord.addEventListener('click', () => {
            window.location.href = '/api/discord/login';
        });

        // Skip Button Trigger (Instant Lateral Transition)
        dom.btnSkipAuth.addEventListener('click', () => {
            enterCockpit({ username: 'Operator', roleName: 'Bypass Mode', verified: true });
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
        initEvents();
        initTabs();
        initPresets();
        initModals();
        
        // Initialize gauge display to 0%
        setGaugeProgress(0);

        // Load default preset (VCU)
        loadPresetFirmware('vcu');

        // Check Discord return parameters or cached session
        checkUrlAuth();
    });

})();
