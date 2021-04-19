import * as express from 'express';

export class AuthServer {
    constructor(port: number = 8080) {
        const parsedPort = port || parseInt(process.env.PORT || '8080');
        const app = express();
    
        app.get('/', (req, res) => {
            res.send('Hello world!');
        });
        
        app.listen(parsedPort, '0.0.0.0', () => console.log(`Listening on ${parsedPort}`));    
    }
}
