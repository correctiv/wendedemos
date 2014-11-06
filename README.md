Demonstrationen vom 13. August 1989 bis 30. April 1990 in der DDR
==========

## iFrame Embed

Folgender iFrame-Code kann zum Embed benutzt werden

    <iframe src="https://correctiv.github.io/wendedemos/" style="width:400px;height:400px;" frameborder="0"></iframe>

Folgende URL-flags stehen zur Verfügung:

- `autoplay`: spielt die Animation sofort ab
- `flash`: flasht die Bezirke bei Aktionen
- `ticker`: lässt einen Ticker der Demomeldungen im Hintergrund laufen

Beispiel-URL: https://correctiv.github.io/wendedemos/?autoplay&flash&ticker

## Dokumentation

Datenquelle:
* http://www.archiv-buergerbewegung.de/index.php/demonstrationen

Verwendete Libraries:
* D3.js
* topojson

Datenvorbereitung:
* morph.io
  https://morph.io/mxfh/abl
* google spreadsheets (download as tsv)
  * mapbox geocoder script für google spreadsheets: https://github.com/mapbox/geo-googledocs
  * demos:
    * edit: https://docs.google.com/spreadsheets/d/1ET3pvUhKrPftifCbsRMu3mPbmPNHD6YSrgkeWNdvNNg/edit#gid=1528299185
    * tsv: https://docs.google.com/spreadsheets/d/1ET3pvUhKrPftifCbsRMu3mPbmPNHD6YSrgkeWNdvNNg/export?gid=1528299185&format=tsv&filename=demos
  * orte:
    * edit: https://docs.google.com/spreadsheets/d/1ET3pvUhKrPftifCbsRMu3mPbmPNHD6YSrgkeWNdvNNg/edit#gid=1266406088
    * tsv: https://docs.google.com/spreadsheets/d/1ET3pvUhKrPftifCbsRMu3mPbmPNHD6YSrgkeWNdvNNg/export?gid=1266406088&format=tsv
* qgis
* topojson
* ogr2ogr


Mögliche Breakpoints für Animation:
* Transit der Pragflüchtlinge durch Sachsen
* Erste Montagsdemo
* 4.11. Kundgebung in Berlin
* 9.11. Mauerfall (implementiert)
* 4.12. Besetzung Der Stasizentralen
*   12. Streiks
* Kundgebungen mit Helmut Kohl
* freie Volkskammerwahl
