# German Providers für Nuvio

> [!WARNING]
> Dieses Projekt ist noch in Entwicklung. Einzelne Provider können ausfallen, weil sich die Seiten oder Hoster ändern.
> Wenn etwas nicht funktioniert, [öffne gerne ein Issue](https://github.com/InvalidPandaa/nuvio-german-providers/issues/new/choose).

Deutsche Quellen für [Nuvio](https://github.com/NuvioMedia), portiert aus dem CloudStream-Repo
[Bnyro/GermanProviders](https://github.com/Bnyro/GermanProviders). Anders als die CloudStream-`.cs3`-Erweiterungen
(Android-Bytecode, in Nuvio nur auf Android nutzbar) sind das reine JavaScript-Plugins im Nuvio-Format und laufen
auf allen Plattformen: Android, Android TV, iOS, macOS, Windows.

## Installation

In Nuvio in den Plugin-Einstellungen ein Repository mit der **rohen** URL der `manifest.json` hinzufügen:

```
https://invalidpandaa.github.io/nuvio-german-providers/manifest.json
```

<details>
<summary><b>Addon Variante (für ältere Geräte ohne Plugin Unterstützung)</b></summary>

### Installation

In Nuvio unter **Einstellungen → Addons** diese Addon-URL einfügen:

```
https://<ADDON-DOMAIN>/manifest.json
```

<details>
<summary><b> Selbst hosten (Docker)</b></summary>

Du brauchst einen [TMDB-API-Key](https://www.themoviedb.org/settings/api) (kostenlos).

```bash
docker build -t german-providers-addon .
```

```bash
docker run -d -p 7000:7000 -e TMDB_API_KEY=dein_key german-providers-addon
```

Das Addon liegt dann unter `http://<server>:7000/manifest.json`. Für eine öffentlich erreichbare Instanz gehört ein
Reverse-Proxy mit HTTPS davor. Mit **Dokploy**: neue Application aus diesem Repo, Build-Typ
`Dockerfile`, Port 7000, Domain mit HTTPS eintragen, Env-Variablen im Environment-Tab setzen. Der Healthcheck
(`/health`) ist im Image eingebaut.

| Variable | Standard | Bedeutung |
|---|---|---|
| `TMDB_API_KEY` | – | **Pflicht.** Für IMDb→TMDB-Zuordnung und Titelsuche |
| `PORT` | `7000` | Port des Servers |
| `ADDON_TOKEN` | – | Wenn gesetzt, läuft alles nur unter `/<token>/…` (z. B. `https://domain/<token>/manifest.json`) |
| `PROXY_MODE` | `auto` | `auto`: Streams, die Header brauchen, über den Proxy · `all`: alles · `off`: nichts (auf Tizen gehen dann nur Mediatheken) |
| `PROXY_PROVIDERS` | `dmax,tele5,tlc` | Provider, die immer über den Proxy laufen, weil ihre Links an die abrufende IP gebunden sind (kommagetrennt, leer = keine) |
| `PROXY_SECRET` | zufällig | Schlüssel für die signierten Proxy-Links; ohne Angabe sind die Links nach einem Neustart ungültig |
| `PROVIDERS_DISABLED` | – | Provider komplett abschalten (kommagetrennte IDs, z. B. `serienstream,aniworld`) |
| `PROVIDER_TIMEOUT_MS` | `30000` | Maximale Laufzeit pro Provider, langsame Provider fallen danach weg |
| `CACHE_TTL_S` | `180` | Wie lange Ergebnisse zwischengespeichert werden (`0` = aus) |
| `RATE_LIMIT_PER_MIN` | `30` | Stream-Anfragen pro IP und Minute (`0` = aus) |

Lokal testen: `npm run addon` startet den Server (Key aus `TMDB_API_KEY` oder `.tmdb_key`), `npm run test:addon`
prüft die Logik und fragt ein paar bekannte Filme und Serien ab.

</details>

</details>


## Provider

| Provider | Inhalte | Hinweise |
|---|---|---|
| ARD Mediathek | Filme, Serien | FSK16+ nur 22–6 Uhr (ARD-Regel) |
| Arte | Filme, Serien | Jugendschutz-Titel nur 22–6 Uhr |
| DMAX, TELE 5, TLC | Filme, Serien | Stream-URLs laufen nach ca. 6 Minuten ab |
| PlutoTV | Filme, Serien | Pluto zeigt nur wechselnde Teile einer Staffel |
| South Park | Serie | nur frei verfügbare Folgen |
| Netzkino | Filme | Suche der Netzkino-API ist lückenhaft |
| Welt | Dokus | nur Einzeldokus, die auf TMDB als Film existieren |
| FilmFrei24, Filmo, FlixiTV, KellerKino, KinoKing, Megakino, FilmPalast, HDFilme, Moflix, Huhu | Filme (teils Serien) | über Hoster wie VOE, Vidara, VidSonic, FireStream, MixDrop … |
| Serienstream, Aniworld | Serien / Anime | s.to zeigt nach ~10 Links pro IP ein Captcha, dann fehlen weitere Links |
| Kinoger, EinschaltenIn | Filme, Serien | **standardmäßig aus**: Seite bzw. einziger Hoster (Dood) liegt hinter Cloudflare |



## Lizenz

GPL-3.0-or-later. Seiten-Logik nach [Bnyro/GermanProviders](https://github.com/Bnyro/GermanProviders) (GPL-3.0),
Hoster-Decoder nach [recloudstream/cloudstream](https://github.com/recloudstream/cloudstream) (GPL-3.0).
Die Plugins hosten keine Inhalte, sie verhalten sich wie ein Browser, der öffentlich erreichbare Seiten aufruft.
