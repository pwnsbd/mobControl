'use strict';

// Serving the module's own client files.
//
// One job: map a URL under the module's base path onto a file inside
// client/, or hand the request back to the host app untouched.

const fs = require('fs');
const path = require('path');

const CONTENT_TYPES = {
  '.js': 'application/javascript; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml'
};

/**
 * @param {{basePath:string, rootDir:string}} options
 * @returns {(req, res, next) => void} Express/Connect middleware
 */
function createAssetMiddleware({ basePath, rootDir }) {
  const root = path.resolve(rootDir);

  return function serveAsset(req, res, next) {
    const passOn = typeof next === 'function' ? next : () => notFound(res);

    const requested = relativeRequestPath(req.url, basePath);
    if (requested === null) return passOn();

    const file = resolveWithinRoot(root, requested);
    if (!file) return passOn();

    res.setHeader('Content-Type', CONTENT_TYPES[path.extname(file)]);
    res.setHeader('Cache-Control', 'no-cache');
    fs.createReadStream(file)
      .on('error', () => fail(res))
      .pipe(res);
  };
}

/** The part of the URL inside our base path, or null if it is not ours. */
function relativeRequestPath(url, basePath) {
  let pathname;
  try {
    pathname = new URL(url, 'http://placeholder').pathname;
  } catch {
    return null;
  }
  const prefix = `${basePath}/`;
  return pathname.startsWith(prefix) ? decodeURIComponent(pathname.slice(prefix.length)) : null;
}

/**
 * Resolve inside client/ and nowhere else. Returns null for anything that
 * escapes the root, has an extension we do not serve, or does not exist.
 * Extensionless paths get the .html they almost certainly meant, so that
 * /phone and /phone.html are the same page.
 */
function resolveWithinRoot(root, requested) {
  if (requested.includes('\0')) return null;

  const withExtension = path.extname(requested) ? requested : `${requested}.html`;
  if (!(path.extname(withExtension) in CONTENT_TYPES)) return null;

  const candidate = path.resolve(root, withExtension);
  // path.resolve collapses '..', so this is the check that contains traversal.
  if (candidate !== root && !candidate.startsWith(root + path.sep)) return null;

  return fs.existsSync(candidate) && fs.statSync(candidate).isFile() ? candidate : null;
}

function notFound(res) {
  res.statusCode = 404;
  res.end('Not found');
}

function fail(res) {
  if (res.headersSent) return res.destroy();
  res.statusCode = 500;
  res.end('mobcontrol: asset could not be read');
}

module.exports = { createAssetMiddleware };
