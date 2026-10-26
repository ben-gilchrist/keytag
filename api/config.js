// Public settings the browser needs. Only safe-to-share values go here.
import { env, textsEnabled } from '../lib/services.js';
import { handler, json } from '../lib/util.js';

export default handler(['GET'], async (req, res) => {
  json(res, 200, {
    supabaseUrl: env('SUPABASE_URL'),
    supabaseAnonKey: env('SUPABASE_ANON_KEY'),
    // e.g. https://shop.keytag.club/cart/44871234567890:{QTY}
    checkoutUrl: process.env.SHOP_CHECKOUT_URL || null,
    // Finder ↔ owner texting switches on once the Twilio number is set up.
    textsEnabled: textsEnabled()
  });
});
