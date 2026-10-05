exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const params = new URLSearchParams(event.body);
  const email = params.get('email') || '';
  const name  = params.get('name')  || '';

  if (!email) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Email required' }) };
  }

  const [firstName, ...rest] = name.trim().split(' ');
  const lastName = rest.join(' ');

  const apiKey     = process.env.MAILCHIMP_API_KEY;
  const audienceId = '03167cde11';
  const dc         = 'us19';

  const mc = await fetch(
    `https://${dc}.api.mailchimp.com/3.0/lists/${audienceId}/members`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + Buffer.from('anystring:' + apiKey).toString('base64')
      },
      body: JSON.stringify({
        email_address: email,
        status: 'subscribed',
        merge_fields: { FNAME: firstName || '', LNAME: lastName || '' }
      })
    }
  );

  const data = await mc.json();

  // 200 = new subscriber; "Member Exists" = already on the list — both are fine
  if (mc.ok || data.title === 'Member Exists') {
    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  }

  console.error('Mailchimp error:', data);
  return { statusCode: 500, body: JSON.stringify({ error: data.detail || 'Subscription failed' }) };
};
