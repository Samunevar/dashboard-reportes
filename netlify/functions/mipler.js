exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  try {
    const { shareUrl, dateFrom, dateTo } = JSON.parse(event.body);
    if (!shareUrl) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Falta la URL de Mipler' }) };

    // La URL de Mipler ya es pública — llamarla directamente sin filtros de fecha
    // Los filtros de fecha se aplican en el cliente
    const resp = await fetch(shareUrl);
    if (!resp.ok) {
      const text = await resp.text();
      return { statusCode: resp.status, headers, body: JSON.stringify({ error: `Mipler ${resp.status}: ${text.slice(0,200)}` }) };
    }

    const data = await resp.json();
    return { statusCode: 200, headers, body: JSON.stringify(data) };

  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
