/* Privacy policy and terms. Edit the COMPANY details before launch. */
const COMPANY = {
  name: '[Company name] Ltd',            // TODO: legal name of the business that runs Keytag
  number: '[company number]',            // TODO: Companies House number
  address: '[registered address]',       // TODO
  ico: '[ICO registration number]',      // TODO: after paying the ICO data protection fee
  email: 'hello@keytag.co.uk',
  updated: '24 October 2026'
};

const legalPage = (tone, title, intro, body) => `
  ${head(tone, [`Updated ${COMPANY.updated}`], title, intro)}
  <article class="card legal">${body}</article>`;

Object.assign(views, {
  privacy(){ return legalPage('sky', 'Privacy policy', 'We keep as little as possible: your name, email and mobile. Finders never see your details.', `
    <h2>Who we are</h2>
    <p>Keytag is run by ${COMPANY.name} (company number ${COMPANY.number}), ${COMPANY.address}. We are the data controller for the personal information described here. Our ICO registration number is ${COMPANY.ico}. Contact us at <b>${COMPANY.email}</b>.</p>

    <h2>What we collect</h2>
    <h3>If you own a Keytag</h3>
    <ul>
      <li><b>Name, email and mobile number</b>, so we can tell you when your keys are found.</li>
      <li><b>Your tags</b>: which tag codes are linked to your account and when you set them up.</li>
      <li><b>Messages from finders</b> about your keys, and your replies sent through Keytag.</li>
    </ul>
    <h3>If you find someone's keys</h3>
    <ul>
      <li><b>Your message</b> to the owner.</li>
      <li><b>Your mobile number</b>, only if you choose “Let the owner contact me”. We use it to pass replies between you and the owner. The owner never sees it.</li>
    </ul>
    <h3>Everyone</h3>
    <ul>
      <li><b>Scans</b>: when a tag is scanned or its code is typed in, we record the tag and the time. We don't record your location.</li>
      <li><b>Abuse protection</b>: to stop people trying codes at random, we keep a scrambled (one-way) version of your IP address for 24 hours, then delete it.</li>
      <li><b>Launch list</b>: your email, if you sign up for news.</li>
      <li><b>Orders</b> are handled by our shop provider, Shopify, which processes payment and delivery details under its own privacy policy. We never see your card details.</li>
    </ul>
    <p>We don't use advertising cookies or tracking on this site. We store your login in your browser so you stay signed in. This is essential for the site to work.</p>

    <h2>How we use it</h2>
    <table class="legal-table">
      <tr><th>What</th><th>Why</th><th>Legal basis</th></tr>
      <tr><td>Owner details</td><td>To run the service you signed up for: alerting you when your keys are found</td><td>Contract</td></tr>
      <tr><td>Finder message and number</td><td>To get the keys back to their owner and relay replies</td><td>Legitimate interests</td></tr>
      <tr><td>Scan records</td><td>To run the service, prevent misuse and improve it</td><td>Legitimate interests</td></tr>
      <tr><td>Launch list email</td><td>To send you Keytag news</td><td>Consent (unsubscribe any time)</td></tr>
    </table>
    <p>We never sell your information or use it for anyone else's marketing.</p>

    <h2>Who we share it with</h2>
    <p>Only the services that run Keytag for us, under contracts that require them to protect it:</p>
    <ul>
      <li><b>Supabase</b>: our database and login (stored in the UK/EU).</li>
      <li><b>Twilio</b>: sends and receives the text messages.</li>
      <li><b>Resend</b>: sends our emails.</li>
      <li><b>Vercel</b>: hosts the website.</li>
      <li><b>Shopify</b>: runs our shop and orders.</li>
    </ul>
    <p>Some of these companies are based in the US. Where information leaves the UK, it is protected by the UK's approved safeguards, such as the International Data Transfer Addendum or the UK–US data bridge. We may also share information if the law requires it.</p>

    <h2>How long we keep it</h2>
    <ul>
      <li><b>Account details</b>: until you delete your account.</li>
      <li><b>Finder messages and finder numbers</b>: 90 days, then deleted automatically.</li>
      <li><b>Scan records</b>: 12 months.</li>
      <li><b>Launch list</b>: until you unsubscribe.</li>
    </ul>

    <h2>Your rights</h2>
    <p>You can ask to see, correct or delete your information, object to how we use it, restrict it, or get a copy to take elsewhere. Owners can change their details or delete their account at any time from <button class="link" data-go="account">your account</button>. For anything else, email ${COMPANY.email}. We'll reply within one month.</p>
    <p>If you're unhappy with how we've handled your information, you can complain to the Information Commissioner's Office at ico.org.uk. We'd appreciate the chance to put it right first.</p>

    <h2>Age</h2>
    <p>You must be 16 or over to set up a Keytag account. Anyone can tell an owner they've found their keys.</p>

    <h2>Changes</h2>
    <p>If we change this policy, we'll update the date at the top. If the change is significant, we'll email owners.</p>`); },

  terms(){ return legalPage('sun', 'Terms', 'The short version: pay once, no subscription. We do our best to get your keys home, but we can’t promise every finder will scan.', `
    <h2>About these terms</h2>
    <p>These terms cover buying Keytags and using the Keytag service at keytag.co.uk. Keytag is run by ${COMPANY.name} (company number ${COMPANY.number}), ${COMPANY.address}. Contact us at <b>${COMPANY.email}</b>.</p>

    <h2>What you get</h2>
    <ul>
      <li>A physical tag with a unique code and QR code.</li>
      <li>The Keytag service: when someone finds your keys and scans the tag, we pass their message to you by text and email. If they leave a number, you can reply through Keytag, and neither of you sees the other's number.</li>
      <li>No subscription. The price you pay at checkout covers the tag and the service.</li>
    </ul>

    <h2>How long the service runs</h2>
    <p>We intend to run the service for as long as Keytag operates. If we ever have to close it, we'll give owners at least 6 months' notice by email.</p>

    <h2>What we can't promise</h2>
    <p>Keytag helps lost keys get home, but it depends on someone finding them and choosing to scan the tag. We can't guarantee your keys will be returned, or how quickly. We also rely on phone networks and email providers to deliver messages. Please keep your mobile number up to date in your account.</p>

    <h2>Buying</h2>
    <ul>
      <li>Prices are shown at checkout and include VAT where it applies. Delivery to the UK is free.</li>
      <li>We currently deliver to the UK and selected European countries. We don't deliver to Asia or South America.</li>
      <li>Orders are processed by Shopify. Your contract for the purchase is with us.</li>
    </ul>

    <h2>Returns and refunds</h2>
    <ul>
      <li><b>Change of mind:</b> you can cancel within 14 days of receiving your order for a full refund. Return the tags unused and not set up. Email ${COMPANY.email} to start a return.</li>
      <li><b>Faulty tags:</b> if a tag is faulty or doesn't scan, contact us and we'll replace or refund it. This doesn't affect your legal rights under the Consumer Rights Act 2015.</li>
    </ul>

    <h2>Using Keytag fairly</h2>
    <p>Don't use Keytag to harass, threaten or spam anyone, to send anything unlawful, or to try to discover someone's personal details. We limit how many messages can be sent, and we may block numbers or close accounts that misuse the service.</p>

    <h2>Your account</h2>
    <p>Keep your email and mobile number up to date, and don't share your login links. A tag belongs to whoever set it up. You can gift a tag to someone else or remove it from your account at any time. You must be 16 or over to set up an account.</p>

    <h2>Our responsibility to you</h2>
    <p>We're responsible for loss or damage you suffer that is a foreseeable result of us breaking these terms or not using reasonable care. We're not responsible for losses we couldn't have foreseen, or for the cost of replacing lost keys, locks or vehicles. Nothing in these terms limits our liability where it would be unlawful to do so, including for death or personal injury caused by our negligence, or fraud.</p>

    <h2>Changes and law</h2>
    <p>We may update these terms. We'll change the date at the top and, for significant changes, email owners. These terms are governed by the law of England and Wales. If you live elsewhere in the UK, you can also bring proceedings in your local courts.</p>`); }
});
