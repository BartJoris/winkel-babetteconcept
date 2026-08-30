import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadRecentPosOrders,
  type RecentPosOrdersOdooCall,
  type RecentPosOrdersOdooCallParams,
} from './recentPosOrders';

const LIVE_SESSION = { useYesterdaySession: false as const };

function domainOf(params: RecentPosOrdersOdooCallParams): unknown[] {
  const domain = params.args[0];
  return Array.isArray(domain) ? domain : [];
}

describe('loadRecentPosOrders', () => {
  it('loads the last 20 orders from opened POS sessions', async () => {
    const calls: Array<{ model: string; domain: unknown[] }> = [];

    const odooCall: RecentPosOrdersOdooCall = async <T>(params: RecentPosOrdersOdooCallParams) => {
      calls.push({ model: params.model, domain: domainOf(params) });

      if (params.model === 'pos.session') {
        return [{ id: 7, name: 'POS/2026/08/30/001', config_id: [1, 'Winkel'] }] as T;
      }

      if (params.model === 'pos.order') {
        assert.equal(params.kwargs?.limit, 20);
        assert.equal(params.kwargs?.order, 'date_order desc');
        const sessionClause = domainOf(params).find(
          (item) => Array.isArray(item) && item[0] === 'session_id'
        ) as [string, string, number[]] | undefined;
        assert.deepEqual(sessionClause, ['session_id', 'in', [7]]);

        return [
          {
            id: 13818,
            name: 'Shop/0042',
            date_order: '2026-08-30 08:32:00',
            state: 'paid',
            partner_id: [12, 'Marie'],
            amount_total: 45.5,
            session_id: [7, 'POS/2026/08/30/001'],
            lines: [1, 2, 3],
          },
          {
            id: 13817,
            name: 'Shop/0041',
            date_order: '2026-08-30 08:15:00',
            state: 'done',
            partner_id: false,
            amount_total: 12,
            session_id: [7, 'POS/2026/08/30/001'],
            lines: [4],
          },
        ] as T;
      }

      throw new Error(`Unexpected model ${params.model}`);
    };

    const result = await loadRecentPosOrders(odooCall, 1, 'secret', LIVE_SESSION);

    assert.equal(calls[0]?.model, 'pos.session');
    assert.equal(result.sessionLabel, 'Winkel · POS/2026/08/30/001');
    assert.equal(result.orders.length, 2);
    assert.deepEqual(result.orders[0], {
      id: 13818,
      name: 'Shop/0042',
      date: '2026-08-30 08:32:00',
      state: 'paid',
      partner: 'Marie',
      total: 45.5,
      lineCount: 3,
      sessionName: 'POS/2026/08/30/001',
    });
    assert.equal(result.orders[1].partner, null);
    assert.equal(result.orders[1].lineCount, 1);
  });

  it('falls back to the last 20 POS orders when no session is open', async () => {
    const odooCall: RecentPosOrdersOdooCall = async <T>(params: RecentPosOrdersOdooCallParams) => {
      if (params.model === 'pos.session') return [] as T;
      if (params.model === 'pos.order') {
        assert.deepEqual(domainOf(params), []);
        return [
          {
            id: 1,
            name: 'Shop/0001',
            date_order: '2026-08-29 16:00:00',
            state: 'done',
            partner_id: false,
            amount_total: 9,
            session_id: [3, 'POS/2026/08/29/001'],
            lines: [],
          },
        ] as T;
      }
      throw new Error(`Unexpected model ${params.model}`);
    };

    const result = await loadRecentPosOrders(odooCall, 1, 'secret', LIVE_SESSION);
    assert.equal(result.sessionLabel, null);
    assert.equal(result.orders.length, 1);
    assert.equal(result.orders[0].name, 'Shop/0001');
  });

  it('uses yesterday start_at when the test session override is on', async () => {
    let sessionDomain: unknown[] = [];
    const odooCall: RecentPosOrdersOdooCall = async <T>(params: RecentPosOrdersOdooCallParams) => {
      if (params.model === 'pos.session') {
        sessionDomain = domainOf(params);
        return [{ id: 9, name: 'POS/2026/08/29/001', config_id: [1, 'Winkel'] }] as T;
      }
      if (params.model === 'pos.order') {
        return [] as T;
      }
      throw new Error(`Unexpected model ${params.model}`);
    };

    const result = await loadRecentPosOrders(odooCall, 1, 'secret', {
      useYesterdaySession: true,
      now: new Date('2026-08-30T10:00:00+02:00'),
    });

    assert.deepEqual(sessionDomain, [
      ['start_at', '>=', '2026-08-29 00:00:00'],
      ['start_at', '<', '2026-08-30 00:00:00'],
    ]);
    assert.equal(result.usingYesterdaySession, true);
    assert.equal(result.sessionLabel, 'TEST gisteren · Winkel · POS/2026/08/29/001');
  });
});
