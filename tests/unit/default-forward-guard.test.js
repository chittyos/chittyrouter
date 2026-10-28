import { describe, it, expect, vi } from 'vitest';
import { CloudflareEmailHandler } from '../../src/email/cloudflare-email-handler.js';

function fixture(env={}) {
 const handler = new CloudflareEmailHandler(env);
 const message = {forward:vi.fn(async()=>{}),setReject:vi.fn()};
 return {handler,message};
}

describe('default forwarding guard',()=>{
 it('never forwards an unknown recipient to a hardcoded mailbox',async()=>{
  const {handler,message}=fixture();
  await expect(handler.routeEmail(message,{to:'unknown+topic@chitty.cc',aliasDecision:null},{}))
    .rejects.toThrow('No approved default-forward destination');
  expect(message.forward).not.toHaveBeenCalled();
 });
 it('requires explicit approved destination membership',()=>{
  const {handler}=fixture({DEFAULT_FORWARD_TO:'not-verified@example.org',VERIFIED_FORWARD_DESTINATIONS:'approved@example.org'});
  expect(handler.approvedDefaultForward()).toBeNull();
 });
 it('accepts configured allowlisted default without changing explicit routes',async()=>{
  const {handler,message}=fixture({DEFAULT_FORWARD_TO:'review@example.org',VERIFIED_FORWARD_DESTINATIONS:'REVIEW@example.org'});
  await handler.routeEmail(message,{to:'unknown+topic@chitty.cc',aliasDecision:null},{});
  expect(message.forward).toHaveBeenCalledWith('review@example.org');
 });
});
