import { practiceApi } from './practice-api.js';
import { encodeBase58, getInjectedWallet } from './wallet.js';

export async function signInPractice(expectedWallet?: string) {
  const wallet = getInjectedWallet();
  if (!wallet)
    throw Error(
      'Open Paperfund in your Solana wallet browser, or connect a compatible browser wallet. No Paperfund extension is needed.',
    );
  const address = (await wallet.connect()).publicKey.toString();
  if (expectedWallet && address !== expectedWallet)
    throw Error('Reconnect the original wallet to resolve the pending PAPER order.');
  const challenge = await practiceApi.challenge(address);
  const signed = await wallet.signMessage(new TextEncoder().encode(challenge.message), 'utf8');
  return practiceApi.verify(challenge.id, encodeBase58(signed.signature));
}
