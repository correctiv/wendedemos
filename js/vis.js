/* globals d3: false */
(function(window){
    'use strict';

    var is_chrome = navigator.userAgent.toLowerCase().indexOf('chrome') > -1;

    var flushAllD3Transitions = function() {
        var now = Date.now;
        Date.now = function() { return Infinity; };
        d3.timer.flush();
        Date.now = now;
    }

    function dateToString(d) {
        var format = d3.format("02d");
        var monthNames = [ "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec" ];
         return d.getFullYear() + "-" + format(d.getMonth() +1) + "-" + format(d.getDate());

    }

    function dateToLocale(d,locale) {
        var supported = ["de"];
        var l = (supported.indexOf(locale) > -1) ? locale : supported[0];
        var monthNames = {
            de:["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"        ]
        };
        var weekdayNames = {
            de : ["Sonntag","Montag","Dienstag","Mittwoch","Donnerstag","Freitag","Sonnabend"]
        };
        var dow = d.getDay();
        var month = d.getMonth();
        return  {
            dayOfMonth :d.getDate(),
            dayOfWeek : dow,
            dayOfWeekString : weekdayNames[l][dow],
            isMonday : dow === 1,
            month: month + 1,
            monthString : monthNames[l][month],
            year: d.getFullYear()
        };
    }

    function Vis(options){
        var self = this;
        this.options = options || {};
        // set defaults
        this.options.locale = this.options.locale || "de";
        this.options.minPart = this.options.minPart || 50;
        this.options.flashDistricts = this.options.flashDistricts || false;
        this.options.limitLoops = this.options.limitLoops === undefined ? 500 : this.options.limitLoops;  //catch runaway intervals and debugging, hard limit of 500
        this.options.forcedStartDate = this.options.forcedStartDate || false;  // override start date
        this.options.forcedEndDate = this.options.forcedEndDate || false;  // override start date
        this.options.tickerEnabled = this.options.tickerEnabled || false;  // override start date
        this.options.tickerMinHeight = this.options.tickerMinHeight || 720;
        this.options.defaultDaysPerSecond = this.options.defaultDaysPerSecond || 2;
        this.options.fastFwdFactor = this.options.fastFwdFactor || 4;
        this.options.autoplay = this.options.autoplay === undefined ? false : this.options.autoplay;
        this.options.linkABL = this.options.linkABL || false;
        this.options.trailFallOff = this.options.trailFallOff || 0.05;
        this.options.noAgentExceptions = this.options.noAgentExceptions === undefined ? false : this.options.noAgentExceptions;
        this.options.loop = this.options.loop === undefined ? false : this.options.loop;
        this.options.containerId = this.options.containerId || 'vis';
        this.options.maxRadiusRatio = this.options.maxRadiusRatio || 0.08;
        this.debug = this.options.debug || false;
        this.styles = {
            landBaseColor: options.landBaseColor || "#222",
            tickerColor: options.tickerColor || "lime",
            markerColor: options.markerColor || "#EEE",
            markerTextColor: options.markerTextColor || "#000",
            labelColor: options.labelColor || "#CCC",
            districtBoundaryColor: options.districtBoundaryColor || "#444",
            countryBoundaryColor: options.countryBoundaryColor || "#883333",
        };
    }

    Vis.prototype.init = function(){
        this.target = {
            elem: document.getElementById(this.options.containerId),
            ratio: 1.5,
            baseScale: 18000,
            baseSize: 1000
        };
        this.width = this.target.elem.offsetWidth;
        this.height = this.target.elem.offsetHeight;
        if (this.height < this.minHeight) {console.warn("Height smaller minHeight" + this.minHeight,this.height)}
        this.playing = false;
        this.dim = Math.min(this.width, this.height);
        this.unit = this.dim/400;
        this.minHeight = 400;
        this.eventDates = [
            // add more timed event here if needed
            {   name: "Der Mauerfall (11.9.'89)",
                dateString: "1989-11-09",
                fn : "mauerFall",
                resetFn : "mauerReset"

            },
            // {   name: "Montagsdemo 9.10. Leipzig",
            //     dateString: "1989-10-09",
            //     fn : "halfSpeed",
            //     resetFn : "doubleSpeed"
            // }
        ];
        this.eventDates.forEach(function (d) {
            if (self.debug) {console.log("coercing dates for Events");}
            d.date =  new Date(d.dateString); // populate date field with type date
            d.dateString = dateToString(d.date); // coerce into standard format
        });

       this.styles.staatsGrenze = {
            fill: "none",
            stroke: this.styles.countryBoundaryColor,
            "stroke-linejoin": "round",
            "stroke-linecap": "round",
            "stroke-width": this.unit * 0.1 +"em"
        };

       this.styles.staatsGrenzeOffen = {
            fill: "none",
            stroke: this.styles.districtBoundaryColor,
            "stroke-linejoin": "round",
            "stroke-linecap": "round",
            "stroke-width": this.unit * 0.05 +"em",
            "animation-name": "flicker",
            "animation-duration": "1.3s",
            "animation-iteration-count": 1
        }

        this.scales = {
            rel : d3.scale.linear().domain([0, 0.5]).range([0.1, 1])
        };
        this.layout = {};
        this.layout.labelPlacement = {
            supressNames : [
                "Rostock-Warnemünde",
                "Rostock-Gehlsdorf",
                "Berlin-Köpenick",
                "Berlin-Staaken",
                "Berlin-Dahlwitz-Hoppegarten",
                "Berlin-Kaulsdorf",
                "Halle-Neustadt"
            ],
            alignLeft : ["Potsdam","Gotha"],
            alignBelow : ["Zwickau","Weimar"],
            alignCenter : ["Erfurt","Weimar","Karl-Marx-Stadt","Magdeburg"]
        }
        this.layout.labelClasses = [
            {range:[0,9999],          className : "smaller10k",   r : 0.8, fs : 1.0, dotStyle : 1, showLabel: false},
            {range:[10000,49999],     className : "pl10kto50k",   r : 1.3, fs : 1.2, dotStyle : 1, showLabel: false},
            {range:[50000,99999],     className : "pl50kto100k",  r : 1.6, fs : 1.2, dotStyle : 1, showLabel: true},
            {range:[100000,299999],   className : "pl100kto300k", r : 2.0, fs : 1.4, dotStyle : 2, showLabel: true},
            {range:[300000,699999],   className : "pl300kto700k", r : 2.3, fs : 1.5, dotStyle : 3, showLabel: true},
            {range:[700000,Infinity], className : "plus700k",     r : 4.0, fs : 1.7, dotStyle : 4, textStyle: "bold", showLabel: true}
        ]

        this.styles.label = {
            dots : {
                1 : {"fill-opacity" : 0.5,"stroke-width" : "1em", "stroke-opacity": 0.01},
                2 : {fill: "grey", "fill-opacity": 0.3, stroke: "black", "stroke-width": "thin", "stroke-opacity": 1},
                3 : {fill: "grey", "fill-opacity": 0.3, stroke: "black", "stroke-width": "thin", "stroke-opacity": 1},
                4 : {fill: "grey", "fill-opacity": 0.01}
            },
            text : {
                norma1:  {"font-weight":"normal"},
                bold: {"font-weight": 800}
            }
        };

        this.demos = false;
        this.locations = false;
        this.groups = false;
        this.globalInterval = {
            dates : [],
            bezRatios : {}
        };
        this.currentInterval = {
            dates : [],
            bezRatios : {}
        };
        this.currentDate = null;
        this.endState = false;
        this.mapReady = false;
        this.defaultFrameDurationTarget = parseInt(1000/this.options.defaultDaysPerSecond);
        this.frameDurationTarget = this.defaultFrameDurationTarget;
        this.ablBaseURL = "http://www.archiv-buergerbewegung.de/index.php/demonstrationen";

        this.layout.lineHeight = Math.max(this.unit * 8,8);
        this.layout.fontSize = Math.max(this.unit * 0.3,0.4);

        var smallFloat = 1.0e-6;

        this.projection = d3.geo.satellite()
            .distance(1.085)
            .scale(this.target.baseScale * this.dim/this.target.baseSize)
            .rotate([-16.5, -38, -11])
            .center([0, 15])
            .tilt(-5)
            .translate([this.width / 2, this.height / 2])
            .clipAngle(Math.acos(1 / 1.09) * 180 / Math.PI - smallFloat)
            .precision(0.1);

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
            if (o.partMax === 0) {
                o.partUnknown = true;
                o.partGuess = self.options.minPart;
            } else {
                o.partGuess = o.partMax;
            }
            o.dayOfMonth = o.date.getDate();
            o.month = o.date.getMonth() + 1;
            o.year = o.date.getFullYear();
            o.dateString = dateToString(o.date);
            return o;
        }, this.demosLoaded.bind(this));

        d3.tsv("assets/data/orte.tsv", function(d) {
            return {
                // keynames from Header
                key: d.KEY,
                name: d.NAME,
                urlName: (d.NAMEDIFFURL === "") ? d.NAME : d.NAMEURLDIFF, //name for URL at ABL
                bezirk: d.BEZIRK,
                bezirkSafe: d.BEZIRK === "Frankfurt/Oder" ? "Frankfurt" : d.BEZIRK,
                bl14: d.BL2014,
                pop89: +d.POP1989,
                popBez89: +d.POPBEZ89,
                coords: [+d.LON, +d.LAT],
                pCoords: self.projection([+d.LON, +d.LAT])
            };
        }, this.locationsLoaded.bind(this));
    };

    Vis.prototype.demosLoaded = function(error, rows) {
        // sort events by date
        this.demos =  rows.sort(function(a, b) {return d3.ascending(a.date, b.date);});
        // get first and last date for time interval / timeline
        // set global time interval
        this.globalInterval.dates = [this.demos[0].date, this.demos[this.demos.length-1].date];
        this.currentInterval.dates = this.globalInterval.dates;
        if (this.options.forcedStartDate) {
            this.options.forcedStartDate = new Date(this.options.forcedStartDate);
            this.currentInterval.dates[0] = this.options.forcedStartDate;
        }
        if (this.options.forcedEndDate) {
            this.options.forcedEndDate = new Date(this.options.forcedEndDate);
            this.currentInterval.dates[1] = this.options.forcedEndDate;
        }
        // initialize current date
        this.currentDate = new Date(this.currentInterval.dates[0]);
        if (this.debug) {console.log("demos loaded");}
        this.checkLoadState();
    };

    Vis.prototype.groupBy = function(rows, fieldname, options) {
        // group unique values as object mith mapped unique groups
        var obj = {};
        options = options || {};
        options.tmp = options.tmp || false; // save to global groups or only return
        options.keyNameF = options.keyNameF || function (d) {
            return d[fieldname];
        };
        options.rollUpF = options.rollUpF || function (d) {
            return d;
        };
        var arr  = d3.nest()
            .key(options.keyNameF)
            .rollup(options.rollUpF)
            .entries(rows)
            .map(function(d){
                var group = d.key;
                var values = d.values;
                return {
                    group: group,
                    values: values
                };
            });
        arr.forEach(function(d){
            obj[d.group] = d.values;
        });
        if (options.tmp) {
            return obj;
        } else {
            this.groups = this.groups || {};
            this.groups[fieldname] = obj;
        }
    };

    Vis.prototype.locationsLoaded = function(error, rows) {
        var rowsSorted = rows.sort(function(a, b) {
            return d3.ascending(a.key, b.key);
        });
        var locations = {};
        rowsSorted.forEach(function (r) {
            locations[r.key] = r;
        });
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
                    d.placeName = r.name;
                    d.placeNameURL = r.urlName;
                    d.bezirk = r.bezirk;
                    d.bezirkSafe = r.bezirkSafe;
                    d.coords = r.coords;
                    d.pCoords = r.pCoords;
                    d.pop89 = r.pop89;
                    d.popBez89 = r.popBez89;
                    d.ratio = d.partGuess/ d.pop89;
                    d.ratioBez = d.partGuess/ d.popBez89;
                    d.placeKey = d.pKey;
                }
                catch(err) {console.error("key in locations",d.pKey, l[d.pKey],err);}
                //clean up unneeded fields here and join coords by location key;
            });
    };

    Vis.prototype.drawMap = function (error, ddr) {
        if (error) {
            return console.error(error);
        }

        this.scales.rPop = d3.scale.sqrt()
            .domain([100, 100000])
            .range([2, this.dim * this.options.maxRadiusRatio]);
        var formatNumber = d3.format(",.0f");
        var smallFloat = 1.0e-6;
        var projection = this.projection;
        var graticule = d3.geo.graticule()
    // [lonmin,latmin], [lonmax + offset for last, latmax + offset for last]
            .extent([[-5, 47], [30 + smallFloat, 85 + smallFloat]])
            .step([1, 1]);

        var path = d3.geo.path()
            .projection(projection);
        var container = d3.select("#" + this.options.containerId);
        this.ui = {};
        this.ui.play = container.select('#play-pause');
        this.ui.next = container.select('#step-backward');
        this.ui.previous = container.select('#step-forward');
        this.ui.fast_fwd = container.select('#fast-fw');
        this.ui.rewind = container.select('#rewind');
        this.ui.datebox = container.select("#ui_currentdate");
        this.ui.datetext = container.select('.date');
        this.ui.datetext.dayOfWeek = container.select('.dayofweek');
        this.ui.datetext.day = container.select('.dayofmonth');
        this.ui.datetext.month = container.select('.month');
        this.ui.datetext.year = container.select('.year');

        this.svg = container.append("svg")
            .attr({
                width: this.width,
                height: this.height,
                "text-rendering": "auto"
            });

        // svg filters have to be inline
        // support of svg-filters from css is poor across browsers
        this.filters = {};
        this.filters.blur = this.svg.append("filter")
            .attr("id", "svgfblur");
        if (!is_chrome || this.options.noAgentExceptions) {
            this.filters.blur.append("feGaussianBlur")
                .attr("stdDeviation",2);
        }

        // end filters
        // ---
        // All svg styles are inline, no css dependencies
        // ---
        // declare styles as high up as possible, or assign to groups if needed,
        // not to individual elements, whens styles are the same

        // todo add layer management
        // Add ticker in back
        this.tickerLayer = this.svg.append("g")
            .attr("class", "ticker")
            .style({
                fill: this.styles.tickerColor,
                stroke: "none",
                "font-family": "monospace",
                "font-size": this.layout.fontSize * 1.5 + "em",
                "text-anchor": "start"
            });

        // breaks in chrome fullscreen
        var grid = this.svg.append("g")
            .classed("graticule", true);
        grid.append("path")
            .datum(graticule)
            .attr("class", "blur")
            .style({
                fill: "none",
                "stroke-width": this.unit/20 + "em",
                "filter": "url(#svgfblur)",
                "stroke": "yellow",
                "opacity": 0.3
            })
            .attr("d", path);

        grid.append("path")
            .datum(graticule)
            .style({
                fill: "none",
                "stroke-width": this.unit/40 + "em",
                stroke: "#fff",
                "opacity": 0.5
            })
            .attr("d", path);

        this.land = this.svg.append("g")
            .attr("class", "land")
            .selectAll('path')
            .data(topojson.feature(ddr, ddr.objects.ddr89).features)
            .enter().append("path")
            .attr("class", function(d) { return  d.id === undefined ? "brd" : "bezirk"; })
            .attr("id", function(d) { return  d.id === undefined ? "BRD" :
                d.id === "Frankfurt (Oder)" ? "Frankfurt" : d.id; })
            .attr("title", function(d) { return  d.id === undefined ? "" : "Bezirk " + d.id; })
            .attr("d", path);

        this.land = this.svg.append("g")
            .attr("class", "land")
            .selectAll('path')
            .data(topojson.feature(ddr, ddr.objects.ddr89).features)
            .enter().append("path")
            .attr("class", function(d) { return  d.id === undefined ? "brd" : "bezirk"; })
            .attr("id", function(d) { return  d.id === undefined ? "BRD" :
                d.id === "Frankfurt (Oder)" ? "Frankfurt" : d.id; })
            .attr("title", function(d) { return  d.id === undefined ? "" : "Bezirk " + d.id; })
            .attr("d", path);
        // apply inline Styles
        this.svg.selectAll(".bezirk").style({fill: this.styles.landBaseColor});
        this.svg.selectAll(".brd").style({"pointer-events": "none","fill-opacity": 0.6,fill: d3.hcl(this.styles.landBaseColor).brighter(0.5)});

        // Bezirksgrenzen
        this.svg.append("path")
            .datum(topojson.mesh(ddr, ddr.objects.ddr89, function (a, b) { return a !== b && a.id !== undefined && b.id !== undefined; }))
            .attr("class", "bezirksgrenze")
            .style({
                fill: "none",
                stroke: this.styles.districtBoundaryColor,
                "stroke-linejoin": "bevel",
                "stroke-linecap": "bevel",
                "stroke-width": "fine"
            })
            .attr("d", path);
        // Staatsgrenze
        this.svg.append("path")
            .datum(topojson.mesh(ddr, ddr.objects.ddr89, function (a, b) { return a !== b && (a.id === undefined || b.id === undefined); }))
            .attr("class", "staatsgrenze")
            .style(this.styles.staatsGrenze)
            .attr("d", path);

        this.labelLayer = this.svg.append("g")
            .attr("class", "labels");

        this.labelDotsLayer = this.labelLayer.append("g")
            .attr("class","dots");
        this.labelTextLayer = this.labelLayer.append("g")
            .attr("class","labeltext")
            .style({
                "pointer-events": "none",
                "fill": this.styles.labelColor,
                "font-family": "sans-serif"
            });


        this.markerLayer = this.svg.append("g")
            .attr("class", "markers")
            .style({
                "pointer-events": "none",
                fill: this.styles.markerColor,
                stroke: "none"
            });
// add drop shadow
        var fs = this.layout.fontSize * 1.2 + "em";
        this.markerTextOutLayer = this.svg.append("g")
            .attr("class", "markerstextout")
            .style({
                fill: "none",
                opacity: 0.6,
                stroke: this.styles.markerTextColor,
                "stroke-width":this.layout.fontSize * 0.5 + "em",
                "font-family": "sans-serif",
                "stroke-linejoin": "round",
                "stroke-linecap": "round",
                "filter": is_chrome ? "" : "url(#svgfblur)",
                "-webkit-filter": "url(#svgfblur)",
                "font-size": fs,
                "text-anchor": "middle"
            });

        this.markerTextLayer = this.svg.append("g")
            .attr("class", "markerstext")
            .style({
                fill: this.styles.markerColor,
                "fill-opacity": 1,
                "opacity": 1,
                stroke: "none",
                "font-family": "sans-serif",
                "font-size": fs,
                "text-anchor": "middle"
            });

        var legendOffset = [this.width * 6/7,this.height * 1/6];
        var maxR = this.scales.rPop(100000);
        var anchor = "middle";
        var xOffset = 0;
        var f = {
            "fill": this.styles.markerColor,
            "font-size": this.layout.fontSize +"em"};
        if (this.width < this.minHeight || this.height < this.minHeight) {
            anchor = "end";
            xOffset = - maxR - 5;
        }
        var legend =this.legend = this.svg.append("g")
            .attr("transform", "translate("+ legendOffset[0] +"," + legendOffset[1] +")")
            .attr("class", "legend");
        var cg = legend.append("g")
            .style({
                fill:"none",
                stroke: this.styles.markerColor,
                "stroke-width":"fine"
            });
        cg.append("circle").attr({cx: 0, cy: 0,r : maxR});
        cg.append("circle").attr({cx: 0, cy: this.scales.rPop(50000)-maxR,r : this.scales.rPop(50000)});
        cg.append("circle").attr({cx: 0, cy: this.scales.rPop(20000)-maxR,r : this.scales.rPop(20000)});
        //this.legend.append("circle").attr({cx: 0, cy: this.scales.rPop(10000)-maxR,r : this.scales.rPop(10000)});
        cg.append("circle").attr({cx: 0, cy: this.scales.rPop(5000)-maxR,r : this.scales.rPop(5000)});

        var tg = legend.append("g")
            .style(f);
        tg.append("text").text("100 000").attr({"text-anchor": anchor, x : xOffset, y : maxR * 5/6 } );
        tg.append("text").text("50 000").attr({"text-anchor": anchor, x : xOffset, y : this.scales.rPop(50000) * 11/6 - maxR } );
        tg.append("text").text("20 000").attr({"text-anchor": anchor, x : xOffset, y : this.scales.rPop(20000) * 8/5 - maxR  } );
        tg.append("text").text("5000").attr({"text-anchor": anchor, x : xOffset, y : this.scales.rPop(5000) * 6/5 - maxR  } );

        this.mapReady = true;
        if (this.debug) {
            console.log("Map rendered");
        }
        this.checkLoadState();
    };

    Vis.prototype.resetEventsAtDate = function(date) {
        var self = this;
        // clear all pending transitions
        // flushAllD3Transitions();
        //this.land.selectAll(".bezirk").style("fill", this.styles.landBaseColor);
        this.eventDates.forEach( function(d) {
            if (date < d.date) {
                if (self.debug) {console.info("found future events", d.dateString, d.name);}
                self[d.resetFn]();
            } else if (date > d.date) {
                self[d.fn]();
            }
        });
    };

    Vis.prototype.setupControls = function() {
        var self = this;
        var rewind = function() {
            self.endState = false;
            self.currentDate = new Date(self.currentInterval.dates[0]);
            window.clearInterval(self.timer);
            self.clearMarkers();
            self.flashDistricts(self.svg.selectAll(".land"),{reset:true});
            self.showInterval(self.currentInterval.dates);
        };
        var playPause = function() {
            if (self.playing) {
                self.pause();
            } else {
                self.play();
            }
        };
        var fastForward = function() {
            if (self.frameDurationTarget === self.defaultFrameDurationTarget) {
                self.frameDurationTarget = self.defaultFrameDurationTarget / self.options.fastFwdFactor;
                self.ui.fast_fwd.classed('active', true);
                window.clearInterval(self.timer);
            } else {
                self.fastFwdOff();
                window.clearInterval(self.timer);
            }
            self.play();
        };
        var showInfo = function() {
            var info = d3.select('#info');
            info.classed('hide', !info.classed('hide'));
        };
        d3.select('.loading').classed('hide', true);
        d3.select('.controls').classed('hide', false);
        this.ui.rewind.on('click', rewind);
        this.ui.play.on('click', playPause);
        this.ui.fast_fwd.on('click', fastForward);

        this.ui.info = d3.select('#info-icon');
        this.ui.info.on('click', showInfo);
        this.ui.info_close = d3.select('.close');
        this.ui.info_close.on('click', showInfo);
    };

    Vis.prototype.updateUI = function() {
        var strObj = dateToLocale(this.currentDate, this.options.locale);
        this.ui.datetext.dayOfWeek.text(strObj.dayOfWeekString);
        this.ui.datetext.day.text(strObj.dayOfMonth + ".");
        this.ui.datetext.month.text(strObj.monthString);
        this.ui.datetext.year.text((String(strObj.year)).replace("19", "’") );
    };

    Vis.prototype.clearMarkers = function(){
        this.svg.select(".markers").selectAll("circle").remove();
        this.svg.select(".markerstextout").selectAll("g").remove();
        this.svg.select(".markerstext").selectAll("g").remove();
    }

    Vis.prototype.showInterval = function(arr) {
        var self = this;
        var i = 1;
        var limit = this.options.limitLoops; //catch runaway intervals
        var interval = arr || this.currentInterval.dates;
        this.currentDate = new Date(interval[0]);
        var endDateStr = dateToString(interval[1]);
        if (this.debug) {console.log("showInterval",interval, this.currentDate);}
        this.resetEventsAtDate(this.currentDate);
        this.clearMarkers();
         this.timer = window.setInterval(function(){
            var currentDateString = dateToString(self.currentDate);
            self.eventDates.forEach( function(d) {
                //if (self.debug) {console.info(currentDateString, d.dateString);}
                if (d.dateString === currentDateString) {
                    if (self.debug) {console.info("found event", d.dateString, d.name);}
                    self[d.fn]();
                }
            });
            self.updateUI();
            // trigger rendering
            if (self.groups.dateString[currentDateString]) {self.showDate(currentDateString);}
            if (currentDateString === endDateStr) {
                if (self.options.loop) {
                    self.currentDate = new Date(interval[0]);
                    if (self.debug) {console.log("new loop",interval[0]);}
                } else {
                    if (self.debug) {console.log("exit interval loop based on date loop");}
                    self.pause({staticView:false})
                    window.clearInterval(self.timer);
                    self.endState = true;
                    return true;
                }
            } else {
                self.currentDate.setDate(self.currentDate.getDate() + 1);
            }
            if (i >= limit && limit) {
                if (self.debug) {console.log("exit interval loop based on limit", limit, i);}
                window.clearInterval(self.timer);
                return true;
            }
            i += 1;
        }, this.frameDurationTarget);
        this.ui.play.classed('icon-play', false).classed('icon-pause', true);
        this.playing = true;
    };

    Vis.prototype.drawTicker = function(d)  {
            var pos = {
                x : [this.width * 0.75 + (Math.random()/2 + 1),  (Math.random()) - this.width /2],
                y : parseInt((this.height * Math.random()) / (this.layout.lineHeight * 0.7)) * (this.layout.lineHeight * 0.7)
            };
        var durations = [2000,10000];
            var l = this.tickerLayer;
            var lc = l;
        // add limit based on render speed not fixed number
        var active = vis.tickerLayer.selectAll("text")[0].length;
        if (active < 20 || d.partGuess > 10000) {
            if (this.options.linkABL) {
                lc = l.append("a").attr({
                    title: d.placeNameURL,
                    "xlink:href": this.options.linkABL ? (
                    this.ablBaseURL +
                    "?Bezirk=" + d.bezirkSafe +
                    "&datum=" + d.dateString + "&ort=" + d.placeNameURL
                    ) : "",
                    "target": "_blank"
                });
            }
            lc.append("text").attr({
                x: pos.x[0],
                y: pos.y
            }).style("opacity", 0)
                .text(
                "+++ " + d.placeName + " (" + dateToString(d.date) + ") " +
                d.partGuess + " Teilnehmer + " + d.eRemarks + " +++")
                .transition().ease("linear").duration(durations[0])
                .attr({x: pos.x[0] - (pos.x[0]-pos.x[1])*durations[0]/durations[1]
                })
                .style("opacity", 1)
                .transition().ease("linear").duration(durations[1])
                .attr({x: pos.x[1]}).style("opacity", 0).remove();
         }
        };

    Vis.prototype.renderEvents = function(d) {
        var g, textPos, textAnchor, textStyle, self = this;
        var mAttr, mAttrStart,rMax;
        if ( d.eRemarks !== "" &&
            this.height > this.options.tickerMinHeight &&
            this.playing &&
            this.options.tickerEnabled
        ) {this.drawTicker(d);}
        mAttrStart = {
            r: 0,
            cx: d.pCoords[0],
            cy: d.pCoords[1],
            opacity: 0
        };
        rMax = Math.max(3, self.scales.rPop(d.partGuess));
        mAttr = {
            r : rMax,
            opacity : 1
        };
        if (this.playing || this.endState) {
            self.markerLayer.append("circle")
                .attr(mAttrStart)
                .transition().ease("cubic-out").duration(this.frameDurationTarget)
                .attr(mAttr)
                .transition().ease("linear").duration(this.frameDurationTarget * 5)
                .attr({r: rMax * 0.5}) // fad out size
                .style({opacity: 0}).remove();
        } else {
            // static markers
            // hide city labels
            this.svg.selectAll("g").selectAll(".labeltext").classed("hidden",true);
            //
            this.markerLayer
                .append("circle").classed("static",true)
                .attr("id", d.placeNameURL)
                .attr(mAttrStart)
                .transition().ease("cubic-out").duration(this.frameDurationTarget)
                .attr(mAttr);

            textPos = {
                x: d.pCoords[0] ,
                y: d.pCoords[1] - this.layout.lineHeight * 0.6
            };
            var id =  "marker-" + d.placeNameURL;
            g = this.markerTextOutLayer.append("g")
                .classed("static",true)
                .attr("id", d.placeNameURL);
            g.append("text")
                .attr(textPos)
                .text(d.placeName);
            textPos.y += this.layout.lineHeight *0.7;
            if (d.eTypeName !== "kA") {
            g.append("text")
                    .attr(textPos)
                    .text(d.eTypeName);
                textPos.y += this.layout.lineHeight * 0.7;
            }
            g.append("text")
                .attr(textPos)
                .text((d.partUnknown ? "k.A." : d.partMax));
            // reuse g and clone into markerTextLayer;
            document.getElementsByClassName("markerstext")[0].appendChild(g[0][0].cloneNode(true));
     }
    };

    Vis.prototype.renderMarkers = function(arr){
        var self = this;
        arr.forEach(function(d) {
           setTimeout(function() {
                self.renderEvents(d);
           }, parseInt(Math.random() * self.frameDurationTarget * 0.6));
        });
    };

    Vis.prototype.flashDistricts = function(selection, options) {
        // color bezirke based on participation ratio
        // get base color from css init;
        var options = options || {};
        // todo fix unexpected clipping for brightness behavior;
        var baseColor = this.styles.landBaseColor;
        //var ratioValue = options.ratioValue || false;
        var dateString = options.dateString || false;
        var reset = options.reset || false;
        if (reset) {
            this.currentInterval.trailingBezRatios = {};
            bezRatios = this.groups.bezirkeTotals;
        } else {
            var bezRatios = this.groups.bezirkeTotalsByDay[dateString];
            this.currentInterval.trailingBezRatios = this.currentInterval.trailingBezRatios || {};
        }
        var rTrail = this.currentInterval.trailingBezRatios;
        var r, rt;
        for (var d in bezRatios) {
            // trailing brightness for fallback color
            var id = "#" + d;
            var brightnessBoost = 10;
            var maxBrightness = 70;
            var b = selection.select(id);
            //flash
            if (reset) {
                b.style({fill: baseColor});
            } else {
                r = bezRatios[d].ratio;
                rTrail[d] = rTrail[d] || {};
                rt = rTrail[d];
                rt.val = (rt.val === undefined) ? this.scales.rel(r) : this.scales.rel(r) + rt.val;
                rt.color = d3.hcl(baseColor);
                rt.color.l = Math.min(d3.hcl(baseColor).l + rt.val * brightnessBoost,maxBrightness);
                b.style({fill: d3.hcl(rt.color).brighter(Math.min(this.scales.rel(r),3))})
                // fall off
                .transition().duration(this.frameDurationTarget).style({fill: rt.color});
            }
        }
    };
    Vis.prototype.showList = function(d,markers) {
        var totals = this.groups.totalsByDay;
        var desc =  d3.selectAll(".ui").select(".description");
        var c = totals[d].length;
        var dStr = dateToLocale(new Date(d),this.options.locale);
        var str = totals[d].length === 1 ? "Demo" : "Demos";
        var frm = d3.format("02d");
        var dFrm = frm(dStr.dayOfMonth) + "." + frm(dStr.month) + ".";
        var t = totals[d].total;
        var tn = "Teilnehmer";
        if (desc.select(".head")[0][0] === null) {
            var h = desc.append("p").classed("head",true);
            h.append("span").classed("r1",true).text("Datum");
            h.append("span").classed("number3",true).text("Anzahl");
            h.append("span").classed("number6",true).text("Teilnehmer");
            desc.append("div").classed("list",true);
        }

        var row =  desc.select(".list").insert("p", ":first-child")
        var dlink = row.append("a")
            .attr("href", "#")
            .attr("onclick","vis.jumpToDate(" + d + ")");

        dlink.append("span").classed("r1",true).text(dFrm);
        dlink.append("span").classed("number3",true).text(c) ;
        dlink.append("span").classed("number6",true).text(t);
        row.style("opacity",1).classed("row",true)
            .transition().duration(this.defaultFrameDurationTarget * 15)
            .style("opacity",0.3);
    }

    Vis.prototype.showDate = function(date){
        var d = date;
        if (typeof d === "object") {d = dateToString(d)}
        var markers = this.groups.dateString[d];
        if (markers === undefined) {return false;}
        // TODO add selection via list;
        if (this.options.showList) {this.showList(d,markers);}
        this.renderMarkers(markers, this.markerLayer);
        if (this.options.flashDistricts) {this.flashDistricts(this.svg.selectAll(".land"),{dateString :d})}
    };


    // TODO fix this function
    Vis.prototype.jumpToDate = function(d) {
        if (typeof d === "string") {d = new Date(d);}
        this.showInterval[d,this.currentDate[1]];
        this.pause({date: d});
    };

    Vis.prototype.mauerFall = function() {
        this.svg.selectAll(".staatsgrenze")
            .attr("class", "staatsgrenzeoffen")
            .style(this.styles.staatsGrenzeOffen);
    };

    Vis.prototype.mauerReset = function() {
        this.svg.selectAll(".staatsgrenzeoffen")
            .attr("class", "staatsgrenze")
            .style(this.styles.staatsGrenze);
    };

    Vis.prototype.halfSpeed = function() {
        this.frameDurationTarget *= 2;
        if (this.debug) { console.log("decrease speed",this.frameDurationTarget); }
        this.play();
    };

    Vis.prototype.doubleSpeed = function() {
        this.frameDurationTarget /= 2;
        if (this.debug) { console.log("increase speed",this.frameDurationTarget); }
        this.play();
    };

    Vis.prototype.fastFwdOff = function() {
        this.frameDurationTarget = this.defaultFrameDurationTarget;
        this.ui.fast_fwd.classed('active', false);
    };

    Vis.prototype.pause = function(options) {
        var options = options || {};
        var staticView = (options.staticView === undefined) ? true : options.staticView;
        var flushAll = (options.flushAll === undefined) ? false : options.flushAll;
        var date = (options.date === undefined) ? this.currentDate : options.date;
        this.playing = false;
        if (flushAll) {flushAllD3Transitions();}
        window.clearInterval(this.timer);
        if (staticView) {
        this.showDate(this.currentDate);
        }
        this.fastFwdOff();
        this.ui.play.classed('icon-play', true).classed('icon-pause', false);
    };

    Vis.prototype.play = function() {
        this.playing = true;
        this.svg.selectAll("g").selectAll(".labeltext").classed("hidden",false);
        var tmp = [this.currentDate, this.currentInterval.dates[1]];
        //window.clearInterval(this.timer);
        this.showInterval(tmp);
    };

    Vis.prototype.getBezirkeTotalsByDay = function() {
        var getRollUp = function (d) {
            return {
                "count": d.length,
                "total": d3.sum(d, function (d) {
                    return d.partGuess;
                }),
                "ratio": d3.sum(d, function (d) {
                    return d.ratioBez;
                })
            };
        };

        var g = this.groups.dateString;
        var o = {};
        for (var key in g) {
            o[key] = this.groupBy(g[key], "bezirkSafe", {
                tmp: true,
                rollUpF: getRollUp
            });
        }
        return o;
    };

    Vis.prototype.drawLabels = function() {
        var self = this;
        var dots = this.labelDotsLayer;
        var labels = this.labelTextLayer;
        var o = this.groups.totalsByPlace;
        var overRides = this.layout.labelPlacement;
        for(var d in o) {
            var s = {anchor: "start", yOffset: -3.5 * this.unit};
            var style = {};
            var p = o[d].pop89;
            var n = o[d].placeName;
            if (overRides.supressNames.indexOf(n) > -1) {continue;}
            if ((this.width <= this.minHeight || this.height <= this.minHeight) && p < 100000) {continue;}
            if (overRides.alignLeft.indexOf(n) > -1) {s.anchor = "end";}
            if (overRides.alignCenter.indexOf(n) > -1) {s.anchor = "middle";}
            if (overRides.alignBelow.indexOf(n) > -1) {s.yOffset = 6 * this.unit;}
            this.layout.labelClasses.forEach( function(d) {
                if (p >= d.range[0] && p<= d.range[1]) {
                    s.class = d.className;
                    s.r = d.r;
                    s.size = d.fs;
                    s.showLabel = d.showLabel;
                    style.dot = self.styles.label.dots[d.dotStyle] || {};
                    style.text = self.styles.label.text[d.text] || {};
                }
            });
           var link,dot = dots;
            if (this.options.linkABL) {
                link = this.ablBaseURL + "?Bezirk=" + o[d].bezirkSafe + "&ort=" + o[d].placeNameURL;
                dot = dot.append("a").attr({
                    "xlink:href": link,
                    "target": "blank"
                });
            }
            dot.append("circle").attr("class", s.class)
                .attr({
                    id: o[d].placeNameURL,
                    title: o[d].placeName,
                    cx: o[d].pCoords[0],
                    cy: o[d].pCoords[1],
                    r: s.r * this.unit
                })
                .style(style.dot);
            if (s.showLabel) {
                labels.append("text")
                    .attr({
                        "id": o[d].placeNameURL,
                        "class": s.class,
                        "text-anchor": s.anchor,
                        x: o[d].pCoords[0] ,
                        y: o[d].pCoords[1] + s.yOffset
                    })
                    .style(style.text)
                    .style({
                        "font-size": Math.min(s.size * this.layout.fontSize) + "em"
                    })
                    .text(n);
            }
        }
    };

    Vis.prototype.checkLoadState = function () {
        if (this.debug) {
            console.log("Check load state");
        }
        if (this.demos && this.locations && !this.groups) {
            if (this.debug) {
                console.log(" -- join records");
            }
            this.joinArrayWithLocationKeyObj(this.demos, this.locations);
            if (this.debug) {
                console.log(" -- group by date");
            }
            this.groupBy(this.demos, "dateString");
            // calculate totals by Bezirk
            this.groups.bezirkeTotals = this.groupBy(this.demos, "bezirkSafe", {
                tmp: true,
                rollUpF: function (d) {
                    return {
                        "length": d.length,
                        "ratio": d3.sum(d, function (d) {
                            return d.ratioBez;
                        }),
                        "total": d3.sum(d, function (d) {
                            return d.partGuess;
                        })
                    };
                }
            });
            // calculate totals by day and Bezirk
            this.groups.bezirkeTotalsByDay = this.getBezirkeTotalsByDay();
            // calculate totals by day
            this.groups.totalsByDay = this.groupBy(this.demos, "dateString", {
                tmp: true,
                rollUpF: function (d) {
                    return {
                        "length": d.length,
                        "total": d3.sum(d, function (d) {
                            return d.partGuess;
                        })
                    };
                }
            });
            this.groups.totalsByPlace = this.groupBy(this.demos, "placeKey", {
                tmp: true,
                rollUpF: function (d) {
                    return {
                        placeName: d[0].placeName,
                        placeNameURL: d[0].placeNameURL,
                        bezirk: d[0].bezirk,
                        bezirkSafe: d[0].bezirkSafe,
                        pop89: d[0].pop89,
                        length: d.length,
                        pCoords: d[0].pCoords,
                        total: d3.sum(d, function (d) {
                            return d.partGuess;
                        }),
                        "totalRel": d3.sum(d, function (d) {
                            return d.ratio;
                        })
                    };
                }
            });
            this.drawLabels();
        }
        if (this.demos && this.locations && this.mapReady) {
            if (this.debug) {
                console.log(" -- start animation");
            }
            this.setupControls();
            if (this.options.autoplay) {
                this.showInterval();
            }
        }
    };

    window.Vis = Vis;

}(window));
