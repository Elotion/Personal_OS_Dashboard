// Converts a CSS declaration string into a React style object.
// Lets us carry the Claude Design inline styles over verbatim.
export function css(str) {
  const out = {};
  if (!str) return out;
  str.split(';').forEach((rule) => {
    const i = rule.indexOf(':');
    if (i === -1) return;
    const prop = rule.slice(0, i).trim();
    const val = rule.slice(i + 1).trim();
    if (!prop || !val) return;
    if (prop.startsWith('--')) {
      out[prop] = val;
      return;
    }
    const camel = prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    out[camel] = val;
  });
  return out;
}

export default css;
