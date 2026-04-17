/**
 * Area URL Preview — Vercel Serverless Function
 * File: api/url-preview.js
 *
 * Fetches open graph metadata from any public URL.
 * Returns: title, description, image, favicon, domain
 *
 * Usage:
 *   GET /api/url-preview?url=https://example.com
 *   Response: { title, description, image, favicon, domain, url }
 */

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'url query param is required' });
  }

  let parsedURL;
  try {
    parsedURL = new URL(url);
  } catch (e) {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  // Security: only allow http/https
  if (!['http:', 'https:'].includes(parsedURL.protocol)) {
    return res.status(400).json({ error: 'Only http/https URLs are supported' });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AreaBot/1.0; +https://area.ai/bot)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      }
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return res.status(200).json({
        title: parsedURL.hostname,
        description: 'Could not fetch page (status ' + response.status + ')',
        image: null,
        favicon: 'https://' + parsedURL.hostname + '/favicon.ico',
        domain: parsedURL.hostname,
        url: url
      });
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      return res.status(200).json({
        title: parsedURL.pathname.split('/').pop() || parsedURL.hostname,
        description: contentType,
        image: null,
        favicon: 'https://' + parsedURL.hostname + '/favicon.ico',
        domain: parsedURL.hostname,
        url: url
      });
    }

    const html = await response.text();

    // Parse meta tags
    function getMeta(property, fallback) {
      // og:property
      const ogMatch = html.match(
        new RegExp('<meta[^>]+(?:property|name)=["\']' + property.replace(':', ':') + '["\'][^>]*content=["\']([^"\']*)["\']', 'i')
      );
      if (ogMatch) return ogMatch[1];

      // content first version
      const ogMatch2 = html.match(
        new RegExp('<meta[^>]+content=["\']([^"\']*)["\'][^>]*(?:property|name)=["\']' + property + '["\']', 'i')
      );
      if (ogMatch2) return ogMatch2[1];

      return fallback || '';
    }

    function getTitleTag() {
      const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      return match ? match[1].trim() : '';
    }

    const title =
      getMeta('og:title') ||
      getMeta('twitter:title') ||
      getTitleTag() ||
      parsedURL.hostname;

    const description =
      getMeta('og:description') ||
      getMeta('twitter:description') ||
      getMeta('description') ||
      '';

    let image =
      getMeta('og:image') ||
      getMeta('twitter:image') ||
      getMeta('twitter:image:src') ||
      null;

    // Resolve relative image URL
    if (image && !image.startsWith('http')) {
      try {
        image = new URL(image, url).href;
      } catch (e) {
        image = null;
      }
    }

    const favicon =
      'https://www.google.com/s2/favicons?domain=' + parsedURL.hostname + '&sz=32';

    return res.status(200).json({
      title: decodeHTMLEntities(title.trim()),
      description: decodeHTMLEntities(description.trim()),
      image: image,
      favicon: favicon,
      domain: parsedURL.hostname,
      url: url
    });

  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(200).json({
        title: parsedURL.hostname,
        description: 'Request timed out after 8 seconds.',
        image: null,
        favicon: 'https://' + parsedURL.hostname + '/favicon.ico',
        domain: parsedURL.hostname,
        url: url
      });
    }
    console.error('URL preview error:', err);
    return res.status(200).json({
      title: parsedURL.hostname,
      description: 'Could not fetch preview: ' + err.message,
      image: null,
      favicon: 'https://' + parsedURL.hostname + '/favicon.ico',
      domain: parsedURL.hostname,
      url: url
    });
  }
}

// Decode common HTML entities
function decodeHTMLEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num)))
    .replace(/&[a-z]+;/g, '');
}
