const TIERS = [{min:1, each:14},{min:2, each:12},{min:5, each:10}];
const tierLabel = i => { const t=TIERS[i], nx=TIERS[i+1]; return !nx ? `${t.min}+ tags` : (nx.min-1===t.min ? `${t.min} tag${t.min>1?'s':''}` : `${t.min}–${nx.min-1} tags`); };
/* shared pricing block: a falling price ladder + live calculator */
const pricing = n => { const nt = TIERS.find(t=>t.min>n); return `<div class="pricing">
  <div class="ladder" aria-label="Price per tag by quantity">
    ${TIERS.map((t,i)=>{ const nx=TIERS[i+1]; const on = n>=t.min && (!nx || n<nx.min); const save = TIERS[0].each - t.each; return `
    <div class="step${on?' on':''}${nx?'':' best'}" style="--h:${(t.each/TIERS[0].each).toFixed(3)}">
      <span class="best-badge${nx?' ph':''}" ${nx?'aria-hidden="true"':''}>Best value</span>
      <span class="label">${tierLabel(i)}</span>
      <span class="yours${on?'':' ph'}" ${on?'':'aria-hidden="true"'}>Your price</span>
      <span class="step-price"><span class="disp">£${t.each}</span><span class="small">each</span></span>
      <span class="pill${save?' on':''}">${save ? `Save £${save} a tag` : 'Full price'}</span>
      <span class="step-bar" aria-hidden="true"></span>
    </div>`; }).join('')}
  </div>
  <div class="calc">
    <div class="stack" style="gap:8px">
      <span class="label">How many?</span>
      <div class="stepper" role="group" aria-label="Quantity">
        <button class="btn" data-qty="-1" aria-label="One fewer" ${n<=1?'disabled':''}>−</button>
        <input id="qtyIn" type="number" inputmode="numeric" min="1" max="99" value="${n}" aria-label="Number of tags">
        <button class="btn" data-qty="1" aria-label="One more">+</button>
      </div>
    </div>
    <div class="stack calc-total" style="gap:6px">
      <span class="label muted">${n} tag${n>1?'s':''} × £${unit(n)}</span>
      <span class="total">£${total(n)}</span>
      <span class="small muted">${nt ? `Add ${nt.min-n} more to pay £${nt.each} each` : 'Best price per tag'}</span>
    </div>
    <div class="free-del"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 6h11v9H2zM13 9h4l3 3v3h-7z"/><circle cx="6" cy="17" r="2"/><circle cx="17" cy="17" r="2"/></svg><span><b>Free UK delivery</b><span>On every order, any size</span></span></div>
    <button class="btn calc-btn" id="checkout">Checkout</button>
  </div></div>`; };
/* change quantity without re-rendering the page (no entrance animation, no jump) */
function setQty(n){
  db.qty = Math.max(1, Math.min(99, n || 1)); save();
  const el = document.querySelector('.pricing'); if(!el) return;
  const focusedQty = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.qty : null;
  el.outerHTML = pricing(qty());
  if(focusedQty) document.querySelector(`.pricing [data-qty="${focusedQty}"]`)?.focus();
}
const unit = n => TIERS.filter(t=>n>=t.min).at(-1).each;
const total = n => n * unit(n);
const qty = () => Math.max(1, Math.min(99, db.qty || 1));
const esc = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const QR = '1111111100000110111011010101101110110000011111111';
const tagArt = (code, cls='') => `<div class="tag ${cls}" aria-hidden="true"><div class="qr">${QR.split('').map(b=>`<span class="${b==='1'?'':'o'}"></span>`).join('')}</div><small>${esc(code)}</small></div>`;
/* coloured page header: tone = sky | sun | lime | coral | violet */
const head = (tone, chips, title, sub, extra='') => `
  <section class="block b-${tone}">
    ${chips && chips.length ? `<div class="chips">${chips.map(c=>`<span class="chip-tag">${c}</span>`).join('')}</div>` : ''}
    ${extra}
    <h1>${title}</h1>
    ${sub ? `<p class="lede">${sub}</p>` : ''}
  </section>`;
const ICON = {
  battery:'<svg viewBox="0 0 24 24"><rect x="3" y="7" width="16" height="10" rx="2"/><path d="M21 10.5v3"/><path d="M6.5 10v4M9.5 10v4"/><path class="cut" d="M4 4l16 16"/><path d="M4 4l16 16"/></svg>',
  app:'<svg viewBox="0 0 24 24"><rect x="4" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6"/><path class="cut" d="M3 3l18 18"/><path d="M3 3l18 18"/></svg>',
  sub:'<svg viewBox="0 0 24 24"><path d="M19.5 12a7.5 7.5 0 0 1-12.8 5.3"/><path d="M4.5 12a7.5 7.5 0 0 1 12.8-5.3"/><path d="M17.6 3.5v3.3h-3.3"/><path d="M6.4 20.5v-3.3h3.3"/><path class="cut" d="M4 4l16 16"/><path d="M4 4l16 16"/></svg>'
};
/* how-it-works illustrations (drawn on coloured tiles, so fixed ink) */
const QRMINI = (x,y,s) => { const c=s/7; return QR.split('').map((b,i)=> b==='1' ? `<rect x="${x+(i%7)*c}" y="${y+Math.floor(i/7)*c}" width="${c*.86}" height="${c*.86}" fill="#141414" stroke="none"/>` : '').join(''); };
const ART = {
  clip:`<svg viewBox="0 0 160 120" fill="none" stroke="#141414" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="58" cy="34" r="20"/>
    <path d="M74 44l14 8"/><circle cx="98" cy="58" r="12" fill="#fff"/><circle cx="98" cy="58" r="4"/>
    <path d="M107 66l26 26M120 79l7-7M127 86l7-7"/>
    <path d="M50 52l-4 10"/>
    <circle cx="44" cy="84" r="24" fill="#fff"/><circle cx="44" cy="67" r="3" fill="#141414" stroke="none"/>
    ${QRMINI(33,74,22)}
  </svg>`,
  scan:`<svg viewBox="0 0 160 120" fill="none" stroke="#141414" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
    <rect x="52" y="8" width="56" height="104" rx="12" fill="#fff"/>
    <path d="M72 16h16"/>
    <path d="M64 40v-8h8M88 32h8v8M96 72v8h-8M72 80h-8v-8"/>
    ${QRMINI(68,40,24)}
    <path d="M58 56h44" stroke="#ee5a4a" stroke-width="3.5"/>
    <rect x="64" y="90" width="32" height="10" rx="5" fill="#141414" stroke="none"/>
  </svg>`,
  text:`<svg viewBox="0 0 160 120" fill="none" stroke="#141414" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
    <path d="M22 22h96a12 12 0 0 1 12 12v30a12 12 0 0 1-12 12H58l-18 16v-16H22a12 12 0 0 1-12-12V34a12 12 0 0 1 12-12z" fill="#fff"/>
    <path d="M28 40h72M28 52h52"/>
    <circle cx="128" cy="88" r="18" fill="#141414" stroke="none"/>
    <path d="M120 88l6 6 11-12" stroke="#c8dd7b" stroke-width="3.5"/>
  </svg>`
};
