import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWhatsAppTemplateRequest,
  INTERVIEW_INVITATION_BODY_FIELDS,
  SCHEDULING_REMINDER_BODY_FIELDS,
  INTERVIEW_SCHEDULED_BODY_FIELDS,
  AVAILABILITY_REQUEST_BODY_FIELDS,
  SCHELA_WHATSAPP_TEMPLATES,
} from '../lib/whatsapp/templates.ts';

function invitation(extra={}) {
  return buildWhatsAppTemplateRequest({
    to: '94770000000', name: SCHELA_WHATSAPP_TEMPLATES.interviewInvitation,
    language: 'en', namedBody: {
      candidate_name: 'Malshan', company_name: 'Acme', job_title: 'Software Engineer',
    }, ...extra,
  });
}

test('recording catalog registers 11 names without guessing other variables', () => {
  assert.equal(Object.values(SCHELA_WHATSAPP_TEMPLATES).length, 11);
  assert.deepEqual(INTERVIEW_INVITATION_BODY_FIELDS, ['candidate_name', 'company_name', 'job_title']);
});

test('first approved template uses exact name and three named fields', () => {
  const body = invitation();
  assert.equal(body.template.name, 'interview_invitation');
  assert.deepEqual(body.template.components[0].parameters, [
    { type: 'text', parameter_name: 'candidate_name', text: 'Malshan' },
    { type: 'text', parameter_name: 'company_name', text: 'Acme' },
    { type: 'text', parameter_name: 'job_title', text: 'Software Engineer' },
  ]);
  assert.equal(body.template.components.length, 1); // Static URL button needs no component.
});

test('dynamic URL button uses only an opaque per-interview suffix at index zero', () => {
  const body = invitation({dynamicUrlSuffix: 'hrHE6QV_UQtO6P6jD6YBIq5W0W6x1-PM'});
  assert.deepEqual(body.template.components[1], {
    type: 'button', sub_type: 'url', index: '0',
    parameters: [{type: 'text',text: 'hrHE6QV_UQtO6P6jD6YBIq5W0W6x1-PM'}],
  });
});

test('rejects malformed variable values and unsafe URL button suffixes', () => {
  assert.throws(() => invitation({namedBody:{candidate_name:''}}), /empty/);
  assert.throws(() => invitation({dynamicUrlSuffix:'\n'}), /Invalid/);
  assert.throws(() => invitation({dynamicUrlSuffix:'abc',urlButtonIndex:11}), /index/);
});

const fourApprovedTemplates = [
  {
    name: SCHELA_WHATSAPP_TEMPLATES.schedulingReminder,
    fields: SCHEDULING_REMINDER_BODY_FIELDS,
    valueMap: { candidate_name: 'Malshan', job_title: 'Software Engineer' },
    button: 'Choose a time',
  },
  {
    name: SCHELA_WHATSAPP_TEMPLATES.interviewScheduled,
    fields: INTERVIEW_SCHEDULED_BODY_FIELDS,
    valueMap: {
      candidate_name: 'Malshan', job_title: 'Software Engineer', company_name: 'Acme',
      interview_date: 'Sep 30, 2026', interview_time: '10:30 AM IST',
    },
    button: 'Join interview',
  },
  {
    name: SCHELA_WHATSAPP_TEMPLATES.availabilityRequest,
    fields: AVAILABILITY_REQUEST_BODY_FIELDS,
    valueMap: {
      candidate_name: 'Malshan', job_title: 'Software Engineer', company_name: 'Acme',
    },
    button: 'Share availability',
  },
];

for (const approved of fourApprovedTemplates) {
  test(`${approved.name}: exact named parameter contract and dynamic URL CTA`, () => {
    const token = 'hrHE6QV_UQtO6P6jD6YBIq5W0W6x1-PM';
    const body = buildWhatsAppTemplateRequest({
      to: '94770000000', name: approved.name, language: 'en',
      namedBody: approved.valueMap, dynamicUrlSuffix: token,
    });
    assert.equal(body.template.name, approved.name);
    assert.deepEqual(Object.keys(approved.valueMap), [...approved.fields]);
    assert.deepEqual(body.template.components[0].parameters,
      approved.fields.map((key) => ({ type: 'text', parameter_name: key, text: approved.valueMap[key] })));
    assert.deepEqual(body.template.components[1], {
      type: 'button', sub_type: 'url', index: '0',
      parameters: [{ type: 'text', text: token }],
    });
  });
}

test('static URL templates omit the dynamic button component', () => {
  const body = buildWhatsAppTemplateRequest({
    to: '94770000000', name: SCHELA_WHATSAPP_TEMPLATES.schedulingReminder,
    language: 'en', namedBody: { candidate_name: 'Malshan', job_title: 'Engineer' },
  });
  assert.equal(body.template.components.length, 1);
});

test('cannot accidentally send empty or mixed named/positional values', () => {
  assert.throws(() => buildWhatsAppTemplateRequest({
    to: '94770000000', name: SCHELA_WHATSAPP_TEMPLATES.availabilityRequest,
    language: 'en', namedBody: { candidate_name: 'Malshan' }, positionalBody: ['Malshan'],
  }), /either named or positional/);
  assert.throws(() => buildWhatsAppTemplateRequest({
    to: '94770000000', name: SCHELA_WHATSAPP_TEMPLATES.interviewScheduled,
    language: 'en', namedBody: { interview_date: '   ' },
  }), /empty/);
});
