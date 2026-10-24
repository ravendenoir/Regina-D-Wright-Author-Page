const crypto = require('crypto');

// Regina's own Mailchimp audience. (Raven's audience is a separate one; never write Regina's readers there.)
const AUDIENCE_ID = 'df99548405';

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

  // A Regina-specific key wins if one is set; otherwise the site's existing key is used.
  // The data center ("us19" etc.) is the part of the key after the dash.
  const apiKey     = process.env.MAILCHIMP_REGINA_API_KEY || process.env.MAILCHIMP_API_KEY;
  const dc         = ((apiKey || '').split('-')[1]) || 'us19';
  const authHeader = 'Basic ' + Buffer.from('anystring:' + apiKey).toString('base64');
  const baseUrl    = `https://${dc}.api.mailchimp.com/3.0/lists/${AUDIENCE_ID}`;

  if (!apiKey) {
    console.error('MAILCHIMP_API_KEY is not set');
    return { statusCode: 500, body: JSON.stringify({ error: 'Server configuration error' }) };
  }

  // Upsert the subscriber (add or update), marked as coming from the author page
  const emailHash = crypto.createHash('md5').update(email).digest('hex');
  const upsert = mergeFields => fetch(`${baseUrl}/members/${emailHash}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
    body: JSON.stringify({
      email_address: email,
      status_if_new: 'subscribed',
      status: 'subscribed',
      merge_fields: mergeFields
    })
  });

  const names = { FNAME: firstName || '', LNAME: lastName || '' };
  let mc   = await upsert({ ...names, SOURCE: 'Author Page' });
  let data = await mc.json();

  // If the audience has no SOURCE field, still subscribe the reader rather than fail the signup.
  const sourceRejected = (data.errors || []).some(e => e.field === 'SOURCE') || /\bSOURCE\b/.test(data.detail || '');
  if (!mc.ok && sourceRejected) {
    console.warn('Mailchimp: no SOURCE field on this audience, subscribing without it');
    mc   = await upsert(names);
    data = await mc.json();
  }

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
