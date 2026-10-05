const crypto = require('crypto');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const params = new URLSearchParams(event.body);
  const email  = params.get('email') || '';
  const name   = params.get('name')  || '';

  if (!email) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Email required' }) };
  }

  const [firstName, ...rest] = name.trim().split(' ');
  const lastName = rest.join(' ');

  const apiKey        = process.env.MAILCHIMP_API_KEY;
  const audienceId    = '03167cde11';
  const dc            = 'us19';
  const authHeader    = 'Basic ' + Buffer.from('anystring:' + apiKey).toString('base64');
  const baseUrl       = `https://${dc}.api.mailchimp.com/3.0/lists/${audienceId}`;

  // Step 1: Add or update the subscriber
  const mc = await fetch(`${baseUrl}/members`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
    body: JSON.stringify({
      email_address: email,
      status: 'subscribed',
      merge_fields: { FNAME: firstName || '', LNAME: lastName || '' }
    })
  });

  const data = await mc.json();
  const alreadyExists = data.title === 'Member Exists';

  if (!mc.ok && !alreadyExists) {
    console.error('Mailchimp add member error:', data);
    return { statusCode: 500, body: JSON.stringify({ error: data.detail || 'Subscription failed' }) };
  }

  // Step 2: Tag the subscriber with "RDW"
  const emailHash = crypto.createHash('md5').update(email.toLowerCase()).digest('hex');

  await fetch(`${baseUrl}/members/${emailHash}/tags`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
    body: JSON.stringify({ tags: [{ name: 'RDW', status: 'active' }] })
  });

  return { statusCode: 200, body: JSON.stringify({ success: true }) };
};
