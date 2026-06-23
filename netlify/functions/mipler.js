exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const { shareUrl, dateFrom, dateTo } = JSON.parse(event.body);

    if (!shareUrl) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Falta la URL' }) };
    }

    const params = new URLSearchParams({
      'filters[orders.processed_at][gte]': dateFrom + 'T00:00:00',
      'filters[orders.processed_at][lte]': dateTo + 'T23:59:59',
    });

    const url = `${shareUrl}?${params}`;
    const resp = await fetch(url);

    if (!resp.ok) {
      const text = await resp.text();
      return { statusCode: resp.status, headers, body: JSON.stringify({ error: `Mipler error ${resp.status}: ${text}` }) };
    }

    const data = await resp.json();
    return { statusCode: 200, headers, body: JSON.stringify(data) };

  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
