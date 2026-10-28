// GET /api/stock  → { inStock: true | false | null }
// null means we couldn't check, so the site shows Checkout as normal.
import { inStock } from '../lib/services.js';
import { handler, json } from '../lib/util.js';

export default handler(['GET'], async (req, res) => {
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
  json(res, 200, { inStock: await inStock() });
});
