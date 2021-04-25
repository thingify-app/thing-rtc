import * as express from 'express';
import { PairingServer } from './pairing-server';
import { InMemoryStorage } from './storage';

export class Server {
    constructor(privateKey: string | Buffer, port: number) {
        const parsedPort = port || parseInt(process.env.PORT || '8080');
        const storage = new InMemoryStorage();
        const server = new PairingServer(storage, privateKey);
        const app = express();

        app.use(express.json());
    
        app.get('/', (req, res) => {
            res.send('ThingRTC Pairing Server');
        });

        app.post('/createPairing', (req, res) => {
            const response = server.createPairingRequest(req.body.publicKey);
            res.json(response);
        });

        app.post('/respondToPairing/:shortcode', (req, res) => {
            const response = server.respondToPairingRequest(req.params.shortcode, req.body.publicKey);
            res.json(response);
        });

        app.get('/pairingStatus/:pairingId', (req, res) => {
            const response = server.checkPairingStatus(req.params.pairingId);
            res.json(response);
        });
        
        app.listen(parsedPort, '0.0.0.0', () => console.log(`Listening on ${parsedPort}`));    
    }
}
