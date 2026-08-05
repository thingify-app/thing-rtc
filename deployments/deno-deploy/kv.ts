import { delay } from '@std/async/delay';

const kv = await Deno.openKv();

// Only initiators create DB entries:
export async function createEntry(pairingId: string, channelId: string, nonce: string, expiryMillis: number): Promise<void> {
  await kv.set(['peer', pairingId, channelId], nonce, { expireIn: expiryMillis });
}

// Responders then try to find an entry of the pairingId they correspond to, and
// atomically claim it.
// If an entry doesn't exist, or the claim fails, they wait and then try again.
// This way, if many responders are waiting, they will eventually claim an initiator.
// Likewise, if there are many initiators, they will eventually be claimed by responders.
export async function attemptClaim(pairingId: string, timeoutMillis: number): Promise<Entry|null> {
  const start = Date.now();
  while ((Date.now() - start) < timeoutMillis) {
    const iter = kv.list({prefix: ['peer', pairingId]}, {limit: 1});
    const entry = await iter.next();
    if (!entry.value) {
      await delay(1000);
      continue;
    }

    const res = await kv.atomic()
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

export async function clearEntry(pairingId: string, channelId: string): Promise<void> {
  await kv.delete(['peer', pairingId, channelId]);
}

export interface Entry {
  channelId: string;
  nonce: string;
}
