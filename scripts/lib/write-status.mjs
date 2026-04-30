export function writeStatusUpdates(content, updates) {
  let result = content.replace(/\r\n/g, '\n');
  for (const [index, newStatus] of updates) {
    const re = new RegExp(
      `(^## ${index}\\.[^\\n]*\\n(?:[^\\n]*\\n)*?- \\*\\*Status:\\*\\* )([^\\n]*)`,
      'm',
    );
    result = result.replace(re, (_, prefix) => `${prefix}${newStatus}`);
  }
  return result;
}
