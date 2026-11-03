import { createAoriServer } from './server.mjs';
const port = Number(process.env.PORT || 4173);
const server = createAoriServer({ databasePath:process.env.AORI_DATABASE_PATH });
server.on('error', error => { console.error(`Não foi possível iniciar a Aori: ${error.message}`); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`Aori · Contas e favoritos\nLocal: http://localhost:${port}\nCtrl+C para encerrar.`));
