/* globals d3: false */
(function(window){
'use strict';

function dateToString(d) {
    return  d.getDate() + "-" + (d.getMonth() + 1) + "-" + d.getFullYear();
}

function Vis(options){
    options = options || {};
    this.containerId = options.containerId || 'vis';
    this.target = {
        elem: document.getElementById(this.containerId),
        ratio: 1.5,
        baseScale: 18000,
        baseSize: 1000
    };
    this.demos = false;
    this.locations = false;

    this.daysPerSecond = options.daysPerSecond || 7; // sets speed
    this.timeInterval = [];
    this.currentDate = null;
    this.eventDates = {
        mauerfall: new Date("1989-11-09")
    };
    this.mapReady = false;
}

Vis.prototype.init = function(){
    this.loadData();
};

Vis.prototype.loadData = function(){
    d3.json("assets/geo/ddr89.json", this.drawMap.bind(this));

    d3.tsv("assets/data/demos.tsv", function(d) {
        var o = {
            date: new Date(d.date),
            pName: d.p_name,
            pBezirk: d.p_bezirk,
            lKey: d.p_bezirk + "--" + d.p_name,
            partMax: +d.part_max,
            partMin: +d.part_min,
            partGuess: +d.part_guess,
            ratioLoc: +(d.ratio_ort.replace("%",""))/100,
            ratioBez: +(d.ratio_bezirk.replace("%",""))/100,
            eTypeName: d.etype_name,
            eTypeCat: d.etype_cat,
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
    }, this.demosLoaded.bind(this));

    d3.tsv("assets/data/orte.tsv", function(d) {
        var record = {
            key: d.KEY,
            pbezirk: d.Bezirk,
            pbl14: d.BL2014,
            pop89: +d.POP1989,
            coords: [+d.lon, +d.lat]
        };
        return record;

    }, this.locationsLoaded.bind(this));
};

Vis.prototype.demosLoaded = function(error, rows) {
    rows = rows.sort(function(a, b) {
        return d3.ascending(a.date, b.date);
    });
    this.demos = rows;
    // get first and last date for time interval / timeline
    this.timeInterval = [this.demos[0].date, this.demos[this.demos.length-1].date];
    console.log("EVENTS");
    this.checkLoadState();
};

Vis.prototype.locationsLoaded = function(error, rows) {
    rows = rows.sort(function(a, b) {
        return d3.ascending(a.key, b.key);
    });
    // todo make dictionary for locations
    var locations = {};
    rows.forEach(function(r){
        locations[r.key] = r;
    });
    this.locations = locations;
    console.log("ORTE", this.locations);
    this.checkLoadState();
};

Vis.prototype.drawMap = function (error, ddr) {
    if (error) {
        return console.error(error);
    }

    var width = this.target.elem.offsetWidth,
        height = this.target.elem.offsetHeight;
    var dim = Math.min(width, height);
    var formatNumber = d3.format(",.0f");

    var projection = d3.geo.satellite()
        .distance(1.085)
        .scale(this.target.baseScale * dim/this.target.baseSize)
        .rotate([-16.5, -38, -11])
        .center([0, 15])
        .tilt(-5)
        .translate([width/2, height/2])
        .clipAngle(Math.acos(1 / 1.09) * 180 / Math.PI - 1e-6)
        .precision(0.1);

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
    this.svg = d3.select("#" + this.containerId).append("svg")
        .attr("width", width)
        .attr("height", height);


    this.svg.append("path")
        .datum(graticule)
        .attr("class", "graticule")
        .attr("d", path);
    /*
    var legend = this.svg.append("g")
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

    this.svg.append("g")
        .attr("class", "land")
        .selectAll('path')
        .data(topojson.feature(ddr, ddr.objects.ddr89).features)
        .enter().append("path")
        .attr("class", function(d) { return  d.id === undefined ? "BRD" : "Bezirk " + d.id; })
        .attr("d", path);

    // Bezirke
    this.svg.append("path")
        .datum(topojson.mesh(ddr, ddr.objects.ddr89, function (a, b) { return a !== b && a.id !== undefined && b.id !== undefined; }))
        .attr("class", "bezirksgrenze")
        .attr("d", path);
    // Staatsgrenze
    this.svg.append("path")
        .datum(topojson.mesh(ddr, ddr.objects.ddr89, function (a, b) { return a !== b && (a.id === undefined || b.id === undefined); }))
        .attr("class", "staatsgrenze")
        .attr("d", path);


    this.mapReady = true;
    console.log("MAP RENDERED");
    this.checkLoadState();
    /*
   this.svg.append("g")
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
};

Vis.prototype.showInterval = function(interval) {
    var self = this;
    if (interval === undefined) {
      interval = this.timeInterval;
    }
    this.currentDate = interval[0];
    var endDateStr = dateToString(interval[1]);

    this.timer = window.setInterval(function(){
        var currentdstr = dateToString(self.currentDate);

        self.showDate(currentdstr);

        if (currentdstr === endDateStr) {
            window.clearInterval(self.timer);
        }

        self.currentDate.setDate(self.currentDate.getDate() + 1);
    }, parseInt(1000 / self.daysPerSecond));
};

Vis.prototype.showDate = function(date){
    var markers = this.demos.filter(function(e) {
        if (e.dstr === date) {
            return e;
        }
    });

    // if more scripted events write a function to load stuff from json or other description file
    if (date === dateToString(this.eventDates.mauerfall)) {
        this.mauerFall();
    }

    console.log(date, markers.length, markers[0]);
    // Get location here: this.locations[markers[0].lKey])

    // find string n sorted
    // todo draw circles from markers events and update time line here
};

Vis.prototype.mauerFall = function() {
    this.svg.selectAll(".staatsgrenze").attr("class", "staatsgrenzeoffen");
};

Vis.prototype.mauerReset = function() {
    this.svg.selectAll(".staatsgrenzeoffen").attr("class", "staatsgrenze");
};

Vis.prototype.checkLoadState = function() {
   // console.log("check:",this.demos, this.locations, this.mapReady);
    if (this.demos && this.locations && this.mapReady) {
        this.showInterval();
    }
};

window.Vis = Vis;

}(window));
