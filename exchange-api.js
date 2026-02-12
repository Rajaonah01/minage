// UTILISEZ UN VRAI EXCHANGE : Binance, KuCoin, Kraken, etc.
const axios = require('axios');
const crypto = require('crypto');

class BinanceExchange {
    constructor(apiKey, apiSecret) {
        this.apiKey = apiKey;
        this.apiSecret = apiSecret;
        this.baseURL = 'https://api.binance.com';
    }

    // 1. VÉRIFIER LE SOLDE XMR
    async checkXMRBalance() {
        try {
            const timestamp = Date.now();
            const queryString = `timestamp=${timestamp}`;
            const signature = crypto
                .createHmac('sha256', this.apiSecret)
                .update(queryString)
                .digest('hex');

            const response = await axios.get(
                `${this.baseURL}/api/v3/account?${queryString}&signature=${signature}`,
                {
                    headers: {
                        'X-MBX-APIKEY': this.apiKey
                    }
                }
            );

            const xmrBalance = response.data.balances.find(b => b.asset === 'XMR');
            return parseFloat(xmrBalance.free);
            
        } catch (error) {
            console.error('Erreur vérification solde XMR:', error);
            return 0;
        }
    }

    // 2. VENDRE XMR POUR USDT
    async sellXMRForUSDT(amount) {
        try {
            // Créer un ordre de vente sur Binance
            const order = {
                symbol: 'XMRUSDT',
                side: 'SELL',
                type: 'MARKET',
                quantity: amount.toFixed(4)
            };

            const timestamp = Date.now();
            const queryString = `symbol=${order.symbol}&side=${order.side}&type=${order.type}&quantity=${order.quantity}&timestamp=${timestamp}`;
            const signature = crypto
                .createHmac('sha256', this.apiSecret)
                .update(queryString)
                .digest('hex');

            const response = await axios.post(
                `${this.baseURL}/api/v3/order?${queryString}&signature=${signature}`,
                {},
                {
                    headers: {
                        'X-MBX-APIKEY': this.apiKey
                    }
                }
            );

            console.log(`✅ VENDU ${amount} XMR → USDT`);
            return response.data;
            
        } catch (error) {
            console.error('Erreur vente XMR:', error);
            throw error;
        }
    }

    // 3. ENVOYER USDT VERS TRUST WALLET
    async sendUSDT(toAddress, amount) {
        try {
            // WITHDRAWAL SUR BINANCE
            const withdrawal = {
                coin: 'USDT',
                network: 'BEP20',
                address: toAddress,
                amount: amount.toFixed(2),
                timestamp: Date.now()
            };

            const queryString = `coin=${withdrawal.coin}&network=${withdrawal.network}&address=${withdrawal.address}&amount=${withdrawal.amount}&timestamp=${withdrawal.timestamp}`;
            const signature = crypto
                .createHmac('sha256', this.apiSecret)
                .update(queryString)
                .digest('hex');

            const response = await axios.post(
                `${this.baseURL}/sapi/v1/capital/withdraw/apply?${queryString}&signature=${signature}`,
                {},
                {
                    headers: {
                        'X-MBX-APIKEY': this.apiKey
                    }
                }
            );

            console.log(`💰 ENVOYÉ ${amount} USDT vers ${toAddress}`);
            return response.data;
            
        } catch (error) {
            console.error('Erreur envoi USDT:', error);
            throw error;
        }
    }

    // 4. PRIX ACTUEL XMR/USDT
    async getXMRPrice() {
        try {
            const response = await axios.get(
                `${this.baseURL}/api/v3/ticker/price?symbol=XMRUSDT`
            );
            return parseFloat(response.data.price);
        } catch (error) {
            console.error('Erreur prix XMR:', error);
            return 150; // Prix par défaut
        }
    }
}

module.exports = BinanceExchange;