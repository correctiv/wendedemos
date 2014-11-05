/* globals d3: false */
(function(window){
    'use strict';
    function dateToString(d) {
        var monthNames = [ "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec" ];
        return  d.getDate() + "-" + monthNames[d.getMonth()]  + "-" + d.getFullYear();
    }
    function Vis(options){
        var self = this;
        this.options = options || {};
        // set defaults
        this.options.minPart = this.options.minPart || 50;
        this.options.limitLoops = this.options.limitLoops || 500;  //catch runaway intervals and debugging, hard limit of 500
        this.options.forcedStartDate = this.options.forcedStartDate || false;  // override start date
        this.options.daysPerSecond = this.options.daysPerSecond || 7;
        this.options.containerId = this.options.containerId || 'vis';
        this.debug =  this.options.debug || false;
        this.eventDates = [
            // add more timed event here if needed
            {name: "Der Mauerfall (11.9.'89)", dateString: "1989-11-09", fn : "mauerFall"
                // todo pass function properly #pass
            }
        ];
        this.eventDates.forEach(function (d) {
            if (self.debug) {console.log("coercing dates for Events");}
            d.date =  new Date(d.dateString); // populate date field with type date
            d.dateString = dateToString(d.date); // coerce into standard format
        });
        this.target = {
            elem: document.getElementById(this.options.containerId),
            ratio: 1.5,
            baseScale: 18000,
            baseSize: 1000
        };
        this.demos = false;
        this.locations = false;
        this.groups = false;
        this.globalTimeInterval = [];
        this.currentTimeInterval = [];
        this.currentDate = null;
        this.mapReady = false;

    }

    Vis.prototype.init = function(){
        this.loadData();
    };
    Vis.prototype.loadData = function(){
        var self = this;
        d3.json("assets/geo/ddr89.json", this.drawMap.bind(this));
        d3.tsv("assets/data/demos.tsv", function(d) {
            var o = {
                date: new Date(d.date),
                pKey: d.p_key,
                partMax: +d.part_max,
                partMin: +d.part_min,
                eTypeName: d.etype_name,
                eTypeCat: d.etype_cat,
                eOrgName: d.eorg_name,
                eOrgCat: d.eorg_cat,
                eOrgTheme: d.etheme,
                eRemarks: d.eremarks,
                eTypeIsChurch: +d.etype_ischurch,
                eTypeIsDemo: +d.etype_isdemo
            };
            // calculate best guess for number of participants
            o.partGuess =
                o.partMax === 0 ? self.options.minPart : // Return unknown number of participants as set in option minpart (50)
                    (
                        o.partMin === 0 ? o.partMax : ( // Return max if min is unknown
                            o.partMax + o.partMin // Return average
                        )
                    )
            ;
            o.dayOfMonth = o.date.getDate();
            o.month = o.date.getMonth() + 1;
            o.year = o.date.getFullYear();
            o.dateString = dateToString(o.date);
            return o;
        },
            this.demosLoaded.bind(this));

        d3.tsv("assets/data/orte.tsv", function(d) {
            return {
                // keynames from Header
                key: d.KEY,
                name: d.NAME,
                urlname: (d.NAMEDIFFURL == "") ? d.NAME : d.NAMEURLDIFF, //name for URL at ABL
                bezirk: d.BEZIRK,
                bezirkSafe: d.BEZIRK === "Frankfurt/Oder" ? "Frankfurt" : d.BEZIRK,
                bl14: d.BL2014,
                pop89: +d.POP1989,
                popbez89: +d.POPBEZ89,
                coords: [+d.LON, +d.LAT]
            };
        }, this.locationsLoaded.bind(this));
    };
    Vis.prototype.demosLoaded = function(error, rows) {
        // sort events by date
        this.demos =  rows.sort(function(a, b) {return d3.ascending(a.date, b.date);});
        // get first and last date for time interval / timeline
        // set global time interval
        this.globalTimeInterval = [this.demos[0].date, this.demos[this.demos.length-1].date];
        this.currentTimeInterval = this.globalTimeInterval;
        if (this.options.forcedStartDate) {
            this.options.forcedStartDate = new Date(this.options.forcedStartDate);
            this.currentTimeInterval[0] = this.options.forcedStartDate;
        }
        if (this.debug) {console.log("demos loaded");}
        this.checkLoadState();
    };
    Vis.prototype.groupBy = function(rows, fieldname, options) {
        // group unique values as object mith mapped unique groups
        var opts = options || {};
        opts.keyNameF = opts.keyNameF || function(d) { return d[fieldname];};
        opts.rollUpF = opts.rollUpF || function(d) {return d};
        var arr  = d3.nest()
            .key(opts.keyNameF)
            .rollup(opts.rollUpF)
            .entries(rows)
            .map(function(d){
                var group = d.key;
                var values = d.values;
                return {'group':group, 'values':values}
            });
        this.groups = this.groups || {};
        this.groups[fieldname] = {};
        var obj = this.groups[fieldname];
        arr.forEach(function(d){
            obj[d.group] = d.values
        });
        this.groups[fieldname] = obj;

    };
    Vis.prototype.locationsLoaded = function(error, rows) {
        var rowsSorted = rows.sort(function(a, b) {
            return d3.ascending(a.key, b.key);
        });
        var locations = {};
        rowsSorted.forEach(function(r){locations[r.key] = r;});
        this.locations = locations;
        if (this.debug) {console.log("locations loaded");}
        this.checkLoadState();
    };
    Vis.prototype.joinArrayWithLocationKeyObj = function(arr, l) {
        arr.forEach(
            function (d) {
                var r;
                try {
                    r = l[d.pKey];
                    d.placename = r.name;
                    d.placenameURL = r.urlname;
                    d.bezirk = r.bezirk;
                    d.bezirkSafe = r.bezirkSafe;
                    d.coords = r.coords;
                    d.pop89 = r.pop89;
                    d.popbez89 = r.popbez89;
                    d.ratio = d.partGuess/ d.pop89;
                    d.ratioBez = d.partGuess/ d.popbez89;
                    delete d.pKey; // optional, but no longer needed
                }
                catch(err) {console.error("key,key in locations",d.pKey, l[d.pKey],err);}
                //clean up unneeded fields here and join coords by location key;
            });
    };

    Vis.prototype.drawMap = function (error, ddr) {
        if (error) {return console.error(error);}
        var width = this.target.elem.offsetWidth,
            height = this.target.elem.offsetHeight;
        var dim = Math.min(width, height);
        var formatNumber = d3.format(",.0f");
        var smallFloat = 1.0e-6;

        var projection = d3.geo.satellite()
            .distance(1.085)
            .scale(this.target.baseScale * dim/this.target.baseSize)
            .rotate([-16.5, -38, -11])
            .center([0, 15])
            .tilt(-5)
            .translate([width/2, height/2])
            .clipAngle(Math.acos(1 / 1.09) * 180 / Math.PI - smallFloat)
            .precision(0.1);

        var graticule = d3.geo.graticule()
            // [lonmin,latmin], [lonmax + offset for last, latmax + offset for last]
            .extent([[-5, 47], [30 + smallFloat, 85 + smallFloat]])
            .step([1, 1]);

        var path = d3.geo.path()
            .projection(projection);
        /*
         var radius = d3.scale.sqrt()
         .domain([0, 1e6])
         .range([0, 15]);
         */
        var container = d3.select("#" + this.options.containerId);
        this.ui = {};
        this.ui.datebox = container.append("div")
            .attr("class","ui")
            .attr("id","ui_currentdate");

        this.ui.datebox.append("span").classed("date",true);
        
        this.svg = container.append("svg")
            .attr("width", width)
            .attr("height", height);

        // svg filters have to be inline
        // support of svg-filters from css is poor across browsers
        this.filters = {};
        this.filters.blur = this.svg.append("filter")
            .attr("id", "svgfblur");
        this.filters.blur.append("feGaussianBlur")
            .attr("stdDeviation",2);
        // end filters

        // some inline svg styling happening here
        // breaks in chrome fullscreen
        this.svg.append("path")
            .datum(graticule)
            .attr("class", "graticule")
            .style("filter", "url(#svgfblur)")
            .style("stroke", "yellow")
            .style("stroke-width", 0.2)
            .style("opacity", 0.5)
            .attr("d", path);

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
            .attr("id", function(d) { return  d.id === undefined ? "BRD" :
                d.id === "Frankfurt (Oder)" ? "Frankfurt" : d.id; })
            .attr("title", function(d) { return  d.id === undefined ? "" : "Bezirk " + d.id; })
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
        if (this.debug) {console.log("Map rendered")}
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
    Vis.prototype.showInterval = function(arr) {
        var self = this;
        var i = 1;
        var limit = this.options.limitLoops; //catch runaway intervals
        var interval = arr || this.currentTimeInterval;
        this.currentDate = interval[0];
        var endDateStr = dateToString(interval[1]);
        if (this.debug) {console.log("showInterval",interval, this.currentDate);}
        this.timer = window.setInterval(function(){
            var currentDateString = dateToString(self.currentDate);
            if (self.debug) {console.log("dateloop",currentDateString, limit, i);}
            // check for timed events
            self.eventDates.forEach( function(d) {
               // if (self.debug) {console.info(currentDateString, d.dateString);}
                if (d.dateString === currentDateString) {
                    if (self.debug) {console.info("found event", d.dateString, d.name);}
                    // todo pass function properly #pass
                    self[d.fn]();
                }
            });
            // trigger rendering
            if (self.groups.dateString[currentDateString]) {self.showDate(currentDateString);}
            // end interval;
            if (currentDateString === endDateStr) {
                if (self.debug) {console.log("exit interval loop based on date loop");}
                window.clearInterval(self.timer);
            }
            if (i >= limit && limit) {
                if (self.debug) {console.log("exit interval loop based on limit", limit, i);}
                window.clearInterval(self.timer);
            } // clear on limit
            // increment current date by one day
            self.currentDate.setDate(self.currentDate.getDate() + 1);
            i += 1;
        }, parseInt(1000 / self.options.daysPerSecond));
    };
    Vis.prototype.showDate = function(dateString){
        var land = d3.selectAll(".land");
        var markers = this.groups.dateString[dateString];
        markers.forEach( function (d){
            var id = "#" + d.bezirkSafe;
            var b = land.select(id);
            console.log(id, b);
            //debugger;
            b.classed("highlight",true);
            setTimeout(function () {
                b.classed("highlight",false);
            }, 200);

        })

        //if (this.debug) {console.log(dateString, markers.length, markers[0]);}
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
        if (this.debug) {console.log("Check load state");}
        // considered hacky, replace with ifs if needed;
        switch(true) {
            case (this.demos && this.locations && !this.groups):
                if (this.debug) {console.log(" -- join records");}
                this.joinArrayWithLocationKeyObj(this.demos, this.locations);
                if (this.debug) {console.log(" -- group by date");}
                this.groupBy(this.demos, "dateString");
                if (this.debug) {console.log(" -- start animation");}
                this.showInterval();
                break;
            case (!this.mapReady || !this.demos || !this.locations) :
                if (this.debug) {console.log(" -- not ready yet");}
                break;
            default:
                console.error("unhandled state:", this);
        }
    };

    window.Vis = Vis;

}(window));
