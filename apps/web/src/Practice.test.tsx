// @vitest-environment jsdom
import { describe,it,expect,vi,afterEach } from 'vitest';
import { render,screen,waitFor,cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient,QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { PracticePage } from './Practice.js';
import { practiceApi,PracticeError,type PracticeAccount,type PracticeQuote } from './practice-api.js';
vi.mock('./WebsiteMarkets.js',()=>({WebsiteMarketPicker:()=>null,WebsiteMarketChart:()=>null}));
vi.mock('./TokenMarketView.js',()=>({TokenMarketView:()=>null,TicketMarketSummary:()=>null}));
const mint='So11111111111111111111111111111111111111112';
const account:PracticeAccount={wallet:mint,mode:'PRACTICE',rewardEligible:false,cash:'10000000000',positions:[],trades:[]};
function show(route='/practice?mint='+mint){return render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}})}><MemoryRouter initialEntries={[route]}><PracticePage/></MemoryRouter></QueryClientProvider>);}
afterEach(()=>{cleanup();vi.restoreAllMocks();});
describe('standalone Practice account',()=>{
 it('opens portfolio directly with exact account cash and recorded basis, without inventing mark-to-market equity',async()=>{
   vi.spyOn(practiceApi,'account').mockResolvedValue({...account,cash:'9990000000',positions:[{mint,quantity:'12',basis:'10000000',decimals:6}]});
   const {container}=show('/practice?view=portfolio');
   await screen.findByRole('heading',{name:'Paper portfolio'});
   await waitFor(()=>expect(container.querySelector('.pf-portfolio-metrics')).toHaveTextContent('9.99'));
   expect(container.querySelector('.pf-portfolio-metrics')).toHaveTextContent('0.01');
   expect(screen.getByText(/Separate from hourly competition accounts/)).toBeInTheDocument();
   expect(screen.getByRole('button',{name:'Sign out of Practice'})).toBeEnabled();
 });
 it('displays unrealized PnL from a fresh net SELL quote and recorded basis, never chart price',async()=>{
   vi.spyOn(practiceApi,'account').mockResolvedValue({...account,positions:[{mint,quantity:'1000000',basis:'100000000',decimals:6}]});
   const quote:PracticeQuote={id:'exit-test',mint,side:'SELL',input:'1000000',output:'90000000',fee:'1000000',decimals:6,minimumOutput:'90000000',expires:Date.now()+15000,protocol:'FIXTURE_ONLY',slot:'1'};
   const pricing=vi.spyOn(practiceApi,'quote').mockResolvedValue(quote);show();
   await waitFor(()=>expect(screen.getByTestId('practice-unrealized')).toHaveTextContent('-0.01 Paper SOL'));
   expect(screen.getByTestId('practice-exit-value')).toHaveTextContent('0.09 Paper SOL');expect(pricing).toHaveBeenCalledWith(mint,'SELL','1000000',0);
 });
 it('shows separate simulated cash without duplicate units or reward eligibility',async()=>{vi.spyOn(practiceApi,'account').mockResolvedValue(account);const {container}=show();await waitFor(()=>expect(container.querySelector('.pf-practice-balance')).toHaveTextContent('10 Paper SOL'));expect(container.textContent).not.toContain('SOL Paper SOL');expect(screen.getByRole('note')).toHaveTextContent(/no prizes or reward eligibility/);});
 it('fails closed when the new backend is not enabled',async()=>{vi.spyOn(practiceApi,'account').mockRejectedValue(new PracticeError('PRACTICE_UNAVAILABLE','Unavailable',503));show();await screen.findByText(/Practice service is unavailable/);expect(screen.getByRole('button',{name:'Preview practice order'})).toBeDisabled();expect(screen.queryByText('10 Paper SOL',{exact:true})).toBeNull();});
 it('retries an uncertain order with the original quote and idempotency key',async()=>{vi.spyOn(practiceApi,'account').mockResolvedValue(account);const quote:PracticeQuote={id:'test-quote',mint,side:'BUY',input:'100000000',output:'1000000',fee:'1000',decimals:6,minimumOutput:'990000',expires:Date.now()+15000,protocol:'FIXTURE_ONLY',slot:'1'};vi.spyOn(practiceApi,'quote').mockResolvedValue(quote);const trade=vi.spyOn(practiceApi,'trade').mockRejectedValueOnce(new PracticeError('NETWORK_UNCERTAIN','Interrupted',0)).mockResolvedValue({id:'fixture-fill',mint,side:'BUY',input:quote.input,output:quote.output,fee:quote.fee,decimals:6,at:Date.now(),realizedPnl:'0',protocol:'FIXTURE_ONLY'});show();const user=userEvent.setup();await waitFor(()=>expect(screen.getByRole('button',{name:'Preview practice order'})).toBeEnabled());await user.click(screen.getByRole('button',{name:'Preview practice order'}));await user.click(await screen.findByRole('button',{name:'Confirm practice BUY'}));await user.click(await screen.findByRole('button',{name:'Retry same practice order'}));await screen.findByRole('status');expect(trade).toHaveBeenCalledTimes(2);expect(trade.mock.calls[0]).toEqual(trade.mock.calls[1]);});
});
