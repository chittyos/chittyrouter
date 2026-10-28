import { describe, it, expect } from 'vitest';
import { extractCommunicationContext } from '../../src/email/communication-context.js';
const msg = (headers, to='luisa+earnings@chitty.cc') => ({
 from:'sender@example.org', to, headers: new Headers(headers)
});
describe('communication context', () => {
 it('preserves recipient roles and plus-addressing as hints only', () => {
  const c=extractCommunicationContext(msg({from:'Alice <alice@example.org>',to:'Luisa <luisa+earnings@chitty.cc>',cc:'Bob <bob@example.org>',bcc:'Hidden <hidden@example.org>', 'reply-to':'reply@example.org','message-id':'<m1>','in-reply-to':'<m0>'}));
  expect(c.evidence.headerParticipants.cc).toEqual(['bob@example.org']);
  expect(c.evidence.headerParticipants.bccObserved).toEqual(['hidden@example.org']);
  expect(c.hints.recipientHint).toEqual({token:'luisa',qualifiers:['earnings'],status:'unverified-hint'});
  expect(c.hints.response).toBe(true);
  expect(c.authorization).toBe('none');
 });
 it('does not infer no BCC from absent header',()=>{
  const c=extractCommunicationContext(msg({to:'someone@example.org'}));
  expect(c.evidence.bccVisibility).toBe('unknown');
 });
 it('does not conflate envelope and visible header recipients',()=>{
  const c=extractCommunicationContext(msg({to:'other@example.org'}));
  expect(c.evidence.envelope.to).toBe('luisa+earnings@chitty.cc');
  expect(c.evidence.headerParticipants.to).toEqual(['other@example.org']);
 });
 it('marks resent evidence without claiming a successful forward',()=>{
  const c=extractCommunicationContext(msg({'resent-to':'new@example.org', 'x-forwarded-to':'a@example.org'}));
  expect(c.hints.redistribution).toBe(true);
  expect(c.hints.forwardedHeaderPresent).toBe(true);
  expect(c.interpretationStatus).toBe('unverified');
 });
});
