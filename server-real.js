require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');
const cron = require('node-cron');
const RealMoneroMiner = require('./miner-pool');
const BinanceExchange = require('./exchange-api');

const app = express();
const PORT = process.env.PORT || 3000;

// MIDDLEWARE
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// FICHIERS DE DONNÉES
const DATA_FILE = path.join(__dirname, 'data', 'users.json');
const PAYMENTS_FILE = path.join(__dirname, 'data', 'payments.json');

fs.ensureFileSync(DATA_FILE);
fs.ensureFileSync(PAYMENTS_FILE);

// ========== CONFIGURATION RÉELLE ==========
const CONFIG = {
    // VOS IDENTIFIANTS BINANCE (À METTRE DANS .env)
    BINANCE_API_KEY: process.env.BINANCE_API_KEY,
    BINANCE_API_SECRET: process.env.BINANCE_API_SECRET,
    
    // VOTRE WALLET MONERO (XMR)
    XMR_WALLET: process.env.XMR_WALLET || '48pYy4jJXKP3J3PqjH3Th7WjNxjJ7qRp7K7qZqK7qZqK7qZqK7qZqK',
    
    // PARTAGE DES REVENUS
    PROFIT_SHARING: {
        USER_COMMISSION: 0.3, // 30% pour l'utilisateur
        YOUR_COMMISSION: 0.7,  // 70% pour vous (frais, profit)
        MIN_PAYOUT: 10,        // 10 USDT minimum
        PAYOUT_FEE: 1          // 1 USDT de frais réseau
    },
    
    // ESTIMATION GAINS (réaliste)
    ESTIMATED_EARNINGS: {
        PER_HASH: 0.0000000001, // XMR par hash
        HASH_PER_CORE: 10,      // 10 hashes/sec par cœur
        XMR_TO_USDT: 150       // 1 XMR = 150 USDT
    }
};

// ========== INITIALISATION EXCHANGE ==========
const exchange = new BinanceExchange(
    CONFIG.BINANCE_API_KEY,
    CONFIG.BINANCE_API_SECRET
);

// ========== GESTIONNAIRE DE MINING ==========
const miners = new Map();

// DÉMARRER LE MINING POUR UN UTILISATEUR
app.post('/api/mining/start', async (req, res) => {
    try {
        const { userId, deviceInfo } = req.body;
        
        // CRÉER UN VRAI MINEUR MONERO
        const miner = new RealMoneroMiner(userId, deviceInfo);
        miner.start();
        
        // SAUVEGARDER LE MINEUR
        miners.set(userId, {
            miner,
            startTime: Date.now(),
            deviceInfo
        });
        
        // CHARGER DONNÉES UTILISATEUR
        const data = await fs.readJson(DATA_FILE);
        if (!data[userId]) {
            data[userId] = {
                userId,
                xmrMined: 0,
                usdtEarned: 0,
                usdtPaid: 0,
                miningTime: 0,
                createdAt: Date.now()
            };
            await fs.writeJson(DATA_FILE, data);
        }
        
        res.json({
            success: true,
            message: '✅ Mining démarré - Vrai Monero (XMR)',
            estimatedEarnings: {
                perHour: (deviceInfo.cores * 10 * 3600 * CONFIG.ESTIMATED_EARNINGS.PER_HASH * CONFIG.ESTIMATED_EARNINGS.XMR_TO_USDT * CONFIG.PROFIT_SHARING.USER_COMMISSION).toFixed(4),
                perDay: (deviceInfo.cores * 10 * 86400 * CONFIG.ESTIMATED_EARNINGS.PER_HASH * CONFIG.ESTIMATED_EARNINGS.XMR_TO_USDT * CONFIG.PROFIT_SHARING.USER_COMMISSION).toFixed(4)
            }
        });
        
    } catch (error) {
        console.error('Erreur démarrage mining:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ARRÊTER LE MINING
app.post('/api/mining/stop', async (req, res) => {
    try {
        const { userId } = req.body;
        
        if (miners.has(userId)) {
            const { miner } = miners.get(userId);
            miner.stop();
            miners.delete(userId);
        }
        
        res.json({ success: true, message: 'Mining arrêté' });
        
    } catch (error) {
        console.error('Erreur arrêt mining:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ========== SYSTÈME DE PAIEMENT AUTOMATIQUE ==========

// VÉRIFIER TOUTES LES 30 MINUTES ET PAYER
cron.schedule('*/30 * * * *', async () => {
    console.log('🔄 Vérification des paiements...');
    await processPayments();
});

async function processPayments() {
    try {
        const data = await fs.readJson(DATA_FILE);
        const payments = await fs.readJson(PAYMENTS_FILE);
        
        // VÉRIFIER SOLDE XMR SUR BINANCE
        const xmrBalance = await exchange.checkXMRBalance();
        console.log(`💰 Solde XMR: ${xmrBalance}`);
        
        if (xmrBalance < 0.1) {
            console.log('⚠️ Pas assez de XMR, attente...');
            return;
        }
        
        // VENDRE XMR POUR USDT
        const xmrToSell = Math.min(xmrBalance, 0.5); // Vendre max 0.5 XMR
        await exchange.sellXMRForUSDT(xmrToSell);
        
        // OBTENIR PRIX ACTUEL
        const xmrPrice = await exchange.getXMRPrice();
        
        // PAYER LES UTILISATEURS
        for (const [userId, userData] of Object.entries(data)) {
            // CALCULER CE QU'IL A GAGNÉ
            const earnedUSDT = userData.xmrMined * xmrPrice * CONFIG.PROFIT_SHARING.USER_COMMISSION;
            const unpaidUSDT = earnedUSDT - userData.usdtPaid;
            
            // PAYER SI MINIMUM ATTEINT
            if (unpaidUSDT >= CONFIG.PROFIT_SHARING.MIN_PAYOUT) {
                
                // RETIRER FRAIS RÉSEAU
                const payoutAmount = unpaidUSDT - CONFIG.PROFIT_SHARING.PAYOUT_FEE;
                
                if (userData.withdrawAddress && payoutAmount > 0) {
                    
                    // ENVOYER VRAI USDT VERS TRUST WALLET
                    const tx = await exchange.sendUSDT(
                        userData.withdrawAddress,
                        payoutAmount.toFixed(2)
                    );
                    
                    // ENREGISTRER PAIEMENT
                    const payment = {
                        id: `PAY_${Date.now()}_${userId}`,
                        userId,
                        amount: payoutAmount,
                        usdtAmount: payoutAmount,
                        xmrPrice: xmrPrice,
                        address: userData.withdrawAddress,
                        txHash: tx.id || tx.hash,
                        status: 'completed',
                        timestamp: Date.now()
                    };
                    
                    payments.push(payment);
                    
                    // METTRE À JOUR UTILISATEUR
                    userData.usdtPaid += payoutAmount + CONFIG.PROFIT_SHARING.PAYOUT_FEE;
                    userData.lastPayout = Date.now();
                    
                    console.log(`✅ PAIEMENT: ${payoutAmount.toFixed(2)} USDT à ${userId}`);
                }
            }
        }
        
        // SAUVEGARDER
        await fs.writeJson(DATA_FILE, data);
        await fs.writeJson(PAYMENTS_FILE, payments);
        
    } catch (error) {
        console.error('Erreur traitement paiements:', error);
    }
}

// ========== API UTILISATEUR ==========

// ENREGISTRER ADRESSE TRUST WALLET
app.post('/api/user/:userId/address', async (req, res) => {
    try {
        const { userId } = req.params;
        const { address } = req.body;
        
        // VALIDER ADRESSE BEP-20
        if (!address || !address.startsWith('0x') || address.length !== 42) {
            return res.status(400).json({ 
                error: '❌ Adresse Trust Wallet invalide (doit commencer par 0x et faire 42 caractères)' 
            });
        }
        
        const data = await fs.readJson(DATA_FILE);
        
        if (!data[userId]) {
            data[userId] = { userId, withdrawAddress: address };
        } else {
            data[userId].withdrawAddress = address;
        }
        
        await fs.writeJson(DATA_FILE, data);
        
        res.json({
            success: true,
            message: '✅ Adresse Trust Wallet enregistrée',
            address
        });
        
    } catch (error) {
        console.error('Erreur enregistrement adresse:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// RÉCUPÉRER STATISTIQUES UTILISATEUR
app.get('/api/user/:userId/stats', async (req, res) => {
    try {
        const { userId } = req.params;
        const data = await fs.readJson(DATA_FILE);
        const userData = data[userId] || { 
            xmrMined: 0, 
            usdtEarned: 0, 
            usdtPaid: 0 
        };
        
        // PRIX ACTUEL XMR
        const xmrPrice = await exchange.getXMRPrice();
        
        // ESTIMATION GAINS
        const pendingUSDT = (userData.xmrMined * xmrPrice * CONFIG.PROFIT_SHARING.USER_COMMISSION) - userData.usdtPaid;
        
        res.json({
            xmrMined: userData.xmrMined.toFixed(6),
            usdtEarned: (userData.xmrMined * xmrPrice * CONFIG.PROFIT_SHARING.USER_COMMISSION).toFixed(2),
            usdtPaid: userData.usdtPaid.toFixed(2),
            usdtPending: Math.max(0, pendingUSDT).toFixed(2),
            xmrPrice: xmrPrice.toFixed(2),
            withdrawAddress: userData.withdrawAddress || null,
            minPayout: CONFIG.PROFIT_SHARING.MIN_PAYOUT,
            payoutFee: CONFIG.PROFIT_SHARING.PAYOUT_FEE
        });
        
    } catch (error) {
        console.error('Erreur stats:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// DÉMARRAGE SERVEUR
app.listen(PORT, () => {
    console.log('\n========== 🚀 VRAI MINING SERVER ==========');
    console.log(`📡 http://localhost:${PORT}`);
    console.log(`💰 Mining: Vrai Monero (XMR)`);
    console.log(`💳 Paiements: Vrais USDT (BEP-20)`);
    console.log(`📊 Partage: 30% utilisateur | 70% vous`);
    console.log(`💵 Paiement minimum: ${CONFIG.PROFIT_SHARING.MIN_PAYOUT} USDT`);
    console.log('===========================================\n');
});