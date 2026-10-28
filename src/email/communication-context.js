/**
 * Observed communication context. Hints are never identities, consent, permissions
 * or delivery/read receipts. BCC is only reported when present in the observed copy.
 * No body, attachment contents, or inferred protected identity is persisted here.
 */
const splitAddresses = value => String(value || '').split(/,(?![^<]*>)/).map(s => s.trim()).filter(Boolean);
const addressOnly = value => (String(value).match(/<([^<>]+)>/)?.[1] || String(value)).trim();
const unique = entries => [...new Set(entries.map(addressOnly).map(v => v.toLowerCase()).filter(Boolean))];
const safeHeader = (headers, name) => headers?.get?.(name) || '';
export function extractCommunicationContext(message) {
  const headers = message?.headers;
  const envelopeFrom = String(message?.from || '');
  const envelopeTo = String(message?.to || '');
  const to = unique(splitAddresses(safeHeader(headers, 'to')));
  const cc = unique(splitAddresses(safeHeader(headers, 'cc')));
  const bcc = unique(splitAddresses(safeHeader(headers, 'bcc')));
  const replyTo = unique(splitAddresses(safeHeader(headers, 'reply-to')));
  const sender = unique(splitAddresses(safeHeader(headers, 'from')));
  const references = String(safeHeader(headers, 'references')).match(/<[^<>]+>/g) || [];
  const inReplyTo = String(safeHeader(headers, 'in-reply-to'));
  const resentTo = unique(splitAddresses(safeHeader(headers, 'resent-to')));
  const resentFrom = unique(splitAddresses(safeHeader(headers, 'resent-from')));
  const listId = String(safeHeader(headers, 'list-id'));
  const autoSubmitted = String(safeHeader(headers, 'auto-submitted'));
  const recipient = envelopeTo.toLowerCase();
  const at = recipient.lastIndexOf('@');
  const local = at > 0 ? recipient.slice(0, at) : '';
  const plus = local.indexOf('+');
  const recipientHint = plus < 0 ? null : {
    token: local.slice(0, plus),
    qualifiers: local.slice(plus + 1).split('+').filter(Boolean),
    status: 'unverified-hint',
  };
  return {
    evidence: {
      envelope: { from: envelopeFrom, to: envelopeTo },
      headerParticipants: { from: sender, to, cc, bccObserved: bcc, replyTo, resentFrom, resentTo },
      bccVisibility: bcc.length ? 'present-in-observed-copy' : 'unknown',
      threading: { messageId: safeHeader(headers, 'message-id'), inReplyTo, references },
      listId, autoSubmitted,
    },
    hints: {
      recipientHint,
      response: Boolean(inReplyTo || references.length),
      redistribution: Boolean(resentTo.length || resentFrom.length),
      // X-Forwarded-* are unauthenticated assertions, not proof of forwarding.
      forwardedHeaderPresent: Boolean(safeHeader(headers, 'x-forwarded-to') || safeHeader(headers, 'x-forwarded-for')),
    },
    interpretationStatus: 'unverified',
    authorization: 'none',
  };
}
