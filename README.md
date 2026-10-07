# German Providers für Nuvio

## Eigenständige Nuvio-Portierung

Dieses Repository ist ein Fork der Arbeit von `InvalidPandaa/nuvio-german-providers` und wird von Dennys Wiesli eigenständig für Nuvio weitergeführt. Die zugrunde liegende Provider-Logik stammt aus `Bnyro/GermanProviders`. Änderungen am CloudStream-Original werden regelmäßig überwacht; aufgrund der unterschiedlichen Implementierungen werden sie nicht blind in JavaScript überschrieben, sondern als Upstream-Update zur Prüfung gemeldet.

> [!WARNING]
> Dieses Projekt ist noch in Entwicklung. Einzelne Provider können ausfallen, weil sich die Seiten oder Hoster ändern.
> Wenn etwas nicht funktioniert, [öffne gerne ein Issue](https://github.com/dennyswiesli-dev/nuvio-german-providers/issues/new).

Deutsche Quellen für [Nuvio](https://github.com/NuvioMedia), portiert aus dem CloudStream-Repo
[Bnyro/GermanProviders](https://github.com/Bnyro/GermanProviders). Anders als die CloudStream-`.cs3`-Erweiterungen
(Android-Bytecode, in Nuvio nur auf Android nutzbar) sind das reine JavaScript-Plugins im Nuvio-Format und laufen
auf allen Plattformen: Android, Android TV, iOS, macOS, Windows.

## Installation

In Nuvio in den Plugin-Einstellungen ein Repository mit der **rohen** URL der `manifest.json` hinzufügen:

```
https://dennyswiesli-dev.github.io/nuvio-german-providers/manifest.json
```


## Provider

| Provider | Inhalte | Hinweise |
|---|---|---|
| ARD Mediathek | Filme, Serien | FSK16+ nur 22–6 Uhr (ARD-Regel) |
| Arte | Filme, Serien | Jugendschutz-Titel nur 22–6 Uhr |
| DMAX, TELE 5, TLC | Filme, Serien | Stream-URLs laufen nach ca. 6 Minuten ab |
| PlutoTV | Filme, Serien | Pluto zeigt nur wechselnde Teile einer Staffel |
| South Park | Serie | nur frei verfügbare Folgen |
| Netzkino | Filme | Suche der Netzkino-API ist lückenhaft |
| FilmFrei24, Filmo, FlixiTV, KellerKino, Megakino, FilmPalast, HDFilme, Moflix, Huhu | Filme (teils Serien) | über Hoster wie VOE, Vidara, VidSonic, FireStream, MixDrop … |
| KinoKing | Serien | Filme sind abgeschaltet: die Filmseite braucht 12–20 s pro Abruf |
| Serienstream, Aniworld | Serien / Anime | s.to zeigt nach ~10 Links pro IP ein Captcha, dann fehlen weitere Links |



## Lizenz

GPL-3.0-or-later. Seiten-Logik nach [Bnyro/GermanProviders](https://github.com/Bnyro/GermanProviders) (GPL-3.0),
Hoster-Decoder nach [recloudstream/cloudstream](https://github.com/recloudstream/cloudstream) (GPL-3.0).
Die Plugins hosten keine Inhalte, sie verhalten sich wie ein Browser, der öffentlich erreichbare Seiten aufruft.
