import sanitizeHtml from 'sanitize-html';

export function sanitizeText(input: string | null | undefined): string {
  if (!input) {
    return '';
  }
  return sanitizeHtml(input, {
    allowedTags: [],
    allowedAttributes: {},
  });
}
