export async function onRequestPost(context: any) {
  const request = context.request;
  const env = context.env;
  
  try {
    const formData = await request.formData();
    const username = formData.get('username');
    const email = formData.get('email');
    const firstAnimation = formData.get('first_animation');
    const honeypot = formData.get('company');

    if (honeypot) {
      return new Response('Success', { status: 200 }); // Spam silently ignored
    }

    if (!username || !email) {
      return new Response('Missing fields', { status: 400 });
    }

    // Call Loops.so API
    if (env.LOOPS_API_KEY) {
      await fetch('https://app.loops.so/api/v1/contacts/create', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.LOOPS_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: email.toString(),
          username: username.toString(),
          firstAnimation: firstAnimation ? firstAnimation.toString() : '',
          source: 'LAO Waitlist'
        })
      });
    }

    // Redirect or return success based on Accept header
    const accept = request.headers.get('Accept') || '';
    if (accept.includes('application/json')) {
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Server-rendered fallback for non-JS submission
    return new Response(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Waitlist Joined</title>
        <style>
          body { background: #0B0F16; color: #E8ECF4; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
          .card { text-align: center; }
          a { color: #7FA6E0; text-decoration: none; margin-top: 20px; display: inline-block; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>You're in — @${username} is yours.</h1>
          <a href="/">← Back to LAO</a>
        </div>
      </body>
      </html>
    `, {
      headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });

  } catch (error) {
    return new Response('Internal Server Error', { status: 500 });
  }
}
