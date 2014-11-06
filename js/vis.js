/* globals d3: false */
(function(window){
    'use strict';

    var is_chrome = navigator.userAgent.toLowerCase().indexOf('chrome') > -1;

    function dateToString(d) {
        var monthNames = [ "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec" ];
        // return  d.getDate() + "-" + monthNames[d.getMonth()]  + "-" + d.getFullYear();
        return d.getFullYear() + "-" + (d.getMonth() +1) + "-" + d.getDate();

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
        this.options.flashColor = this.options.flashColor || "hsl(54,30%,50%)";
        this.options.flashDistricts = this.options.flashDistricts || false;
        this.options.limitLoops = this.options.limitLoops === undefined ? 500 : this.options.limitLoops;  //catch runaway intervals and debugging, hard limit of 500
        this.options.forcedStartDate = this.options.forcedStartDate || false;  // override start date
        this.options.forcedEndDate = this.options.forcedEndDate || false;  // override start date
        this.options.tickerEnabled = this.options.tickerEnabled || false;  // override start date
        this.options.daysPerSecond = this.options.daysPerSecond || 4;
        this.options.trailFallOff = this.options.trailFallOff || 0.05;
        this.options.noAgentExceptions = this.options.noAgentExceptions === undefined ? false : this.options.noAgentExceptions;
        this.options.loop = this.options.loop === undefined ? false : this.options.loop;
        this.options.containerId = this.options.containerId || 'vis';
        this.options.maxRadiusRatio = this.options.maxRadiusRatio || 0.08;
        this.debug =  this.options.debug || false;
        this.eventDates = [
            // add more timed event here if needed
            {
                name: "Der Mauerfall (11.9.'89)",
                dateString: "1989-11-09",
                fn : "mauerFall",
                resetFn : "mauerReset"
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
        this.scales = {
            rel : d3.scale.linear().domain([0, 0.5]).range([0.1, 1])

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
        this.mapReady = false;
    }

    Vis.prototype.init = function(){
        this.width = this.target.elem.offsetWidth;
        this.height = this.target.elem.offsetHeight;

        this.dim = Math.min(this.width, this.height);
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
                    d.placeNameURL = r.urlname;
                    d.bezirk = r.bezirk;
                    d.bezirkSafe = r.bezirkSafe;
                    d.coords = r.coords;
                    d.pCoords = r.pCoords;
                    d.pop89 = r.pop89;
                    d.popBez89 = r.popbez89;
                    d.ratio = d.partGuess/ d.pop89;
                    d.ratioBez = d.partGuess/ d.popbez89;
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
        this.ui.datebox = container.append("div")
            .attr("class","ui")
            .attr("id","ui_currentdate");

        this.ui.datetext = this.ui.datebox.append("p").classed("date",true);
        this.ui.datetext.dayOfWeek = this.ui.datetext.append("span").classed("dayofweek",true);
        this.ui.datetext.day = this.ui.datetext.append("span").classed("dayofmonth",true);
        this.ui.datetext.month = this.ui.datetext.append("span").classed("month",true);
        this.ui.datetext.year = this.ui.datetext.append("span").classed("year",true);

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
        // some inline svg styling happening here
        // breaks in chrome fullscreen
        var grid = this.svg.append("g")
            .classed("graticule",true);
        grid.append("path")
            .datum(graticule)
            .attr("class", "blur")
            .style("filter", "url(#svgfblur)")
            .style("stroke", "yellow")
            .style("stroke-width", 0.2)
            .style("opacity", 0.5)
            .attr("d", path);

        grid.append("path")
            .datum(graticule)
            .attr("d", path);
        this.tickerLayer = this.svg.append("g")
            .attr("class", "ticker");

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


        this.labelLayer = this.svg.append("g")
            .attr("class", "labels");
        this.markerLayer = this.svg.append("g")
            .attr("class", "markers");


        var legendOffset = [this.width * 4/5,this.height * 1/6];
        var maxR = this.scales.rPop(100000);
        this.legend = this.svg.append("g")
            .attr("transform", "translate("+
            legendOffset[0] +"," + legendOffset[1] +")")
            .attr("class", "legend");
        this.legend.append("circle").attr({cx: 0, cy: 0,r : maxR});
        this.legend.append("circle").attr({cx: 0, cy: this.scales.rPop(50000)-maxR,r : this.scales.rPop(50000)});
        this.legend.append("circle").attr({cx: 0, cy: this.scales.rPop(20000)-maxR,r : this.scales.rPop(20000)});
        //this.legend.append("circle").attr({cx: 0, cy: this.scales.rPop(10000)-maxR,r : this.scales.rPop(10000)});
        this.legend.append("circle").attr({cx: 0, cy: this.scales.rPop(5000)-maxR,r : this.scales.rPop(5000)});
        this.legend.append("text").text("100 000").attr({"text-anchor": "middle", x : 0, y : maxR * 5/6 } );
        this.legend.append("text").text("50 000").attr({"text-anchor": "middle", x : 0, y : this.scales.rPop(50000) * 11/6 - maxR } );
        this.legend.append("text").text("20 000").attr({"text-anchor": "middle", x : 0, y : this.scales.rPop(20000) * 8/5 - maxR  } );
        this.legend.append("text").text("5000").attr({"text-anchor": "middle", x : 0, y : this.scales.rPop(5000) * 6/5 - maxR  } );

        this.mapReady = true;
        if (this.debug) {
            console.log("Map rendered");
        }
        this.checkLoadState();
    };

    Vis.prototype.resetEventsAtDate = function(date) {
        var self = this;
        this.eventDates.forEach( function(d) {
            // todo implement timespans for events;
            if (date < d.date) {
                if (self.debug) {console.info("found future events", d.dateString, d.name);}
                // todo pass function properly #pass
                self[d.resetFn]();
            } else if (date > d.date) {
                self[d.fn]();
            }
        });
    };

    Vis.prototype.showInterval = function(arr) {
        var self = this;
        var i = 1;
        var limit = this.options.limitLoops; //catch runaway intervals
        var interval = arr || this.currentInterval.dates;
        this.currentDate = new Date(interval[0]);
        var endDateStr = dateToString(interval[1]);
        if (this.debug) {console.log("showInterval",interval, this.currentDate);}
        this.resetEventsAtDate();
        this.timer = window.setInterval(function(){
            var currentDateString = dateToString(self.currentDate);
            //  if (self.debug) {console.log("dateloop",currentDateString, limit, i);}
            // check for timed events
            self.eventDates.forEach( function(d) {
                // if (self.debug) {console.info(currentDateString, d.dateString);}
                if (d.dateString === currentDateString) {
                    if (self.debug) {console.info("found event", d.dateString, d.name);}
                    // todo pass function properly #pass
                    self[d.fn]();
                }
            });
            // update UI
            var strObj = dateToLocale(self.currentDate,self.options.locale);
            self.ui.datetext.dayOfWeek.text(strObj.dayOfWeekString);
            self.ui.datetext.day.text(strObj.dayOfMonth + ".");
            self.ui.datetext.month.text(strObj.monthString);
            self.ui.datetext.year.text(strObj.year);
            // trigger rendering
            if (self.groups.dateString[currentDateString]) {self.showDate(currentDateString);}
            // end interval;
            // trigger fadeout
            //fadeCircles();
            if (currentDateString === endDateStr) {
                if (self.options.loop) {
                    self.currentDate = new Date(interval[0]);
                    if (self.debug) {console.log("new loop",interval[0]);}
                } else {
                    if (self.debug) {console.log("exit interval loop based on date loop");}
                    window.clearInterval(self.timer);
                }
            } else {
                self.currentDate.setDate(self.currentDate.getDate() + 1);
            }
            if (i >= limit && limit) {
                if (self.debug) {console.log("exit interval loop based on limit", limit, i);}
                window.clearInterval(self.timer);
            }
            i += 1;
        }, parseInt(1000 / self.options.daysPerSecond));
    };

    Vis.prototype.renderEvents = function(d) {
        var self = this;
        var pos = {
            x : [this.width * 1.5 + (Math.random()/2 + 1), - this.width * (Math.random()/2)],
            y : this.height * 0.9 * Math.random()
        };
        if ( d.eRemarks !== "" && this.height > 700 && this.options.tickerEnabled) {
            self.tickerLayer.append("text").attr({
                "text-anchor": "start",
                x: pos.x[0],
                y: pos.y
            }).text(
                "+++ " + d.placeName + " (" + dateToString(d.date) + ") " +
            d.partGuess + " Teilnehmer + " + d.eRemarks + " +++")
                .transition().ease("linear").duration(25000)
                .attr({x: pos.x[1]}).remove();
        }
        self.markerLayer.append("circle")
            .attr({
                r : 0,
                cx: d.pCoords[0],
                cy: d.pCoords[1],
                fill : "lime",
                opacity : 0
            })
            .transition().ease("cubic-out").duration(900)
            .attr({
                r : self.scales.rPop(d.partGuess),
                opacity : 1
            })
            // todo insert custom timer for less load
            .transition().ease("linear").duration(2500)
            .attr({r: self.scales.rPop(d.partGuess*0.8)})
            .style({opacity : 0}).remove();
    };


    Vis.prototype.renderMarkers = function(arr){
        var self = this;
        //console.log (arr.length, arr[0].dateString, arr[0].placename);
        arr.forEach(function(d) {
            // todo figure out timeout asynchronity
             setTimeout(function() {
            self.renderEvents(d);
            }, Math.random() * 1000/self.daysPerSecond)
        });
    };


    Vis.prototype.showDate = function(dateString){
        var self = this;
        var land = d3.selectAll(".land");
        this.styles = this.styles || {};
        var markers = this.groups.dateString[dateString];
        this.renderMarkers(markers, this.markerLayer);
        if (this.options.flashDistricts) {
            // color bezirke based on participation ratio
            // get base color from css inits;
            // todo fix unexpected clipping for brightness behavior;
            this.styles.landBaseColor = this.styles.landBaseColor ||
            land.style('fill');
            var baseColor = this.styles.landBaseColor;
            var bezRatios = this.groups.bezirkeTotalsByDay[dateString];
            this.currentInterval.trailingBezRatios = this.currentInterval.trailingBezRatios || {};
            var rTrail = this.currentInterval.trailingBezRatios;
            var flashBaseC = this.options.flashColor;
            for (var d in bezRatios) {
                var r = bezRatios[d].ratio;
                // trailing brightness for fallback color
                rTrail[d] = rTrail[d] === undefined ? r :
                rTrail[d] * (1 - this.options.trailFallOff) + this.scales.rel(r);
                var id = "#" + d;
// TODO Throw out comments here or get delays with random offset working
                var b = land.select(id);
                b.style({
                    fill: d3.hsl(flashBaseC),
                    //.brighter(this.scales.rel(r)*0.2),
                    opacity: 0.5
                })
                    .transition().duration(800)
                    .style({
                        fill: d3.hsl(baseColor).brighter(
                            0.05
                            // (this.scales.rel(rTrail[d]) > 0.2)? 0.2 : this.scales.rel(rTrail[d]);
                        ),
                        opacity: 1
                    });
            }
        }
    };

    Vis.prototype.mauerFall = function() {
        this.svg.selectAll(".staatsgrenze").attr("class", "staatsgrenzeoffen");
    };
    Vis.prototype.mauerReset = function() {
        this.svg.selectAll(".staatsgrenzeoffen").attr("class", "staatsgrenze");
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
                        bezirk: d[0].bezirk,
                        pop89: d[0].pop89,
                        length: d.length,
                        pCoords: d[0].pCoords,
                        total: d3.sum(d, function (d) {
                            return d.partGuess;
                        }),
                        "totalRel": d3.sum(d, function (d) {
                            return d.ratio;
                        })
                    }
                }
            });
            //console.log(this.groups.totalsByPlace[1]);
            // debugger;
            var textNodes = d3.select("svg").select(".labels");
            var dots = textNodes.append("g").attr("class","dots");
            var labels = textNodes.append("g").attr("class","labeltext");
            var o = this.groups.totalsByPlace;
            for(var d in o) {
                var s = {anchor: "start", yOffset: -5};
                var p = o[d].pop89;
                var n = o[d].placeName;
                var supressNames = [
                    "Rostock-Warnemünde",
                    "Rostock-Gehlsdorf",
                    "Berlin-Köpenick",
                    "Berlin-Staaken",
                    "Berlin-Dahlwitz-Hoppegarten",
                    "Berlin-Kaulsdorf",
                    "Halle-Neustadt"
                ];
                var alignLeft = ["Potsdam","Gotha","Zwickau"];
                var alignCenter = ["Erfurt","Weimar","Karl-Marx-Stadt"];
                if (supressNames.indexOf(n) > -1) {continue;}
                if ((this.width < 700 || this.height < 540) && p < 100000) {continue;}
                if (alignLeft.indexOf(n) > -1) {s.anchor = "end";}
                if (alignCenter.indexOf(n) > -1) {s.anchor = "middle";}

                switch (true) {
                    case (p < 10000) :  s.class = "smaller10k";s.r = 1;s.size = 6;s.showLabel= false; break;
                    case (p < 50000) :  s.class = "pl10kto50k";s.r = 2;s.size = 7;s.showLabel= false; break;
                    case (p < 100000) : s.class = "pl50kto100k";s.r = 3;s.size = 8;s.showLabel= true; break;
                    case (p < 300000) : s.class = "pl100kto300k";s.r = 4;s.size = 10;s.showLabel= true; break;
                    default :           s.class = "pl300kplus";s.r = 4;s.size = 12;s.showLabel= true; break;
                }
                if (n === "Zwickau") {s.yOffset = 10};

                dots.append("circle")
                    .attr({
                        cx: o[d].pCoords[0],
                        cy: o[d].pCoords[1],
                        r: s.r
                    })
                if (s.showLabel) {
                    labels.append("text")
                        .attr({"class": s.class})
                        .attr({"text-anchor": s.anchor})
                        .attr({
                            x: o[d].pCoords[0] ,
                            y: o[d].pCoords[1] + s.yOffset
                        })
                        .style({
                            "font-size": s.size + "px",
                            "fill": "white",
                            "font-family": "sans-serif"
                        })
                        .text(n);
                }
            }

        }
        if (this.demos && this.locations && this.mapReady) {
            if (this.debug) {
                console.log(" -- start animation");
            }
            this.showInterval();
        }
    };

    window.Vis = Vis;

}(window));
