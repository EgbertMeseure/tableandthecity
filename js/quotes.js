/* City quotes in the hero's top-left quote spot (guide.html .quote), one per city per month.
   Only the verified quotes from handoff/city-quotes/quotes.md (checked 29 Oct 2026). en = the English line shown; orig + lang = the original
   text, shown instead when the site language (js/i18n.js) is that language; tr = the English line is our own translation; att = attributed only;
   flag = the person is linked to the city but was not born there (marked ⚑ in quotes.md).
   Pick: (year × 12 + month) mod count → every quote comes round in turn, the same one all month, for everyone (Europe/Brussels date). */
(function () {
  'use strict';
  const WQ = { maet: 'https://en.wikiquote.org/wiki/Maurice_Maeterlinck', els: 'https://nl.wikiquote.org/wiki/Willem_Elsschot', ost: 'https://nl.wikiquote.org/wiki/Paul_van_Ostaijen',
    rub: 'https://en.wikiquote.org/wiki/Peter_Paul_Rubens', gez1: 'https://nl.wikisource.org/wiki/Gezelle/Als_de_ziele_luistert', claus: 'https://nl.wikiquote.org/wiki/Hugo_Claus',
    ens: 'https://nl.wikiquote.org/wiki/James_Ensor', brel: 'https://fr.wikiquote.org/wiki/Jacques_Brel', aud: 'https://en.wikiquote.org/wiki/Audrey_Hepburn',
    yfr: 'https://fr.wikiquote.org/wiki/Marguerite_Yourcenar', yen: 'https://en.wikiquote.org/wiki/Marguerite_Yourcenar', roel: 'https://www.dbnl.org/tekst/_vla016197701_01/_vla016197701_01_0056.php' };
  const Q = {
    gent: [
      { by: 'Maurice Maeterlinck', en: 'An act of goodness is of itself an act of happiness. No reward coming after the event can compare with the sweet reward that went with it.', work: 'The New Dictionary of Thoughts (1960)', src: WQ.maet },
      { by: 'Maurice Maeterlinck', en: 'The future is a world limited by ourselves; in it we discover only what concerns us and, sometimes, by chance, what interests those whom we love the most.', work: 'Joyzelle', src: WQ.maet },
      { by: 'Maurice Maeterlinck', en: 'We are alone, absolutely alone on this chance planet: and, amid all the forms of life that surround us, not one, excepting the dog, has made an alliance with us.', work: 'My Dog (1906)', src: WQ.maet },
      { by: 'Maurice Maeterlinck', en: 'When we lose one we love, our bitterest tears are called forth by the memory of hours when we loved not enough.', work: 'Wisdom and Destiny (1898)', src: WQ.maet },
      { by: 'Maurice Maeterlinck', en: 'If any of you should find him, would you be so very kind as to give him back to us?... We need him for our happiness, later on...', work: 'The Blue Bird', src: WQ.maet },
      { by: 'Charles V', att: true, en: 'As many languages as a man knows, so many times is he a man.', orig: 'Autant de langues que l’homme sçait parler, autant de fois est-il homme.', lang: 'fr', work: 'via Brantôme; English: Emerson', src: 'https://en.wikiquote.org/wiki/Charles_V,_Holy_Roman_Emperor' },
      { by: 'Klokke Roeland, 1314 bell inscription', en: 'Who is called Roeland: when she is rung, there is storm in the land.', orig: 'Die gheheeten es Roeland: als men ze luyd es storme int landt.', lang: 'nl', tr: true, work: 'Ghent belfry', src: WQ.roel },
      { by: 'Klokke Roeland, 1948 bell', en: 'My Ghent, my people / so proud, so true / your voice and herald / in joy or grief.', orig: 'Mijn Gent, mijn volk / zo trots, zo trouw / uw taal en tolk / bij vreugd’ of rouw.', lang: 'nl', tr: true, work: 'Ghent belfry', src: WQ.roel },
      { by: 'Albrecht Rodenbach', flag: true, en: 'Above Ghent rises, lonely and grey, the old Belfry, symbol of the past.', orig: 'Boven Gent rijst, eenzaam en grijsd, ’t oud Belfort, zinbeeld van ’t verleden.', lang: 'nl', tr: true, work: '“Klokke Roeland”, Ghent’s city song (1877)', src: 'https://nl.wikipedia.org/wiki/Klokke_Roeland_(lied)' }
    ],
    antwerpen: [
      { by: 'Willem Elsschot', en: 'But kill he did not, for between dream and deed / laws stand in the way, and practical objections, / and melancholy too, that no one can explain, / that comes at evening, when one goes to sleep.', orig: 'Maar doodslaan deed hij niet, want tussen droom en daad / staan wetten in de weg en praktische bezwaren, / en ook weemoedigheid, die niemand kan verklaren, / en die des avonds komt, wanneer men slapen gaat.', lang: 'nl', tr: true, work: 'Het Huwelijk (1910)', src: WQ.els },
      { by: 'Willem Elsschot', en: 'Everyone wants to be number one, or at least to pass for number one.', orig: 'Ieder wil nummer één zijn of tenminste doorgaan voor nummer één.', lang: 'nl', tr: true, work: 'Lijmen (1923)', src: WQ.els },
      { by: 'Willem Elsschot', en: 'One can try to bake a loaf of bread, but one does not try a creation.', orig: 'Men kan proberen een brood te bakken, maar men probeert geen schepping.', lang: 'nl', tr: true, work: 'Kaas (1933)', src: WQ.els },
      { by: 'Willem Elsschot', en: '…a dream that becomes reality runs away like water between the fingers.', orig: '…een droom, die werkelijkheid wordt, als water tusschen de vingers vervloeit.', lang: 'nl', tr: true, work: 'Het dwaallicht (1946)', src: WQ.els },
      { by: 'Paul van Ostaijen', en: 'The poet always tells the truth. He just does it a little earlier than people find pleasant.', orig: 'De dichter zegt steeds de waarheid. Men weet dat hij dit doet een ietsje vroeger dan het de mensen aangenaam is.', lang: 'nl', tr: true, work: 'Self-defence (1926)', src: WQ.ost },
      { by: 'Paul van Ostaijen', en: 'I want to be naked and begin.', orig: 'Ik wil bloot zijn en beginnen.', lang: 'nl', tr: true, work: 'Vers 6', src: WQ.ost },
      { by: 'Paul van Ostaijen', en: 'I get up in the morning with the problem: ‘What can I do that hasn’t been done yet?’', orig: 'Ik sta ’s morgens op met het probleem: ‘Wat kan ik nou wel doen wat nog niet gedaan is.’', lang: 'nl', tr: true, src: WQ.ost },
      { by: 'Peter Paul Rubens', flag: true, en: 'I am by nature and inclination a peaceful man, the sworn enemy to disputes, lawsuits and quarrels both public and private.', work: 'Letter to Peiresc, May 1635', src: WQ.rub },
      { by: 'Peter Paul Rubens', flag: true, en: 'I have neither time to live nor to write.', work: 'Letter to Peiresc, December 1634', src: WQ.rub }
    ],
    brugge: [
      { by: 'Simon Stevin', en: 'A wonder is no wonder.', orig: 'Wonder en is gheen wonder.', lang: 'nl', work: 'his motto', src: 'https://nl.wikipedia.org/wiki/Simon_Stevin' },
      { by: 'Jan van Eyck', flag: true, en: 'As I can.', orig: 'Als ich kan.', work: 'his motto (1433)', src: 'https://en.wikipedia.org/wiki/Jan_van_Eyck' },
      { by: 'Guido Gezelle', en: 'When the soul listens, / everything speaks a language that lives.', orig: 'Als de ziele luistert / spreekt het al een taal dat leeft.', lang: 'nl', tr: true, work: 'XXXIII Kleengedichtjes', src: WQ.gez1 },
      { by: 'Guido Gezelle', en: 'Many an hour I’ve spent with you, / and savoured every one, / and never has an hour with you / weighed on me for a moment.', orig: '’k Heb menig uur bij u / gesleten en genoten, / en nooit en heeft een uur met u / me een enklen stond verdroten.', lang: 'nl', tr: true, work: 'Dien avond en die rooze', src: 'https://nl.wikisource.org/wiki/Gezelle/Dien_avond_en_die_rooze' },
      { by: 'Guido Gezelle', en: 'O the rustling of the slender reed!', orig: 'O ’t ruischen van het ranke riet!', lang: 'nl', tr: true, work: 'Vlaemsche Dichtoefeningen (1858)', src: 'https://nl.wikisource.org/wiki/Gezelle/O_%27t_ruischen_van_het_ranke_riet' },
      { by: 'Hugo Claus', en: 'What bothers me a bit is that sometimes I can’t explain exactly what’s bothering me.', orig: 'Wat me wel een beetje dwars zit is dat ik soms niet precies kan uitleggen wat me dwars zit.', lang: 'nl', tr: true, work: 'Humo, 11 December 1980', src: WQ.claus },
      { by: 'Hugo Claus', en: 'Literature is made by sick people. Whoever is healthy writes no books.', orig: 'Literatuur wordt door zieken gemaakt. Wie gezond is, schrijft geen boeken.', lang: 'nl', tr: true, work: 'Humo, 5 February 1992', src: WQ.claus }
    ],
    oostende: [
      { by: 'James Ensor', en: 'Light devours objects.', orig: 'Het licht vreet de voorwerpen op.', lang: 'nl', tr: true, work: 'as reported by Verhaeren, c. 1882', src: WQ.ens },
      { by: 'James Ensor', en: 'I have always found that a correctly drawn line cannot stir deep feelings.', orig: 'Ik heb altijd ervaren dat een juist getekende lijn geen diepe gevoelens kan opwekken.', lang: 'nl', tr: true, work: 'Letter to Pol de Mont, 1894', src: WQ.ens },
      { by: 'James Ensor', en: 'I love my big painting Le cortège des masques; it fills me with joy every day. It rings out like a blaring brass band at the back of my studio.', orig: 'Ik houd erg veel van mijn grote schilderij Le cortège des masques, dat mij elke dag met vreugde vervult. Als een schetterende fanfare klinkt het op, achteraan in mijn atelier.', lang: 'nl', tr: true, work: 'Letter to Edmond Picard, 13 July 1903', src: WQ.ens },
      { by: 'James Ensor', en: 'I believe I am an exceptional painter.', orig: 'Je crois être un peintre d’exception.', lang: 'fr', tr: true, work: 'Notes for August Vermeylen, c. 1906–08', src: WQ.ens },
      { by: 'James Ensor', en: 'Between twelve and one I sometimes venture onto the beach. It’s very busy then.', orig: 'Tussen twaalf en een ’s middags waag ik mij wel eens op het strand. Het is er dan erg druk.', lang: 'nl', tr: true, work: 'Letter to Emma Lambotte, summer 1910', src: WQ.ens },
      { by: 'James Ensor', en: 'A rain of criticism came down on me: since then I never let go of my umbrella.', orig: 'Ik krijg een regen van kritiek over me heen: sindsdien laat ik mijn paraplu niet meer los.', lang: 'nl', tr: true, work: 'Lecture, 1922', src: WQ.ens },
      { by: 'James Ensor', en: 'Yes, good friends, from the dawn of my first day Venus came to meet me… She feasted on my painted shells.', orig: 'Jawel, goede vrienden, van bij het gloren van mijn eerste dag kwam Venus mij tegemoet… Zij aasde op mijn geschilderde schelpjes.', lang: 'nl', tr: true, work: 'Speech at Hotel Osborne, 22 December 1923', src: WQ.ens },
      { by: 'James Ensor', en: 'My studio has five windows, up under the roof… at chest height you can see most of the town.', orig: 'Mijn atelier telt vijf ramen en bevindt zich onder de zolder… op borsthoogte, kun je het grootste deel van de stad zien.', lang: 'nl', tr: true, work: 'Letter to André de Ridder, 1928', src: WQ.ens }
    ],
    brussel: [
      { by: 'Jacques Brel', en: 'I wish you endless dreams and the furious desire to make a few of them come true.', orig: 'Je vous souhaite des rêves à n’en plus finir et l’envie furieuse d’en réaliser quelques uns.', lang: 'fr', tr: true, work: 'Europe 1, 1 January 1968', src: WQ.brel },
      { by: 'Jacques Brel', en: 'I’d say a man who suddenly dreams of eating a lobster has, in that moment, the talent… to savour it properly.', orig: 'Je prétends qu’un homme qui rêve tout d’un coup, il a envie de manger un homard, il a le talent, à ce moment là, … pour le savourer convenablement.', lang: 'fr', tr: true, work: 'Brel parle (1971)', src: WQ.brel },
      { by: 'Audrey Hepburn', en: 'I’m half-Irish, half-Dutch, and I was born in Belgium. If I was a dog, I’d be in a hell of a mess!', work: 'Audrey Hepburn (2002)', src: WQ.aud },
      { by: 'Audrey Hepburn', en: 'I love people who make me laugh. I honestly think it’s the thing I like most, to laugh. It cures a multitude of ills.', src: WQ.aud },
      { by: 'Audrey Hepburn', en: 'Living is like tearing through a museum. Not until later do you really start absorbing what you saw…', work: 'A Bio-bibliography (1994)', src: WQ.aud },
      { by: 'Audrey Hepburn', en: 'Success is like reaching an important birthday and finding you’re exactly the same.', work: 'A Life in Pictures (2007)', src: WQ.aud },
      { by: 'Marguerite Yourcenar', en: 'The fact remains that, even for the least refined, least greedy, least gluttonous of us, living together is partly eating together.', orig: 'Le fait reste que, même pour les moins gourmets, les moins gourmands ou les moins goinfres, vivre ensemble, c’est en partie manger ensemble.', lang: 'fr', tr: true, work: 'Souvenirs pieux', src: WQ.yfr },
      { by: 'Marguerite Yourcenar', en: 'The true birthplace is that wherein for the first time one looks intelligently upon oneself; my first homelands have been books.', orig: 'Le véritable lieu de naissance est celui où l’on a porté pour la première fois un coup d’œil intelligent sur soi-même : mes premières patries ont été des livres.', lang: 'fr', work: 'Mémoires d’Hadrien', src: WQ.yen },
      { by: 'Marguerite Yourcenar', en: 'Leisure moments: each life well regulated has some such intervals, and he who cannot make way for them does not know how to live.', orig: 'Des moments libres. Toute vie bien réglée a les siens, et qui ne sait pas les provoquer ne sait pas vivre.', lang: 'fr', work: 'Mémoires d’Hadrien', src: WQ.yen },
      { by: 'Marguerite Yourcenar', en: 'A touch of madness is, I think, almost always necessary for constructing a destiny.', orig: 'Je crois qu’il faut presque toujours un coup de folie pour bâtir un destin.', lang: 'fr', work: 'Les yeux ouverts (1980)', src: WQ.yen },
      { by: 'Marguerite Yourcenar', en: 'It is not difficult to nourish admirable thoughts when the stars are present.', orig: 'Il n’est pas difficile de nourrir des pensées admirables lorsque les étoiles sont présentes.', lang: 'fr', work: 'Alexis', src: WQ.yen },
      { by: 'Andreas Vesalius', en: 'I am not accustomed to saying anything with certainty after only one or two observations.', work: 'O’Malley, p. 201 (from the Latin)', src: 'https://en.wikiquote.org/wiki/Andreas_Vesalius' }
    ]
  };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function monthIndex(d = new Date()) {                                 // calendar month in Europe/Brussels
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit' }).formatToParts(d);
    const y = +p.find(x => x.type === 'year').value, m = +p.find(x => x.type === 'month').value;
    return y * 12 + (m - 1);
  }
  function pick(cityId, d) { const L = Q[cityId]; return L && L.length ? L[monthIndex(d) % L.length] : null; }
  function render(city) {
    const el = document.querySelector('.hero .quote'), q = city && pick(city.id);
    if (!el || !q) return;                                              // a city without quotes keeps the page's default quote
    const lang = (window.TG_I18N && window.TG_I18N.lang) || 'en', orig = q.orig && q.lang === lang;
    const text = orig ? q.orig : q.en;
    const tip = [q.work, q.att ? 'attributed, not documented' : '', q.tr && !orig ? 'English translation: Table and the City' : '', orig ? 'original text' : ''].filter(Boolean).join(' · ');
    el.classList.add('quote--city'); el.setAttribute('data-i18n-skip', ''); if (orig) el.setAttribute('lang', q.lang); else el.setAttribute('lang', 'en');
    el.innerHTML = `“${esc(text)}”<cite>${esc(q.by)}${q.att ? ' <span class="quote__att">(attributed)</span>' : ''}${q.work ? `, <i>${esc(q.work)}</i>` : ''}`
      + ` <a class="quote__src" href="${esc(q.src)}" target="_blank" rel="noopener" title="${esc(tip ? 'Source · ' + tip : 'Source')}" aria-label="Source of this quote (opens in a new tab)">↗</a></cite>`;
  }
  window.TGQuotes = { Q, pick, render, monthIndex };
})();
