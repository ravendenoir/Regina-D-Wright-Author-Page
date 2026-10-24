const crypto = require('crypto');

// Askli ("Regina's Newsletter" form). Website signups are also saved there so every subscriber shows up
// in Askli's responses, the same as people who sign up on the Askli form itself.
// The key is Askli's public "anon" key: it is already published in the Askli form's own page code and
// only allows what the public form allows (adding a submission, checking for a duplicate email).
const ASKLI_URL     = 'https://myelzkbeipgwgyxrtgcq.supabase.co';
const ASKLI_KEY     = process.env.ASKLI_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15ZWx6a2JlaXBnd2d5eHJ0Z2NxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1Njg1NjIsImV4cCI6MjA4ODE0NDU2Mn0.DgcLH8ie77yaCiIr8-bvImxsPAGAftmwMcAa-d6WwLU';
const ASKLI_FORM_ID = '5a70e808-6ed3-472d-b84d-c9bb23df1fc3';
const ASKLI_SITE    = 'https://askli-forms.netlify.app';

// Save the signup as a response on Askli's "Regina's Newsletter" form, unless that email is already there.
// Never throws: the reader is already subscribed in Mailchimp, so an Askli hiccup must not fail the signup.
async function saveToAskli(name, email) {
  const headers = { 'Content-Type': 'application/json', 'apikey': ASKLI_KEY, 'Authorization': 'Bearer ' + ASKLI_KEY };
  try {
    const dup = await fetch(`${ASKLI_URL}/rest/v1/rpc/check_duplicate_email`, {
      method: 'POST', headers,
      body: JSON.stringify({ form_id_input: ASKLI_FORM_ID, field_label_input: 'Email', email_input: email })
    });
    if (dup.ok && (await dup.json()) === true) {
      console.log('Askli: already on Regina\'s Newsletter, not saved again:', email);
      return;
    }

    const data = { Name: name, Email: email };
    const saved = await fetch(`${ASKLI_URL}/rest/v1/submissions`, {
      method: 'POST',
      headers: { ...headers, 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        form_id: ASKLI_FORM_ID,
        data,
        metadata: { submitted_at: new Date().toISOString(), source: 'reginadwright.com' }
      })
    });
    if (!saved.ok) {
      console.error('Askli save error:', saved.status, await saved.text());
      return;
    }
    console.log('Askli: saved to Regina\'s Newsletter:', email);

    // Same new-response notice Raven gets for signups made on the Askli form itself.
    await fetch(`${ASKLI_SITE}/.netlify/functions/notify-submission`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ formTitle: "Regina's Newsletter", data })
    }).catch(err => console.error('Askli notify error:', err.message));
  } catch (err) {
    console.error('Askli save error:', err.message);
  }
}

async function subscribe(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const params = new URLSearchParams(event.body);
  const email  = (params.get('email') || '').trim().toLowerCase();
  const name   = (params.get('name')  || '').trim();

  if (!email) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Email required' }) };
  }

  const [firstName, ...rest] = name.split(' ');
  const lastName = rest.join(' ');

  const apiKey     = process.env.MAILCHIMP_API_KEY;
  const audienceId = '03167cde11';
  const dc         = 'us19';
  const authHeader = 'Basic ' + Buffer.from('anystring:' + apiKey).toString('base64');
  const baseUrl    = `https://${dc}.api.mailchimp.com/3.0/lists/${audienceId}`;

  if (!apiKey) {
    console.error('MAILCHIMP_API_KEY is not set');
    return { statusCode: 500, body: JSON.stringify({ error: 'Server configuration error' }) };
  }

  // Upsert the subscriber (add or update)
  const emailHash = crypto.createHash('md5').update(email).digest('hex');

  const mc = await fetch(`${baseUrl}/members/${emailHash}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
    body: JSON.stringify({
      email_address: email,
      status_if_new: 'subscribed',
      status: 'subscribed',
      merge_fields: { FNAME: firstName || '', LNAME: lastName || '' }
    })
  });

  const data = await mc.json();

  if (!mc.ok) {
    console.error('Mailchimp upsert error:', JSON.stringify(data));
    return { statusCode: 500, body: JSON.stringify({ error: data.detail || data.title || 'Subscription failed' }) };
  }

  console.log('Mailchimp upsert success for', email, '— status:', data.status);

  // Tag the subscriber with "RDW" and "Regina" (the tag Askli's Regina form uses)
  const tagRes = await fetch(`${baseUrl}/members/${emailHash}/tags`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
    body: JSON.stringify({ tags: [{ name: 'RDW', status: 'active' }, { name: 'Regina', status: 'active' }] })
  });

  if (!tagRes.ok) {
    const tagData = await tagRes.json();
    console.error('Mailchimp tag error:', JSON.stringify(tagData));
    // Don't fail the whole request over a tagging error
  }

  await saveToAskli(name, email);

  return { statusCode: 200, body: JSON.stringify({ success: true }) };
}

// reginadwright.com is hosted on GitHub Pages, so the signup form calls this function across sites.
// Allow only Regina's own pages to call it, and answer the browser's permission check (OPTIONS).
const ALLOWED = ['https://reginadwright.com', 'https://www.reginadwright.com', 'https://regina-d-wright.netlify.app'];
exports.handler = async (event) => {
  const origin = (event.headers && (event.headers.origin || event.headers.Origin)) || '';
  const cors = {
    'Access-Control-Allow-Origin': ALLOWED.includes(origin) ? origin : ALLOWED[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };
  const res = await subscribe(event);
  return { ...res, headers: { ...(res.headers || {}), ...cors } };
};
