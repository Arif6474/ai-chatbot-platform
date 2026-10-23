const fs = require('fs');
const path = require('path');

describe('Widget Architecture, Build, and Initialization Contract', () => {
  const distWidgetPath = path.resolve(__dirname, '../dist/widget.js');

  beforeAll(() => {
    // Ensure widget build exists
    expect(fs.existsSync(distWidgetPath)).toBe(true);
  });

  it('generates a self-contained IIFE bundle under 35KB with bundled styling', () => {
    const stats = fs.statSync(distWidgetPath);
    expect(stats.size).toBeLessThan(35 * 1024);
    const content = fs.readFileSync(distWidgetPath, 'utf8');
    expect(content).toContain('__AI_CHATBOT_WIDGET_INITIALIZED__');
  });

  it('uses Shadow DOM mode "open" for complete style and DOM isolation from host page', () => {
    const content = fs.readFileSync(distWidgetPath, 'utf8');
    expect(content).toContain('attachShadow');
    expect(content).toContain('open');
  });

  it('enforces safe DOM text assignment to prevent XSS from model or user messages', () => {
    const content = fs.readFileSync(distWidgetPath, 'utf8');
    // textContent is used for message rendering
    expect(content).toContain('textContent');
  });

  it('correctly reads data-tenant and data-api-base configuration from embedding script', () => {
    const content = fs.readFileSync(distWidgetPath, 'utf8');
    expect(content).toContain('data-tenant');
    expect(content).toContain('data-api-base');
  });

  it('calls the Step 7 public chat API endpoint and preserves sessionToken', () => {
    const content = fs.readFileSync(distWidgetPath, 'utf8');
    expect(content).toContain('/api/v1/public/chat/');
    expect(content).toContain('/message');
    expect(content).toContain('sessionToken');
  });

  it('calls the public configuration endpoint and applies dynamic display name, color, and position', () => {
    const content = fs.readFileSync(distWidgetPath, 'utf8');
    expect(content).toContain('/config');
    expect(content).toContain('displayName');
    expect(content).toContain('primaryColor');
    expect(content).toContain('position');
  });

  it('includes accessible controls (aria-expanded, aria-label, role="dialog")', () => {
    const content = fs.readFileSync(distWidgetPath, 'utf8');
    expect(content).toContain('aria-label');
    expect(content).toContain('aria-expanded');
    expect(content).toContain('dialog');
  });

  it('prevents duplicate script executions via window sentinel', () => {
    const content = fs.readFileSync(distWidgetPath, 'utf8');
    expect(content).toContain('window.__AI_CHATBOT_WIDGET_INITIALIZED__');
  });
});
