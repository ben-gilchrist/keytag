/* Keytag site: talks to the /api server functions and Supabase login.
   Helpers marked HELPERS are copied in from the design prototype at build time. */

/* ---------- state ---------- */
const db = { qty: 1 };            // quantity picker (name kept from the prototype's pricing helpers)
function save(){}                 // pricing helpers call save(); nothing to persist here
const state = { flash: null, pending: null };
let CONFIG = null, sb = null, session = null;

/*__HELPERS__*/

/* ---------- small helpers ---------- */
const $ = id => document.getElementById(id);
const norm = c => (c||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6);
const fmtCode = c => c ? `${c.slice(0,3)}-${c.slice(3)}` : '';
const when = iso => new Date(iso).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
const looksLikeMobile = s => /^(\+?44\s?7|07|\+[1-9])[\d\s()-]{8,}$/.test(String(s).trim());

async function api(path, { method='GET', body } = {}){
  const headers = { 'Content-Type':'application/json' };
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
  const r = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = {}; try { data = await r.json(); } catch(e) {}
  if (!r.ok) { const err = new Error(data.error || 'Something went wrong. Please try again.'); err.status = r.status; throw err; }
  return data;
}
function showErr(id, msg){ const el=$(id); if(!el) return; el.textContent = msg; el.hidden = !msg; }
async function busy(btn, label, fn){
  const old = btn?.textContent; if(btn){ btn.disabled = true; btn.textContent = label; }
  try { return await fn(); } finally { if(btn && document.body.contains(btn)){ btn.disabled = false; btn.textContent = old; } }
}
const site = () => location.origin;
const texts = () => CONFIG?.textsEnabled !== false;   // off until the Twilio number is live

/* ---------- views ---------- */
const app = $('app');

const views = {
  home(){ return `
    <section class="block bleed hero-photo">
      <picture class="hero-img">
        <source media="(max-width: 899px)" srcset="/assets/hero-mobile.webp" type="image/webp">
        <source media="(max-width: 899px)" srcset="/assets/hero-mobile.jpg">
        <source srcset="/assets/hero.webp" type="image/webp">
        <img src="/assets/hero.jpg" alt="A Keytag with a QR code on a keyring with car and house keys" width="2400" height="1200" fetchpriority="high">
      </picture>
      <div class="in hero-grid">
        <div class="stack hero-copy">
          <h1>The keyring that helps lost keys get home.</h1>
          <p class="lede">Lose your keys. Get a text when someone finds them.</p>
          <div class="row" style="gap:10px"><button class="btn" data-go="buy">Shop Keytag · from £10</button><button class="btn ghost hero-ghost" data-go="enter" data-arg="found">Found some keys?</button></div>
        </div>
      </div>
    </section>
    <div class="wrap section">
    <section class="card how">
      <h2>How it works</h2>
      <ol class="how-steps">
        <li><div class="how-art" aria-hidden="true">${ART.clip}</div><span class="how-n" aria-hidden="true">1</span><h3>Clip it on</h3><p class="muted">Put the tag on your keyring.</p></li>
        <li><div class="how-art" aria-hidden="true">${ART.scan}</div><span class="how-n" aria-hidden="true">2</span><h3>Add your number</h3><p class="muted">Scan it once with your phone camera and add your contact details.</p></li>
        <li><div class="how-art" aria-hidden="true">${ART.text}</div><span class="how-n" aria-hidden="true">3</span><h3>Get a text</h3><p class="muted">If your keys are lost, the finder scans the tag and you hear where they are.</p></li>
      </ol>
      <div class="panel priv-strip">
        <span class="shield" aria-hidden="true"></span>
        <h3>Your number stays private</h3>
        <p class="muted">Your data is safe. You will be contacted by Keytag.</p>
      </div>
    </section>
    </div>
    <div class="wrap section">
    <ul class="perks" aria-label="Why Keytag">
      <li><span class="perk-dot b-sun" aria-hidden="true">${ICON.battery}</span><h3>No battery</h3><p class="muted">Nothing to charge or run out</p></li>
      <li><span class="perk-dot b-violet" aria-hidden="true">${ICON.app}</span><h3>No app</h3><p class="muted">Any camera phone can scan it</p></li>
      <li><span class="perk-dot b-coral" aria-hidden="true">${ICON.sub}</span><h3>No subscription</h3><p class="muted">Pay once, keep it for life</p></li>
    </ul>
    </div>
    <div class="wrap section">
    <section class="card packs-sec">
      <div class="sec-head"><h2>The more you buy, the less you pay</h2><p class="muted">The price per tag drops as you add more. Pay once, free UK delivery, no subscription.</p></div>
      ${pricing(qty())}
    </section>
    </div>
    <div class="wrap section">
    <div class="doors">
      <button class="door b-sky" data-go="enter" data-arg="found"><span class="disp">Found keys?</span><span class="small muted">Tell the owner</span></button>
      <button class="door b-sun" data-go="register"><span class="disp">Register Keytag</span><span class="small muted">Got a new tag? Set it up</span></button>
    </div>
    </div>
    <section class="block bleed b-violet signup">
      <div class="in signup-grid">
        <div class="stack" style="gap:10px"><h2>Be first in line</h2><p class="lede">Hear first about new Keytag products, colours and launches. No spam.</p></div>
        <form id="signupForm" class="signup-form">
          <label for="suEmail" class="sr">Email</label>
          <input id="suEmail" type="email" required autocomplete="email" placeholder="Your email">
          <button class="btn" type="submit">Sign up</button>
          <p id="suOk" class="small" hidden>Thanks. You're on the list.</p>
        </form>
      </div>
    </section>`; },

  enter(mode){ if (mode !== 'found') return views.register(); return `
    ${head('coral',[],'Found some keys?','Scan the tag with your phone camera, or type the code on the back.')}
    <form id="codeForm" class="card">
      <label for="codeIn">Code on the tag<input id="codeIn" class="code" placeholder="e.g. 7H4-Q9M" autocomplete="off" autocapitalize="characters" required></label>
      <p id="codeErr" class="err" hidden></p>
      <button class="btn" type="submit">Continue</button>
    </form>`; },

  buy(){ return `
    ${head('sun',[],'Get your Keytags','The more you buy, the less you pay. Pay once, free UK delivery, no subscription.')}
    <section class="card compact">${pricing(qty())}</section>`; },

  checkoutSoon(){ return `
    ${head('sun',['Checkout'],'Opening soon','Our shop isn’t open just yet. Leave your email and we’ll tell you the moment it is.')}
    <form id="signupForm" class="card">
      <label for="suEmail">Email<input id="suEmail" type="email" required autocomplete="email"></label>
      <button class="btn" type="submit">Tell me when it opens</button>
      <p id="suOk" class="ok" hidden>Thanks. You're on the list.</p>
    </form>`; },

  unknownTag(code){ return `
    ${head('sun',[],'We can’t find that tag',`Check the code on the back of the tag${code?` (you entered ${esc(fmtCode(code))})`:''}. It’s 6 letters and numbers.`)}
    <div class="doors"><button class="door b-sky" data-go="enter" data-arg="found"><span class="disp">Try again</span><span class="small muted">Found keys</span></button><button class="door b-sun" data-go="register"><span class="disp">Register Keytag</span><span class="small muted">New tag</span></button></div>`; },

  newTag(code){ return `
    <section class="block b-sky">
      ${tagArt(fmtCode(code))}
      <h1 class="center">This Keytag isn't registered yet</h1>
      <div class="stack" style="gap:6px">
        <button class="btn" data-go="register" data-arg="${esc(code)}">It's mine, register it</button>
        <button class="btn ghost" data-go="unregFound" data-arg="${esc(code)}">I found these keys</button>
      </div>
    </section>`; },

  unregFound(code){ return `
    ${head('sun',[`Tag ${esc(fmtCode(code))}`],'The owner hasn’t registered this tag yet','So we can’t contact them. Thanks for trying.')}
    <section class="card">
      <h3>Best options</h3>
      <ol class="steps">
        <li><div><b>Hand them in where you found them</b><p class="muted">A shop, bar or station desk.</p></div></li>
        <li><div><b>Or take them to a police station</b><p class="muted">Your nearest front desk.</p></div></li>
      </ol>
    </section>`; },

  /* Register: step 1 = code, step 2 = email + mobile (code already checked) */
  register(code){
    if (!code) return `
    ${head('violet',[],'Register your Keytag','Enter the code on the back of your tag.')}
    <form id="regCode" class="card">
      <label for="rCode">Code on the tag<input id="rCode" class="code" placeholder="e.g. 7H4-Q9M" autocomplete="off" autocapitalize="characters" required></label>
      <p id="rCodeErr" class="err" hidden></p>
      <button class="btn" type="submit">Continue</button>
    </form>`;
    return `
    ${head('violet',[`Tag ${esc(fmtCode(code))}`],'Register your Keytag','Where should we text you if your keys are found?')}
    <form id="regForm" class="card" data-code="${esc(code)}">
      <label for="rEmail">Email<input id="rEmail" type="email" required autocomplete="email"></label>
      <label for="rPhone">Mobile number<input id="rPhone" type="tel" required autocomplete="tel" inputmode="tel" placeholder="07..."></label>
      <label for="rLabel"><span>Which keys? <span class="muted">(optional)</span></span><input id="rLabel" maxlength="30" placeholder="e.g. House, Car, Bike"></label>
      <p class="muted small">Finders never see your number or email. By registering you agree to our <button class="link" type="button" data-go="terms">terms</button> and <button class="link" type="button" data-go="privacy">privacy policy</button>.</p>
      <p id="regErr" class="err" hidden></p>
      <button class="btn" type="submit">Save</button>
    </form>`; },

  verify(){ const v = state.verify || {}; return `
    ${head('violet',[`Tag ${esc(fmtCode(v.code||''))}`], v.phoneSent ? 'Check your email and phone' : 'Check your email',
      `We’ve sent a 6-digit code to ${esc(v.email||'your email')}${v.phoneSent ? ` and texted one to ${esc(v.phone)}` : ''}.`)}
    <form id="verifyForm" class="card">
      <label for="vEmail">Code from your email<input id="vEmail" class="code otp" inputmode="numeric" autocomplete="one-time-code" maxlength="7" placeholder="123456" required></label>
      ${v.phoneSent ? '<label for="vPhone">Code from your text<input id="vPhone" class="code otp" inputmode="numeric" autocomplete="one-time-code" maxlength="7" placeholder="123456" required></label>' : ''}
      <p id="verifyErr" class="err" hidden></p>
      <button class="btn" type="submit">Confirm</button>
      <p class="muted small">Codes expire after 15 minutes. Not arrived? Check spam, or <button class="link" type="button" id="resendCodes">send new codes</button>.</p>
      <p id="resentCodes" class="ok" hidden>New codes sent</p>
    </form>`; },

  phoneCode(){ const v = state.verify || {}; return `
    ${head('violet',[],'Confirm your new number',`We’ve texted a 6-digit code to ${esc(v.phone||'your new number')}.`)}
    <form id="phoneCodeForm" class="card">
      <label for="pcCode">Code from your text<input id="pcCode" class="code otp" inputmode="numeric" autocomplete="one-time-code" maxlength="7" placeholder="123456" required></label>
      <p id="pcErr" class="err" hidden></p>
      <button class="btn" type="submit">Confirm</button>
      <button class="btn ghost" type="button" data-go="account">Cancel</button>
    </form>`; },

  registered(r){ return `
    ${head('lime',[`Tag ${esc(fmtCode(r.code))}`], r.existing ? 'Added to your account' : 'Your Keytag is registered',
      r.existing ? `This email already had a Keytag account, so we’ve added the tag to it and kept your number, ${esc(r.phone)}.`
                 : `If someone finds your keys, we’ll text ${esc(r.phone)}.`)}
    <section class="card">
      <p class="muted">We’ve emailed you a link to change your details or add more tags any time. No password needed.</p>
      <div class="row" style="gap:10px"><button class="btn" data-go="register">Register another tag</button><button class="btn ghost" data-go="home">Done</button></div>
    </section>`; },

  taken(code){ return `
    ${head('sun',[`Tag ${esc(fmtCode(code))}`],'This Keytag is already registered','If it’s yours, enter your email and we’ll send you a link to edit your details.')}
    <form id="takenForm" class="card">
      <label for="tEmail">Email<input id="tEmail" type="email" required autocomplete="email"></label>
      <p id="takenMsg" class="ok" hidden>If that email matches this Keytag, we’ve sent a link. Check your inbox.</p>
      <button class="btn" type="submit">Send me a link</button>
      <p class="muted small">Found these keys? <button class="link" type="button" data-scan="${esc(code)}">Tell the owner</button>.</p>
    </form>`; },

  linkSent(){ const p = state.pending || {}; return `
    ${head('lime',[],'Check your email',`Tap the link we sent to ${esc(p.email||'your email')} to log in.`)}
    <section class="card">
      <p class="muted">Open the email on any device. The link works once and expires after an hour.</p>
      <p class="muted small">Not there? Check spam or <button class="link" id="resend">send it again</button>.</p>
      <p id="resent" class="ok" hidden>Sent again</p>
      <p id="resendErr" class="err" hidden></p>
    </section>`; },

  login(){ return `
    ${head('sky',[],'Log in','We’ll email you a link. No password needed.')}
    <form id="loginForm" class="card">
      <label for="lEmail">Email<input id="lEmail" type="email" required autocomplete="email"></label>
      <p id="loginErr" class="err" hidden></p>
      <button class="btn" type="submit">Send link</button>
      <p class="muted small">New Keytag? <button class="link" type="button" data-go="register">Register it</button>.</p>
    </form>`; },

  claiming(){ return `${head('lime',[],'Adding your tag…','One moment.')}`; },

  needDetails(){ return `
    ${head('violet',[],'Nearly done','Where should we text you if your keys are found?')}
    <form id="detailsNeeded" class="card">
      <label for="nPhone">Mobile number<input id="nPhone" type="tel" required autocomplete="tel" inputmode="tel" placeholder="07..."></label>
      <p id="needErr" class="err" hidden></p>
      <button class="btn" type="submit">Save</button>
    </form>`; },

  problem(msg){ return `
    ${head('coral',[],'That didn’t work', esc(msg))}
    <div class="row" style="gap:10px"><button class="btn" data-go="account">Go to my tags</button><button class="btn ghost" data-go="home">Home</button></div>`; },

  addTag(code){ return `
    <section class="block b-sky">
      ${tagArt(fmtCode(code))}
      <h1 class="center">Add this Keytag to your account?</h1>
      <form id="addOne" class="stack" style="gap:8px" data-code="${esc(code)}">
        <label for="aLabel"><span>Which keys? <span class="muted">(optional)</span></span><input id="aLabel" maxlength="30" placeholder="e.g. House, Car, Bike"></label>
        <button class="btn" type="submit">Add ${esc(fmtCode(code))}</button>
        <button class="btn ghost" type="button" data-go="unregFound" data-arg="${esc(code)}">It's not mine, I found it</button>
      </form>
    </section>`; },

  rename(code){ return `
    ${head('sky',[`Tag ${esc(fmtCode(code))}`],'Name this tag','So you know which keys a message is about.')}
    <form id="renameForm" class="card" data-code="${esc(code)}">
      <label for="nLabel">Which keys?<input id="nLabel" maxlength="30" placeholder="e.g. House, Car, Bike" required></label>
      <p id="renameErr" class="err" hidden></p>
      <button class="btn" type="submit">Save</button>
      <button class="btn ghost" type="button" data-go="account">Cancel</button>
    </form>`; },

  yourTag(r){ return `
    ${head('lime',[],'Your tag works',`If someone finds your keys, you'll get a text at ${esc(r.phone||'your mobile')}. We've emailed you an example.`)}
    <button class="btn" data-go="account">Done</button>`; },

  finder(code){ return `
    <section class="block b-coral">
      <h1>You found someone's keys</h1>
      <p class="lede">Tell the owner where they are. They'll ${texts() ? 'get a text' : 'hear from us'} straight away.</p>
    </section>
    <form id="findForm" class="card" data-code="${esc(code)}">
      <div class="choices" role="group" aria-label="Quick answers">
        <button type="button" class="choice" data-chip="I've handed them in at ">Handed them in</button>
        ${texts() ? '<button type="button" class="choice" data-chip="I still have them. Text me to arrange getting them back." data-keep="1">I still have them</button>' : ''}
      </div>
      <label for="fMsg">Where are they?<textarea id="fMsg" required maxlength="160" placeholder="Behind the counter at the café on Old Street"></textarea></label>
      <p id="fCount" class="muted" style="font-size:12px;text-align:right;margin-top:-10px">0 / 160</p>
      <div class="contact-opt"${texts() ? '' : ' hidden'}>
        <label class="switch-row" for="fAllow">
          <input type="checkbox" id="fAllow">
          <span class="switch" aria-hidden="true"></span>
          <span class="switch-text"><b>Let the owner contact me</b><span class="small muted" id="allowHint">They can text you back through Keytag. They never see your number.</span></span>
        </label>
        <div id="phoneWrap" hidden>
          <label for="fPhone">Your mobile<input id="fPhone" type="tel" autocomplete="tel" inputmode="tel" placeholder="07..."></label>
        </div>
      </div>
      <p id="findErr" class="err" hidden></p>
      <button class="btn" type="submit">Send</button>
    </form>
    <p class="muted small center">Your tag? <button class="link" data-go="login">Log in to test it</button></p>`; },

  sent(canReply){ return `
    ${head('lime',[],'Sent. Thank you!', canReply ? 'If the owner replies, you’ll get a text from Keytag.' : 'The owner has your message. That’s all you need to do.')}
    <button class="door" data-go="buy" style="flex-direction:row;justify-content:space-between;align-items:center;width:100%"><span class="disp">Want one for your keys?</span><span class="small muted">From £10 →</span></button>`; },

  async dashboard(){
    if (!session) return views.login();
    let d;
    try { d = await api('/api/me'); } catch(e){ if(e.status===401){ session=null; return views.login(); } return views.problem(e.message); }
    const flash = state.flash; state.flash = null;
    if (!d.owner) return `
      ${head('violet',[],'No tags yet',`You're logged in as ${esc(d.email)}. Scan your tag to set it up.`)}
      <button class="btn" data-go="register">Register a Keytag</button>`;
    const o = d.owner, tags = d.tags;
    return `
    ${head('violet',[], o.name ? `Hi ${esc(o.name.split(' ')[0])}` : 'Your Keytags', 'Your tags and the number we text if they’re found.')}
    ${flash ? `<p class="ok">${esc(flash)}</p>` : ''}
    <section class="card">
      <h2>Your tags</h2>
      <div class="tagrows">
      ${tags.length ? tags.map(t=>`
        <div class="tagrow">
          <span class="stack" style="gap:2px"><span class="disp">${esc(t.label || fmtCode(t.code))}</span>${t.label ? `<span class="small muted code">${esc(fmtCode(t.code))}</span>` : ''}</span>
          <span class="row" style="gap:6px">
            <button class="btn sm" data-scan="${esc(t.code)}">Test</button>
            <details class="more"><summary class="btn ghost sm">More</summary>
              <div class="menu"><button data-go="rename" data-arg="${esc(t.code)}">${t.label ? 'Rename' : 'Name it'}</button><button data-go="gift" data-arg="${esc(t.code)}">Gift to someone</button><button data-go="remove" data-arg="${esc(t.code)}">Remove</button></div>
            </details>
          </span>
        </div>`).join('') : '<p class="muted">No tags on your account.</p>'}
      </div>
      <form id="addForm" class="stack" style="gap:8px">
        <span class="label">Add a tag</span>
        <div class="row" style="gap:8px;align-items:flex-end">
          <label for="aCode" style="flex:1 1 120px">Code<input id="aCode" class="code" placeholder="On the tag" autocomplete="off" autocapitalize="characters"></label>
          <label for="aLabel2" style="flex:1 1 120px"><span>Which keys? <span class="muted">(optional)</span></span><input id="aLabel2" maxlength="30" placeholder="e.g. Car"></label>
          <button class="btn" type="submit">Add</button>
        </div>
        <p id="addErr" class="err" hidden></p>
      </form>
    </section>
    <section class="card">
      <h2>Messages from finders</h2>
      ${d.conversations.length ? `<div class="msgs">${d.conversations.map(c=>`
        <div class="msg">
          <div class="row split"><span class="label">${esc(fmtCode(c.code))} · ${esc(when(c.at))}</span>${c.canReply?'<span class="pill on">Can reply</span>':''}</div>
          ${c.messages.map(m=>`<p${m.direction==='owner_to_finder'?' class="muted"':''}>${m.direction==='owner_to_finder'?'You: ':''}“${esc(m.body)}”</p>`).join('')}
          ${c.canReply?'<p class="small muted">Reply to the text from Keytag to message them. Your number stays hidden.</p>':''}
        </div>`).join('')}</div>`
        : '<p class="muted">No messages yet. If someone finds your keys, their message appears here and by text.</p>'}
    </section>
    <form id="detailsForm" class="card">
      <h2>Your details</h2>
      <label for="dName"><span>Name <span class="muted">(optional)</span></span><input id="dName" value="${esc(o.name||'')}" maxlength="80"></label>
      <label for="dPhone">Mobile number<input id="dPhone" type="tel" value="${esc(o.phone)}" required></label>
      <label for="dEmail">Email<input id="dEmail" value="${esc(o.email)}" disabled></label>
      <p id="savedMsg" class="ok" hidden>Saved</p>
      <p id="detailsErr" class="err" hidden></p>
      <button class="btn" type="submit">Save</button>
    </form>
    <div class="row split" style="padding-inline:6px">
      <button class="link small" id="logout">Log out</button>
      <button class="link small muted" data-go="deleteAcct">Delete my account</button>
    </div>`; },

  gift(code){ return `
    ${head('coral',['Gift',esc(fmtCode(code))],'Give this tag to someone','We’ll email them a link to set it up with their own details. Your details are removed from this tag straight away.')}
    <form id="giftForm" class="card" data-code="${esc(code)}">
      <label for="gName">Their name<input id="gName" required maxlength="80"></label>
      <label for="gEmail">Their email<input id="gEmail" type="email" required></label>
      <p id="giftErr" class="err" hidden></p>
      <button class="btn" type="submit">Send gift</button>
      <button class="btn ghost" type="button" data-go="account">Cancel</button>
    </form>`; },

  remove(code){ return `
    <section class="card">
      <h2>Remove ${esc(fmtCode(code))}?</h2>
      <p class="muted">Use this if you've lost the tag itself or don't use it any more. Anyone who scans it afterwards won't be able to reach you.</p>
      <p id="removeErr" class="err" hidden></p>
      <button class="btn danger" id="confirmRemove" data-code="${esc(code)}">Remove tag</button>
      <button class="btn ghost" data-go="account">Keep it</button>
    </section>`; },

  deleteAcct(){ return `
    <section class="card">
      <h2>Delete your account?</h2>
      <p class="muted">We'll delete your name, email and phone number. Your tags will stop working until someone sets them up again.</p>
      <p id="delErr" class="err" hidden></p>
      <button class="btn danger" id="confirmDelete">Delete account</button>
      <button class="btn ghost" data-go="account">Cancel</button>
    </section>`; },

  async admin(){
    if (!session) return views.login();
    let d;
    try { d = await api('/api/admin'); } catch(e){ return views.problem(e.message); }
    const kindName = {finder:'Finder page',owner_test:'Owner test',setup:'Set-up'};
    return `
    <section class="panel">
      <span class="chip-tag" style="background:var(--on-panel);color:var(--panel)">Keytag admin</span>
      <h1>Activity</h1>
      <div class="tiles">
        <div class="tile"><span class="label">Active tags</span><b>${d.stats.tagsActive}</b></div>
        <div class="tile"><span class="label">Scans this week</span><b>${d.stats.scansWeek}</b></div>
        <div class="tile"><span class="label">Finds this week</span><b>${d.stats.convsWeek}</b></div>
      </div>
      <p class="muted small">${d.stats.tagsTotal} tags made in total.</p>
    </section>
    <section class="card"><h2>Recent scans</h2>
      ${d.scans.length ? `<div class="tablebox"><table><tr><th>When</th><th>Tag</th><th>Result</th></tr>${d.scans.map(s=>`<tr><td>${esc(when(s.scanned_at))}</td><td class="code">${esc(s.tag_code)}</td><td><span class="pill ${s.kind==='finder'?'on':''}">${kindName[s.kind]||esc(s.kind)}</span></td></tr>`).join('')}</table></div>` : '<p class="muted">No scans yet.</p>'}
    </section>
    <section class="card"><h2>Finds</h2>
      ${d.conversations.length ? d.conversations.map(c=>`<div class="msg"><div class="row split"><span class="label">${esc(c.code)} · ${esc(c.owner||'No owner')} · ${esc(when(c.at))}</span>${c.canReply?'<span class="pill on">Finder left number</span>':''}</div>${c.messages.map(m=>`<p class="small">${m.direction==='owner_to_finder'?'Owner':'Finder'}: “${esc(m.body)}”</p>`).join('')}</div>`).join('') : '<p class="muted">No finds yet.</p>'}
    </section>
    <section class="card"><h2>Tags</h2>
      <div class="tablebox"><table><tr><th>Code</th><th>Batch</th><th>Owner</th><th>Status</th></tr>${d.tags.map(t=>`<tr><td class="code">${esc(t.code)}</td><td>${esc(t.batch||'')}</td><td>${esc(t.owner||'—')}</td><td>${t.owner?'<span class="pill on">Active</span>':t.giftPending?'<span class="pill warn">Gift sent</span>':'<span class="pill">Not set up</span>'}</td></tr>`).join('')}</table></div>
    </section>`; }
};

/*__LEGAL__*/

/* ---------- routing ---------- */
const PATHS = { register:'/register', home:'/', buy:'/shop', login:'/login', dashboard:'/account', admin:'/admin', privacy:'/privacy', terms:'/terms' };
let current = { view:'home' };

async function go(view, arg, { push = true } = {}){
  if (view === 'account') view = session ? 'dashboard' : 'login';
  current = { view, arg };
  const path = view === 'enter' ? (arg === 'found' ? '/found' : '/setup') : PATHS[view];
  if (push && path && location.pathname !== path) history.pushState({ view, arg }, '', path);
  const out = views[view](arg);
  if (out instanceof Promise) app.innerHTML = '<div class="wrap"><div class="view page"><section class="card"><p class="muted">Loading…</p></section></div></div>';
  const html = await out;
  if (current.view !== view || current.arg !== arg) return;   // user moved on while loading
  app.innerHTML = view === 'home'
    ? '<div class="view home">' + html + '</div>'
    : '<div class="wrap"><div class="view page">' + html + '</div></div>';
  $('accountBtn').textContent = session ? 'My tags' : 'Log in';
  window.scrollTo(0, 0);
  bind();
}

async function scanFlow(rawCode){
  const code = norm(rawCode);
  if (code.length !== 6) return go('unknownTag', code);
  let r;
  try { r = await api(`/api/scan?code=${code}`); } catch(e){ return go('problem', e.message); }
  if (r.status === 'unknown') return go('unknownTag', code);
  if (r.status === 'registered') return go('finder', code);
  if (r.status === 'yours') return go('yourTag', r);
  return go(session ? 'addTag' : 'newTag', code);
}

/* Register step 1: check the code, then show the details form (or the right message). */
async function registerCode(rawCode, errId){
  const code = norm(rawCode);
  if (code.length !== 6) { if (errId) return showErr(errId, 'Codes are 6 letters and numbers, like 7H4-Q9M.'); return go('register'); }
  let r;
  try { r = await api(`/api/scan?code=${code}`); } catch(e){ if (errId) return showErr(errId, e.message); return go('problem', e.message); }
  if (r.status === 'unknown') { if (errId) return showErr(errId, 'Code not found. Check the code on the back of your tag.'); return go('unknownTag', code); }
  if (r.status === 'yours') return go('yourTag', r);
  if (r.status === 'registered') return go('taken', code);
  if (session) return go('addTag', code);
  return go('register', code);
}

async function route({ push = false } = {}){
  const p = location.pathname;
  const t = p.match(/^\/t\/([A-Za-z0-9-]{6,7})(?:\/[A-Za-z0-9]*)?\/?$/i);
  if (t) return scanFlow(t[1]);
  const reg = p.match(/^\/register(?:\/([A-Za-z0-9-]{6,7}))?\/?$/i);
  if (reg) return reg[1] ? registerCode(reg[1]) : go('register', null, { push });
  if (/^\/found\/?$/i.test(p)) return go('enter', 'found', { push });
  if (/^\/setup\/?$/i.test(p)) return go('register', null, { push });
  if (/^\/shop\/?$/i.test(p)) return go('buy', null, { push });
  if (/^\/login\/?$/i.test(p)) return go('login', null, { push });
  if (/^\/account\/?$/i.test(p)) return go('account', null, { push });
  if (/^\/admin\/?$/i.test(p)) return go('admin', null, { push });
  if (/^\/privacy\/?$/i.test(p)) return go('privacy', null, { push });
  if (/^\/terms\/?$/i.test(p)) return go('terms', null, { push });
  return go('home', null, { push });
}

/* Logged in: add a tag to your account. */
async function claimFlow(code, extra){
  code = norm(code);
  if (!session) return go('login');
  go('claiming');
  try {
    const r = await api('/api/claim', { method:'POST', body:{ code, ...(extra||{}) } });
    if (r.needDetails) { state.pending = { code, label: extra?.label }; return go('needDetails'); }
    state.flash = r.already ? `${fmtCode(code)} is already on your account.` : `${fmtCode(code)} is added. Tap Test to check it.`;
    history.replaceState({}, '', '/account');
    go('dashboard', null, { push:false });
  } catch(e){ go('problem', e.message); }
}

async function sendLink(email, redirectPath, data, createUser){
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: site() + redirectPath, data, shouldCreateUser: createUser } });
  if (error) {
    if (/signups not allowed|user not found/i.test(error.message)) throw new Error('No account uses that email. New Keytag? Register it first.');
    if (/rate|seconds/i.test(error.message)) throw new Error('Please wait a minute before asking for another link.');
    throw new Error(error.message);
  }
}

/* ---------- events ---------- */
function bind(){
  $('codeForm')?.addEventListener('submit', e=>{ e.preventDefault();
    const code = norm($('codeIn').value);
    if (code.length !== 6) return showErr('codeErr','Codes are 6 letters and numbers, like 7H4-Q9M.');
    scanFlow(code); });

  $('regCode')?.addEventListener('submit', async e=>{ e.preventDefault();
    await busy(e.submitter, 'Checking…', () => registerCode($('rCode').value, 'rCodeErr')); });

  $('signupForm')?.addEventListener('submit', async e=>{ e.preventDefault();
    const btn = e.target.querySelector('button'); await busy(btn, 'Signing up…', async ()=>{
      try { await api('/api/signup', { method:'POST', body:{ email: $('suEmail').value } }); $('suOk').hidden = false; btn.hidden = true; }
      catch(err){ $('suOk').hidden = false; $('suOk').textContent = err.message; } }); });

  $('regForm')?.addEventListener('submit', async e=>{ e.preventDefault();
    const code = e.target.dataset.code, email = $('rEmail').value.trim(), phone = $('rPhone').value.trim(), label = $('rLabel').value.trim();
    if (!looksLikeMobile(phone)) return showErr('regErr','Enter a mobile number we can text, like 07700 900123.');
    await busy(e.submitter, 'Saving…', async ()=>{
      try { const r = await api('/api/register', { method:'POST', body:{ code, email, phone, label } });
            state.verify = { ...r, code, label }; go('verify'); }
      catch(err){ if (err.status === 409) return go('taken', code); showErr('regErr', err.message); } }); });

  $('verifyForm')?.addEventListener('submit', async e=>{ e.preventDefault(); const v = state.verify;
    await busy(e.submitter, 'Checking…', async ()=>{
      try { const r = await api('/api/register', { method:'POST', body:{ id:v.id, emailCode:$('vEmail').value, phoneCode:$('vPhone')?.value } }); state.verify = null; go('registered', r); }
      catch(err){ if (err.status === 409) return go('taken', v.code); showErr('verifyErr', err.message); } }); });

  $('resendCodes')?.addEventListener('click', async e=>{ const v = state.verify;
    await busy(e.currentTarget, 'Sending…', async ()=>{
      try { const r = await api('/api/register', { method:'POST', body:{ code:v.code, email:v.email, phone:v.phone, label:v.label } });
            state.verify = { ...v, ...r }; $('resentCodes').hidden = false; showErr('verifyErr',''); }
      catch(err){ showErr('verifyErr', err.message); } }); });

  $('phoneCodeForm')?.addEventListener('submit', async e=>{ e.preventDefault();
    await busy(e.submitter, 'Checking…', async ()=>{
      try { await api('/api/me', { method:'PATCH', body:{ id:state.verify.id, phoneCode:$('pcCode').value } }); state.verify = null; state.flash = 'Number confirmed and saved.'; go('dashboard'); }
      catch(err){ showErr('pcErr', err.message); } }); });

  $('takenForm')?.addEventListener('submit', async e=>{ e.preventDefault();
    const email = $('tEmail').value.trim();
    await busy(e.submitter, 'Sending…', async ()=>{
      try { await sendLink(email, '/account', undefined, false); } catch(err){ if (/wait a minute/.test(err.message)) { $('takenMsg').textContent = err.message; } }
      $('takenMsg').hidden = false; }); });   // same message either way, so nobody can test whose email it is

  $('loginForm')?.addEventListener('submit', async e=>{ e.preventDefault();
    const email = $('lEmail').value.trim();
    await busy(e.submitter, 'Sending…', async ()=>{
      try { await sendLink(email, '/account', undefined, false); state.pending = { email, redirect:'/account' }; go('linkSent'); }
      catch(err){ showErr('loginErr', err.message); } }); });

  $('resend')?.addEventListener('click', async ()=>{ const p = state.pending;
    try { await sendLink(p.email, p.redirect || '/account', undefined, false); $('resent').hidden = false; showErr('resendErr',''); }
    catch(err){ showErr('resendErr', err.message); } });

  $('detailsNeeded')?.addEventListener('submit', e=>{ e.preventDefault();
    const phone = $('nPhone').value.trim();
    if (!looksLikeMobile(phone)) return showErr('needErr','Enter a mobile number we can text, like 07700 900123.');
    claimFlow(state.pending.code, { phone, label: state.pending.label }); });

  $('addOne')?.addEventListener('submit', e=>{ e.preventDefault(); claimFlow(e.target.dataset.code, { label: $('aLabel').value.trim() }); });

  $('renameForm')?.addEventListener('submit', async e=>{ e.preventDefault(); const code = e.target.dataset.code;
    await busy(e.submitter, 'Saving…', async ()=>{
      try { await api('/api/tag', { method:'POST', body:{ action:'label', code, label:$('nLabel').value } }); state.flash = 'Saved.'; go('dashboard'); }
      catch(err){ showErr('renameErr', err.message); } }); });

  /* finder */
  document.querySelectorAll('[data-chip]').forEach(ch=>ch.addEventListener('click',()=>{
    document.querySelectorAll('[data-chip]').forEach(c=>c.setAttribute('aria-pressed','false')); ch.setAttribute('aria-pressed','true');
    const m=$('fMsg'); m.value=ch.dataset.chip; m.dispatchEvent(new Event('input'));
    const keep=!!ch.dataset.keep, a=$('fAllow');
    if(keep){ a.checked=true; a.disabled=true; } else { a.disabled=false; }
    syncContact(keep);
    if(!keep){ m.focus(); m.setSelectionRange(m.value.length,m.value.length); } else $('fPhone').focus(); }));
  function syncContact(locked){ const a=$('fAllow'); if(!a) return; const on=a.checked;
    $('phoneWrap').hidden=!on; $('fPhone').required=on;
    $('allowHint').textContent = locked ? 'Needed so the owner can arrange to get their keys back. They never see your number.' : 'They can text you back through Keytag. They never see your number.';
    a.closest('.contact-opt').classList.toggle('on', on); }
  $('fAllow')?.addEventListener('change', e=>{ syncContact(false); if(e.target.checked) $('fPhone').focus(); });
  $('fMsg')?.addEventListener('input', e=>{ $('fCount').textContent = e.target.value.length + ' / 160'; });
  $('findForm')?.addEventListener('submit', async e=>{ e.preventDefault();
    const allow = $('fAllow').checked, phone = $('fPhone').value.trim();
    if (allow && !looksLikeMobile(phone)) return showErr('findErr','Enter a mobile number we can text, like 07700 900123.');
    await busy(e.submitter, 'Sending…', async ()=>{
      try { const r = await api('/api/message', { method:'POST', body:{ code:e.target.dataset.code, body:$('fMsg').value, allowContact:allow, phone } }); go('sent', r.canReply); }
      catch(err){ showErr('findErr', err.message); } }); });

  /* account */
  $('addForm')?.addEventListener('submit', e=>{ e.preventDefault();
    const code = norm($('aCode').value);
    if (code.length !== 6) return showErr('addErr','Codes are 6 letters and numbers, like 7H4-Q9M.');
    claimFlow(code, { label: $('aLabel2').value.trim() }); });
  $('detailsForm')?.addEventListener('submit', async e=>{ e.preventDefault();
    const phone = $('dPhone').value.trim();
    if (!looksLikeMobile(phone)) return showErr('detailsErr','Enter a mobile number we can text, like 07700 900123.');
    await busy(e.submitter, 'Saving…', async ()=>{
      try { const r = await api('/api/me', { method:'PATCH', body:{ name:$('dName').value, phone } });
            if (r.needCode) { state.verify = { id:r.id, phone:r.phone }; return go('phoneCode'); }
            $('dPhone').value = r.owner.phone; $('savedMsg').hidden=false; showErr('detailsErr',''); }
      catch(err){ showErr('detailsErr', err.message); } }); });
  $('giftForm')?.addEventListener('submit', async e=>{ e.preventDefault(); const code = e.target.dataset.code, name=$('gName').value.trim();
    await busy(e.submitter, 'Sending…', async ()=>{
      try { await api('/api/tag', { method:'POST', body:{ action:'gift', code, name, email:$('gEmail').value } }); state.flash = `Gift sent. ${name} will get an email to set up ${fmtCode(code)}.`; go('dashboard'); }
      catch(err){ showErr('giftErr', err.message); } }); });
  $('confirmRemove')?.addEventListener('click', async e=>{ const code = e.currentTarget.dataset.code;
    await busy(e.currentTarget, 'Removing…', async ()=>{
      try { await api('/api/tag', { method:'POST', body:{ action:'remove', code } }); state.flash = `${fmtCode(code)} removed from your account.`; go('dashboard'); }
      catch(err){ showErr('removeErr', err.message); } }); });
  $('confirmDelete')?.addEventListener('click', async e=>{
    await busy(e.currentTarget, 'Deleting…', async ()=>{
      try { await api('/api/me', { method:'DELETE' }); await sb.auth.signOut(); session=null; go('home'); }
      catch(err){ showErr('delErr', err.message); } }); });
  $('logout')?.addEventListener('click', async ()=>{ await sb.auth.signOut(); session=null; go('home'); });
}

document.addEventListener('change', e=>{ if(e.target.id==='qtyIn') setQty(parseInt(e.target.value,10)); });
document.addEventListener('click', e=>{
  if(!e.target.closest('.more')) document.querySelectorAll('.more[open]').forEach(d=>d.removeAttribute('open'));
  const q = e.target.closest('[data-qty]'); if(q){ setQty(qty() + Number(q.dataset.qty)); return; }
  if(e.target.closest('#checkout')){
    if (CONFIG?.checkoutUrl) location.href = CONFIG.checkoutUrl.replace('{QTY}', qty());
    else go('checkoutSoon');
    return; }
  const s = e.target.closest('[data-scan]'); if(s){ scanFlow(s.dataset.scan); return; }
  const g = e.target.closest('[data-go]'); if(g){ go(g.dataset.go, g.dataset.arg); }
});
window.addEventListener('popstate', ()=>route());

/* ---------- start ---------- */
(async function boot(){
  try {
    CONFIG = await fetch('/api/config').then(r=>{ if(!r.ok) throw new Error(); return r.json(); });
    sb = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, { auth: { flowType:'implicit', detectSessionInUrl:true, persistSession:true } });
    const { data } = await sb.auth.getSession();
    session = data.session;
    sb.auth.onAuthStateChange((_e, s)=>{ session = s; const b=$('accountBtn'); if(b) b.textContent = s ? 'My tags' : 'Log in'; });
    if (location.hash.includes('access_token')) history.replaceState({}, '', location.pathname + location.search);
  } catch(e){ console.error('Could not load settings', e); }
  route();
})();
