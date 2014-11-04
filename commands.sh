ogr2ogr -f "GeoJSON" -s_srs EPSG:3044 -t_srs EPSG:4326 assets/geo/output.geojson sources/geo/VG250_DDRBEZ89_OHNEGF.shp
topojson --id-property "DDRBEZ89" --out assets/geo/ddr89.json -q 2000 -s 0.00000004 assets/geo/ddr89.geojson

