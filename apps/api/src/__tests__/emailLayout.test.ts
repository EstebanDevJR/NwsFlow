import { describe, expect, it } from 'vitest';
import { buildEmailHtml, escapeHtml, plainTextToHtmlBlocks } from '../lib/emailLayout.js';

describe('emailLayout helpers', () => {
  it('escapes HTML-sensitive characters', () => {
    expect(escapeHtml('<script>alert("x") & test</script>')).toBe('&lt;script&gt;alert(&quot;x&quot;) &amp; test&lt;/script&gt;');
  });

  it('converts plain text into paragraph blocks with line breaks', () => {
    const result = plainTextToHtmlBlocks('Linea 1\nLinea 2\n\nBloque 2');
    expect(result).toContain('<p style=');
    expect(result).toContain('Linea 1<br />Linea 2');
    expect(result).toContain('Bloque 2');
  });

  it('returns empty html blocks for blank text', () => {
    expect(plainTextToHtmlBlocks('   ')).toBe('');
  });
});

describe('buildEmailHtml', () => {
  it('builds default template with escaped heading/body and CTA', () => {
    const html = buildEmailHtml({
      heading: 'Hola <Admin>',
      bodyText: 'Mensaje\ncon salto',
      cta: {
        url: 'https://example.com/?q=<x>',
        label: 'Ir <ahora>',
      },
    });

    expect(html).toContain('NWSPayFlow');
    expect(html).toContain('linear-gradient(135deg, #0f766e 0%, #0d9488 100%)');
    expect(html).toContain('Hola &lt;Admin&gt;');
    expect(html).toContain('Mensaje<br />con salto');
    expect(html).toContain('href="https://example.com/?q=&lt;x&gt;"');
    expect(html).toContain('Ir &lt;ahora&gt;');
  });

  it('uses attention variant and fallback body when text is blank', () => {
    const html = buildEmailHtml({
      heading: 'Atención',
      bodyText: '   ',
      variant: 'attention',
    });

    expect(html).toContain('linear-gradient(135deg, #b45309 0%, #d97706 100%)');
    expect(html).toContain('(Sin contenido)');
  });
});
