# bookorbit-audiobookbay-plugin

An [AudioBook Bay](https://audiobookbay.lu) indexer plugin for BookOrbit (plugin API v1). It searches the site for a requested audiobook, lists the matching releases, and hands BookOrbit the release's `.torrent` file so your download client can fetch it.

It is a single dependency-free file, so you can read it start to finish before you trust it. A plugin runs inside the BookOrbit process, so please do.

## What it does

- Searches the site's `/?s=` page. It tries title plus author first and then the bare title, and the query is lowercased because the site returns nothing useful for capitalized queries.
- Reads each good match's detail page for the info hash, trackers, narrators, author, format, combined size and the torrent link. Detail lookups are limited to a few at a time to go easy on the site.
- Drops releases that do not contain the requested title, and releases over 10 GiB.
- Downloads the real `.torrent` file at grab time (`fetchTorrentFile`) and refuses anything that turns out to be an HTML page.
- Reports no seeder or leecher counts, because the site does not publish them.

It only reads the site's pages and torrent files through BookOrbit's `host.fetch`. It does not log in, store credentials, or write anywhere.

## Install

1. Copy `indexers/audiobookbay/index.mjs` to `<BookOrbit data path>/plugins/indexers/audiobookbay/index.mjs`. In the standard Docker setup that is `/data/plugins/indexers/audiobookbay/index.mjs` inside the app container.
2. Restart BookOrbit.
3. Add AudioBook Bay as a source under Settings, System, Requests. The default base URL is `https://audiobookbay.lu`. Change it if the site moves to another domain.
4. Use a download client that accepts `.torrent` files, for example qBittorrent or a debrid bridge that speaks its API.

## Limitations

- It scrapes HTML, so it is only as stable as the site's markup. It was written against pages saved from `audiobookbay.lu` on 2026-10-24. A mirror with a different theme may need the parser adjusted.
- The site has blocked clients by User-Agent before. The one this plugin sends is a single constant at the top of the file, and it is the first thing to check if every request answers 403.
- File tags and titles on the site are uneven. BookOrbit may hold an import for review when its own metadata lookup disagrees with your request.

## Development

```
node verify.mjs
```

The check script runs the plugin against saved markup and a fake host. It makes no network requests.

## Credits

Written with the help of Claude (Anthropic), under Fabian Groen's direction and testing.

## Disclaimer

This project is not affiliated with AudioBook Bay or BookOrbit. The plugin is a client for a third-party website that links to material it does not host. You are responsible for what you download and for following the laws that apply to you. The authors do not host or distribute any audiobook files.

## License

MIT, see [LICENSE](LICENSE).
