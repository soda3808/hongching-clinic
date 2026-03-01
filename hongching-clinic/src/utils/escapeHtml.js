// HTML entity escaping to prevent XSS in document.write() print functions
// MUST be used for ALL user-controlled data rendered in HTML strings

const ESCAPE_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
  '`': '&#96;',
};

const ESCAPE_REGEX = /[&<>"'\/`]/g;

export default function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(ESCAPE_REGEX, (char) => ESCAPE_MAP[char] || char);
}

// Alias for template literal usage: h`user data`
export const h = (strings, ...values) => {
  return strings.reduce((result, str, i) => {
    return result + str + (i < values.length ? escapeHtml(values[i]) : '');
  }, '');
};
