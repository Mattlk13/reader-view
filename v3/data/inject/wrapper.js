/**
    Reader View - Strips away clutter

    Copyright (C) 2014-2022 [@rNeomy]

    This program is free software: you can redistribute it and/or modify
    it under the terms of the Mozilla Public License as published by
    the Mozilla Foundation, either version 2 of the License, or
    (at your option) any later version.
    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    Mozilla Public License for more details.
    You should have received a copy of the Mozilla Public License
    along with this program.  If not, see {https://www.mozilla.org/en-US/MPL/}.

    GitHub: https://github.com/rNeomy/reader-view/
    Homepage: https://webextension.org/listing/chrome-reader-view.html
*/

/* global Readability, config, extractChapLinks */
'use strict';

// error on https://www.un.org/about-us/specialized-agencies

{
  // https://github.com/rNeomy/reader-view/issues/185
  // example: https://parade.com/food/trader-joes-harry-and-david-comice-pears
  const originalParentNode = Object.getOwnPropertyDescriptor(Node.prototype, 'parentNode');
  Object.defineProperty(Node.prototype, 'parentNode', {
    enumerable: true,
    configurable: true,
    get: function() {
      const o = originalParentNode.get.call(this);
      return o || {
        tagName: 'BODY',
        getAttribute() {}
      };
    }
  });

  // http://add0n.com/chrome-reader-view.html#IDComment1117127387
  HTMLElement.prototype.setAttribute = new Proxy(HTMLElement.prototype.setAttribute, {
    apply(target, self, args) {
      try {
        Reflect.apply(target, self, args);
      }
      catch (e) {
        console.error('setAttribute', args, e);
      }
    }
  });

  if (Readability.prototype._getReadTime === undefined) {
    Readability.prototype._getReadTime = function(textContent) {
      const lang = document.documentElement.lang || 'en';
      const readingSpeed = this._getReadingSpeedForLanguage(lang);
      const charactersPerMinuteLow = readingSpeed.cpm - readingSpeed.variance;
      const charactersPerMinuteHigh = readingSpeed.cpm + readingSpeed.variance;
      const length = textContent.length;
      return {
        readingTimeMinsSlow: Math.ceil(length / charactersPerMinuteLow),
        readingTimeMinsFast: Math.ceil(length / charactersPerMinuteHigh)
      };
    };
    Readability.prototype._getReadingSpeedForLanguage = function(lang) {
      const readingSpeed = new Map([
        ['en', {cpm: 987, variance: 118}],
        ['ar', {cpm: 612, variance: 88}],
        ['de', {cpm: 920, variance: 86}],
        ['es', {cpm: 1025, variance: 127}],
        ['fi', {cpm: 1078, variance: 121}],
        ['fr', {cpm: 998, variance: 126}],
        ['he', {cpm: 833, variance: 130}],
        ['it', {cpm: 950, variance: 140}],
        ['jw', {cpm: 357, variance: 56}],
        ['nl', {cpm: 978, variance: 143}],
        ['pl', {cpm: 916, variance: 126}],
        ['pt', {cpm: 913, variance: 145}],
        ['ru', {cpm: 986, variance: 175}],
        ['sk', {cpm: 885, variance: 145}],
        ['sv', {cpm: 917, variance: 156}],
        ['tr', {cpm: 1054, variance: 156}],
        ['zh', {cpm: 255, variance: 29}]
      ]);
      return readingSpeed.get(lang) || readingSpeed.get('en');
    };

    Readability.prototype.parse = new Proxy(Readability.prototype.parse, {
      apply(target, self, args) {
        const rtn = Reflect.apply(target, self, args);

        if (rtn) {
          try {
            const o = self._getReadTime(rtn.textContent);

            if (o) {
              return {
                ...rtn,
                ...o
              };
            }
          }
          catch (e) {}
        }

        return rtn;
      }
    });
  }

  // https://github.com/rNeomy/reader-view/issues/191
  Readability.prototype._clean = new Proxy(Readability.prototype._clean, {
    apply(target, self, args) {
      const [, tag] = args;

      if (tag === 'aside') {
        return;
      }
      return Reflect.apply(target, self, args);
    }
  });
}

function createHTMLDocument() {
  const doc = document.implementation.createHTMLDocument(document.title);
  const base = doc.createElement('base');
  base.href = location.href;
  doc.head.appendChild(base);

  return doc;
}

// The implementation is from https://stackoverflow.com/a/5084441/260793
function getSelectionHTML() {
  const selection = window.getSelection();
  if (selection && selection.rangeCount && selection.toString().trim().length > 2) {
    let range;
    if (selection.getRangeAt) {
      range = selection.getRangeAt(0);
    }
    else {
      range = document.createRange();
      range.setStart(selection.anchorNode, selection.anchorOffset);
      range.setEnd(selection.focusNode, selection.focusOffset);
    }
    const doc = createHTMLDocument();

    const article = doc.body.appendChild(doc.createElement('article'));
    let start = range.startContainer;
    if (start.nodeType === Element.TEXT_NODE) {
      start = start.parentElement;
    }
    range.setStart(start, 0);
    let end = range.endContainer;
    if (end.nodeType === Element.TEXT_NODE) {
      end = end.parentElement;
    }
    range.setEnd(end, end.childNodes.length);
    article.appendChild(range.cloneContents());

    if (article.textContent.length > 20) {
      return doc;
    }
  }
}

try {
  // if a website has an automatic redirect use this method to wait for a new page load
  if (location.href.indexOf('://news.google.') !== -1 &&
      location.href.indexOf('/articles/') !== -1) {
    window.addEventListener('unload', () => chrome.runtime.sendMessage({
      cmd: 'reader-on-reload'
    }));
  }
  else {
    const style = () => {
      style.clean();

      config.load(() => {
        if (config.prefs['display-loader'] === false) {
          return;
        }
        const parser = new DOMParser();
        const doc = parser.parseFromString(`
          <div class="rv-overlay" style="
            all: initial;
            background-color: rgba(0, 0, 0, 0.5);
            position: fixed;
            inset: 0 0 0 0;
            z-index: 2147483647;
            display: grid;
            align-items: end;
          ">
            <div style="
              all: initial;
              display: grid;
              grid-template-columns: 1fr min-content;
              align-items: center;
              padding: 1ch 2ch;
              background-color: #282828;">
              <span style="
                all: initial;
                font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif;
                font-size: 16px;
                color: #bcc5ce;">Converting to Reader View...</span>
              <input type="button" value="×" style="
                all: initial;
                border: none;
                background: transparent;
                color: #bcc5ce;
                cursor: pointer;
                font-size: 32px;">
            </div>
          </div>`, 'text/html');
        const p = doc.querySelector('div');
        doc.querySelector('input').onclick = () => {
          p.remove();
          document.removeEventListener('DOMContentLoaded', convert);
          chrome.runtime.sendMessage({
            cmd: 'aborted'
          });
        };
        document.documentElement.append(p);
      });
    };
    style.clean = () => [...document.querySelectorAll('.rv-overlay')].forEach(e => e.remove());

    const convert = () => {
      // health check
      const id = setTimeout(() => {
        if (confirm(`Oops! Reader View is crashed. Would you like to restart the extension?`)) {
          chrome.runtime.reload();
        }
      }, 5000);
      chrome.runtime.sendMessage({
        cmd: 'health-check'
      }, r => {
        if (r === true) {
          clearTimeout(id);
        }
      });
      // fix SVG resizing issue
      for (const svg of document.querySelectorAll('svg')) {
        // Check if width or height attribute is missing
        if (!svg.hasAttribute('width') || !svg.hasAttribute('height')) {
          const style = getComputedStyle(svg);

          // Set width if it's missing
          if (!svg.hasAttribute('width')) {
            const width = style.width;
            svg.setAttribute('width', width);
          }
          // Set height if it's missing
          if (!svg.hasAttribute('height')) {
            const height = style.height;
            svg.setAttribute('height', height);
          }
        }
      }
      // prepare
      const doc = getSelectionHTML() || document.cloneNode(true);

      const articles = [...doc.querySelectorAll('article')].map(e => e.cloneNode(true));
      const reader = new Readability(doc, {
        debug: false
      });
      const article = reader.parse();

      // multiple articles
      for (let n = 0; n < articles.length; n += 1) {
        const doc = createHTMLDocument();
        doc.body.appendChild(articles[n]);

        const reader = new Readability(doc, {
          debug: false
        });
        const a = reader.parse();
        if (a) {
          article.contents = article.contents || [];
          article.contents.push(
            `<h2 class="page-separator">Page ${n + 1}</h2>`,
            a.content.replace('id="readability-page-1"', `id="readability-page-${n + 1}"`)
          );
        }
      }

      if (!article) {
        throw Error('Cannot convert this page!');
      }

      // each article has two elements
      // example with multiple articles that should not be used
      // https://www.ctvnews.ca/health/are-you-in-perimenopause-here-s-what-to-look-for-according-to-a-doctor-1.7094650
      // example with multiple articles that should be used
      // chatgpt with multiple Q&A

      if (article.contents && article.contents.length > 2) {
        if (article.contents.some(c => c.length >= article.content.length)) {
          article.content = article.contents.join('');
        }
      }
      delete article.contents;

      article.chapters = {};
      try {
        const navLinks = extractChapLinks(document);
        article.chapters.next = navLinks.nextLink;
        article.chapters.previous = navLinks.prevLink;
      }
      catch (e) {
        console.error('Cannot extract chapters', e);
      }

      article.url = article.url || location.href;

      // detect doi
      try {
        const doi = document.querySelector('[href^="https://doi.org/"]');
        if (doi) {
          article.doi = doi.href;
        }
        else {
          const n = /doi:\s([^\s]{3,})/i.exec(document.body.innerText);
          if (n) {
            article.doi = 'https://doi.org/' + n[1];
          }
          else {
            const m = /https:\/\/doi\.org\/[^\s]{4,}/.exec(document.body.innerText);
            if (m) {
              article.doi = m[0];
            }
          }
        }
      }
      catch (e) {
        console.warn('detect doi', e);
      }
      // detect date
      try {
        const date = document.querySelector('meta[property="article:published_time"],meta[property="og:pubdate"],meta[property="og:publish_date"],meta[name="citation_online_date"],meta[name="dc.Date"]');
        if (date) {
          article.published_time = (new Date(date.content)).toLocaleDateString();
        }
        else {
          const e = document.querySelector('script[type="application/ld+json"]');
          if (e) {
            const j = JSON.parse(e.textContent);
            if (j && j.datePublished) {
              article.published_time = (new Date(j.datePublished)).toLocaleDateString();
            }
          }
        }
      }
      catch (e) {
        console.warn('detect date', e);
      }


      // https://www.w3.org/International/questions/qa-scripts.en#directions
      if (article.dir === null) {
        const lang = document.documentElement.lang;
        if (lang && ['ar', 'fa', 'he', 'iw', 'ur', 'yi', 'ji'].some(a => lang.indexOf(a) !== -1)) {
          article.dir = 'rtl';
        }
      }

      // load
      config.load(async () => {
        const prefs = config.prefs;
        if (prefs.embedded || window.embedded === true) {
          const {pathname, hostname} = (new URL(article.url));
          const title = document.title;
          const resp = await fetch(chrome.runtime.getURL('/data/reader/template.html'));

          const font = (
            prefs['supported-fonts'].filter(o => o.value === prefs.font).map(o => o.name).shift() || prefs.font
          ).toLowerCase().replaceAll(/\s+/g, '-');

          const html = (await resp.text())
            .replace('%dir%', article.dir ? ' dir=' + article.dir : '')
            .replace('%lang%', article.lang ? ' lang=' + article.lang : '')
            .replace('%light-color%', '#222')
            .replace('%light-bg%', 'whitesmoke')
            .replace('%dark-color%', '#eee')
            .replace('%dark-bg%', '#333')
            .replace('%sepia-color%', '#5b4636')
            .replace('%sepia-bg%', '#f4ecd8')
            .replace('%solarized-light-color%', '#586e75')
            .replace('%solarized-light-bg%', '#fdf6e3')
            .replace('%groove-dark-color%', '#cec4ac')
            .replace('%groove-dark-bg%', '#282828')
            .replace('%solarized-dark-color%', '#839496')
            .replace('%solarized-dark-bg%', '#002b36')
            .replace('%content%', article.content)
            .replace('%title%', article.title || 'Unknown Title')
            .replace('%byline%', article.byline || '')
            .replace('%reading-time-fast%', article.readingTimeMinsFast)
            .replace('%reading-time-slow%', article.readingTimeMinsSlow)
            .replace('%published-time%', article['published_time'] || '')
            .replace('%href%', article.url)
            .replace('%hostname%', hostname)
            .replace('%pathname%', pathname)
            .replace('/*user-css*/', `
              body {
                font-size:  ${prefs['font-size']}px;
                font-family: ${prefs.font} !important;
                width: ${prefs.width ? prefs.width + 'px' : 'calc(100vw - 50px)'};
              }
            ` + prefs['user-css'])
            .replace('%data-images%', prefs['show-images'])
            .replace('%data-font%', font)
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

          const dom = (new DOMParser()).parseFromString(html, `text/html`);
          document.head.replaceWith(dom.querySelector('head'));
          document.body.replaceWith(dom.querySelector('body'));
          document.documentElement.dataset.mode = prefs.mode;
          document.title = title;

          style.clean();
          chrome.runtime.sendMessage({
            cmd: 'converted'
          });
        }
        else {
          style.clean();
          chrome.runtime.sendMessage({
            cmd: 'open-reader',
            article
          });
        }
      });
    };
    const safeConvert = () => {
      try {
        // visual banner
        style();
        // convert
        convert();
      }
      catch (e) {
        style.clean();
        chrome.runtime.sendMessage({
          cmd: 'aborted'
        });
        console.error(e);
        alert('Cannot convert to reader view:\n\n' + e.message);
      }
    };

    if (self.converting && Date.now() - self.converting < 1000) {
      console.warn('new conversion is skipped');
    }
    else {
      self.converting = Date.now();
      chrome.runtime.sendMessage({
        cmd: 'converting'
      });
      if (document.readyState === 'loading') {
        Promise.race([
          new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve)),
          new Promise(resolve => setTimeout(resolve, 3000))
        ]).then(safeConvert);
      }
      else {
        safeConvert();
      }
    }
  }
}
catch (e) {
  console.error(e);
  chrome.runtime.sendMessage({
    cmd: 'notify',
    msg: 'Convert to reader view failed, ' + e.message
  });
}
