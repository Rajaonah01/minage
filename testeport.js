const POOLS_VPS = [
    { name: 'GGM', host: 'ggm.pool-pay.com', port: 3333 },
    { name: 'P2Pool', host: 'p2pool.observer', port: 3333 },
    { name: 'Miner.rocks', host: 'xmr.miner.rocks', port: 3333 },
    { name: 'Cryptonote.social', host: 'cryptonote.social', port: 3333 },
    { name: 'HeroMiners', host: 'xmr.herominers.com', port: 1111 }
];

// Testez-les tous avec ce script
for (const pool of POOLS_VPS) {
    const socket = net.createConnection(pool.port, pool.host);
    socket.on('connect', () => {
        console.log(`✅ ${pool.name} ACCEPTE LES VPS !`);
        socket.destroy();
    });
    socket.on('error', () => console.log(`❌ ${pool.name} REFUSE`));
}