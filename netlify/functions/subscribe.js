const crypto = require('crypto');

exports.handler = async (event) => {
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

  // Tag the subscriber with "RDW"
  const tagRes = await fetch(`${baseUrl}/members/${emailHash}/tags`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
    body: JSON.stringify({ tags: [{ name: 'RDW', status: 'active' }] })
  });

  if (!tagRes.ok) {
    const tagData = await tagRes.json();
    console.error('Mailchimp tag error:', JSON.stringify(tagData));
    // Don't fail the whole request over a tagging error
  }

  return { statusCode: 200, body: JSON.stringify({ success: true }) };
};
