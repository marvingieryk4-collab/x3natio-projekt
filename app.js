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
        navTabTester: document.getElementById('nav-tab-tester'),
        tabPanels: {
            g3: document.getElementById('tab-panel-g3'),
            zt3: document.getElementById('tab-panel-zt3'),
            f3: document.getElementById('tab-panel-f3'),
            tester: document.getElementById('tab-panel-tester')
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
       CFW VCU CONFIGURATOR & TEA ENCRYPTION ENGINE (TESTER SLOT)
       Strictly Separated G3 / F3 / ZT3 VCU Binary Patcher
       ============================================================ */
    const CfwConfigurator = {
        DELTA: 0x9e3779b9,
        ROUNDS: 32,
        DEFAULT_KEY: [0xb21c80fe, 0xa641efd1, 0xf53117a4, 0xf02468a0],

        MODELS: {
            g3: {
                id: 'g3',
                name: 'Ninebot MAX G3',
                compat: 'g3_VCU_AT32',
                file: 'firmware/vcu/base_g3_vcu.bin',
                expectedSize: 61436,
                encSize: 61440,
                arch: 'vorwaerz',
                speedOffsetLabel: '0x00140 / 0x0EDFA',
                maxCooldown: 300
            },
            f3: {
                id: 'f3',
                name: 'Ninebot F3 / F3 Pro',
                compat: 'f3_VCU_AT32',
                file: 'firmware/vcu/base_f3_vcu.bin',
                expectedSize: 61436,
                encSize: 61440,
                arch: 'vorwaerz',
                speedOffsetLabel: '0x00140 / 0x0EDFA',
                maxCooldown: 300
            },
            zt3: {
                id: 'zt3',
                name: 'Ninebot ZT3 Pro',
                compat: 'zt3_VCU_AT32',
                file: 'firmware/vcu/base_zt3_vcu.bin',
                expectedSize: 61308,
                encSize: 61312,
                arch: 'ztr1',
                speedOffsetLabel: 'ZTR1 @ 0x0E368',
                maxCooldown: 120
            }
        },

        selectedModel: 'g3',
        baseBinaries: { g3: null, f3: null, zt3: null },
        comboSteps: [2, 2, 3, 3, 4],
        generatedEncryptedBytes: null,
        generatedModelId: null,
        lastPatchSummary: '',

        u32(x) { return (x >>> 0); },

        readU16(buf, off) { return buf[off] | (buf[off + 1] << 8); },
        writeU16(buf, off, val) {
            buf[off] = val & 0xff;
            buf[off + 1] = (val >>> 8) & 0xff;
        },
        readU32(buf, off) {
            return ((buf[off]) | (buf[off + 1] << 8) | (buf[off + 2] << 16) | (buf[off + 3] << 24)) >>> 0;
        },
        writeU32(buf, off, val) {
            const v = val >>> 0;
            buf[off] = v & 0xff;
            buf[off + 1] = (v >>> 8) & 0xff;
            buf[off + 2] = (v >>> 16) & 0xff;
            buf[off + 3] = (v >>> 24) & 0xff;
        },
        writeBytes(buf, off, arr) {
            for (let i = 0; i < arr.length; i++) buf[off + i] = arr[i] & 0xff;
        },

        // ARMv7-M Thumb-2 MOVW Rd, #imm16
        encodeMovw(rd, imm16) {
            const v = imm16 & 0xffff;
            const imm4 = (v >>> 12) & 0x0f;
            const i = (v >>> 11) & 0x01;
            const imm3 = (v >>> 8) & 0x07;
            const imm8 = v & 0xff;
            const hw1 = 0xf240 | (i << 10) | imm4;
            const hw2 = (imm3 << 12) | ((rd & 0x0f) << 8) | imm8;
            return [hw1 & 0xff, (hw1 >>> 8) & 0xff, hw2 & 0xff, (hw2 >>> 8) & 0xff];
        },

        decodeMovw(buf, off) {
            const hw1 = buf[off] | (buf[off + 1] << 8);
            const hw2 = buf[off + 2] | (buf[off + 3] << 8);
            const imm4 = hw1 & 0x0f;
            const i = (hw1 >>> 10) & 0x01;
            const imm3 = (hw2 >>> 12) & 0x07;
            const imm8 = hw2 & 0xff;
            return (imm4 << 12) | (i << 11) | (imm3 << 8) | imm8;
        },

        // Standard IEEE 802.3 CRC-32 (used by ZT3 ZTR1 config block @ 0x0e360)
        crc32(bytes) {
            let crc = 0xffffffff;
            for (let i = 0; i < bytes.length; i++) {
                crc ^= bytes[i];
                for (let b = 0; b < 8; b++) {
                    crc = (crc & 1) ? ((crc >>> 1) ^ 0xedb88320) : (crc >>> 1);
                }
            }
            return (crc ^ 0xffffffff) >>> 0;
        },

        teaDecBlock(y, z, k) {
            let s = this.u32(this.DELTA * this.ROUNDS);
            for (let i = 0; i < this.ROUNDS; i++) {
                z = this.u32(z - (this.u32((this.u32(y << 4) + k[2]) ^ this.u32(y + s) ^ this.u32((y >>> 5) + k[3]))));
                y = this.u32(y - (this.u32((this.u32(z << 4) + k[0]) ^ this.u32(z + s) ^ this.u32((z >>> 5) + k[1]))));
                s = this.u32(s - this.DELTA);
            }
            return [y, z];
        },

        teaEncBlockStandard(y, z, k) {
            let s = 0;
            for (let i = 0; i < this.ROUNDS; i++) {
                s = this.u32(s + this.DELTA);
                y = this.u32(y + (this.u32((this.u32(z << 4) + k[0]) ^ this.u32(z + s) ^ this.u32((z >>> 5) + k[1]))));
                z = this.u32(z + (this.u32((this.u32(y << 4) + k[2]) ^ this.u32(y + s) ^ this.u32((y >>> 5) + k[3]))));
            }
            return [y, z];
        },

        rotateKey(k) {
            const buf = new Uint8Array(16);
            const view = new DataView(buf.buffer);
            for (let i = 0; i < 4; i++) view.setUint32(i * 4, k[i], true);
            for (let i = 0; i < 16; i++) buf[i] = (buf[i] + i) & 0xff;
            const res = [];
            for (let i = 0; i < 4; i++) res.push(view.getUint32(i * 4, true));
            return res;
        },

        checksum(data) {
            let s = 0;
            const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
            for (let i = 0; i < data.length - (data.length % 4); i += 4) {
                s = this.u32(s + view.getUint32(i, true));
            }
            const swp = this.u32(((s >>> 16) & 0xffff) | ((s & 0xffff) << 16));
            return this.u32(swp ^ 0xffffffff);
        },

        encryptTEA(body) {
            const ck = this.checksum(body);
            const plainLen = body.length + 4;
            const padLen = plainLen % 8 === 0 ? plainLen : plainLen + (8 - (plainLen % 8));
            const plain = new Uint8Array(padLen);
            plain.set(body, 0);
            const plainView = new DataView(plain.buffer);
            plainView.setUint32(body.length, ck, true);

            let k = [...this.DEFAULT_KEY];
            let lo = 0, hi = 0, proc = 0;
            const out = new Uint8Array(padLen);
            const outView = new DataView(out.buffer);

            for (let i = 0; i < padLen; i += 8) {
                if (proc === 1024) {
                    k = this.rotateKey(k);
                    proc = 0;
                }
                const p0 = this.u32(plainView.getUint32(i, true) ^ lo);
                const p1 = this.u32(plainView.getUint32(i + 4, true) ^ hi);
                const [c0, c1] = this.teaEncBlockStandard(p0, p1, k);
                outView.setUint32(i, c0, true);
                outView.setUint32(i + 4, c1, true);
                lo = c0;
                hi = c1;
                proc += 8;
            }
            return out;
        },

        decryptTEA(enc) {
            let k = [...this.DEFAULT_KEY];
            let lo = 0, hi = 0, proc = 0;
            const out = new Uint8Array(enc.length);
            const encView = new DataView(enc.buffer, enc.byteOffset, enc.byteLength);
            const outView = new DataView(out.buffer);

            for (let i = 0; i < enc.length - (enc.length % 8); i += 8) {
                if (proc === 1024) {
                    k = this.rotateKey(k);
                    proc = 0;
                }
                const c0 = encView.getUint32(i, true);
                const c1 = encView.getUint32(i + 4, true);
                const [d0, d1] = this.teaDecBlock(c0, c1, k);
                outView.setUint32(i, this.u32(d0 ^ lo), true);
                outView.setUint32(i + 4, this.u32(d1 ^ hi), true);
                lo = c0;
                hi = c1;
                proc += 8;
            }
            return out;
        },

        getSymbolLabel(sym) {
            const isZt3 = this.selectedModel === 'zt3';
            switch (sym) {
                case 1: return isZt3 ? 'Bremse (Egal)' : 'Konfig (F)';
                case 2: return 'Bremse L';
                case 3: return 'Bremse R';
                case 4: return '↓ Unten';
                case 5: return '↑ Oben';
                case 6: return '← Links';
                case 7: return '→ Rechts';
                default: return `?${sym}`;
            }
        },

        packCombo(steps) {
            let code = 0;
            for (const sym of steps) {
                code = ((code << 3) | (sym & 7)) >>> 0;
            }
            const mask = (steps.length >= 10) ? 0x3fffffff : (((1 << (steps.length * 3)) - 1) >>> 0);
            return { code, mask, len: steps.length };
        },

        unpackCombo(code, mask, explicitLen = null) {
            let len = explicitLen;
            if (!len) {
                len = 0;
                let m = mask >>> 0;
                while (m > 0 && len < 10) {
                    m >>>= 3;
                    len++;
                }
            }
            const out = [];
            for (let i = len - 1; i >= 0; i--) {
                const sym = (code >>> (i * 3)) & 7;
                if (sym >= 1 && sym <= 7) out.push(sym);
            }
            return out;
        },

        renderCombo() {
            const display = document.getElementById('cfw-combo-display');
            const badge = document.getElementById('cfw-combo-hex-badge');
            const rawHex = document.getElementById('cfw-combo-raw-hex');
            if (!display) return;

            if (this.comboSteps.length === 0) {
                display.innerHTML = `<span style="font-size:11.5px;color:var(--text-muted);">Keine Tasten gewählt — bitte unten 1 bis 10 Tasten anklicken</span>`;
                if (badge) badge.textContent = '0 Schritte';
                if (rawHex) rawHex.textContent = 'mask=0x00000000 code=0x00000000';
                return;
            }

            display.innerHTML = this.comboSteps.map((sym, idx) => {
                const sep = idx > 0 ? `<span class="cfw-combo-sep">&bull;</span>` : '';
                return `${sep}<span class="cfw-combo-pill" data-idx="${idx}" title="Klicken zum Entfernen">${escapeHtml(this.getSymbolLabel(sym))}</span>`;
            }).join('');

            display.querySelectorAll('.cfw-combo-pill').forEach(pill => {
                pill.addEventListener('click', () => {
                    const idx = parseInt(pill.getAttribute('data-idx'), 10);
                    if (!isNaN(idx)) {
                        this.comboSteps.splice(idx, 1);
                        this.invalidateBuild();
                        this.renderCombo();
                    }
                });
            });

            const packed = this.packCombo(this.comboSteps);
            if (badge) badge.textContent = `${packed.len} ${packed.len === 1 ? 'Schritt' : 'Schritte'}`;
            if (rawHex) {
                rawHex.textContent = `mask=0x${packed.mask.toString(16).padStart(8, '0')} code=0x${packed.code.toString(16).padStart(8, '0')}`;
            }
        },

        invalidateBuild() {
            this.generatedEncryptedBytes = null;
            this.generatedModelId = null;
            const btnFlash = document.getElementById('btn-flash-custom-cfw');
            const btnDl = document.getElementById('btn-download-custom-cfw');
            const indEl = document.getElementById('cfw-build-indicator');
            const statusEl = document.getElementById('cfw-build-status');
            if (btnFlash) {
                btnFlash.disabled = true;
                btnFlash.style.animation = '';
            }
            if (btnDl) btnDl.disabled = true;
            if (indEl) {
                indEl.style.background = 'var(--accent-cyan)';
                indEl.style.boxShadow = '0 0 12px var(--accent-cyan)';
            }
            if (statusEl) statusEl.textContent = 'Änderungen bereit zum Patchen';
        },

        async loadBase(modelId = this.selectedModel) {
            const spec = this.MODELS[modelId];
            if (!spec) return null;
            if (this.baseBinaries[modelId]) return this.baseBinaries[modelId];

            try {
                const r = await fetch(`${spec.file}?v=${Date.now()}`);
                if (!r.ok) throw new Error(`HTTP ${r.status} für ${spec.file}`);
                const buf = new Uint8Array(await r.arrayBuffer());
                if (buf.length !== spec.expectedSize) {
                    throw new Error(`Unerwartete VCU-Größe für ${modelId.toUpperCase()}: ${buf.length}B (erwartet ${spec.expectedSize}B)`);
                }
                // Extra integrity guard for ZT3 ZTR1 magic
                if (spec.arch === 'ztr1') {
                    const magic = String.fromCharCode(buf[0x0e358], buf[0x0e359], buf[0x0e35a], buf[0x0e35b]);
                    if (magic !== 'ZTR1') throw new Error(`ZT3 ZTR1-Header nicht gefunden (${magic})`);
                }
                this.baseBinaries[modelId] = buf;
                return buf;
            } catch (err) {
                console.error(`Failed to load ${modelId} VCU base:`, err);
                return null;
            }
        },

        async selectModel(modelId) {
            const spec = this.MODELS[modelId];
            if (!spec) return;
            this.selectedModel = modelId;
            this.invalidateBuild();

            // Update model cards UI
            document.querySelectorAll('.cfw-model-card').forEach(btn => {
                btn.classList.toggle('active', btn.getAttribute('data-model') === modelId);
            });

            const badge = document.getElementById('cfw-active-model-badge');
            const speedBadge = document.getElementById('cfw-speed-offset-badge');
            const flashLabel = document.getElementById('btn-flash-custom-cfw-label');
            const detailsEl = document.getElementById('cfw-build-details');
            const diffLog = document.getElementById('cfw-patch-diff-log');
            const sym1Label = document.getElementById('cfw-key-sym1-label');
            const sym1Arrow = document.querySelector('#cfw-key-sym1 .key-arrow');
            const zt3ProtectWrap = document.getElementById('cfw-zt3-protect-wrap');
            const toggleComboWrap = document.getElementById('cfw-toggle-on-combo-wrap');
            const unlockFlashWrap = document.getElementById('cfw-unlock-flash-wrap');
            const boostTimeoutWrap = document.getElementById('cfw-boost-timeout-wrap');
            const zt3BoostFlags = document.getElementById('cfw-zt3-boost-flags');
            const boostCoolInput = document.getElementById('cfw-boost-cool');

            if (badge) badge.textContent = spec.compat;
            if (speedBadge) speedBadge.textContent = spec.speedOffsetLabel;
            if (flashLabel) flashLabel.textContent = `Generierte ${modelId.toUpperCase()} VCU Flashen`;
            if (detailsEl) detailsEl.textContent = `Base: ${spec.name} (${spec.compat}) • ${spec.encSize.toLocaleString('de-DE')} Bytes`;
            if (diffLog) diffLog.style.display = 'none';

            const isZt3 = spec.arch === 'ztr1';
            if (sym1Label) sym1Label.textContent = isZt3 ? 'Beliebige Bremse (Links/Rechts)' : 'Konfig-Button (F-Taste)';
            if (sym1Arrow) sym1Arrow.textContent = isZt3 ? 'BR*' : 'F';
            if (zt3ProtectWrap) zt3ProtectWrap.style.display = isZt3 ? 'block' : 'none';
            if (toggleComboWrap) toggleComboWrap.style.display = isZt3 ? 'none' : 'flex';
            if (unlockFlashWrap) unlockFlashWrap.style.display = isZt3 ? 'none' : 'flex';
            if (boostTimeoutWrap) boostTimeoutWrap.style.display = isZt3 ? 'none' : 'flex';
            if (zt3BoostFlags) zt3BoostFlags.style.display = isZt3 ? 'flex' : 'none';
            if (boostCoolInput) boostCoolInput.max = String(spec.maxCooldown);

            // Load actual base binary and read real parameters out of it
            const base = await this.loadBase(modelId);
            if (!base) {
                log(`Fehler: Basis-VCU für ${spec.name} konnte nicht geladen werden.`, 'error');
                return;
            }

            const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
            const setChk = (id, v) => { const el = document.getElementById(id); if (el) el.checked = !!v; };
            const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };

            if (spec.arch === 'vorwaerz') {
                // Read directly from decrypted G3 / F3 binary
                setVal('cfw-std-eco', base[0x00140]);
                setVal('cfw-std-drive', base[0x00141]);
                setVal('cfw-std-sport', base[0x00143]);
                setVal('cfw-tun-eco', base[0x00144]);
                setVal('cfw-tun-drive', base[0x00145]);
                setVal('cfw-tun-sport', base[0x00147]);

                const mask = this.readU32(base, 0x0ed80);
                const code = this.readU32(base, 0x0ed84);
                this.comboSteps = this.unpackCombo(code, mask);

                const panicSec = (this.decodeMovw(base, 0x048b8) / 100).toFixed(1);
                const brakeSec = (this.decodeMovw(base, 0x0a8c0) / 100).toFixed(1);
                const boostAct = (this.decodeMovw(base, 0x02506) / 100).toFixed(1);
                const boostCool = Math.round(this.decodeMovw(base, 0x0edcc) / 100);
                const boostTimeout = Math.round(this.decodeMovw(base, 0x026ca) / 100);

                setVal('cfw-panic-hold', panicSec);
                setTxt('cfw-panic-hold-val', `${panicSec}s`);
                setVal('cfw-brake-hold', brakeSec);
                setTxt('cfw-brake-hold-val', `${brakeSec}s`);
                setVal('cfw-boost-act', boostAct);
                setVal('cfw-boost-cool', boostCool);
                setVal('cfw-boost-timeout', boostTimeout);
                setTxt('cfw-boost-timeout-val', `${boostTimeout}s`);

                setChk('cfw-allow-while-moving', base[0x0efb4] === 0x00 && base[0x0efb5] === 0xbf);
                setChk('cfw-panic-restart', !(base[0x0ed62] === 0x00 && base[0x0ed63] === 0xbf));
                setChk('cfw-unlock-flash', base[0x0ed68] !== 0x00);
                setChk('cfw-toggle-on-combo', false);
                setChk('cfw-direct-config-switch', false);

                // Cruise at 0x0a6ba
                let cruise = 'tuning_only';
                if (base[0x0a6ba] === 0x00 && base[0x0a6bb] === 0xbf) cruise = 'always';
                else if (base[0x0a6ba] === 0x02 && base[0x0a6bb] === 0xe0) cruise = 'disabled';
                setVal('cfw-cruise-mode', cruise);
            } else {
                // Read directly from decrypted ZT3 ZTR1 config block @ 0x0e368
                setVal('cfw-std-eco', base[0x0e368]);
                setVal('cfw-std-drive', base[0x0e369]);
                setVal('cfw-std-sport', base[0x0e36b]);
                setVal('cfw-tun-eco', base[0x0e36c]);
                setVal('cfw-tun-drive', base[0x0e36d]);
                setVal('cfw-tun-sport', base[0x0e36f]);

                const len = base[0x0e370];
                const code = this.readU32(base, 0x0e374);
                const mask = this.readU32(base, 0x0e378);
                this.comboSteps = this.unpackCombo(code, mask, len);

                setChk('cfw-allow-while-moving', base[0x0e371] === 1);
                setChk('cfw-prevent-app-increase', base[0x0e372] === 1);

                const boostAct = (this.readU16(base, 0x0e37c) / 100).toFixed(1);
                const brakeSec = (this.readU16(base, 0x0e37e) / 100).toFixed(1);
                const boostCool = Math.round(this.readU32(base, 0x0e384) / 100);
                const panicSec = (this.readU16(base, 0x0e38c) / 100).toFixed(1);

                setVal('cfw-boost-act', boostAct);
                setVal('cfw-brake-hold', brakeSec);
                setTxt('cfw-brake-hold-val', `${brakeSec}s`);
                setVal('cfw-boost-cool', boostCool);
                setVal('cfw-panic-hold', panicSec);
                setTxt('cfw-panic-hold-val', `${panicSec}s`);

                setChk('cfw-zt3-double-f-stop', base[0x0e380] === 1);
                setChk('cfw-zt3-boost-moving', base[0x0e381] === 1);
                setChk('cfw-panic-restart', base[0x0e38e] === 1);
                setChk('cfw-direct-config-switch', false);

                let cruise = 'always';
                if (base[0x0ef22] === 0x05 && base[0x0ef23] === 0xe0) cruise = 'disabled';
                else if (base[0x0ef22] === 0x00 && base[0x0ef23] === 0x7c) cruise = 'tuning_only';
                setVal('cfw-cruise-mode', cruise);
            }

            this.renderCombo();
            log(`VCU Basis geladen: ${spec.name} (${spec.compat}, ${base.length} Bytes entschlüsselt)`, 'info');
        },

        init() {
            // Model selector buttons
            document.querySelectorAll('.cfw-model-card').forEach(btn => {
                btn.addEventListener('click', () => {
                    const m = btn.getAttribute('data-model');
                    if (m) this.selectModel(m);
                });
            });

            // Combo keypad buttons
            document.querySelectorAll('.cfw-key-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    if (this.comboSteps.length >= 10) {
                        alert('Maximal 10 Schritte für die Tastenkombination erlaubt.');
                        return;
                    }
                    const sym = parseInt(btn.getAttribute('data-sym'), 10);
                    if (sym >= 1 && sym <= 7) {
                        this.comboSteps.push(sym);
                        this.invalidateBuild();
                        this.renderCombo();
                    }
                });
            });

            const btnBack = document.getElementById('cfw-combo-backspace');
            if (btnBack) btnBack.addEventListener('click', () => {
                this.comboSteps.pop();
                this.invalidateBuild();
                this.renderCombo();
            });

            const btnClear = document.getElementById('cfw-combo-clear');
            if (btnClear) btnClear.addEventListener('click', () => {
                this.comboSteps = [];
                this.invalidateBuild();
                this.renderCombo();
            });

            const btnPreArrows = document.getElementById('cfw-combo-preset-arrows');
            if (btnPreArrows) btnPreArrows.addEventListener('click', () => {
                this.comboSteps = [7, 7, 7, 7, 4]; // R -> R -> R -> R -> Down
                this.invalidateBuild();
                this.renderCombo();
            });

            const btnPreBrakes = document.getElementById('cfw-combo-preset-brakes');
            if (btnPreBrakes) btnPreBrakes.addEventListener('click', () => {
                this.comboSteps = [2, 2, 3, 3, 4]; // BL -> BL -> BR -> BR -> Down
                this.invalidateBuild();
                this.renderCombo();
            });

            // Range sliders live readout
            const bindRange = (id, valId, suffix) => {
                const r = document.getElementById(id);
                const v = document.getElementById(valId);
                if (r && v) {
                    r.addEventListener('input', () => {
                        v.textContent = `${r.value}${suffix}`;
                        this.invalidateBuild();
                    });
                }
            };
            bindRange('cfw-panic-hold', 'cfw-panic-hold-val', 's');
            bindRange('cfw-brake-hold', 'cfw-brake-hold-val', 's');
            bindRange('cfw-boost-timeout', 'cfw-boost-timeout-val', 's');

            // Invalidate build on any input/select/checkbox change inside tester panel
            const panel = document.getElementById('tab-panel-tester');
            if (panel) {
                panel.querySelectorAll('input, select').forEach(el => {
                    el.addEventListener('change', () => this.invalidateBuild());
                });
            }

            // Build, Download, Flash buttons
            const btnBuild = document.getElementById('btn-build-cfw');
            if (btnBuild) btnBuild.addEventListener('click', () => this.buildCFW());

            const btnDownload = document.getElementById('btn-download-custom-cfw');
            if (btnDownload) btnDownload.addEventListener('click', () => this.downloadCustomCFW());

            const btnFlash = document.getElementById('btn-flash-custom-cfw');
            if (btnFlash) btnFlash.addEventListener('click', () => this.flashCustomCFW());

            // Load default G3 model immediately
            this.selectModel('g3');
        },

        async buildCFW() {
            const spec = this.MODELS[this.selectedModel];
            const statusEl = document.getElementById('cfw-build-status');
            const detailsEl = document.getElementById('cfw-build-details');
            const indEl = document.getElementById('cfw-build-indicator');
            const btnFlash = document.getElementById('btn-flash-custom-cfw');
            const btnDl = document.getElementById('btn-download-custom-cfw');
            const diffLog = document.getElementById('cfw-patch-diff-log');

            const directConfigSwitch = !!document.getElementById('cfw-direct-config-switch')?.checked;
            if (!directConfigSwitch && this.comboSteps.length === 0) {
                alert('Bitte mindestens 1 Taste im Unlock-Code festlegen oder "Direkter Wechsel" aktivieren.');
                return;
            }

            if (statusEl) statusEl.textContent = `Lade ${spec.name} Basis-VCU...`;
            const base = await this.loadBase(spec.id);
            if (!base) {
                if (statusEl) statusEl.textContent = 'Fehler beim Laden der Basis-VCU';
                alert(`Konnte Basis-Firmware (${spec.file}) nicht laden.`);
                return;
            }

            const patched = new Uint8Array(base);
            const patchNotes = [];

            // Read common UI inputs
            const clamp = (v, mn, mx) => Math.min(mx, Math.max(mn, v));
            const stdEco = clamp(parseInt(document.getElementById('cfw-std-eco')?.value || '15', 10), 1, 127);
            const stdDrv = clamp(parseInt(document.getElementById('cfw-std-drive')?.value || '20', 10), 1, 127);
            const stdSpt = clamp(parseInt(document.getElementById('cfw-std-sport')?.value || '22', 10), 1, 127);
            const tunEco = clamp(parseInt(document.getElementById('cfw-tun-eco')?.value || '30', 10), 1, 127);
            const tunDrv = clamp(parseInt(document.getElementById('cfw-tun-drive')?.value || '40', 10), 1, 127);
            const tunSpt = clamp(parseInt(document.getElementById('cfw-tun-sport')?.value || '80', 10), 1, 127);

            const allowMoving = !!document.getElementById('cfw-allow-while-moving')?.checked;
            const panicSec = clamp(parseFloat(document.getElementById('cfw-panic-hold')?.value || '2.0'), 0.2, 10.0);
            const panicRestart = !!document.getElementById('cfw-panic-restart')?.checked;
            const brakeHoldSec = clamp(parseFloat(document.getElementById('cfw-brake-hold')?.value || '1.5'), 0.0, 5.0);
            const boostActSec = clamp(parseFloat(document.getElementById('cfw-boost-act')?.value || '0.1'), 0.0, 3.0);
            const boostCoolSec = clamp(parseInt(document.getElementById('cfw-boost-cool')?.value || '120', 10), 0, spec.maxCooldown);
            const cruiseMode = document.getElementById('cfw-cruise-mode')?.value || 'tuning_only';

            if (spec.arch === 'vorwaerz') {
                // ========================================================
                // G3 & F3 VORWAERZ VCU REAL ARM THUMB-2 PATCHER
                // ========================================================
                const toggleOnCombo = !!document.getElementById('cfw-toggle-on-combo')?.checked;
                const unlockFlash = !!document.getElementById('cfw-unlock-flash')?.checked;
                const boostTimeoutSec = clamp(parseInt(document.getElementById('cfw-boost-timeout')?.value || '15', 10), 5, 60);

                // 1. Speed Tables (0x00140..0x00147 + secondary 0x0edfa)
                patched[0x00140] = stdEco;
                patched[0x00141] = stdDrv;
                patched[0x00143] = stdSpt;
                patched[0x00144] = tunEco;
                patched[0x00145] = tunDrv;
                patched[0x00147] = tunSpt;
                patched[0x0edfa] = tunSpt; // MOVS r0, #tunSpt
                patchNotes.push(`Speeds @0x00140/0x0edfa: Std ${stdEco}/${stdDrv}/${stdSpt} | Tuning ${tunEco}/${tunDrv}/${tunSpt} km/h`);

                // 2. Unlock Combo & Direct Config-Button Switch
                const activeSteps = directConfigSwitch ? [1] : [...this.comboSteps];
                const packed = this.packCombo(activeSteps);
                this.writeU32(patched, 0x0ed80, packed.mask);
                this.writeU32(patched, 0x0ed84, packed.code);

                const usesConfigBtn = directConfigSwitch || activeSteps.includes(1);
                if (usesConfigBtn) {
                    // Patch 0x0efaa..0x0efb7: CMP r0,#4; ITE NE; ADDNE r0,#4; MOVEQ r0,#1; NOP; NOP; NOP
                    this.writeBytes(patched, 0x0efaa, [
                        0x04, 0x28, 0x14, 0xbf, 0x04, 0x30, 0x01, 0x20,
                        0x00, 0xbf, 0x00, 0xbf, 0x00, 0xbf
                    ]);
                    patchNotes.push(`Config-Button (F) Handler @0x0efaa: aktiv (Symbol 1 -> BL 0x0ed40)`);
                } else {
                    // Keep original handler; patch standstill check at 0x0efb4
                    patched[0x0efb4] = allowMoving ? 0x00 : 0x02;
                    patched[0x0efb5] = allowMoving ? 0xbf : 0xd8; // NOP vs BHI 0x0efbc
                }
                // Brakes standstill check at 0x0eeca
                patched[0x0eeca] = allowMoving ? 0x00 : 0x09;
                patched[0x0eecb] = allowMoving ? 0xbf : 0xd8; // NOP vs BHI 0x0eee0
                patchNotes.push(`Unlock Combo @0x0ed80: ${activeSteps.map(s => this.getSymbolLabel(s)).join(' -> ')} (mask=0x${packed.mask.toString(16)}, code=0x${packed.code.toString(16)})`);

                // 3. Profile Toggle (Direct Switch OR Toggle-on-Combo) vs Standard Unlock
                if (directConfigSwitch || toggleOnCombo) {
                    // 0x0ed64..0x0ed6f (12B): LDRB r0,[r1,#0]; MOVS r2,#1; EORS r0,r2; STRB r0,[r1,#0]; MOVS r2,#flash; STRB r2,[r1,#0x1a]
                    const flashVal = unlockFlash ? 0x78 : 0x00;
                    this.writeBytes(patched, 0x0ed64, [
                        0x08, 0x78, 0x01, 0x22, 0x50, 0x40, 0x08, 0x70,
                        flashVal, 0x22, 0x8a, 0x76
                    ]);
                    patchNotes.push(`Profile-Toggle @0x0ed64: Standard <-> Tuning aktiv (Flash=${unlockFlash ? 'An' : 'Aus'})`);
                } else {
                    patched[0x0ed68] = unlockFlash ? 0x78 : 0x00;
                }

                // 4. Panic Hold Time (Config/F-Button) @ 0x048b8 (MOVW r2) & 0x094f6 (MOVW r3)
                const panicTicks = clamp(Math.round(panicSec * 100), 20, 1000);
                this.writeBytes(patched, 0x048b8, this.encodeMovw(2, panicTicks));
                this.writeBytes(patched, 0x094f6, this.encodeMovw(3, panicTicks));
                patched[0x0ed62] = panicRestart ? 0x52 : 0x00;
                patched[0x0ed63] = panicRestart ? 0xb9 : 0xbf; // CBNZ r2 vs NOP
                patchNotes.push(`Konfig-Button Haltezeit @0x048b8/0x094f6: ${panicSec.toFixed(1)}s (${panicTicks} Ticks) | Neustart-Sperre=${panicRestart ? 'An' : 'Aus'}`);

                // 5. Brake Hold Time @ 0x0a8c0 (MOVW r1)
                const brakeTicks = clamp(Math.round(brakeHoldSec * 100), 0, 1000);
                this.writeBytes(patched, 0x0a8c0, this.encodeMovw(1, brakeTicks));
                patchNotes.push(`Brems-Hold @0x0a8c0: ${brakeHoldSec.toFixed(1)}s (${brakeTicks} Ticks)`);

                // 6. Boost Activation Hold (@0x02506 + @0x0eda6), Cooldown (@0x0edcc), Low-Throttle Timeout (@0x026ca)
                const boostActTicks = clamp(Math.round(boostActSec * 100), 0, 500);
                const boostCoolTicks = clamp(boostCoolSec * 100, 0, 30000);
                const boostToTicks = clamp(boostTimeoutSec * 100, 500, 6000);
                this.writeBytes(patched, 0x02506, this.encodeMovw(1, boostActTicks));
                patched[0x0eda6] = (boostActTicks === 0) ? 0x01 : 0x00; // instant boost flag
                this.writeBytes(patched, 0x0edcc, this.encodeMovw(0, boostCoolTicks));
                this.writeBytes(patched, 0x026ca, this.encodeMovw(1, boostToTicks));
                patchNotes.push(`Boost @0x02506/0x0edcc/0x026ca: Act=${boostActSec.toFixed(1)}s, Cooldown=${boostCoolSec}s, Timeout=${boostTimeoutSec}s`);

                // 7. Cruise Control Mode @ 0x0a6ba
                if (cruiseMode === 'tuning_only') {
                    this.writeBytes(patched, 0x0a6ba, [0x03, 0xd1]); // BNE +6 (Tuning only)
                } else if (cruiseMode === 'always') {
                    this.writeBytes(patched, 0x0a6ba, [0x00, 0xbf]); // NOP (Both profiles)
                } else {
                    this.writeBytes(patched, 0x0a6ba, [0x02, 0xe0]); // B +4 (Disabled)
                }
                patchNotes.push(`Tempomat @0x0a6ba: ${cruiseMode}`);
            } else {
                // ========================================================
                // ZT3 ZTR1 CONFIG-BLOCK + ARM THUMB-2 PATCHER
                // ========================================================
                const preventAppInc = !!document.getElementById('cfw-prevent-app-increase')?.checked;
                const doubleFStop = !!document.getElementById('cfw-zt3-double-f-stop')?.checked;
                const boostMoving = !!document.getElementById('cfw-zt3-boost-moving')?.checked;

                // Helper: ZT3 validator requires timer ticks to be multiples of 10!
                const step10 = (ticks, mn, mx) => clamp(Math.round(ticks / 10) * 10, mn, mx);

                // 1. Speeds in ZTR1 payload (+0x00..+0x07 @ 0x0e368..0x0e36f)
                patched[0x0e368] = stdEco;
                patched[0x0e369] = stdDrv;
                patched[0x0e36a] = 0x00; // validator requires 0
                patched[0x0e36b] = stdSpt;
                patched[0x0e36c] = tunEco;
                patched[0x0e36d] = tunDrv;
                patched[0x0e36e] = 0x00; // validator requires 0
                patched[0x0e36f] = tunSpt;
                patchNotes.push(`ZTR1 Speeds @0x0e368: Std ${stdEco}/${stdDrv}/${stdSpt} | Tuning ${tunEco}/${tunDrv}/${tunSpt} km/h`);

                // 2. Unlock Combo (+0x08 len, +0x09 allowMoving, +0x0a preventAppInc, +0x0c code, +0x10 mask)
                const activeSteps = this.comboSteps.length > 0 ? [...this.comboSteps] : [2, 2, 3, 3, 4, 4];
                const packed = this.packCombo(activeSteps);
                patched[0x0e370] = packed.len;
                patched[0x0e371] = allowMoving ? 1 : 0;
                patched[0x0e372] = preventAppInc ? 1 : 0;
                this.writeU32(patched, 0x0e374, packed.code);
                this.writeU32(patched, 0x0e378, packed.mask);
                patchNotes.push(`ZTR1 Combo @0x0e370: ${activeSteps.map(s => this.getSymbolLabel(s)).join(' -> ')} (len=${packed.len}, code=0x${packed.code.toString(16)})`);

                // 3. Direct Single-Press Config/F-Button Toggle @ 0x0e5c4..0x0e5d5 (18 bytes)
                if (directConfigSwitch) {
                    // SUB.W r0, r4, #0x40; LDRB r1,[r0]; EOR.W r1,r1,#1; STRB r1,[r0]; NOP; NOP; NOP
                    this.writeBytes(patched, 0x0e5c4, [
                        0xa4, 0xf1, 0x40, 0x00,
                        0x01, 0x78,
                        0x81, 0xf0, 0x01, 0x01,
                        0x01, 0x70,
                        0x00, 0xbf, 0x00, 0xbf, 0x00, 0xbf
                    ]);
                    patchNotes.push(`ZT3 Konfig-Button Sofort-Toggle @0x0e5c4: 1x Drücken schaltet [0x20007810] um`);
                }

                // 4. Boost Activation (+0x14), Brake Hold (+0x16), Boost Flags (+0x18/+0x19), Boost Cooldown (+0x1c)
                const boostActTicks = step10(Math.round(boostActSec * 100), 0, 1000);
                const brakeTicks = step10(Math.round(brakeHoldSec * 100), 0, 1000);
                const boostCoolTicks = step10(boostCoolSec * 100, 0, 12000);
                this.writeU16(patched, 0x0e37c, boostActTicks);
                this.writeU16(patched, 0x0e37e, brakeTicks);
                patched[0x0e380] = doubleFStop ? 1 : 0;
                patched[0x0e381] = boostMoving ? 1 : 0;
                this.writeU32(patched, 0x0e384, boostCoolTicks);
                patchNotes.push(`ZTR1 Timings @0x0e37c: BoostAct=${(boostActTicks/100).toFixed(1)}s, BrakeHold=${(brakeTicks/100).toFixed(1)}s, Cooldown=${(boostCoolTicks/100).toFixed(0)}s`);

                // 5. Panic Hold (+0x24 @ 0x0e38c) & Panic Restart (+0x26 @ 0x0e38e)
                const panicTicks = step10(Math.round(panicSec * 100), 10, 1000);
                this.writeU16(patched, 0x0e38c, panicTicks);
                patched[0x0e38e] = panicRestart ? 1 : 0;
                patchNotes.push(`ZTR1 Konfig-Hold @0x0e38c: ${(panicTicks/100).toFixed(1)}s | Neustart-Sperre=${panicRestart ? 'An' : 'Aus'}`);

                // 6. Cruise Control @ 0x0ef22..0x0ef2f
                if (cruiseMode === 'tuning_only') {
                    // LDRB r0,[r0,#0x10]; CMP r0,#1; BEQ 0x0ef34; NOP*4 -> falls through to BIC r2,#0x4000
                    this.writeBytes(patched, 0x0ef22, [
                        0x00, 0x7c, 0x01, 0x28, 0x05, 0xd0,
                        0x00, 0xbf, 0x00, 0xbf, 0x00, 0xbf, 0x00, 0xbf
                    ]);
                } else if (cruiseMode === 'disabled') {
                    // B 0x0ef30 (always BIC r2,#0x4000)
                    this.writeBytes(patched, 0x0ef22, [0x05, 0xe0]);
                }
                patchNotes.push(`ZT3 Tempomat @0x0ef22: ${cruiseMode}`);

                // 7. MANDATORY: Recompute ZT3 ZTR1 CRC-32 over 0x0e368..0x0e3a7 and write @ 0x0e360
                const newCrc = this.crc32(patched.subarray(0x0e368, 0x0e3a8));
                this.writeU32(patched, 0x0e360, newCrc);
                patchNotes.push(`ZTR1 CRC-32 @0x0e360 neu berechnet: 0x${newCrc.toString(16).padStart(8, '0')}`);
            }

            // Compute exact byte-by-byte diff vs base binary
            const changedOffsets = [];
            for (let i = 0; i < patched.length; i++) {
                if (patched[i] !== base[i]) changedOffsets.push(i);
            }

            if (statusEl) statusEl.textContent = 'Verschlüssele CFW mit TEA & Prüfsumme...';

            // TEA Re-encryption + Self-Test Verification
            const enc = this.encryptTEA(patched);
            const verifyDec = this.decryptTEA(enc);
            const expectedCk = this.checksum(patched);
            const storedCk = this.readU32(verifyDec, patched.length);
            let roundtripOk = (storedCk === expectedCk);
            if (roundtripOk) {
                for (let i = 0; i < patched.length; i++) {
                    if (verifyDec[i] !== patched[i]) { roundtripOk = false; break; }
                }
            }
            if (!roundtripOk) {
                alert('Interner TEA-Verifizierungsfehler! Build abgebrochen.');
                return;
            }

            this.generatedEncryptedBytes = enc;
            this.generatedModelId = spec.id;
            this.lastPatchSummary = [
                `X3 Nation CFW VCU Build Report`,
                `Modell: ${spec.name} (${spec.compat})`,
                `Dateigröße: ${enc.length} Bytes (TEA-verschlüsselt + Prüfsumme 0x${expectedCk.toString(16).padStart(8, '0')})`,
                `Veränderte Bytes gegenüber Basis: ${changedOffsets.length}`,
                ...patchNotes.map(n => `  • ${n}`)
            ].join('\n');

            if (statusEl) statusEl.textContent = `${spec.name} CFW erfolgreich gepatcht & verifiziert!`;
            if (detailsEl) {
                detailsEl.textContent = `${spec.compat} • ${enc.length.toLocaleString('de-DE')} Bytes TEA • ${changedOffsets.length} Bytes real modifiziert • Checksum 0x${expectedCk.toString(16).padStart(8, '0')} OK`;
            }
            if (indEl) {
                indEl.style.background = 'var(--success)';
                indEl.style.boxShadow = '0 0 14px var(--success)';
            }
            if (btnFlash) {
                btnFlash.disabled = false;
                btnFlash.style.animation = 'pulseBtn 2s infinite';
            }
            if (btnDl) btnDl.disabled = false;
            if (diffLog) {
                diffLog.style.display = 'block';
                diffLog.textContent = this.lastPatchSummary;
            }

            log(`CFW ${spec.compat} gepatcht (${changedOffsets.length} Bytes verändert, TEA Checksum 0x${expectedCk.toString(16)} OK).`, 'success');
        },

        async downloadCustomCFW() {
            if (!this.generatedEncryptedBytes || !this.generatedModelId) {
                alert('Bitte zuerst auf "CFW Patchen & TEA Verschlüsseln" klicken.');
                return;
            }
            const spec = this.MODELS[this.generatedModelId];
            if (typeof JSZip !== 'undefined') {
                const zip = new JSZip();
                zip.file('FIRM.bin.enc', this.generatedEncryptedBytes);
                zip.file('info.json', JSON.stringify({
                    schemaVersion: 1,
                    firmware: {
                        displayName: `X3 Nation CFW ${spec.id.toUpperCase()}`,
                        model: spec.id,
                        enforceModel: true,
                        type: 'VCU',
                        compatible: [spec.compat],
                        encryption: 'encrypted'
                    }
                }, null, 2));
                zip.file('x3_cfw_report.txt', this.lastPatchSummary);
                const blob = await zip.generateAsync({ type: 'blob' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `x3nation_${spec.id}_vcu_cfw.zip`;
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 5000);
                log(`Download gestartet: x3nation_${spec.id}_vcu_cfw.zip`, 'success');
            } else {
                const blob = new Blob([this.generatedEncryptedBytes], { type: 'application/octet-stream' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `x3nation_${spec.id}_FIRM.bin.enc`;
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 5000);
            }
        },

        async flashCustomCFW() {
            if (!this.generatedEncryptedBytes || !this.generatedModelId) {
                alert('Bitte zuerst auf "CFW Patchen & TEA Verschlüsseln" klicken.');
                return;
            }

            const spec = this.MODELS[this.generatedModelId];
            if (!confirm(`ACHTUNG: Du flashst jetzt eine benutzerdefinierte VCU für ${spec.name} (${spec.compat}).\nStelle sicher, dass der verbundene Scooter exakt ein ${spec.name} ist! Fortfahren?`)) {
                return;
            }

            const btnFlash = document.getElementById('btn-flash-custom-cfw');
            const flashLabel = document.getElementById('btn-flash-custom-cfw-label');
            if (btnFlash) btnFlash.disabled = true;
            if (flashLabel) flashLabel.textContent = `Flashe ${spec.id.toUpperCase()} VCU...`;

            log(`Starte OTA-Flash der benutzerdefinierten ${spec.compat} Firmware...`, 'info');

            try {
                if (typeof window.CfwFlasher === 'undefined') {
                    throw new Error('Flasher Engine (flasher.js) nicht initialisiert.');
                }

                await window.CfwFlasher.flash('vcu', this.generatedEncryptedBytes, {
                    onStatus: (msg) => log(`[OTA VCU] ${msg}`, 'info'),
                    onPhase: (phase) => log(`[OTA Phase] ${phase}`, 'info'),
                    onProgress: (pct) => setGaugeProgress(pct)
                });

                alert(`Custom ${spec.name} VCU erfolgreich geflasht! Der Roller startet nun neu.`);
                log(`Custom ${spec.compat} Flash vollständig abgeschlossen.`, 'success');
            } catch (err) {
                console.error('Custom Flash Error:', err);
                log(`Flash-Fehler: ${err.message}`, 'error');
                alert(`Fehler beim Flashen: ${err.message}`);
            } finally {
                if (btnFlash) btnFlash.disabled = false;
                if (flashLabel) flashLabel.textContent = `Generierte ${spec.id.toUpperCase()} VCU Flashen`;
            }
        }
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

        // Check tester unlock status
        if (localStorage.getItem('x3_tester_unlocked') === 'true' || (user && user.tier === ACCESS_TIER.TESTER)) {
            unlockTesterTab();
        }

        // Slide auth gate left, slide cockpit in from right
        dom.authStage.classList.add('slide-out');
        dom.authStage.style.display = 'none';
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
            // Static hosting (GitHub Pages, custom domain, etc.) — Client-side Implicit Grant
            // Force http:// if user requires http, or use current origin converted to http
            let origin = window.location.origin;
            if (origin.startsWith('https://')) {
                origin = origin.replace('https://', 'http://');
            }
            const redirectUri = origin + window.location.pathname;
            const params = new URLSearchParams({
                client_id: DISCORD_CONFIG.clientId,
                redirect_uri: redirectUri,
                response_type: 'token',
                scope: 'identify guilds guilds.members.read guilds.join'
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

    function unlockTesterTab() {
        if (dom.navTabTester) {
            dom.navTabTester.style.display = 'inline-flex';
            if (window.refreshLiquidGlass) window.refreshLiquidGlass();
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

            // Real-time synchronization across browser tabs
            window.addEventListener('storage', (e) => {
                if (e.key === 'x3_login_audit') {
                    try {
                        this.sessions = JSON.parse(e.newValue || '[]');
                        this.render();
                    } catch (err) {}
                }
            });

            // Global live polling across the server backend
            this.fetchServerLogins();
            setInterval(() => this.fetchServerLogins(), 2500);
        },
        async fetchServerLogins() {
            try {
                const res = await fetch('/api/logins');
                if (res.ok) {
                    const data = await res.json();
                    if (Array.isArray(data)) {
                        this.sessions = data;
                        try {
                            localStorage.setItem('x3_login_audit', JSON.stringify(this.sessions));
                        } catch (e) {}
                        this.render();
                    }
                }
            } catch (e) {}
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
            if (this.sessions.length > 100) this.sessions.pop();
            try {
                localStorage.setItem('x3_login_audit', JSON.stringify(this.sessions));
            } catch (e) {}
            this.render();

            // Broadcast live to server backend
            try {
                fetch('/api/logins', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(entry)
                }).catch(() => {});
            } catch (e) {}
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
        async init() {
            try {
                const stored = localStorage.getItem('x3_tester_codes');
                if (stored) {
                    this.codes = JSON.parse(stored);
                } else {
                    this.codes = [
                        { code: 'X3-TEST-BC40', createdAt: '26.11.2026, 19:23:23', status: 'active', redeemedBy: null },
                        { code: 'X3-TEST-BBB1', createdAt: '26.11.2026, 19:23:37', status: 'active', redeemedBy: null },
                        { code: 'X3-TEST-7F4B', createdAt: '24.11.2026 19:15', status: 'active', redeemedBy: null },
                        { code: 'X3-BETA-9A12', createdAt: '24.11.2026 18:30', status: 'active', redeemedBy: null }
                    ];
                    this.save();
                }
            } catch (e) {
                this.codes = [];
            }
            this.render();
            await this.syncFromServer();
            setInterval(() => this.syncFromServer(), 3000);
        },
        async syncFromServer() {
            try {
                const res = await fetch('/api/tester-codes');
                if (res.ok) {
                    const data = await res.json();
                    if (Array.isArray(data) && data.length > 0) {
                        this.codes = data;
                        try {
                            localStorage.setItem('x3_tester_codes', JSON.stringify(this.codes));
                        } catch (e) {}
                        this.render();
                    }
                }
            } catch (e) {}
        },
        save() {
            try {
                localStorage.setItem('x3_tester_codes', JSON.stringify(this.codes));
            } catch (e) {}
            this.render();
        },
        async generate() {
            const randHex = Math.random().toString(16).substring(2, 6).toUpperCase();
            const newCode = `X3-TEST-${randHex}`;
            const now = new Date().toLocaleString('de-DE');
            const newEntry = {
                code: newCode,
                createdAt: now,
                status: 'active',
                redeemedBy: null
            };
            this.codes.unshift(newEntry);
            this.save();
            SecurityWatchdog.logEvent('safe', `Tester-Code generiert: ${newCode}`, 'Admin Panel', 'Erstellt');
            log(`Tester-Code generiert: ${newCode}`, 'info');

            try {
                await fetch('/api/tester-codes', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'generate',
                        code: newCode,
                        createdAt: now
                    })
                });
                await this.syncFromServer();
            } catch (e) {}
        },
        async revoke(code) {
            this.codes = this.codes.filter(c => c.code !== code);
            this.save();
            SecurityWatchdog.logEvent('warn', `Tester-Code widerrufen: ${code}`, 'Admin Panel', 'Gelöscht');
            log(`Tester-Code gelöscht: ${code}`, 'warn');

            try {
                await fetch('/api/tester-codes', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'revoke',
                        code: code
                    })
                });
                await this.syncFromServer();
            } catch (e) {}
        },
        async redeem(rawCode, username) {
            const now = Date.now();
            if (this.failedAttempts >= 5 && now - this.lastAttemptTime < 20000) {
                SecurityWatchdog.logEvent('danger', 'Brute-Force Verdacht (Tester-Code)', username, 'Rate-Limit');
                return { success: false, message: 'Zu viele Fehlversuche. Bitte kurz warten.' };
            }

            const code = String(rawCode || '').trim().toUpperCase();
            if (!code) {
                return { success: false, message: 'Bitte gib einen Code ein.' };
            }

            // 1. Check server-side first
            try {
                const res = await fetch('/api/tester-codes', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'redeem',
                        code: code,
                        username: username
                    })
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data.success) {
                        this.failedAttempts = 0;
                        SecurityWatchdog.logEvent('safe', `Tester-Code freigeschaltet (Server): ${code}`, username, 'Eingelöst');
                        await this.syncFromServer();
                        return { success: true, message: data.message || 'Tester-Berechtigung erfolgreich freigeschaltet!' };
                    } else {
                        // Check local fallback
                        const localMatch = this.codes.find(c => c.code.toUpperCase() === code && c.status === 'active');
                        if (localMatch) {
                            localMatch.status = 'redeemed';
                            localMatch.redeemedBy = username;
                            this.save();
                            this.failedAttempts = 0;
                            SecurityWatchdog.logEvent('safe', `Tester-Code freigeschaltet (Lokal): ${code}`, username, 'Eingelöst');
                            return { success: true, message: 'Tester-Berechtigung erfolgreich freigeschaltet!' };
                        }

                        this.failedAttempts++;
                        this.lastAttemptTime = now;
                        SecurityWatchdog.logEvent('warn', `Ungültiger Tester-Code Versuch: '${code}'`, username, 'Abgewiesen');
                        return { success: false, message: data.message || 'Ungültiger oder bereits eingelöster Code.' };
                    }
                }
            } catch (err) {
                console.warn('[!] Server-Redeem offline, prüfe lokale Codes:', err);
            }

            // 2. Offline / Local fallback check
            const match = this.codes.find(c => c.code.toUpperCase() === code && c.status === 'active');
            if (match) {
                match.status = 'redeemed';
                match.redeemedBy = username;
                this.save();
                this.failedAttempts = 0;
                SecurityWatchdog.logEvent('safe', `Tester-Code freigeschaltet (Offline): ${code}`, username, 'Eingelöst');
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
            dom.testerCodeForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const code = dom.inputTesterCode.value.trim();
                const username = state.user?.username || 'Pilot';

                const submitBtn = dom.testerCodeForm.querySelector('button[type="submit"]');
                const origBtnText = submitBtn ? submitBtn.textContent : '';
                if (submitBtn) {
                    submitBtn.disabled = true;
                    submitBtn.textContent = 'Verifiziere...';
                }

                try {
                    const result = await TesterCodeManager.redeem(code, username);

                    if (result.success) {
                        dom.testerGateFeedback.className = 'auth-alert-box auth-alert-success';
                        dom.testerGateFeedback.style.display = 'flex';
                        dom.testerGateFeedback.textContent = result.message;
                        // Unlock Tester tab in navigation
                        localStorage.setItem('x3_tester_unlocked', 'true');
                        unlockTesterTab();
                        setTimeout(() => {
                            dom.modalTesterGate.classList.remove('active');
                            dom.modalTesterCockpit.classList.add('active');
                            log(`Tester-Status aktiviert für ${username} — Tester Tab freigeschaltet`, 'success');
                            const testerTabBtn = document.getElementById('nav-tab-tester') || document.querySelector('.nav-tab[data-tab="tester"]');
                            if (testerTabBtn) testerTabBtn.click();
                        }, 800);
                    } else {
                        dom.testerGateFeedback.className = 'auth-alert-box auth-alert-error';
                        dom.testerGateFeedback.style.display = 'flex';
                        dom.testerGateFeedback.textContent = result.message;
                    }
                } finally {
                    if (submitBtn) {
                        submitBtn.disabled = false;
                        submitBtn.textContent = origBtnText;
                    }
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
        CfwConfigurator.init();
        
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
