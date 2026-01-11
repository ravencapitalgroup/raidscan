import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const { endpoint, params = {} } = body;

    if (!endpoint) {
      return Response.json({ error: 'Endpoint is required' }, { status: 400 });
    }

    // Construct the full URL with parameters
    const url = new URL(`https://api.binance.com${endpoint}`);
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });

    console.log(`Proxying request to: ${url.toString()}`);

    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error(`Binance API error: ${response.status} - ${errorData}`);
      return Response.json(
        { error: `Binance API error: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return Response.json(data);
  } catch (error) {
    console.error('Proxy error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});