// Offline check: the plugin's real search path against markup saved from audiobookbay.lu, with a
// fake host. No network, no BookOrbit. Run with: node verify.mjs
import assert from 'node:assert/strict';
import plugin from './indexers/audiobookbay/index.mjs';

// Three posts copied from a saved search page, plus one SYNTHETIC post (Ender) that exists only to
// exercise HTML entity decoding in a title.
const SEARCH_HTML = `<h1 class="archiveTitle"><strong>Project Hail Mary</strong> Audiobooks Free Download</h1>
<div class="post"><div class="postTitle"><h2><a href="/abss/getv-lost-justin-halpern/" rel="bookmark">Get Lost - Justin Halpern</a></h2></div><div class="postInfo">Category: Humor&nbsp; Mystery&nbsp; <br />Language: English<span style="margin-left:100px;">Keywords: Exciting&nbsp Funny&nbsp </span><br /></div><div class="postContent"><div class="center">
<p class="center">Shared by:<a href="/member/users/index?&amp;mode=userinfo&amp;username=Pinkmann11">Pinkmann11</a></p>
</div>
<p style="center;">
<p style='text-align:center;'>Posted: 12 Jul 2026<br />Format: <span style='color:#a00;'>M4B</span> / Bitrate: <span style='color:#a00;'>?</span><br />File Size: <span style='color:#00f;'>205.01</span> MBs</p>
</div>
<div class='postMeta'>
					<span class='postLink'><a href='https://audiobookbay.lu/abss/getv-lost-justin-halpern/'>Audiobook Details</a></span><span class='postComments'><a href='/dload-now?ll=15Justin_Halpern___Get_Lost' rel='nofollow'>Direct Download</a></span></p>
</div></div><div class="post"><div class="postTitle"><h2><a href="/abss/audilbles-top-sci-fi-fantasy-of-2021-part-2-multiple-authors/" rel="bookmark">Audible&#8217;s Top Sci-Fi &amp; Fantasy of 2021 (Part 2) - Multiple Authors</a></h2></div><div class="postInfo">Category: Fantasy&nbsp; Sci-Fi&nbsp; <br />Language: English<span style="margin-left:100px;">Keywords: 2021&nbsp Audible&nbsp </span><br /></div><div class="postContent"><div class="center">
</div>
<p style="center;">
<p style='text-align:center;'>Posted: 4 May 2022<br />Format: <span style='color:#a00;'>MP3</span> / Bitrate: <span style='color:#a00;'>96 Kbps</span><br />File Size: <span style='color:#00f;'>11.1</span> GBs</p>
</div>
<div class='postMeta'>
					<span class='postLink'><a href='https://audiobookbay.lu/abss/audilbles-top-sci-fi-fantasy-of-2021-part-2-multiple-authors/'>Audiobook Details</a></span></p>
</div></div><div class="post"><div class="postTitle"><h2><a href="/abss/proaject-hail-mary-andy-weir/" rel="bookmark">Project Hail Mary - Andy Weir</a></h2></div><div class="postInfo">Category: Sci-Fi&nbsp; <br />Language: English<span style="margin-left:100px;">Keywords: Andy Weir&nbsp Project Hail Mary&nbsp Road Trip&nbsp </span><br /></div><div class="postContent"><div class="center">
</div>
<p style="center;">
<p style='text-align:center;'>Posted: 14 Nov 2021<br />Format: <span style='color:#a00;'>M4B</span> / Bitrate: <span style='color:#a00;'>128 Kbps</span><br />File Size: <span style='color:#00f;'>881.82</span> MBs</p>
</div>
<div class='postMeta'>
					<span class='postLink'><a href='https://audiobookbay.lu/abss/proaject-hail-mary-andy-weir/'>Audiobook Details</a></span></p>
</div></div><div class="post"><div class="postTitle"><h2><a href="/abss/synthetic-enders-game/" rel="bookmark">Ender&#8217;s Game - Orson Scott Card</a></h2></div><div class="postInfo">Category: Sci-Fi&nbsp; <br />Language: English</div><div class="postContent">
<p style='text-align:center;'>Posted: 1 Jan 2020<br />Format: <span style='color:#a00;'>MP3</span> / Bitrate: <span style='color:#a00;'>Variable</span><br />File Size: <span style='color:#00f;'>400</span> MBs</p>
</div></div>			<div style="margin-bottom:15px;">
            </div>
<div class="navigation" style="margin-bottom:5px;"><div style="text-align:center;"><div class="wp-pagenavi">
<span class="current">1</span><a href="/page/2/?s=project+hail+mary">2</a></div>
 </div></div>
<div id="lsidebar"><li><a href="/?s=full+cast">full cast</a></li></div>`;

// The detail-page parts copied from a saved page (The Dune Saga). Served for every detail lookup, so
// every release in these tests carries Dune's hash.
const DETAIL_HTML = `<div class="postInfo">
<div class="desc" itemprop="description">
<p style="left;">Written by <a href="/?s=frank+herbert&#038;tt=1"><span class="author" itemprop="author" itemtype="https://schema.org/Person">Frank Herbert</span></a> <br />Read by <a href="/?s=george+guidall"><span class="narrator" itemprop="author" itemtype="https://schema.org/Person">George Guidall</span></a>, <a href="/?s=davina+porter"><span class="narrator" itemprop="author" itemtype="https://schema.org/Person">Davina Porter</span></a>, <a href="/?s=simon+vance"><span class="narrator" itemprop="author" itemtype="https://schema.org/Person">Simon Vance</span></a>, <a href="/?s=scott+brick"><span class="narrator" itemprop="author" itemtype="https://schema.org/Person">Scott Brick</span></a>, <a href="/?s=euan+morton"><span class="narrator" itemprop="author" itemtype="https://schema.org/Person">Euan Morton</span></a>, <a href="/?s=katherine+kellgren"><span class="narrator" itemprop="author" itemtype="https://schema.org/Person">Katherine Kellgren</span></a> <br />Format: <span class='format' itemprop="encodingFormat">M4B</span> <br />Bitrate: <span class='bitrate' itemprop="bitrate">Mixed</span> <br /><span class='is_abridged'>Unabridged</span> </p>
</div>
<table border='1' border-color='#dfdfdf' style='margin:0;'>
<tr>
<td style='width:150px;'>Announce URL:</td>
<td style='width:323px;'>http://tracker2.dler.org:80/announce</td>
</tr>
<tr>
<td colspan='2'>This Torrent also has several backup trackers</td>
</tr>
<tr>
<td>Tracker:</td>
<td>http://tracker2.dler.org:80/announce</td>
</tr>
<tr>
<td>Tracker:</td>
<td>http://tracker.bt4g.com:2095/announce</td>
</tr>
<tr>
<td>Tracker:</td>
<td>http://bt.okmp3.ru:2710/announce</td>
</tr>
<tr>
<td>Tracker:</td>
<td>udp://exodus.desync.com:6969/announce</td>
</tr>
<tr>
<td>Tracker:</td>
<td>udp://open.stealth.si:80/announce</td>
</tr>
<tr>
<td>Tracker:</td>
<td>udp://p4p.arenabg.com:1337/announce</td>
</tr>
<tr>
<td>Tracker:</td>
<td>udp://tracker.dler.org:6969/announce</td>
</tr>
<tr>
<td>Tracker:</td>
<td>udp://tracker.opentrackr.org:1337/announce</td>
</tr>
<tr>
<td>Tracker:</td>
<td>udp://tracker.tiny-vps.com:6969/announce</td>
</tr>
<tr>
<td>Tracker:</td>
<td>udp://tracker.torrent.eu.org:451/announce</td>
</tr>
<tr>
<td colspan='2'>This is a Multifile Torrent</td>
</tr>
<tr>
<td colspan='2'>1965 - Dune.m4b 1.32 GBs</td>
</tr>
<tr>
<td colspan='2'>1969 - Dune Messiah.m4b 529.66 MBs</td>
</tr>
<tr>
<td colspan='2'>1976 - Children of Dune.m4b 859.87 MBs</td>
</tr>
<tr>
<td colspan='2'>1981 - God Emperor of Dune.m4b 431.94 MBs</td>
</tr>
<tr>
<td colspan='2'>1984 - Heretics of Dune.m4b 495.2 MBs</td>
</tr>
<tr>
<td colspan='2'>1985 - Chapterhouse Dune.m4b 820.25 MBs</td>
</tr>
<tr>
<td>Combined File Size:</td>
<td><span style='color:#00f;'>4.39</span> GBs</td>
</tr>
<tr>
<td>Info Hash:</td>
<td>4130cd40505a9107413d43c3bd5c522b4be68c5c</td>
</tr>
<tr>
<td>Torrent Download</td>
<td><span style='display:block;font-weight:bold;font-size:11px;font-family:Arial;'><a href='/downld0?downfs=49Dune_Saga_by_Frank_Herbert'>Torrent Free Downloads</a></span></td>
<td style='display:none;'></td>
</tr>
</table></div>`;

const CHALLENGE_HTML = '<html><head><title>Just a moment...</title></head><body>cf-chl-bypass</body></html>';

function makeHost(respond) {
  const requested = [];
  return {
    requested,
    fetch: async (url) => {
      requested.push(url);
      return respond(new URL(url));
    },
    logger: { log() {}, warn() {} },
    buildSearchText: (query) => `${query.title.replace(/\s*\([^)]*\)/g, '')} ${query.author ?? ''}`.trim(),
    fail: (failure, message) => Object.assign(new Error(message), { failure }),
  };
}

const okHost = () =>
  makeHost((url) => {
    if (url.searchParams.has('s')) return new Response(SEARCH_HTML, { status: 200 });
    if (url.pathname.startsWith('/abss/')) return new Response(DETAIL_HTML, { status: 200 });
    return new Response('<title>AudioBook Bay (ABB)</title>', { status: 200 });
  });

const config = {
  id: 1,
  name: 'abb',
  baseUrl: 'https://audiobookbay.lu',
  credential: null,
  allowPrivateAddress: false,
  categories: { ebook: [], audiobook: [] },
  settings: null,
};

const query = (title, author) => ({ title, author, isbn13: null, isbn13s: [], mediaKind: 'audiobook', language: null, limit: 20 });
const signal = new AbortController().signal;

// 1. A decorated title with an author: the combined search goes first, and the title narrows the pool.
{
  const host = okHost();
  const releases = await plugin.search(query('Project Hail Mary (Unabridged)', 'Andy Weir'), config, host, signal);
  assert.match(host.requested[0], /[?&]s=project\+hail\+mary\+andy\+weir$/);
  assert.equal(releases.length, 1);

  const [release] = releases;
  assert.equal(release.guid, 'proaject-hail-mary-andy-weir');
  assert.equal(release.bookTitle, 'Project Hail Mary');
  assert.equal(release.author, 'Andy Weir');
  assert.equal(release.infoHash, '4130cd40505a9107413d43c3bd5c522b4be68c5c');
  assert.ok(release.magnet.startsWith('magnet:?xt=urn:btih:4130cd40505a9107413d43c3bd5c522b4be68c5c&dn='));
  assert.equal(release.magnet.split('&tr=').length - 1, 8);
  assert.equal(release.title, 'Project Hail Mary - Andy Weir (George Guidall, Davina Porter +4)');
  assert.equal(release.format, 'm4b');
  assert.equal(release.language, 'en');
  assert.equal(release.sizeBytes, Math.round(4.39 * 1024 ** 3));
  assert.equal(release.seeders, null);
  assert.equal(release.downloadUrl, 'https://audiobookbay.lu/downld0?downfs=49Dune_Saga_by_Frank_Herbert');
  assert.equal(release.primaryFileCount, 6);
  assert.equal(release.infoUrl, 'https://audiobookbay.lu/abss/proaject-hail-mary-andy-weir/');
  assert.equal(release.publishedAt, '2021-11-14T00:00:00.000Z');
  assert.equal(release.audio.bitrateKbps, 128);
}

// 2. A page that ignores the query and lists unrelated uploads yields nothing, rather than a picker
// full of the wrong books.
{
  const host = okHost();
  const releases = await plugin.search(query('Dune', 'Frank Herbert'), config, host, signal);
  assert.deepEqual(releases, []);
}

// 3. Entities in titles are decoded, and a bitrate word becomes a mode.
{
  const [release] = await plugin.search(query("Ender's Game", null), config, okHost(), signal);
  assert.equal(release.bookTitle, 'Ender\u2019s Game');
  assert.equal(release.audio.bitrateMode, 'VBR');
}

// 4. A browser check is reported as a failing indexer, not as "nothing found".
{
  const host = makeHost(() => new Response(CHALLENGE_HTML, { status: 403 }));
  await assert.rejects(
    () => plugin.search(query('Project Hail Mary', null), config, host, signal),
    (error) => error.failure === 'error' && /browser check/.test(error.message),
  );
}

// 5. test() recognises the site, and refuses an unrelated page.
{
  assert.deepEqual(await plugin.test(config, okHost()), { success: true, indexerName: 'AudioBook Bay' });
  const other = makeHost(() => new Response('<title>Something else</title>', { status: 200 }));
  assert.equal((await plugin.test(config, other)).success, false);
}

// 6. The loader needs exactly one fetch hook, so the plugin declares exactly one.
assert.equal(typeof plugin.fetchTorrentFile, 'function');
assert.equal(plugin.resolveFile, undefined);

// 7. A real torrent file comes back byte for byte. The bytes are a SYNTHETIC minimal torrent, since
// nothing here has seen what the site's download link actually answers.
{
  const torrent = new TextEncoder().encode(
    'd8:announce36:http://tracker2.dler.org:80/announce4:infod4:name4:Dune12:piece lengthi4194304e6:pieces0:ee',
  );
  const host = makeHost(() => new Response(torrent, { status: 200 }));
  const release = { title: 'x', downloadUrl: 'https://audiobookbay.lu/downld0?downfs=49Dune_Saga_by_Frank_Herbert' };
  const bytes = await plugin.fetchTorrentFile(release, config, host);
  assert.deepEqual([...bytes], [...torrent]);
  assert.equal(host.requested[0], release.downloadUrl);
}

// 8. A web page where a torrent should be is refused with a message that says so.
{
  const host = makeHost(() => new Response('<html>Please wait...</html>', { status: 200 }));
  const release = { title: 'x', downloadUrl: 'https://audiobookbay.lu/downld0?downfs=x' };
  await assert.rejects(
    () => plugin.fetchTorrentFile(release, config, host),
    (error) => error.failure === 'error' && /instead of a torrent/.test(error.message),
  );
}

// 9. A release with no link is refused too.
await assert.rejects(
  () => plugin.fetchTorrentFile({ title: 'x' }, config, okHost()),
  (error) => error.failure === 'error' && /no torrent/.test(error.message),
);

console.log('audiobookbay: all checks passed');
