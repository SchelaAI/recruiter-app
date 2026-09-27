/**
 * Read-only Meta template inspection. Never sends a WhatsApp message.
 * Usage:
 *  WHATSAPP_ACCESS_TOKEN=... node scripts/inspect-whatsapp-templates.mjs YOUR_WABA_ID
 * If using a local env file (Node 22):
 *  node --env-file=.env.local scripts/inspect-whatsapp-templates.mjs YOUR_WABA_ID
 * Requires Meta whatsapp_business_management permission on the token.
 */
import { readFileSync } from 'node:fs';
const wabaId = process.argv[2] || process.env.WHATSAPP_WABA_ID;
const token = process.env.WHATSAPP_ACCESS_TOKEN;
if (!wabaId || !/^\d{8,30}$/.test(wabaId) || !token) {
  console.error('Supply your numeric WABA ID and WHATSAPP_ACCESS_TOKEN (never paste the access token in chat).');
  process.exit(1);
}

// Keep registry names in one place: extract quoted values from the TS source.
const source = readFileSync(new URL('../lib/whatsapp/templates.ts', import.meta.url), 'utf8');
const registryBlock = source.match(/SCHELA_WHATSAPP_TEMPLATES\s*=\s*\{([\s\S]*?)\}\s*as const/);
const names = [...(registryBlock?.[1] || '').matchAll(/:\s*"([a-z_]+)"/g)].map((m) => m[1]);
const apiVersion = 'v23.0';
let next = `https://graph.facebook.com/${apiVersion}/${wabaId}/message_templates?fields=name,status,language,category,components&limit=100`;
const templates = [];
try {
  while (next) {
    const response = await fetch(next, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
    const payload = await response.json();
    if (!response.ok) {
      console.error(`Meta read failed (${response.status}). Check WABA ID and whatsapp_business_management permission.`, JSON.stringify(payload.error || {}));
      process.exit(1);
    }
    templates.push(...(payload.data || []));
    next = payload.paging?.next || '';
  }
} catch (error) {
  console.error('Could not read WhatsApp templates:', error instanceof Error ? error.message : String(error));
  process.exit(1);
}

console.log(`Read ${templates.length} Meta templates. Checking ${names.length} Schela names...\n`);
for (const name of names) {
  const matches = templates.filter((x) => x.name === name);
  if (!matches.length) {
    console.log(`MISSING ${name}`);
    continue;
  }
  for (const template of matches) {
    const body = template.components?.find((part) => part.type.toUpperCase() === 'BODY');
    const buttons = template.components?.find((part) => part.type.toUpperCase() === 'BUTTONS')?.buttons || [];
    const fields = [...(body?.text || '').matchAll(/\{\{([a-zA-Z0-9_]+)\}\}/g)].map((x) => x[1]);
    console.log(`${template.status === 'APPROVED' ? 'APPROVED' : template.status} ${name} [${template.language}] ${template.category || ''}`);
    console.log(`  Body variables: ${fields.join(', ') || '(none)'}`);
    buttons.forEach((button, i) => {
      const dynamic = /\{\{.*?\}\}/.test(button.url || '');
      console.log(`  Button ${i}: ${button.type} ${button.text || ''} — ${dynamic ? 'DYNAMIC' : 'STATIC'} ${button.url || '(no URL)'}`);
    });
    if (name === 'interview_invitation') {
      for (const field of ['candidate_name', 'company_name', 'job_title']) {
        if (!fields.includes(field)) console.log(`  WARNING: Expected named body parameter {{${field}}} not present.`);
      }
      if (!['en', 'en_US'].includes(template.language)) console.log('  WARNING: Set optional WHATSAPP_INVITATION_LANGUAGE to this exact Meta language code.');
      const chooseButton = buttons.find((b) => b.type.toUpperCase() === 'URL' && /choose a time/i.test(b.text || ''));
      if (!chooseButton) console.log('  WARNING: No Choose a time URL button found.');
      else if (/\{\{.*?\}\}/.test(chooseButton.url || '')) {
        console.log('  Dynamic URL detected. Schela expects the booking CTA prefix https://recruiter.schela.app/book/.');
      } else {
        console.log('  Static button: Schela cannot add its per-interview URL. Confirm this static URL is appropriate before live use.');
      }
    }
  }
}
