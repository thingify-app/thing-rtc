import { delay } from '@std/async/delay';
import { Claimer, Entry } from './signalling-server.ts';

export class KvClaimer implements Claimer {

  static async create(inMemory: boolean = false): Promise<Claimer> {
    if (inMemory) {
      return new KvClaimer(await Deno.openKv(':memory:'));
    } else {
      return new KvClaimer(await Deno.openKv());
    }
  }

  private constructor(private kv: Deno.Kv) {}

  // Only initiators create DB entries:
  async createEntry(pairingId: string, channelId: string, nonce: string, expiryMillis: number): Promise<void> {
    await this.kv.set(['peer', pairingId, channelId], nonce, { expireIn: expiryMillis });
  }

  // Responders then try to find an entry of the pairingId they correspond to, and
  // atomically claim it.
  // If an entry doesn't exist, or the claim fails, they wait and then try again.
  // This way, if many responders are waiting, they will eventually claim an initiator.
  // Likewise, if there are many initiators, they will eventually be claimed by responders.
  async attemptClaim(pairingId: string, timeoutMillis: number): Promise<Entry|null> {
    const start = Date.now();
    while ((Date.now() - start) < timeoutMillis) {
      const iter = this.kv.list({prefix: ['peer', pairingId]}, {limit: 1});
      const entry = await iter.next();
      if (!entry.value) {
        await delay(1000);
        continue;
      }

      const res = await this.kv.atomic()
        .check(entry.value)
        .delete(entry.value.key)
        .commit();
      
      if (res.ok) {
        const channelId = entry.value.key[2] as string;
        const nonce = entry.value.value as string;
        console.log(`Claimed entry with channelId ${channelId}`);
        return {channelId, nonce};
      } else {
        console.log('Failed to claim');
      }
    }
    return null;
  }

  async clearEntry(pairingId: string, channelId: string): Promise<void> {
    await this.kv.delete(['peer', pairingId, channelId]);
  }
}
