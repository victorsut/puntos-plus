// api/v1/stations.js — catálogo de estaciones (F7a, PROPER).
//
// GET /api/v1/stations
// Solo REFERENCIA: la estación viaja con cada factura
// (`operator.station` = código de estación de PROPER, mapeado en
// stations.external_code). Sirve para cotejar ese mapeo — el POS no
// necesita configurar nada por dispositivo.
import { authenticate, json, cors, statusFor, messageFor, sbAdmin } from '../_lib/apiAuth.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    return json(res, 405, { error: 'method_not_allowed', message: 'Usá GET' });
  }

  const auth = await authenticate(req, 'purchases:write');
  if (auth.error) {
    return json(res, statusFor(auth.error), { error: auth.error, message: messageFor(auth.error) });
  }

  const { data, error } = await sbAdmin
    .from('stations')
    .select('id, name, address, active')
    .eq('active', true)
    .order('name');

  if (error) {
    console.error('[API:stations]', error.message);
    return json(res, 500, { error: 'server_error', message: messageFor('server_error') });
  }
  return json(res, 200, { ok: true, stations: data || [] });
}
