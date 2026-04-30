const HEADING_RE = /^## (\d+)\.\s+(.+?)\s*$/;
const FIELD_RE = /^- \*\*([^:]+):\*\*\s*(.*)$/;
const QUOTE_RE = /^\s*>\s?(.*)$/;
const BAD_HEADING_RE = /^## (?!\d)/;

const FIELD_KEY_MAP = {
  'format': 'format',
  'native size': 'nativeSize',
  'reference to attach': 'reference',
  'status': 'status',
};

export function parsePromptsFile(content) {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const entries = [];
  let current = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (BAD_HEADING_RE.test(line)) {
      throw new Error(`Invalid section heading (must be "## N. <path>"): ${line}`);
    }

    const headingMatch = line.match(HEADING_RE);
    if (headingMatch) {
      if (current) entries.push(current);
      current = {
        index: Number(headingMatch[1]),
        path: headingMatch[2].trim(),
        format: null,
        nativeSize: null,
        reference: null,
        status: null,
        prompt: null,
      };
      continue;
    }

    if (!current) continue;

    const fieldMatch = line.match(FIELD_RE);
    if (!fieldMatch) continue;

    const rawKey = fieldMatch[1].trim().toLowerCase();
    const value = fieldMatch[2].trim();

    if (rawKey === 'prompt') {
      const promptLines = [];
      let j = i + 1;
      while (j < lines.length) {
        const next = lines[j];
        if (HEADING_RE.test(next)) break;
        const qm = next.match(QUOTE_RE);
        if (qm) {
          promptLines.push(qm[1]);
        } else if (next.trim() === '' && promptLines.length === 0) {
          // skip leading blank between "- **Prompt:**" and first quote line
        } else {
          break;
        }
        j++;
      }
      current.prompt = promptLines.join('\n').trim();
      i = j - 1;
      continue;
    }

    const mappedKey = FIELD_KEY_MAP[rawKey];
    if (mappedKey) current[mappedKey] = value;
  }

  if (current) entries.push(current);
  return entries;
}
