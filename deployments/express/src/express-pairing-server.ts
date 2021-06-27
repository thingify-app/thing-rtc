import * as express from 'express';
import * as cors from 'cors';
import { createPrivateKey } from 'crypto';
import { PairingServer, InMemoryStorage } from 'thingrtc-pairing-server';

export class ExpressPairingServer {
    constructor(privateKey: Buffer, port: number) {
        const parsedPort = port || parseInt(process.env.PORT || '8080');
        const storage = new InMemoryStorage();
        const server = new PairingServer(storage, createPrivateKey(privateKey));
        const app = express();

        app.use(express.json());
        app.use(cors());
    
        app.get('/', (req, res) => {
            res.send('ThingRTC Pairing Server');
        });

        app.post('/createPairing', async (req, res) => {
            const response = await server.createPairingRequest(req.body.publicKey);
            res.json(response);
        });

        app.post('/respondToPairing/:shortcode', async (req, res) => {
            const response = await server.respondToPairingRequest(req.params.shortcode, req.body.publicKey);
            res.json(response);
        });

        app.get('/pairingStatus/:pairingId', async (req, res) => {
            const response = await server.checkPairingStatus(req.params.pairingId);
            res.json(response);
        });
        
        app.listen(parsedPort, '0.0.0.0', () => console.log(`Listening on ${parsedPort}`));    
    }
}
