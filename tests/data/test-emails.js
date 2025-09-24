/**
 * Test Email Data - Realistic Legal Email Examples
 * Used for testing ChittyRouter AI Gateway functionality
 */

export const testEmails = {
  // Lawsuit-related emails
  lawsuit_urgent: {
    from: 'opposing.counsel@lawfirm.com',
    to: 'smith-v-jones@example.com',
    subject: 'URGENT: Motion for Summary Judgment Due Tomorrow',
    content: `Dear Counsel,

We are filing our motion for summary judgment tomorrow morning. Per the court's scheduling order, your response is due within 14 days.

Key arguments:
1. Lack of material fact disputes
2. Statute of limitations has expired
3. Plaintiff failed to establish causation

Please confirm receipt of this notice.

Best regards,
Jane Smith, Esq.
Opposing Counsel`,
    attachments: [
      { name: 'motion-summary-judgment.pdf', size: 245760, type: 'application/pdf' },
      { name: 'supporting-brief.pdf', size: 189440, type: 'application/pdf' }
    ],
    timestamp: '2024-09-16T10:30:00Z',
    messageId: 'msg-lawsuit-urgent-001'
  },

  lawsuit_settlement: {
    from: 'mediator@neutrals.com',
    to: 'arias-v-bianchi@example.com',
    subject: 'Settlement Conference Scheduled - Arias v. Bianchi',
    content: `Greetings Counsel,

The court has scheduled a mandatory settlement conference for the Arias v. Bianchi matter:

Date: October 15, 2024
Time: 10:00 AM PST
Location: Superior Court, Department 12
Mediator: Hon. Robert Johnson (Ret.)

Please confirm your clients' availability and submit settlement statements 7 days prior.

Settlement Conference Statement Requirements:
- Brief case summary
- Settlement authority
- Damage calculations
- Previous settlement discussions

Regards,
Mediation Services`,
    attachments: [
      { name: 'settlement-conference-order.pdf', size: 156789, type: 'application/pdf' }
    ],
    timestamp: '2024-09-16T14:15:00Z',
    messageId: 'msg-lawsuit-settlement-001'
  },

  // Document submission emails
  document_evidence: {
    from: 'client@company.com',
    to: 'doe-v-megacorp@example.com',
    subject: 'Evidence Submission - Medical Records and Expert Reports',
    content: `Dear Legal Team,

Please find attached the requested medical records and expert reports for the Doe v. MegaCorp personal injury case.

Attached Documents:
1. Complete medical records from St. Mary's Hospital (Jan-Mar 2024)
2. Dr. Smith's orthopedic evaluation and prognosis
3. Physical therapy progress notes
4. Accident reconstruction expert report
5. Economic loss analysis by CPA firm

All documents have been reviewed for HIPAA compliance and redacted as necessary.

Let me know if you need any additional documentation.

Best,
Sarah Johnson
Case Manager`,
    attachments: [
      { name: 'medical-records-complete.pdf', size: 2456789, type: 'application/pdf' },
      { name: 'orthopedic-evaluation.pdf', size: 567890, type: 'application/pdf' },
      { name: 'physical-therapy-notes.pdf', size: 234567, type: 'application/pdf' },
      { name: 'accident-reconstruction.pdf', size: 789012, type: 'application/pdf' },
      { name: 'economic-loss-analysis.xlsx', size: 123456, type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
    ],
    timestamp: '2024-09-16T09:45:00Z',
    messageId: 'msg-doc-evidence-001'
  },

  document_filing: {
    from: 'clerk@superior-court.gov',
    to: 'case-2024d007847@example.com',
    subject: 'Court Filing Confirmation - Motion to Compel Discovery',
    content: `COURT FILING CONFIRMATION

Case Number: 2024D007847
Case Title: Thompson v. Industrial Corp
Document Type: Motion to Compel Discovery
Filing Date: September 16, 2024, 11:30 AM
Filing Party: Plaintiff Thompson (Attorney: John Doe, Esq.)

Document has been electronically filed and served on all parties.

Next hearing date: October 5, 2024 at 9:00 AM, Department 15

IMPORTANT: Opposition papers due by September 30, 2024 at 5:00 PM.

For questions about this filing, contact the clerk's office at (555) 123-4567.

Superior Court Civil Division
Electronic Filing System`,
    attachments: [
      { name: 'motion-to-compel-filed.pdf', size: 345678, type: 'application/pdf' },
      { name: 'proof-of-service.pdf', size: 123456, type: 'application/pdf' }
    ],
    timestamp: '2024-09-16T11:35:00Z',
    messageId: 'msg-doc-filing-001'
  },

  // Emergency communications
  emergency_injunction: {
    from: 'emergency@lawfirm.com',
    to: 'acme-v-competitor@example.com',
    subject: 'EMERGENCY: TRO Application Filed - Immediate Response Required',
    content: `EMERGENCY LEGAL NOTICE

A Temporary Restraining Order (TRO) application has been filed against our client in the Acme v. Competitor trade secrets case.

CRITICAL DEADLINES:
- Hearing scheduled: TODAY at 4:00 PM
- Opposition brief due: 2:00 PM (in 3 hours)
- Client must cease all disputed activities IMMEDIATELY

Plaintiff's Claims:
1. Misappropriation of trade secrets
2. Breach of non-disclosure agreement
3. Irreparable harm to business operations

IMMEDIATE ACTION REQUIRED:
1. Contact client to halt disputed activities
2. Gather all relevant communications
3. Prepare emergency opposition brief
4. Coordinate with litigation team

This is a CODE RED situation requiring all hands on deck.

Contact me immediately at (555) 999-9999.

Mark Stevens, Esq.
Emergency Response Team`,
    attachments: [
      { name: 'tro-application.pdf', size: 567890, type: 'application/pdf' },
      { name: 'supporting-declarations.pdf', size: 789012, type: 'application/pdf' }
    ],
    timestamp: '2024-09-16T11:00:00Z',
    messageId: 'msg-emergency-tro-001'
  },

  emergency_subpoena: {
    from: 'subpoena-service@process.com',
    to: 'corporate-litigation@example.com',
    subject: 'URGENT: Federal Subpoena Served - 10 Day Response Required',
    content: `SUBPOENA SERVICE NOTICE

A federal grand jury subpoena has been served on your client, Global Industries Inc.

Subpoena Details:
- Case: United States v. Unknown Defendants
- Court: U.S. District Court, Central District
- Service Date: September 16, 2024
- Response Due: September 26, 2024 (10 days)

Documents Requested:
1. All financial records from 2020-2024
2. Communications with specified individuals
3. Board meeting minutes and resolutions
4. Audit reports and compliance documentation

COMPLIANCE REQUIREMENTS:
- Must preserve all relevant documents
- Cannot destroy any responsive materials
- Must provide privilege log for withheld docs
- May need to assert Fifth Amendment protections

Recommend immediate attorney-client conference to discuss response strategy and privilege issues.

Process Server: Mike Rodriguez
Service Company: Reliable Process LLC
Contact: (555) 777-8888`,
    attachments: [
      { name: 'federal-subpoena.pdf', size: 456789, type: 'application/pdf' },
      { name: 'service-certificate.pdf', size: 123456, type: 'application/pdf' }
    ],
    timestamp: '2024-09-16T16:20:00Z',
    messageId: 'msg-emergency-subpoena-001'
  },

  // Client communication
  client_consultation: {
    from: 'potential.client@email.com',
    to: 'intake@example.com',
    subject: 'Legal Consultation Request - Employment Discrimination',
    content: `Hello,

I am seeking legal representation for a potential employment discrimination case.

Background:
- Worked at XYZ Corporation for 5 years as Senior Manager
- Recently terminated after filing EEOC complaint
- Believe termination was retaliatory
- Have documentation of discriminatory comments from supervisors

Specific Issues:
1. Age discrimination (I'm 58 years old)
2. Retaliation for protected activity
3. Hostile work environment
4. Wrongful termination

I have gathered relevant emails, performance reviews, and witness contact information. Several coworkers experienced similar treatment.

When can we schedule a consultation to discuss my case? I understand there may be statute of limitations concerns.

My contact information:
Phone: (555) 234-5678
Email: potential.client@email.com
Best times to call: Weekdays 9-5, weekends 10-2

Thank you for your time.

Robert Martinez`,
    attachments: [
      { name: 'termination-letter.pdf', size: 123456, type: 'application/pdf' },
      { name: 'eeoc-complaint.pdf', size: 234567, type: 'application/pdf' }
    ],
    timestamp: '2024-09-16T13:30:00Z',
    messageId: 'msg-client-consultation-001'
  },

  client_update_request: {
    from: 'existing.client@company.com',
    to: 'martinez-v-employer@example.com',
    subject: 'Case Status Update Request - Martinez v. Former Employer',
    content: `Dear Legal Team,

I hope this email finds you well. I wanted to check on the status of my employment discrimination case against my former employer.

It's been about 6 weeks since our last communication, and I'm getting anxious about the progress. Could you please provide an update on:

1. Discovery progress and timeline
2. Any settlement discussions
3. Next steps in the litigation
4. Expected timeline for resolution

Recent Developments on My End:
- Found new employment (lower salary but same field)
- Former colleague reached out with additional evidence
- Received unemployment benefits (may affect damages calculation)

Questions:
- Should I be documenting ongoing damages?
- How should I handle reference requests from potential employers?
- Can we discuss the likelihood of settlement vs. trial?

I'm available for a call this week if that would be more efficient than email.

Thank you for all your hard work on my case.

Best regards,
Carlos Martinez
Phone: (555) 345-6789`,
    attachments: [],
    timestamp: '2024-09-16T15:45:00Z',
    messageId: 'msg-client-update-001'
  },

  // General inquiries
  general_question: {
    from: 'general.inquiry@email.com',
    to: 'info@example.com',
    subject: 'Question about Statute of Limitations - Personal Injury',
    content: `Hi,

I have a quick question about statute of limitations for personal injury cases in California.

I was in a car accident 2 years and 8 months ago. I initially thought I was fine, but recently discovered I have ongoing back problems that may be related to the accident.

Questions:
1. Is it too late to file a lawsuit?
2. Does the discovery rule apply to my situation?
3. Do I need to act immediately?

The accident details:
- Date: January 15, 2022
- Other driver was clearly at fault (ran red light)
- Police report filed
- I was seen in ER but released same day
- Recent MRI shows disc problems

I have insurance records and the police report. The other driver's insurance company contacted me initially but I didn't pursue it because I felt fine at the time.

What would you recommend as my next steps?

Thank you,
Lisa Chen
(555) 456-7890`,
    attachments: [],
    timestamp: '2024-09-16T12:15:00Z',
    messageId: 'msg-general-question-001'
  },

  // Appointment scheduling
  appointment_request: {
    from: 'scheduling@clientcompany.com',
    to: 'calendar@example.com',
    subject: 'Deposition Scheduling - Williams v. Construction Co.',
    content: `Dear Scheduling Coordinator,

We need to schedule depositions for the Williams v. ABC Construction case.

Requested Depositions:
1. Plaintiff John Williams (our client)
2. Defendant's project manager
3. Site supervisor
4. Safety inspector

Preferred Dates:
- Week of October 21, 2024
- Week of October 28, 2024
- Morning sessions preferred (9 AM - 12 PM)

Location Options:
1. Our office conference room (seats 12)
2. Neutral location (court reporter's office)
3. Defendant's counsel office (if preferred)

Special Requirements:
- Court reporter with real-time capability
- Video recording requested
- Plaintiff may need interpreter (Spanish)

Please coordinate with opposing counsel and provide available dates. Discovery deadline is November 15, 2024.

Court Reporter Preferences:
- Peterson Reporting Services
- Accurate Stenography Inc.
- Metro Court Reporters

Contact for coordination:
Jennifer Adams, Paralegal
Phone: (555) 567-8901
Email: jadams@clientcompany.com

Best regards,
Jennifer Adams
Litigation Support`,
    attachments: [
      { name: 'deposition-notice-template.pdf', size: 123456, type: 'application/pdf' }
    ],
    timestamp: '2024-09-16T14:30:00Z',
    messageId: 'msg-appointment-request-001'
  },

  // Billing inquiries
  billing_question: {
    from: 'accounting@client.com',
    to: 'billing@example.com',
    subject: 'Invoice Questions - Matter #2024-156',
    content: `Dear Billing Department,

We have questions about Invoice #INV-2024-0892 dated September 1, 2024 for Matter #2024-156 (Johnson v. Supplier).

Invoice Details:
- Total Amount: $45,678.90
- Period: August 1-31, 2024
- Matter: Contract dispute litigation

Questions:
1. Line item #15 shows 8.5 hours for "Document Review" on 8/15/24. Can you provide more details about what documents were reviewed?

2. Travel expenses of $1,247.50 - where was travel to/from and what was the business purpose?

3. Expert witness fees of $3,500 - which expert and for what services?

4. Court filing fees of $435 seem high - can you provide breakdown?

We're not disputing the charges, just need additional details for our internal approval process.

Our preferred format for future invoices:
- Task-based time entries (not just "Legal Services")
- Specific document descriptions for review time
- Prior approval for expenses over $500

When can we schedule a call to discuss the invoice and our billing guidelines?

Best regards,
Patricia Wong, CPA
Corporate Legal Accounting
Phone: (555) 789-0123`,
    attachments: [
      { name: 'invoice-INV-2024-0892.pdf', size: 234567, type: 'application/pdf' }
    ],
    timestamp: '2024-09-16T11:20:00Z',
    messageId: 'msg-billing-question-001'
  }
};

// Email categories for testing
export const emailCategories = {
  lawsuit: ['lawsuit_urgent', 'lawsuit_settlement'],
  document_submission: ['document_evidence', 'document_filing'],
  emergency: ['emergency_injunction', 'emergency_subpoena'],
  inquiry: ['general_question', 'client_consultation'],
  appointment: ['appointment_request'],
  billing: ['billing_question'],
  client_communication: ['client_update_request']
};

// Priority levels for testing
export const priorityLevels = {
  CRITICAL: ['emergency_injunction', 'emergency_subpoena'],
  HIGH: ['lawsuit_urgent', 'document_filing'],
  NORMAL: ['document_evidence', 'lawsuit_settlement', 'appointment_request', 'billing_question'],
  LOW: ['general_question', 'client_consultation', 'client_update_request']
};

// Mock message objects for testing
export function createMockMessage(emailKey) {
  const email = testEmails[emailKey];
  if (!email) {
    throw new Error(`Test email '${emailKey}' not found`);
  }

  return {
    from: email.from,
    to: email.to,
    headers: new Map([
      ['subject', email.subject],
      ['message-id', email.messageId],
      ['date', email.timestamp]
    ]),
    attachments: email.attachments || [],
    raw: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(email.content));
        controller.close();
      }
    }),
    reply: async (options) => {
      console.log('Mock reply sent:', options);
      return { success: true };
    },
    forward: async (destination) => {
      console.log('Mock forward to:', destination);
      return { success: true };
    }
  };
}

export function getRandomTestEmail() {
  const keys = Object.keys(testEmails);
  const randomKey = keys[Math.floor(Math.random() * keys.length)];
  return { key: randomKey, email: testEmails[randomKey] };
}

export function getEmailsByCategory(category) {
  const categoryKeys = emailCategories[category] || [];
  return categoryKeys.map(key => ({ key, email: testEmails[key] }));
}

export function getEmailsByPriority(priority) {
  const priorityKeys = priorityLevels[priority] || [];
  return priorityKeys.map(key => ({ key, email: testEmails[key] }));
}