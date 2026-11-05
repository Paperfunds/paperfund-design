// Deliberately synthetic display data. No private key, wallet signing or financial mutation.
export const mint = 'AxPzkSJKU3ACqZu7qpq8ov29g4BENZBM4SAZwUUUFo8M';
export const pool = 'FsRk3TJj7y3vfvSQJe1DzrxEP9uU6rkSQ1hkRJEoNLKA';
const sol = 'So11111111111111111111111111111111111111112';
const wallet = '11111111111111111111111111111111';
function data() {
  const now = Date.now(), start = Math.floor(now/3600000)*3600000;
  const scenario = { id: 'designer-hour', startsAt: new Date(start).toISOString(), endsAtExclusive: new Date(start+3600000).toISOString(), state: 'OPEN', startingPaperSolLamports: '10000000000', maxUniqueTokens: 5, maxBuyRatioBps: 2000, rewardFinalizationGracePeriodSeconds: 60 };
  const marketData = { mint, pair: pool, dex: 'pumpswap', name: 'Designer Fixture', symbol: 'DESIGN', priceUsd: 0.000123, marketCapUsd: 123000, liquidityUsd: 50000, volume24h: 75000, change5m: 1.2, change1h: -2.3, change24h: 4.5, buys5m: 23, sells5m: 19, icon: null, links: [], observedAt: now };
  const base = { mint, name: marketData.name, symbol: marketData.symbol, firstSeenAt: now-1000000, lastSeenAt: now, source: 'pumpportal', marketCapSol: 100, marketCapUsd: 123000, marketCapUsdAt: now, marketCapSource: 'DESIGNER_FIXTURE', marketObservedAt: now, volume24hUsd: 75000, curveProgressPct: 50, progressVerifiedAt: now, verifiedAt: now, createdAt: now-1000000, creationVerifiedAt: now, creationTimeStatus: 'verified', marketData, mintSupplyRaw: '1000000000000000', decimals: 6 };
  const snapshot = { status: 'live', lastEventAt: now, receivedAt: now, provider: 'SYNTHETIC DESIGNER FIXTURE', coverage: 'LOCAL FIXTURES ONLY', tokens: [{ ...base, stage: 'new', createdAt: now-5000000 }, { ...base, mint: '7F8BkfhPaDGMeNkaYeVa99WAqo86LpXDKsLQXpM7pump', stage: 'stretch', marketData: { ...marketData, mint: '7F8BkfhPaDGMeNkaYeVa99WAqo86LpXDKsLQXpM7pump' } }, { ...base, mint: '8muc9DdhqWfAPcvmEebNQCG89bLiwi12T2KtBtzVpump', stage: 'migrated', migrationVerifiedAt: now, complete: true, marketData: { ...marketData, mint: '8muc9DdhqWfAPcvmEebNQCG89bLiwi12T2KtBtzVpump' } }] };
  const trades = Array.from({length:120},(_,i)=>({ id:'fixture:'+i, mint, pool, time: Math.floor(now/1000)*1000-(120-i)*1000, slot: 1000+i, sourceOrder:i, signature:'1'.repeat(64), wallet, side:i%3?'BUY':'SELL', priceUsd:0.000123*(1+Math.sin(i/5)*0.02), quantity:1000+i, volumeUsd:1+i/100 }));
  return { now, scenario, marketData, snapshot, trades };
}
function provider(raw, d) {
  const p = decodeURIComponent(raw ?? '');
  const selected = /(?:tokens|solana)\/([1-9A-HJ-NP-Za-km-z]{32,44})/.exec(p)?.[1] ?? mint;
  const listing = { chainId:'solana', pairAddress:pool, dexId:'pumpswap', baseToken:{address:selected,name:'Designer Fixture',symbol:'DESIGN'}, quoteToken:{address:sol,symbol:'SOL'}, liquidity:{usd:50000}, priceUsd:'0.000123', marketCap:123000, volume:{h24:75000}, priceChange:{m5:1.2,h1:-2.3,h24:4.5}, txns:{m5:{buys:23,sells:19}} };
  if (p.includes('/search')) return { pairs:[listing] };
  if (!p.includes('/api/v2/')) return [listing];
  if (p.includes('/ohlcv/')) return { meta:{base:{address:mint},quote:{address:sol}}, data:{attributes:{ohlcv_list:d.trades.map((t,i)=>[Math.floor(t.time/1000/60)*60-i*60,t.priceUsd,t.priceUsd*1.01,t.priceUsd*0.99,t.priceUsd,10])}} };
  return { data:[{id:'solana_'+pool,attributes:{address:pool,name:'DESIGN/SOL',reserve_in_usd:'50000'},relationships:{base_token:{data:{id:'solana_'+selected}},quote_token:{data:{id:'solana_'+sol}},dex:{data:{id:'pumpswap'}}}}] };
}
export function fixtureMiddleware(req,res,next) {
  const u = new URL(req.url,'http://localhost'), p = u.pathname;
  if (!['/__designer/','/api/v1/','/practice-api/','/pulse-feed/'].some((prefix)=>p.startsWith(prefix))) return next();
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Security-Policy', "default-src 'none'");
  const reply=(body,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(body));};
  if (!['GET','HEAD'].includes(req.method)) return reply({error:{code:'DESIGN_ONLY',message:'Authentication and trading are disabled in designer preview.'}},403);
  const d=data(), state=u.searchParams.get('state') ?? u.searchParams.get('__state');
  if (state==='unavailable') return reply({error:{code:'FIXTURE_UNAVAILABLE',message:'Synthetic outage state'}},503);
  if (p==='/__designer/provider') return reply(provider(u.searchParams.get('path'),d));
  if (p==='/pulse-feed/snapshot') return reply(d.snapshot);
  if (p.endsWith('/events')) {
    res.writeHead(200,{'Content-Type':'text/event-stream','Connection':'keep-alive'});
    const send=()=>{
      const n=data();
      if(p==='/pulse-feed/events') res.write('event: snapshot\ndata: '+JSON.stringify(n.snapshot)+'\n\n');
      else res.write('data: '+JSON.stringify({mint:u.searchParams.get('mint'),pool:u.searchParams.get('pool'),trades:n.trades.map(t=>({...t,mint:u.searchParams.get('mint'),pool:u.searchParams.get('pool')})),full:true,gaps:[],status:'available',delivery:'rest-delayed',streamState:'designer-fixture',checkedAt:n.now,emittedAt:n.now})+'\n\n');
    }; send(); const timer=setInterval(send,5000);res.on('close',()=>clearInterval(timer));return;
  }
  if(p.endsWith('/terminal/trades')) return reply({mint:u.searchParams.get('mint'),pool:u.searchParams.get('pool'),trades:d.trades.map(t=>({...t,mint:u.searchParams.get('mint'),pool:u.searchParams.get('pool')})),gaps:[],status:'available',delivery:'rest-delayed',streamState:'designer-fixture',checkedAt:d.now});
  if(p.endsWith('/terminal/holders')) return reply({status:'available',checkedAt:d.now,lastSuccessfulAt:d.now,slot:1120,decimals:6,supplyRaw:'1000000000000000',sampledTokenAccounts:1,sampledOnCurveOwners:1,excludedProgramCustodyRaw:'0',uniqueHolderCount:null,top10LowerBoundPct:1,top20LowerBoundPct:1,scope:'SYNTHETIC DESIGNER SAMPLE',rows:[{wallet,raw:'10000000000000',percent:1}]});
  const valuation={status:'AVAILABLE',executablePaperSolLamports:'7200000',unrealizedPnlLamports:'-300000',currentProtocol:'PUMP_SWAP',evidenceFingerprint:'synthetic-designer-only',observedAt:new Date(d.now).toISOString(),chainSlot:'1120',valuedAt:new Date(d.now).toISOString()};
  const position={id:'fixture-position',mint,originMarketId:pool,originProtocol:'PUMP_SWAP',tokenDecimals:6,tokenQuantityBaseUnits:'750000000',costBasisPaperSolLamports:'7500000',realizedPnlLamports:'-100000',valuation};
  if(state==='position' && p.endsWith('/rounds/current/account')) return reply({accountId:'designer-account',roundId:d.scenario.id,paperSolLamports:'9992400000',startingPaperSolLamports:'10000000000',realizedPnlLamports:'-100000',slotsUsed:1,slotLimit:5,roundState:'OPEN',positions:[position]});
  if(state==='position' && p.endsWith('/positions')) return reply({accountId:'designer-account',roundId:d.scenario.id,cashLamports:'9992400000',startingPaperSolLamports:'10000000000',valuationStatus:'AVAILABLE',equityValuationStatus:'FULL',executablePositionsLamports:'7200000',portfolioEquityLamports:'9999600000',livePnlLamports:'-400000',valuedAt:new Date(d.now).toISOString(),positions:[position]});
  if(p.endsWith('/auth/me')) return reply({user:{id:'designer-user',walletAddress:wallet}});
  if(p==='/practice-api/account') return reply({mode:'PRACTICE',rewardEligible:false,wallet,cash:'10000000000',positions:[],trades:[]});
  if(p.endsWith('/rounds/current')) return reply({round:d.scenario,serverTime:new Date(d.now).toISOString()});
  if(p.endsWith('/rounds/current/account')) return reply({accountId:'designer-account',roundId:d.scenario.id,paperSolLamports:'10000000000',startingPaperSolLamports:'10000000000',realizedPnlLamports:'0',slotsUsed:0,slotLimit:5,roundState:'OPEN',positions:[]});
  if(p.includes('/markets/')) return reply({mint:p.split('/').at(-1),supported:true,executionProtocol:'PUMP_SWAP',marketId:pool,tokenDecimals:6,tokenSupplyBaseUnits:'1000000000000000'});
  if(p.endsWith('/positions')) return reply({accountId:'designer-account',roundId:d.scenario.id,cashLamports:'10000000000',startingPaperSolLamports:'10000000000',valuationStatus:'AVAILABLE',equityValuationStatus:'FULL',executablePositionsLamports:'0',portfolioEquityLamports:'10000000000',livePnlLamports:'0',valuedAt:new Date(d.now).toISOString(),positions:[]});
  if(p.includes('/buy-preflight')) return reply({accountId:'designer-account',roundId:d.scenario.id,cashLamports:'10000000000',portfolioEquityLamports:'10000000000',executablePositionsLamports:'0',maxBuyByRatioLamports:'2000000000',maxBuyLamports:'2000000000',maxBuyRatioBps:'2000',slotsUsed:0,slotLimit:5,targetAlreadyConsumesSlot:false,requiresNewSlot:true,slotAvailable:true,marketSupported:true,protocol:'PUMP_SWAP',marketStatus:'ACTIVE',valuationStatus:'AVAILABLE',unavailablePositionIds:[],serverTime:new Date(d.now).toISOString()});
  if(p.endsWith('/trades')||p.includes('/results/')) return reply({items:[],nextCursor:null});
  if(p.endsWith('/rewards/me')) return reply([]);
  if(p.includes('/leaderboards/')||p.includes('/rewards/')||p.includes('/competitions/')) return reply(null);
  return reply({error:{code:'DESIGN_FIXTURE_UNAVAILABLE',message:'This fixture is intentionally unavailable.'}},404);
}
