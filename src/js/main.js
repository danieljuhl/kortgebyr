/**
*   @author Ulrik Moe, Christian Blach, Joakim Sindholt
*   @license GPLv3
**/

const country = 'DK';
let opts = {
    acquirer: 'auto',
    currency: 'DKK',
    qty: 200,
    avgvalue: 500,
    cards: { dankort: 1, visa: 1 },
    features: {}
};
let $qty, $avgvalue, $revenue, $acqs, $currency, $dankortscale;


function settings(o) {
    $qty = o.qty;
    $avgvalue = new Currency(o.avgvalue, o.currency);
    $revenue = $avgvalue.scale($qty);

    $acqs = (o.acquirer === 'auto') ? ACQs.slice(0) : (country === 'DK') ?
        [ACQs[0], ACQs[o.acquirer]] : [ACQs[o.acquirer]];

    // 77% to Dankort. 23% to Visa/MC etc.
    $dankortscale = (!o.cards.visa) ? 1 :
        (o.cards.dankort || o.cards.forbrugsforeningen) ? 0.77 : 0;

    if ($currency !== o.currency) {
        $currency = o.currency;
        updateCurrency().then(() => build());
        document.getElementById('currency_code').textContent = $currency;
    } else {
        build();
    }
}


// Check if object-x' properties is in object-y.
function x_has_y(objx, objy) {
    for (let prop in objy) {
        if (!objx[prop]) { return false; }
    }
    return true;
}

function sum(obj) {
    let ret = new Currency();
    for (let fee in obj) {
        ret = ret.add(obj[fee]);
    }
    return ret;
}

function merge() {
    let obj = {};
    for (let i = 0; i < arguments.length; i++) {
        const costobj = arguments[i];
        for (let z in costobj) {
            if (obj[z]) {
                obj[z] = obj[z].add(costobj[z]);
            } else {
                obj[z] = costobj[z];
            }
        }
    }
    return obj;
}

// Find combination of acquirers that support all cards
function acqcombo(psp) {
    const A = $acqs;
    const acqarr = [];

    // Check if a single acq support all cards.
    for (let i = 0; i < A.length; i++) {
        const acq = A[i];
        if (psp.acquirers[acq.name]) {
            // Return acq if it support all cards.
            if (x_has_y(acq.cards, opts.cards)) { return [acq]; }
            acqarr.push(acq);
        }
    }

    // Nope. Then we'll need to search for a combination of acquirers.
    const len = acqarr.length;
    for (let i = 0; i < len; i++) {
        const primary = acqarr[i];
        let missingCards = {};

        for (let card in opts.cards) {
            if (!primary.cards[card]) { missingCards[card] = true; }
        }

        // Find secondary acquirer with the missing cards.
        for (let j = i + 1; j < len; j++) {
            let secondary = acqarr[j];
            if (x_has_y(secondary.cards, missingCards)) {
                return [primary, secondary];
            }
        }
    }
    return null;
}

function cost2obj(cost, obj, name) {
    for (let i in cost) {
        let value = cost[i];
        const type = typeof value;
        if (typeof value === 'function') {
            value = value(obj);
        }
        if (!value || typeof value !== 'object') { continue; }
        obj[i][name] = value;
    }
}

function sumTxt(obj) {
    const frag = document.createDocumentFragment();
    frag.textContent = sum(obj).print($currency);
    if (Object.keys(obj).length) {
        const info = document.createElement('div');
        info.textContent = '[?]';
        info.className = 'info';
        info.ttdata = obj;
        info.addEventListener('mouseover', showTooltip);
        frag.appendChild(info);
    }
    return frag;
}

// Build table
function build(action) {
    const data = [];
    const frag = document.createDocumentFragment();

    if (!opts.cards.dankort && !opts.cards.visa) {
        document.getElementById('tbody').innerHTML = '';
    }

    // Calculate acquirer costs and sort by Total Costs.
    for (let i = 0; i < $acqs.length; i++) {
        const acq = $acqs[i];
        const cardscale = (acq.name === 'Nets') ? $dankortscale : 1 - $dankortscale;
        acq.trnfees = acq.fees.trn().scale($qty).scale(cardscale);
        acq.TC = acq.trnfees;
        if (acq.fees.monthly) { acq.TC = acq.TC.add(acq.fees.monthly); }
    }
    $acqs.sort((obj1, obj2) => obj1.TC.order($currency) - obj2.TC.order($currency));

    psploop:
    for (let i = 0; i < PSPs.length; i++) {
        const psp = PSPs[i];
        const fees = { setup: {}, monthly: {}, trn: {} };
        cost2obj(psp.fees, fees, psp.name);

        // Check if psp support all enabled payment methods
        for (let card in opts.cards) {
            if (!psp.cards[card]) { continue psploop; }
        }

        // Check if psp support all enabled features
        for (let i in opts.features) {
            const feature = psp.features[i];
            if (!feature) { continue psploop; }
            cost2obj(feature, fees, i);
        }

        // If an acquirer has been selected then hide the Stripes
        if ($acqs.length < 3 && !psp.acquirers) { continue; }

        const acqfrag = document.createDocumentFragment();
        const acqcards = {};
        let acqArr = [];
        if (psp.acquirers) {
            acqArr = acqcombo(psp); // Find acq with full card support

            if (!acqArr) { continue; }
            for (let j = 0; j < acqArr.length; j++) {
                const acq = acqArr[j];
                cost2obj({
                    setup: acq.fees.setup,
                    monthly: acq.fees.monthly,
                    trn: acq.trnfees
                }, fees, acq.name);

                const acqlink = document.createElement('a');
                acqlink.href = acq.link;
                acqlink.className = 'acq';
                const acqlogo = new Image();
                acqlogo.src = '/img/psp/' + acq.logo;
                acqlogo.alt = acq.name;
                acqlink.appendChild(acqlogo);
                acqfrag.appendChild(acqlink);
                acqfrag.appendChild(document.createElement('br'));

                // Construct a new acqcards
                for (let card in acq.cards) { acqcards[card] = acq.cards[card]; }
            }
        } else {
            const acqtext = document.createElement('p');
            acqtext.classList.add('acquirer-included');
            acqtext.textContent = 'Inkluderet';
            acqfrag.appendChild(acqtext);
        }

        const cardfrag = document.createDocumentFragment();
        for (let card in psp.cards) {
            if (psp.acquirers && !acqcards[card]) { continue; }

            //  Some cards/methods (e.g. mobilepay) add extra costs.
            if (typeof psp.cards[card] === 'object') {
                if (!opts.cards[card]) { continue; }
                cost2obj(psp.cards[card], fees, card);
            }

            const cardicon = new Image(22, 15);
            cardicon.src = '/img/cards/' + card + '.svg?1';
            cardicon.alt = card;
            cardicon.className = 'card';
            cardfrag.appendChild(cardicon);
        }

        // Calculate TC and sort psps
        const totals = merge(fees.monthly, fees.trn);
        const totalcost = sum(totals);
        let sort;
        for (sort = 0; sort < data.length; ++sort) {
            if (totalcost.order($currency) < data[sort]) { break; }
        }
        data.splice(sort, 0, totalcost.order($currency));

        // Create PSP logo.
        const pspfrag = document.createDocumentFragment();
        const psplink = document.createElement('a');
        psplink.target = '_blank';
        psplink.href = psp.link;
        psplink.className = 'psp';
        const psplogo = new Image();
        psplogo.src = '/img/psp/' + psp.logo + '?{{ imgtoken }}';
        psplogo.alt = psp.name;
        const pspname = document.createElement('span');
        pspname.textContent = psp.name;
        psplink.appendChild(psplogo);
        psplink.appendChild(pspname);
        pspfrag.appendChild(psplink);

        // cardfee calc.
        const cardfeefrag = document.createDocumentFragment();
        const p1 = document.createElement('p');
        const cardfee = totalcost.scale(1 / ($qty || 1));
        const cardfeepct = '' + Math.round(cardfee.order($currency) * 10000 / $avgvalue.order($currency)) / 100;
        cardfeefrag.textContent = cardfee.print($currency);
        p1.textContent = '(' + cardfeepct.replace('.', currency_map[$currency].d) + '%)';
        p1.className = 'procent';
        cardfeefrag.appendChild(p1);

        const tr = document.createElement('tr');
        tr.insertCell(-1).appendChild(pspfrag);
        tr.insertCell(-1).appendChild(acqfrag);
        tr.insertCell(-1).appendChild(cardfrag);
        tr.insertCell(-1).appendChild(sumTxt(fees.setup));
        tr.insertCell(-1).appendChild(sumTxt(fees.monthly));
        tr.insertCell(-1).appendChild(sumTxt(fees.trn));
        tr.insertCell(-1).appendChild(sumTxt(totals));
        tr.insertCell(-1).appendChild(cardfeefrag);
        frag.insertBefore(tr, frag.childNodes[sort]);
    }
    const tbody = document.getElementById('tbody');
    tbody.innerHTML = '';
    tbody.appendChild(frag);
}

function formEvent(evt) {
    opts = form2obj(this);
    settings(opts);
}

//===========================
//    Lets build
//===========================

(() => {
    const form = document.getElementById('form');
    if (form) {
        settings(opts);

        form.addEventListener('change', formEvent);
        form.addEventListener('input', formEvent);
        obj2form(opts, form);
    }

    /**
    *   A tiny Google Analytics client
    */
    function _ga(o) {
        const time = '' + Date.now();
        let cid = localStorage._ga;
        if (!cid) {
            localStorage._ga = cid = ((Math.random() * 10e7) | 0) + time;
        }
        let d = 'v=1&tid=UA-46668451-1&ds=web&cid=' + cid;
        for (let k in o) {
            d += '&' + k + '=' + o[k];
        }
        fetch('/_ga/collect?' + d + '&z=' + time);
    }

    _ga({
        t: 'pageview',
        dr: encodeURIComponent(document.referrer),
        dl: encodeURIComponent(location.href), // URL
        dh: encodeURIComponent(location.hostname), // Document Host Name
        dp: encodeURIComponent(location.pathname), // Document Path
        dt: encodeURIComponent(document.title), // Document Title

        // System Info
        sr: screen.width + 'x' + screen.height,
        vp: document.documentElement.clientWidth + 'x' + document.documentElement.clientHeight,
        sd: screen.colorDepth + '-bits',
        ul: navigator.language
    });

})();
