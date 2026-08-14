import { ParseThroughAuthValidator } from "./auth-validator.ts";
import { BroadcastChannelConnectionChannelFactory } from "./connection-channel.ts";
import { KvClaimer } from "./kv.ts";
import { serve } from "./serve.ts";
import { SignallingServer } from "./signalling-server.ts";

const authValidator = new ParseThroughAuthValidator();
const claimer = await KvClaimer.create();
const connectionChannelFactory = new BroadcastChannelConnectionChannelFactory();
const signallingServer = new SignallingServer(authValidator, claimer, connectionChannelFactory);

await serve(signallingServer);
