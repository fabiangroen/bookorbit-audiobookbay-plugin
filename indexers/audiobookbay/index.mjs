/**
 * AudioBook Bay as a BookOrbit indexer plugin.
 *
 * Written against pages saved from audiobookbay.lu on 2026-10-24: one search results page and one
 * detail page. It scrapes HTML, so it is only as stable as that markup. A mirror with another theme
 * will need the parser looked at again.
 *
 * The site publishes no swarm counts and no magnet link on its search page. A release's info hash
 * and tracker list live on its detail page, so after a search the plugin reads the detail page of
 * the few best-matching results and builds the magnet itself. That is why a search costs one request
 * for the results plus up to MAX_DETAIL_LOOKUPS more, a few at a time. It is a donated service of
 * unknown capacity: keep the numbers small.
 *
 * AudioBook Bay has blocked other clients by User-Agent before. The one it is sent is the single
 * constant below, so it is the first thing to look at if every request answers 403.
 *
 * The grab itself is the site's own .torrent file, linked from the detail page, which is what the
 * `fetchTorrentFile` hook hands to BookOrbit. The magnet built from the info hash rides along on each
 * release for display, but the loader needs one of the two fetch hooks, so the .torrent is the path.
 * What that download link answers has not been seen: a page that is not a torrent is refused with a
 * message that says so.
 *
 * Dependency free and single file on purpose. A plugin runs inside the BookOrbit process with that
 * process's access, so it has to be something a person can read start to finish before trusting it.
 * It reaches the network only through `host.fetch`.
 */

/** Results a search page returns, and how many of them get a detail lookup. */
const MAX_DETAIL_LOOKUPS = 6;
const DETAIL_CONCURRENCY = 3;

/** The site's own search box caps a query at 50 characters. */
const MAX_QUERY_LENGTH = 50;

/** More trackers than this adds nothing a download client will use. */
const MAX_TRACKERS = 8;

/** A real .torrent is a few hundred kilobytes at most. Anything larger is not one. */
const MAX_TORRENT_BYTES = 5 * 1024 * 1024;

/**
 * A single audiobook that is bigger than this is a collection or a site rip, not the book that was
 * asked for. Dropped before any detail lookup is spent on it, unless nothing else is left.
 */
const MAX_SIZE_BYTES = 10 * 1024 ** 3;

const USER_AGENT = 'Mozilla/5.0 (compatible; BookOrbit)';

const LEADING_ARTICLES = new Set(['the', 'a', 'an']);

const UNIT_BYTES = { bytes: 1, kbs: 1024, mbs: 1024 ** 2, gbs: 1024 ** 3, tbs: 1024 ** 4 };

/** The site states a language as its English name; the release matcher compares codes. */
const LANGUAGE_BY_NAME = {
  arabic: 'ar',
  chinese: 'zh',
  czech: 'cs',
  danish: 'da',
  dutch: 'nl',
  english: 'en',
  finnish: 'fi',
  french: 'fr',
  german: 'de',
  greek: 'el',
  hebrew: 'he',
  hindi: 'hi',
  hungarian: 'hu',
  italian: 'it',
  japanese: 'ja',
  korean: 'ko',
  latin: 'la',
  norwegian: 'no',
  polish: 'pl',
  portuguese: 'pt',
  russian: 'ru',
  spanish: 'es',
  swedish: 'sv',
  turkish: 'tr',
};

export default {
  apiVersion: 1,
  version: '0.1.0',
  type: 'audiobookbay',
  label: 'AudioBook Bay',
  requiresCredential: false,
  credentialKind: null,
  mediaKinds: ['audiobook'],
  usesCategories: false,
  // The grab is a magnet, so it joins a swarm.
  seedsBack: true,
  defaultBaseUrl: 'https://audiobookbay.lu',
  baseUrlHint: 'The address of the AudioBook Bay mirror you use. Mirrors change, so set whichever one answers.',

  async search(query, config, host, signal) {
    const limit = Math.max(1, Math.min(query.limit, MAX_DETAIL_LOOKUPS));
    const wanted = stripEditionQualifiers(query.title);

    // Title and author first: it is the narrower search, and the site's titles end in the author.
    // The bare title follows only if that found nothing.
    for (const text of searchTexts(query, wanted, host)) {
      if (signal.aborted) break;

      const html = await getPage(host, searchUrl(config, text), true);
      const rows = parseSearchPage(html, config.baseUrl);
      if (rows.length === 0) continue;

      const chosen = choose(rows, wanted).slice(0, limit);
      if (chosen.length === 0) {
        host.logger.warn(`audiobookbay: the site answered "${text}" with ${rows.length} results and none of them is "${wanted}"`);
        continue;
      }

      const releases = await lookUp(chosen, host, signal);
      if (releases.length > 0) return releases;
    }

    return [];
  },

  async test(config, host) {
    try {
      const html = await getPage(host, new URL(config.baseUrl).href, false);
      if (!/AudioBook\s*Bay/i.test(html)) return { success: false, error: 'That URL answered, but not with AudioBook Bay' };
      return { success: true, indexerName: 'AudioBook Bay' };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },

  /**
   * The .torrent the site publishes for the release, fetched from the link its detail page gave. A
   * page that is not a torrent (an interstitial, a block, a login wall) is refused here, because a
   * download client would take the HTML for a corrupt torrent and fail with a far less useful message.
   */
  async fetchTorrentFile(release, config, host) {
    const url = release.downloadUrl ? sameOriginUrl(release.downloadUrl, config.baseUrl) : null;
    if (!url) throw host.fail('error', `lists "${release.title}" but published no torrent for it. Pick another release.`);

    const response = await send(host, url, 'application/x-bittorrent, */*');
    if (response.status === 429) throw host.fail('throttled', 'is rate limiting us');
    if (!response.ok) throw host.fail('error', `answered ${response.status} for the torrent file`);

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!looksLikeTorrent(bytes)) {
      throw host.fail('error', 'answered with a page instead of a torrent file. The download link may need a browser step this plugin cannot take.');
    }
    return bytes;
  },
};

/**
 * What to ask the site, in the order worth asking, deduplicated. `buildSearchText` is the host's own
 * text: parentheticals stripped and the author appended.
 */
function searchTexts(query, wanted, host) {
  const combined = query.author ? host.buildSearchText(query).trim() : '';
  const texts = [combined, wanted].filter((text) => text.length > 0 && text.length <= MAX_QUERY_LENGTH);
  if (texts.length === 0 && wanted.length > 0) texts.push(wanted.slice(0, MAX_QUERY_LENGTH).trim());
  return [...new Set(texts)];
}

function searchUrl(config, text) {
  const base = new URL(config.baseUrl);
  const url = new URL(`${base.pathname.replace(/\/+$/, '')}/`, base);
  // Lower case, as every search link on the site is written. A capitalised query is the one thing a
  // browser never sends, and the site answered one with its latest uploads instead of results.
  url.search = new URLSearchParams({ s: text.toLowerCase() }).toString();
  return url.href;
}

/** The one place a request is made, so a refusal or a timeout is reported the same way everywhere. */
async function send(host, url, accept) {
  try {
    return await host.fetch(url, { headers: { Accept: accept, 'User-Agent': USER_AGENT } });
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    if (name === 'AbortError' || name === 'TimeoutError') throw host.fail('timeout', 'did not answer in time');
    throw host.fail('unreachable', `could not be reached: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** A bencoded dictionary that has an info section. Cheap, and enough to tell a torrent from a web page. */
function looksLikeTorrent(bytes) {
  if (bytes.length < 20 || bytes.length > MAX_TORRENT_BYTES || bytes[0] !== 0x64) return false;
  return new TextDecoder('latin1').decode(bytes).includes('4:info');
}

async function getPage(host, url, emptyOn404) {
  const response = await send(host, url, 'text/html');

  if (response.status === 404 && emptyOn404) return '';
  if (response.status === 429) throw host.fail('throttled', 'is rate limiting us');

  const html = response.ok || response.status === 403 || response.status === 503 ? await safeText(response) : '';
  if (isChallenge(html)) throw host.fail('error', 'is asking for a browser check this plugin cannot pass');
  if (!response.ok) throw host.fail('error', `answered ${response.status}`);
  return html;
}

async function safeText(response) {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

/** A Cloudflare interstitial has none of the site's own markup, so a real page never trips this. */
function isChallenge(html) {
  return /just a moment|cf-chl|cf-browser-verification/i.test(html) && !/class="post"|AudioBook\s*Bay/i.test(html);
}

/**
 * Drop the obvious collections, then prefer results whose title holds the requested one. The site's
 * search also matches keywords, so a search for one book returns box sets that merely mention it.
 * Nothing else is returned. A result whose title does not hold the requested one is not a worse
 * choice, it is a different book, and a site that ignores the query and answers with its latest
 * uploads would otherwise fill the picker with them.
 */
function choose(rows, wanted) {
  const sized = rows.filter((row) => row.sizeBytes === null || row.sizeBytes <= MAX_SIZE_BYTES);
  const pool = sized.length > 0 ? sized : rows;

  const target = normalize(wanted);
  if (!target) return pool;
  const targets = [...new Set([target, stripLeadingArticle(target)])];
  return pool.filter((row) => {
    const text = normalize(row.bookTitle);
    if (targets.some((candidate) => text.includes(candidate))) return true;
    const words = new Set(text.split(' '));
    return target.split(' ').every((word) => words.has(word));
  });
}

/**
 * Read the detail page of each chosen row, a few at a time. A row whose page cannot be read is
 * dropped. If every one fails, the last failure is thrown so a block shows up as a failing indexer
 * rather than as a book nobody has recorded.
 */
async function lookUp(rows, host, signal) {
  const found = new Array(rows.length).fill(null);
  let next = 0;
  let lastError = null;

  async function worker() {
    while (!signal.aborted) {
      const index = next++;
      if (index >= rows.length) return;
      try {
        const html = await getPage(host, rows[index].detailUrl, false);
        found[index] = toRelease(rows[index], parseDetail(html));
      } catch (error) {
        lastError = error;
        host.logger.warn(`audiobookbay: detail page for "${rows[index].slug}" failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(DETAIL_CONCURRENCY, rows.length) }, worker));

  const releases = found.filter(Boolean);
  if (releases.length === 0 && lastError) throw lastError;
  return releases;
}

/** One result per `<div class="post">` on a search page. */
function parseSearchPage(html, baseUrl) {
  const rows = [];
  for (const chunk of html.split('<div class="post">').slice(1)) {
    const body = chunk.split('<div class="navigation"')[0];

    const heading = /<h2><a href="([^"]+)"[^>]*>([\s\S]*?)<\/a><\/h2>/.exec(body);
    if (!heading) continue;

    const detailUrl = sameOriginUrl(heading[1], baseUrl);
    const slug = detailUrl ? new URL(detailUrl).pathname.split('/').filter(Boolean).pop() : '';
    if (!detailUrl || !slug) continue;

    const fullTitle = decodeEntities(stripTags(heading[2])).replace(/\s+/g, ' ').trim();
    if (!fullTitle) continue;

    // Titles read "Book - Author". The author is after the last separator, because a book's own
    // title can hold one too.
    const split = fullTitle.lastIndexOf(' - ');
    const bookTitle = split > 0 ? fullTitle.slice(0, split).trim() : fullTitle;
    const author = split > 0 ? fullTitle.slice(split + 3).trim() : '';

    const language = /Language:\s*([^<]+)/.exec(body);
    const formatBitrate = /Format:\s*<span[^>]*>([^<]*)<\/span>\s*\/\s*Bitrate:\s*<span[^>]*>([^<]*)<\/span>/i.exec(body);
    const size = /File Size:\s*<span[^>]*>([\d.,]+)<\/span>\s*(Bytes|KBs|MBs|GBs|TBs)/i.exec(body);
    const posted = /Posted:\s*([^<]+)</.exec(body);

    rows.push({
      slug,
      detailUrl,
      fullTitle,
      bookTitle,
      author,
      languageName: language ? language[1].trim() : '',
      format: formatBitrate ? formatBitrate[1].trim() : '',
      bitrateText: formatBitrate ? formatBitrate[2].trim() : '',
      sizeBytes: size ? parseSize(size[1], size[2]) : null,
      publishedAt: posted ? parseDate(posted[1]) : undefined,
    });
  }
  return rows;
}

/** What the detail page adds: the info hash, the trackers, who read it, and the file list. */
function parseDetail(html) {
  const hash = /Info Hash:<\/td>\s*<td[^>]*>\s*([0-9a-f]{40})\s*<\/td>/i.exec(html);
  const announce = /Announce URL:<\/td>\s*<td[^>]*>\s*([^<\s]+)\s*<\/td>/i.exec(html);
  const trackers = [...html.matchAll(/<td>Tracker:<\/td>\s*<td[^>]*>\s*([^<\s]+)\s*<\/td>/gi)].map((match) => match[1]);

  const narrators = [...html.matchAll(/<span class=["']narrator["'][^>]*>([^<]+)<\/span>/g)]
    .map((match) => decodeEntities(match[1]).trim())
    .filter(Boolean);
  const author = /<span class=["']author["'][^>]*>([^<]+)<\/span>/.exec(html);
  const format = /<span class=["']format["'][^>]*>([^<]*)<\/span>/.exec(html);
  const abridged = /<span class=["']is_abridged["'][^>]*>([^<]*)<\/span>/.exec(html);

  const combined = /Combined File Size:<\/td>\s*<td[^>]*>\s*<span[^>]*>([\d.,]+)<\/span>\s*(Bytes|KBs|MBs|GBs|TBs)/i.exec(html);
  const fileCount = (html.match(/\.(?:m4b|mp3|m4a|flac|opus|ogg|aac|wma)\s+[\d.,]+\s*(?:Bytes|KBs|MBs|GBs|TBs)\s*<\/td>/gi) ?? []).length;

  const torrent = /<a href=["']([^"']+)["'][^>]*>\s*Torrent Free Downloads\s*<\/a>/i.exec(html);

  return {
    infoHash: hash ? hash[1].toLowerCase() : null,
    torrentHref: torrent ? decodeEntities(torrent[1]) : '',
    trackers: [...new Set([announce ? announce[1] : '', ...trackers].filter(isTrackerUrl))],
    narrators: [...new Set(narrators)],
    author: author ? decodeEntities(author[1]).trim() : '',
    format: format ? format[1].trim() : '',
    abridged: abridged ? abridged[1].trim().toLowerCase() === 'abridged' : false,
    sizeBytes: combined ? parseSize(combined[1], combined[2]) : null,
    fileCount,
  };
}

function toRelease(row, detail) {
  // Without a hash there is nothing to grab, so the result is not a worse choice, it is not a choice.
  if (!detail.infoHash) return null;

  // The grab is the site's own .torrent file. With no link to one there is nothing to hand over.
  const downloadUrl = detail.torrentHref ? sameOriginUrl(detail.torrentHref, row.detailUrl) : null;
  if (!downloadUrl) return null;

  const magnet =
    `magnet:?xt=urn:btih:${detail.infoHash}&dn=${encodeURIComponent(row.fullTitle)}` +
    detail.trackers
      .slice(0, MAX_TRACKERS)
      .map((tracker) => `&tr=${encodeURIComponent(tracker)}`)
      .join('');

  const readers = namedReaders(detail.narrators);
  const author = row.author || detail.author;
  const format = (detail.format || row.format).toLowerCase();
  const language = LANGUAGE_BY_NAME[row.languageName.toLowerCase()];
  const bitrate = /(\d+)\s*kbps/i.exec(row.bitrateText);

  return {
    guid: row.slug,
    // Decorated the way a tracker decorates a release name: who read it is what tells apart several
    // recordings of one book.
    title: `${row.fullTitle}${detail.abridged ? ' [Abridged]' : ''}${readers ? ` (${readers})` : ''}`,
    bookTitle: row.bookTitle,
    downloadUrl,
    magnet,
    infoHash: detail.infoHash,
    infoUrl: row.detailUrl,
    sizeBytes: detail.sizeBytes ?? row.sizeBytes,
    // The site publishes no swarm counts. Null, never zero, or the zero-seeder filter drops everything.
    seeders: null,
    leechers: null,
    ...(format && format !== '?' ? { format } : {}),
    ...(language ? { language } : {}),
    ...(author ? { author } : {}),
    ...(row.publishedAt ? { publishedAt: row.publishedAt } : {}),
    audio: {
      bitrateKbps: bitrate ? Number(bitrate[1]) : null,
      bitrateMode: /variable/i.test(row.bitrateText) ? 'VBR' : null,
      channels: null,
      samplingRateHz: null,
      durationSeconds: null,
      chapterCount: null,
    },
    ...(detail.fileCount > 0 ? { primaryFileCount: detail.fileCount } : {}),
  };
}

/** Bare names, most to least: two are named and the rest become a count. */
function namedReaders(narrators) {
  if (narrators.length === 0) return '';
  const named = narrators.slice(0, 2).join(', ');
  return narrators.length > 2 ? `${named} +${narrators.length - 2}` : named;
}

/**
 * A metadata provider routinely appends an edition qualifier: "Project Hail Mary (Unabridged)". No
 * title on the site carries one, and the site ANDs its terms, so one would match nothing.
 */
function stripEditionQualifiers(title) {
  const stripped = title
    .replace(/[([{][^)\]}]*[)\]}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return stripped.length > 0 ? stripped : title.trim();
}

function stripLeadingArticle(text) {
  const [first, ...rest] = text.split(' ');
  return rest.length > 0 && LEADING_ARTICLES.has(first) ? rest.join(' ') : text;
}

/** Lower case, accents folded, everything that is not a letter or digit collapsed to one space. */
function normalize(text) {
  return String(text)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** A link on the page, forced onto the configured host so a stray absolute link cannot redirect a fetch. */
function sameOriginUrl(href, baseUrl) {
  try {
    const base = new URL(baseUrl);
    const link = new URL(href, base);
    return new URL(`${link.pathname}${link.search}`, base).href;
  } catch {
    return null;
  }
}

function isTrackerUrl(value) {
  try {
    const protocol = new URL(value).protocol;
    return protocol === 'http:' || protocol === 'https:' || protocol === 'udp:';
  } catch {
    return false;
  }
}

function parseSize(amount, unit) {
  const value = Number(String(amount).replace(/,/g, ''));
  const multiplier = UNIT_BYTES[String(unit).toLowerCase()];
  return Number.isFinite(value) && multiplier ? Math.round(value * multiplier) : null;
}

/** "12 Jul 2026", read as UTC. */
function parseDate(text) {
  const parsed = Date.parse(`${text.trim()} UTC`);
  return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString();
}

function stripTags(text) {
  return text.replace(/<[^>]*>/g, '');
}

const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(text) {
  return text.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (whole, decimal, hex, name) => {
    if (name) return NAMED_ENTITIES[name.toLowerCase()] ?? whole;
    const code = decimal ? Number(decimal) : parseInt(hex, 16);
    return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  });
}
