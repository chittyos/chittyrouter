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

describe('communication-context safety regressions', () => {
 it('does not promote sender-provided plus tokens into authorization', () => {
  const c = extractCommunicationContext(msg({to:'luisa+earnings@chitty.cc', from:'untrusted@example.net'}));
  expect(c.hints.recipientHint.status).toBe('unverified-hint');
  expect(c.authorization).toBe('none');
  expect(c.interpretationStatus).toBe('unverified');
 });
 it('preserves all observed audience roles without implying actual delivery', () => {
  const c = extractCommunicationContext(msg({
   to:'A <a@example.net>, B <b@example.net>',
   cc:'C <c@example.net>',
   bcc:'D <d@example.net>',
   'resent-from':'relay@example.net',
   'resent-to':'E <e@example.net>'
  }));
  expect(c.evidence.headerParticipants.to).toEqual(['a@example.net','b@example.net']);
  expect(c.evidence.headerParticipants.cc).toEqual(['c@example.net']);
  expect(c.evidence.headerParticipants.bccObserved).toEqual(['d@example.net']);
  expect(c.evidence.headerParticipants.resentTo).toEqual(['e@example.net']);
  expect(c.evidence.bccVisibility).toBe('present-in-observed-copy');
  expect(c.authorization).toBe('none');
 });
 it('treats a message without reply or redistribution headers as unclassified', () => {
  const c = extractCommunicationContext(msg({'message-id':'<new@example.net>'}));
  expect(c.hints.response).toBe(false);
  expect(c.hints.redistribution).toBe(false);
  expect(c.hints.forwardedHeaderPresent).toBe(false);
 });
 it('retains threading references without asserting prior receipt', () => {
  const c = extractCommunicationContext(msg({
   'message-id':'<next@example.net>',
   references:'<first@example.net> <second@example.net>',
   'in-reply-to':'<second@example.net>'
  }));
  expect(c.evidence.threading.references).toEqual(['<first@example.net>','<second@example.net>']);
  expect(c.hints.response).toBe(true);
  expect(c.interpretationStatus).toBe('unverified');
 });
});
