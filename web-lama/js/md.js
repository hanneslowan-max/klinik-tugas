// Markdown → HTML aman: markdown-it (html:false) lalu DOMPurify. Satu-satunya tempat innerHTML dipakai.
import { markdownit, DOMPurify } from '../vendor/muat.js';

const md = markdownit({ html: false, linkify: true, breaks: true, typographer: false });

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
  if (node.tagName === 'IMG') {
    node.setAttribute('loading', 'lazy');
    node.setAttribute('referrerpolicy', 'no-referrer');
  }
});

const OPSI = {
  USE_PROFILES: { html: true },
  FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select', 'iframe', 'object', 'embed', 'svg', 'math'],
  FORBID_ATTR: ['style', 'id', 'class'],
  ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|#)/i,
};

export function htmlAman(teks) {
  return DOMPurify.sanitize(md.render(teks || ''), OPSI);
}

/** Render markdown ke elemen (dikosongkan dulu). */
export function renderMarkdown(el, teks) {
  el.innerHTML = htmlAman(teks);
  return el;
}
