function mauerfall() {
    d3.selectAll(".staatsgrenze").attr("class", "staatsgrenzeoffen");
}
function mauerreset() {
    d3.selectAll(".staatsgrenzeoffen").attr("class", "staatsgrenze");
}
function main() {
    function dateToString(d) {return  d.getDate() + "-" + d.getMonth() + "-" + d.getFullYear()}



    var demos = false,
    locations = false,
    mapReady = false,
    daysPerSecond = 7,   /// sets speed
    timeInterval = [],
    currentDate,
    eventDates = {
        mauerfall: new Date("1989-11-09")
    };


    d3.tsv("assets/data/demos.tsv", function(d) {
        var o = {
            date: new Date(d.date),
            pName: d.p_name,
            pBezirk: d.p_bezirk,
            lKey: d.p_bezirk + "--" + d.p_name,
            partMax: +d.part_max,
            partMax: +d.part_min,
            partGuess: +d.part_guess,
            ratioLoc: +d.ratio_ort,
            ratioBez: +d.ratio_bezirk,
            eTypeName: d.etype_name,
            eTypeCat: d.etype_cat	,
            eOrgName: d.eorg_name,
            eOrgCat: d.eorg_cat,
            eOrgTheme: d.etheme,
            eRemarks: d.eremarks,
            eTypeIsChurch: +d.etype_ischurch,
            eTypeIsDemo: +d.etype_isdemo
        };
        o.dayOfMonth = o.date.getDate();
        o.month = o.date.getMonth();
        o.year = o.date.getFullYear();
        o.dstr = dateToString(o.date);
            return o;
    }, function(error, rows) {
        rows = rows.sort(function(a, b) {
            return d3.ascending(a.date, b.date);
        });
        demos = rows;
        timeInterval = [demos[0].date, demos[demos.length-1].date];
        console.log(timeInterval,rows[1]);
        checkLoadState();
    });

    d3.tsv("assets/data/orte.tsv", function(d) {
        return {
            key: d.KEY,
            pbezirk: d.Bezirk,
            pbl14: d.BL2014,
            pop89: +d.POP1989,
            coords: [+d.lon, +d.lat]
        };
    }, function(error, rows) {
        rows = rows.sort(function(a, b) {
            return d3.ascending(a.key, b.key);
        });
        locations = rows;
        console.log(rows[1]);
        checkLoadState();
    });

    function checkLoadState() {
        if (demos && locations && mapReady) {
            console.log("all loaded");
           showData();
        }
    }

    function showData(interval) {
        if (interval == undefined) {interval = timeInterval;}
        var currentDate = interval[0];
        var endDateStr = dateToString(interval[1]);
        var i = setInterval(function(){
            var currentdstr = dateToString(currentDate);
            var markers = demos.filter(function(e) {if (e.dstr == currentdstr ) {return e;}});

            // if more scripted events write a function to load stuff from json or other description file
            if (currentdstr == dateToString(eventDates.mauerfall)) {mauerfall();}
            console.log(currentdstr, markers.length);

            // todo draw circles from markers events and update time line here

            if (currentdstr == endDateStr) {clearInterval(i);}
            currentDate.setDate(currentDate.getDate() + 1);
        },  parseInt(1000/daysPerSecond));
    }

    var containerId = "vis";
    var target = {
            elem : document.getElementById(containerId),
            ratio : 1.5,
            baseScale : 18000,
            baseSize : 1000
        };
    var width = target.elem.offsetWidth,
        height = target.elem.offsetHeight;
    var dim = Math.min(width, height);
    var formatNumber = d3.format(",.0f");

    var projection = d3.geo.satellite()
        .distance(1.085)
        .scale(target.baseScale * dim/target.baseSize)
        .rotate([-16.5, -38, -11])
        .center([0, 15])
        .tilt(-5)
        .translate([width/2, height/2])
        .clipAngle(Math.acos(1 / 1.09) * 180 / Math.PI - 1e-6)
        .precision(.1);

    var graticule = d3.geo.graticule()
        // [lonmin,latmin + offset for last], [lonmax, latmax + offset for last]
        .extent([[-5, 47], [30+ 1e-6, 85+ 1e-6]])
        .step([1, 1]);

    var path = d3.geo.path()
        .projection(projection);
/*
    var radius = d3.scale.sqrt()
        .domain([0, 1e6])
        .range([0, 15]);
*/
    var svg = d3.select("#vis").append("svg")
        .attr("width", width)
        .attr("height", height);


    svg.append("path")
        .datum(graticule)
        .attr("class", "graticule")
        .attr("d", path);
/*
    var legend = svg.append("g")
        .attr("class", "legend")
        .attr("transform", "translate(" + (width - 50) + "," + (height - 20) + ")")
        .selectAll("g")
        .data([1e6, 5e6, 1e7])
        .enter().append("g");

    legend.append("circle")
        .attr("cy", function (d) {
            return -radius(d);
        })
        .attr("r", radius);

    legend.append("text")
        .attr("y", function (d) {
            return -2 * radius(d);
        })
        .attr("dy", "1.3em")
        .text(d3.format(".1s"));
*/
    d3.json("assets/geo/ddr89.json", function (error, ddr) {
        if (error) return console.error(error);

        svg.append("g")
            .attr("class", "land")
            .selectAll('path')
            .data(topojson.feature(ddr, ddr.objects.ddr89).features)
            .enter().append("path")
            .attr("class", function(d) { return  d.id == undefined ? "BRD" : "Bezirk " + d.id; })
            .attr("d", path);

// Bezirke
        svg.append("path")
            .datum(topojson.mesh(ddr, ddr.objects.ddr89, function (a, b) { return a !== b && a.id !== undefined && b.id !== undefined; }))
            .attr("class", "bezirksgrenze")
            .attr("d", path);
// Staatsgrenze
        svg.append("path")
            .datum(topojson.mesh(ddr, ddr.objects.ddr89, function (a, b) { return a !== b && (a.id == undefined || b.id == undefined); }))
            .attr("class", "staatsgrenze")
            .attr("d", path);

        mapReady=true;
        checkLoadState();
        /*
         svg.append("g")
         .attr("class", "bubble")
         .selectAll("circle")
         .data(topojson.feature(ddr, ddr.objects.VG250_DDRBEZ89_OHNEGF).features
         .sort(function(a, b) { return b.properties.population - a.properties.population; }))
         .enter().append("circle")
         .attr("transform", function(d) { return "translate(" + path.centroid(d) + ")"; })
         .attr("r", function(d) { return radius(d.properties.population); })
         .append("title")
         .text(function(d) {
         return d.properties.name
         + "\nPopulation " + formatNumber(d.properties.population);
         });
         */
    });
}


