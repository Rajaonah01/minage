require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');
const net = require('net');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ========== GESTION FICHIERS POUR RENDER ==========
const DATA_FILE = path.join('/tmp', 'users.json');

try {
    fs.ensureDirSync('/tmp');
    if (!fs.existsSync(DATA_FILE)) {
        fs.writeFileSync(DATA_FILE, '{}');
        console.log('✅ Fichier users.json créé dans /tmp');
    }
} catch (error) {
    console.error('❌ Erreur dossier:', error);
}

function readUsers() {
    try {
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (error) {
        fs.writeFileSync(DATA_FILE, '{}');
        return {};
    }
}

function writeUsers(data) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error('❌ Erreur écriture:', error.message);
        return false;
    }
}

// ========== CONFIGURATION HASHVAULT MEGA BOOST ==========
const CONFIG = {
    XMR_WALLET: process.env.XMR_WALLET || '4285FGc1m5ZdUSi1Dqpdmp2MJZBL3LfiDR88hLLmzH7vDaooQtZ3WM18fd5jDvDeAf7gT6oBPMAB3EVYNG3ZhJX7C3Jea5J',
    
    // ✅ HASHVAULT
    POOL_HOST: 'pool.hashvault.pro',
    POOL_PORT: 3333,
    
    // ✅ EMAIL OBLIGATOIRE
    PASSWORD: process.env.HASHVAULT_EMAIL || 'anjararajaonah01@email.com',
    
    // ✅ WORKER UNIQUE
    WORKER: 'mega_boost_' + Math.random().toString(36).substr(2, 6),
    
    // 🚀 MEGA BOOST - 100x PLUS DE COINS !
    VIRTUAL_COINS: {
        PER_HASH: 0.001,        // Base: 0.001 coin par hash (sera multiplié par 100)
        BOOST_MULTIPLIER: 100,  // 🚀 x100 de BOOST !
        MIN_WITHDRAW: 10000,    // 10000 coins minimum (10 USDT virtuel)
        EXCHANGE_RATE: 0.001,   // 1000 coins = 1 USDT virtuel
        TARGET_COINS: 10000     // Objectif: 10000 coins
    }
};

console.log('\n' + '='.repeat(70));
console.log('🚀🚀🚀 MEGA BOOST ACTIVÉ - x100 COINS ! 🚀🚀🚀');
console.log('='.repeat(70));
console.log(`🌐 Pool: ${CONFIG.POOL_HOST}:${CONFIG.POOL_PORT}`);
console.log(`💰 Wallet: ${CONFIG.XMR_WALLET.slice(0,8)}...${CONFIG.XMR_WALLET.slice(-8)}`);
console.log(`📧 Email: ${CONFIG.PASSWORD}`);
console.log(`⚙️ Worker: ${CONFIG.WORKER}`);
console.log(`💎 Coins: ${CONFIG.VIRTUAL_COINS.PER_HASH * CONFIG.VIRTUAL_COINS.BOOST_MULTIPLIER} coin/hash (${CONFIG.VIRTUAL_COINS.BOOST_MULTIPLIER}x BOOST)`);
console.log(`🎯 Objectif: ${CONFIG.VIRTUAL_COINS.TARGET_COINS} coins = ${CONFIG.VIRTUAL_COINS.TARGET_COINS * CONFIG.VIRTUAL_COINS.EXCHANGE_RATE} USDT`);
console.log('='.repeat(70) + '\n');

// ========== MINER HASHVAULT ==========
class XMRTCPMiner {
    constructor() {
        this.socket = null;
        this.totalHashes = 0;
        this.xmrEarned = 0;
        this.activeMiners = new Set();
        this.jobId = null;
        this.reconnectAttempts = 0;
        this.isConnecting = false;
        this.buffer = '';
        this.keepAliveInterval = null;
        this.lastJobTime = Date.now();
        this.loginSent = false;
    }

    connect() {
        if (this.isConnecting) return;
        this.isConnecting = true;
        
        console.log(`🔄 Connexion à HashVault (${CONFIG.POOL_HOST}:${CONFIG.POOL_PORT})...`);
        
        try {
            this.socket = net.createConnection(CONFIG.POOL_PORT, CONFIG.POOL_HOST);
            
            this.socket.setKeepAlive(true, 30000);
            this.socket.setNoDelay(true);
            this.socket.setTimeout(45000);

            this.socket.on('connect', () => {
                console.log('✅✅✅ CONNECTÉ À HASHVAULT !');
                console.log(`💰 Wallet: ${CONFIG.XMR_WALLET.slice(0,8)}...${CONFIG.XMR_WALLET.slice(-8)}`);
                
                this.isConnecting = false;
                this.reconnectAttempts = 0;
                this.loginSent = false;
                
                setTimeout(() => {
                    this.sendLogin();
                }, 1000);
                
                this.keepAliveInterval = setInterval(() => {
                    if (this.socket && !this.socket.destroyed) {
                        this.send({ id: Date.now(), method: 'keepalived' });
                    }
                }, 25000);
            });

            this.socket.on('data', (data) => {
                this.buffer += data.toString();
                const lines = this.buffer.split('\n');
                this.buffer = lines.pop() || '';
                
                for (const line of lines) {
                    if (line.trim()) {
                        try {
                            const msg = JSON.parse(line);
                            this.handleMessage(msg);
                        } catch (e) {}
                    }
                }
            });

            this.socket.on('timeout', () => {
                console.log('⏰ Timeout, reconnexion...');
                this.socket.destroy();
            });

            this.socket.on('error', (err) => {
                if (err.message.includes('ECONNRESET')) {
                    console.log('⚠️ Connexion reset, reconnexion...');
                } else {
                    console.error('❌ Erreur TCP:', err.message);
                }
                this.isConnecting = false;
                this.cleanup();
                this.reconnect();
            });

            this.socket.on('close', () => {
                console.log('🔌 Déconnecté de HashVault');
                this.isConnecting = false;
                this.cleanup();
                this.reconnect();
            });

        } catch (error) {
            console.error('❌ Exception:', error.message);
            this.isConnecting = false;
            this.reconnect();
        }
    }

    sendLogin() {
        if (this.loginSent) return;
        this.loginSent = true;
        
        const loginMsg = {
            id: 1,
            method: 'login',
            params: {
                login: CONFIG.XMR_WALLET,
                pass: CONFIG.PASSWORD,
                agent: 'MegaBoost-Miner/1.0',
                algo: 'randomx',
                worker_id: CONFIG.WORKER
            }
        };
        
        console.log('📤 Envoi login à HashVault...');
        this.send(loginMsg);
    }

    cleanup() {
        if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
            this.keepAliveInterval = null;
        }
    }

    send(msg) {
        if (this.socket && !this.socket.destroyed) {
            this.socket.write(JSON.stringify(msg) + '\n');
        }
    }

    handleMessage(msg) {
        if (msg.method === 'job') {
            this.jobId = msg.params.job_id;
            this.lastJobTime = Date.now();
            console.log(`⛏️🔥 JOB REÇU ! ID: ${this.jobId.substring(0,8)}...`);
        }
        
        if (msg.result && msg.result.status === 'OK') {
            this.totalHashes++;
            this.xmrEarned += 0.0000000001;
            
            if (this.totalHashes % 50 === 0) {
                const usdtValue = (this.xmrEarned * 150).toFixed(4);
                console.log(`📊 Hash accepté! Total: ${this.totalHashes} | ${this.xmrEarned.toFixed(8)} XMR | ${usdtValue} USDT`);
            }
        }
        
        if (msg.id === 1 && msg.result) {
            console.log('✅✅✅ LOGIN RÉUSSI SUR HASHVAULT !');
            console.log('⛏️ Prêt à miner !');
            
            if (msg.result.job) {
                this.jobId = msg.result.job.job_id;
            }
        }
        
        if (msg.error && msg.error.code !== -1) {
            console.log('⚠️ Erreur:', msg.error);
        }
    }

    reconnect() {
        if (this.socket && !this.socket.destroyed) return;
        
        this.reconnectAttempts++;
        const delay = 5000;
        console.log(`🔄 Reconnexion dans ${delay/1000}s... (tentative ${this.reconnectAttempts})`);
        
        setTimeout(() => {
            if (!this.isConnecting) {
                this.connect();
            }
        }, delay);
    }

    // 🚀 MEGA BOOST - x100 COINS !
    async creditUser(userId, amount) {
        try {
            const data = readUsers();
            
            if (!data[userId]) {
                data[userId] = {
                    virtualBalance: 0,
                    totalMined: 0,
                    createdAt: Date.now(),
                    lastMine: Date.now()
                };
            }
            
            // 🚀 APPLICATION DU BOOST x100 !
            const boostedAmount = amount * CONFIG.VIRTUAL_COINS.BOOST_MULTIPLIER;
            
            data[userId].virtualBalance += boostedAmount;
            data[userId].totalMined += boostedAmount;
            data[userId].lastMine = Date.now();
            
            writeUsers(data);
            
            // Log toutes les 1000 coins
            if (Math.floor(data[userId].virtualBalance / 1000) > Math.floor((data[userId].virtualBalance - boostedAmount) / 1000)) {
                console.log(`💰 Utilisateur ${userId.slice(0,8)}: ${Math.floor(data[userId].virtualBalance)} coins (${(data[userId].virtualBalance * CONFIG.VIRTUAL_COINS.EXCHANGE_RATE).toFixed(2)} USDT virtuel)`);
            }
            
        } catch (error) {
            console.error('❌ Erreur crédit:', error.message);
        }
    }

    async submitHash(userId, nonce, hash) {
        if (this.socket && !this.socket.destroyed && this.jobId) {
            const submitMsg = {
                id: Date.now(),
                method: 'submit',
                params: {
                    id: this.jobId,
                    job_id: this.jobId,
                    nonce: nonce.toString(16).padStart(8, '0'),
                    result: hash
                }
            };
            
            this.send(submitMsg);
            await this.creditUser(userId, CONFIG.VIRTUAL_COINS.PER_HASH);
            this.activeMiners.add(userId);
            
            return true;
        }
        return false;
    }

    getStatus() {
        return {
            connected: this.socket && !this.socket.destroyed,
            totalHashes: this.totalHashes,
            xmrEarned: this.xmrEarned,
            jobId: this.jobId,
            activeMiners: this.activeMiners.size,
            lastJob: Date.now() - this.lastJobTime < 60000
        };
    }
}

// ========== INITIALISATION ==========
const xmrMiner = new XMRTCPMiner();
setTimeout(() => xmrMiner.connect(), 2000);

// ========== API AVEC MEGA BOOST ==========

// 1. Démarrer le mining
app.post('/api/mining/start', async (req, res) => {
    const { userId } = req.body;
    const data = readUsers();
    
    if (!data[userId]) {
        data[userId] = { 
            virtualBalance: 0, 
            totalMined: 0, 
            createdAt: Date.now(),
            boostMultiplier: CONFIG.VIRTUAL_COINS.BOOST_MULTIPLIER
        };
        writeUsers(data);
    }
    
    xmrMiner.activeMiners.add(userId);
    
    res.json({
        success: true,
        message: '🚀 MEGA BOOST ACTIVÉ - x100 COINS !',
        boost: {
            multiplier: CONFIG.VIRTUAL_COINS.BOOST_MULTIPLIER,
            perHash: CONFIG.VIRTUAL_COINS.PER_HASH * CONFIG.VIRTUAL_COINS.BOOST_MULTIPLIER,
            targetCoins: CONFIG.VIRTUAL_COINS.TARGET_COINS,
            targetUSDT: CONFIG.VIRTUAL_COINS.TARGET_COINS * CONFIG.VIRTUAL_COINS.EXCHANGE_RATE
        },
        job: { job_id: xmrMiner.jobId || 'waiting' },
        stats: {
            totalHashes: xmrMiner.totalHashes,
            xmrEarned: xmrMiner.xmrEarned.toFixed(8)
        }
    });
});

// 2. Soumettre un hash
app.post('/api/mining/submit', async (req, res) => {
    const { userId, nonce, hash } = req.body;
    const submitted = await xmrMiner.submitHash(userId, nonce, hash);
    res.json({ 
        success: submitted, 
        accepted: submitted,
        boost: submitted ? CONFIG.VIRTUAL_COINS.BOOST_MULTIPLIER : 1
    });
});

// 3. Récupérer le solde (avec conversion USDT)
app.get('/api/user/:userId/balance', (req, res) => {
    const { userId } = req.params;
    const data = readUsers();
    const user = data[userId] || { virtualBalance: 0, totalMined: 0 };
    
    const coins = Math.floor(user.virtualBalance);
    const usdtValue = (coins * CONFIG.VIRTUAL_COINS.EXCHANGE_RATE).toFixed(2);
    
    res.json({
        virtualCoins: coins.toLocaleString(),
        usdtValue: usdtValue,
        totalMined: Math.floor(user.totalMined || 0).toLocaleString(),
        minWithdraw: CONFIG.VIRTUAL_COINS.MIN_WITHDRAW.toLocaleString(),
        canWithdraw: coins >= CONFIG.VIRTUAL_COINS.MIN_WITHDRAW,
        targetCoins: CONFIG.VIRTUAL_COINS.TARGET_COINS,
        progress: Math.min(100, Math.floor((coins / CONFIG.VIRTUAL_COINS.TARGET_COINS) * 100))
    });
});

// 4. Retirer des coins (10000 minimum)
app.post('/api/user/:userId/withdraw', (req, res) => {
    const { userId } = req.params;
    const data = readUsers();
    
    if (data[userId] && data[userId].virtualBalance >= CONFIG.VIRTUAL_COINS.MIN_WITHDRAW) {
        const withdrawAmount = CONFIG.VIRTUAL_COINS.MIN_WITHDRAW;
        const usdtValue = withdrawAmount * CONFIG.VIRTUAL_COINS.EXCHANGE_RATE;
        
        data[userId].virtualBalance -= withdrawAmount;
        writeUsers(data);
        
        res.json({ 
            success: true, 
            message: `💰 Retrait de ${withdrawAmount.toLocaleString()} coins effectué ! (${usdtValue.toFixed(2)} USDT virtuel)`,
            amount: withdrawAmount,
            usdtValue: usdtValue.toFixed(2)
        });
    } else {
        res.json({ 
            success: false, 
            message: `❌ Solde insuffisant. Minimum ${CONFIG.VIRTUAL_COINS.MIN_WITHDRAW.toLocaleString()} coins requis.` 
        });
    }
});

// 5. Statistiques admin avec MEGA BOOST
app.get('/api/admin/stats', (req, res) => {
    const data = readUsers();
    const status = xmrMiner.getStatus();
    
    // Calcul des coins totaux générés
    let totalCoinsGenerated = 0;
    Object.values(data).forEach(user => {
        totalCoinsGenerated += user.totalMined || 0;
    });
    
    res.json({
        pool: 'HashVault',
        connected: status.connected,
        totalHashes: status.totalHashes.toLocaleString(),
        xmrEarned: status.xmrEarned.toFixed(8),
        usdtEarned: (status.xmrEarned * 150).toFixed(4),
        
        // 🚀 MEGA BOOST STATS
        boostMultiplier: CONFIG.VIRTUAL_COINS.BOOST_MULTIPLIER,
        totalCoinsGenerated: Math.floor(totalCoinsGenerated).toLocaleString(),
        totalVirtualUSDT: (totalCoinsGenerated * CONFIG.VIRTUAL_COINS.EXCHANGE_RATE).toFixed(2),
        
        // Statistiques utilisateurs
        totalUsers: Object.keys(data).length,
        activeMiners: status.activeMiners,
        jobActive: status.lastJob
    });
});

// 6. Configuration du boost (pour l'interface)
app.get('/api/config/boost', (req, res) => {
    res.json({
        multiplier: CONFIG.VIRTUAL_COINS.BOOST_MULTIPLIER,
        perHash: CONFIG.VIRTUAL_COINS.PER_HASH * CONFIG.VIRTUAL_COINS.BOOST_MULTIPLIER,
        targetCoins: CONFIG.VIRTUAL_COINS.TARGET_COINS,
        minWithdraw: CONFIG.VIRTUAL_COINS.MIN_WITHDRAW,
        exchangeRate: CONFIG.VIRTUAL_COINS.EXCHANGE_RATE
    });
});

// ========== SERVEUR ==========
app.listen(PORT, '0.0.0.0', () => {
    console.log('\n' + '='.repeat(70));
    console.log('🚀🚀🚀 SERVEUR MEGA BOOST - PRÊT ! 🚀🚀🚀');
    console.log('='.repeat(70));
    console.log(`📡 URL: http://localhost:${PORT}`);
    console.log(`🌐 Pool: ${CONFIG.POOL_HOST}:${CONFIG.POOL_PORT}`);
    console.log(`💰 Wallet: ${CONFIG.XMR_WALLET.slice(0,8)}...${CONFIG.XMR_WALLET.slice(-8)}`);
    console.log(`📧 Email: ${CONFIG.PASSWORD}`);
    console.log(`🎮 MEGA BOOST: ${CONFIG.VIRTUAL_COINS.BOOST_MULTIPLIER}x COINS !`);
    console.log(`💎 Gains: ${CONFIG.VIRTUAL_COINS.PER_HASH * CONFIG.VIRTUAL_COINS.BOOST_MULTIPLIER} coins/hash`);
    console.log(`🎯 Objectif: ${CONFIG.VIRTUAL_COINS.TARGET_COINS} coins = ${CONFIG.VIRTUAL_COINS.TARGET_COINS * CONFIG.VIRTUAL_COINS.EXCHANGE_RATE} USDT virtuel`);
    console.log('='.repeat(70) + '\n');
});