import assert from 'node:assert/strict';
import {test} from 'node:test';
import {alipayPaymentUrl,projectedExpiry} from '../src/membership-levels.js';

test('Shanghai calendar renewal clamps month end and appends to active expiry',()=>{
  const now=new Date('2026-01-30T16:00:00Z');
  assert.equal(projectedExpiry(null,1,now),'2026-02-27T16:00:00.000Z');
  const member={status:'active',starts_at:'2026-01-01T00:00:00Z',expires_at:'2028-01-30T16:00:00Z'};
  assert.equal(projectedExpiry(member,1,now),'2028-02-28T16:00:00.000Z');
  assert.equal(projectedExpiry({...member,status:'expired'},1,now),'2026-02-27T16:00:00.000Z');
  assert.equal(projectedExpiry({...member,starts_at:'2030-01-01T00:00:00Z'},1,now),'2026-02-27T16:00:00.000Z');
});
test('payment URL allows only the expected official application and page-pay method',()=>{
  const query='app_id=2021007104686921&method=alipay.trade.page.pay';
  assert.equal(alipayPaymentUrl(`https://openapi.alipay.com/gateway.do?${query}`),`https://openapi.alipay.com/gateway.do?${query}`);
  for(const base of ['http://openapi.alipay.com','https://openapi.alipay.com.evil.test','https://user@openapi.alipay.com','https://openapi.alipay.com:8443'])assert.throws(()=>alipayPaymentUrl(`${base}/gateway.do?${query}`));
  assert.throws(()=>alipayPaymentUrl(`https://openapi.alipay.com/gateway.do?${query}&method=other`));
  assert.throws(()=>alipayPaymentUrl(`https://openapi.alipay.com/gateway.do?${query}#other`));
  assert.throws(()=>alipayPaymentUrl(`https://openapi.alipay.com/other?${query}`));
});
