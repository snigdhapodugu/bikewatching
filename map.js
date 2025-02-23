mapboxgl.accessToken = 'pk.eyJ1Ijoic25pZ2RoYXBvZHVndSIsImEiOiJjbTdmMXgwNDcwa2VzMmxxNnJvYW9kMmloIn0.fombosUB9YrSdhGHQ_Kbog';
const map = new mapboxgl.Map({
    container: 'map', // ID of the div where the map will render
    style: 'mapbox://styles/snigdhapodugu/cm7f3lkv400bc01rgh60q77ml', // Map style
    center: [-71.0923923, 42.3371131], // [longitude, latitude]
    zoom: 12, // Initial zoom level
    minZoom: 5, // Minimum allowed zoom
    maxZoom: 18 // Maximum allowed zoom
});

map.on('error', (e) => {
    console.error('Mapbox error:', e);
});

map.on('load', () => { 
    map.addSource('boston_route', {
        type: 'geojson',
        data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson?...'
    });
    map.addLayer({
        id: 'bos-bike-lanes',
        type: 'line',
        source: 'boston_route',
        paint: {
            'line-color': '#C8102E',  // A bright green using hex code
            'line-width': 4,          // Thicker lines
            'line-opacity': 0.6       // Slightly less transparent
        }
    }); 
    map.addSource('cam_route', {
        type: 'geojson',
        data: 'https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson?...'
    });
    map.addLayer({
        id: 'cam-bike-lanes',
        type: 'line',
        source: 'cam_route',
        paint: {
            'line-color': '#C8102E',  // A bright green using hex code
            'line-width': 4,          // Thicker lines
            'line-opacity': 0.6       // Slightly less transparent
        }
    });
});

function getCoords(station) {
    const point = new mapboxgl.LngLat(+station.lon, +station.lat);  // Convert lon/lat to Mapbox LngLat
    const { x, y } = map.project(point);  // Project to pixel coordinates
    return { cx: x, cy: y };  // Return as object for use in SVG attributes
}

let trips = []; 
let stations = [];
let stationFlow = d3.scaleQuantize().domain([0, 1]).range([0, 0.5, 1]);

map.on('load', () => {
    const jsonurl = 'https://dsc106.com/labs/lab07/data/bluebikes-stations.json';
    const csvurl = 'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv';
    
    Promise.all([d3.json(jsonurl), d3.csv(csvurl)]).then(([jsonData, csvData]) => {
        console.log('Loaded JSON Data:', jsonData);  
        console.log('Loaded CSV Data:', csvData);  

        stations = jsonData.data.stations; 
        trips = csvData;

        for (let trip of trips) {
            trip.started_at = new Date(trip.started_at);
            trip.ended_at = new Date(trip.ended_at);
            console.log('Started At:', trip.started_at, 'Ended At:', trip.ended_at);
        }

        let departures = d3.rollup(
            trips,
            (v) => v.length,
            (d) => d.start_station_id,
        );

        let arrivals = d3.rollup(
            trips,
            (v) => v.length,
            (d) => d.end_station_id,
        );

        stations.map((station) => {
            let id = station.short_name;
            station.arrivals = arrivals.get(id) ?? 0;
            station.departures = departures.get(id) ?? 0;
            station.totalTraffic = station.arrivals + station.departures;
            return station;
        });

        const radiusScale = d3
            .scaleSqrt()
            .domain([0, d3.max(stations, (d) => d.totalTraffic)])
            .range([0, 25]);
        
        const svg = d3.select('#map').select('svg');
        const circles = svg.selectAll('circle')
            .data(stations)
            .enter()
            .append('circle')
            .attr('r', d => radiusScale(d.totalTraffic))              
            .attr('fill', 'hsl(360, 72%, 68%)')  // Circle fill color
            .attr('stroke', 'white')    // Circle border color
            .attr('stroke-width', 1)    // Circle border thickness
            .attr('opacity', 0.9)      // Circle opacity
            .each(function(d) {
                // Add <title> for browser tooltips
                d3.select(this)
                  .append('title')
                  .text(`${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`);
            })
            .style("--departure-ratio", d => stationFlow(d.departures / d.totalTraffic)) ;

        // Update positions after rendering
        function updatePositions() {
            circles.attr('cx', d => getCoords(d).cx)
                   .attr('cy', d => getCoords(d).cy);
        }
        
        updatePositions();  // Position initially
        map.on('move', updatePositions);
        map.on('zoom', updatePositions);
        map.on('resize', updatePositions);
        map.on('moveend', updatePositions);
        
    })
});

function minutesSinceMidnight(date) {
    return date.getHours() * 60 + date.getMinutes();
}

let filteredTrips = [];
let filteredArrivals = new Map();
let filteredDepartures = new Map();
let filteredStations = [];

let timeFilter = -1;

const timeSlider = document.getElementById('time-slider');
const selectedTime = document.getElementById('selected-time');
const anyTimeLabel = document.getElementById('any-time');

function formatTime(minutes) {
    const date = new Date(0, 0, 0, 0, minutes);  // Set hours & minutes
    return date.toLocaleString('en-US', { timeStyle: 'short' }); // Format as HH:MM AM/PM
}

function updateTimeDisplay() {
    timeFilter = Number(timeSlider.value);  // Get slider value
  
    if (timeFilter === -1) {
      selectedTime.textContent = '';  // Clear time display
      anyTimeLabel.style.display = 'block';  // Show "(any time)"
    } else {
      selectedTime.textContent = formatTime(timeFilter);  // Display formatted time
      anyTimeLabel.style.display = 'none';  // Hide "(any time)"
    }
  
    // Trigger filtering logic which will be implemented in the next step
    filterTripsbyTime();
}

timeSlider.addEventListener('input', updateTimeDisplay);
updateTimeDisplay();

function filterTripsbyTime() {
    console.log(timeFilter);
    filteredTrips = timeFilter === -1
        ? trips
        : trips.filter((trip) => {
            const startedMinutes = minutesSinceMidnight(trip.started_at);
            const endedMinutes = minutesSinceMidnight(trip.ended_at);
            return (
              Math.abs(startedMinutes - timeFilter) <= 60 ||
              Math.abs(endedMinutes - timeFilter) <= 60
            );
        });

    // we need to update the station data here explained in the next couple paragraphs
    filteredArrivals = d3.rollup(
        filteredTrips,
        (v) => v.length,
        (d) => d.end_station_id,
    );

    filteredDepartures = d3.rollup(
        filteredTrips,
        (v) => v.length,
        (d) => d.start_station_id,
    );

    filteredStations = stations.map(station => {
        let clonedStation = { ...station }; 
        let id = clonedStation.short_name;
        clonedStation.arrivals = filteredArrivals.get(id) ?? 0;
        clonedStation.departures = filteredDepartures.get(id) ?? 0;
        clonedStation.totalTraffic = clonedStation.arrivals + clonedStation.departures;
        return clonedStation;
    });

    const radiusScale = d3
        .scaleSqrt()
        .domain([0, d3.max(filteredStations, (d) => d.totalTraffic)])
        .range([0, 25]);

    const svg = d3.select('#map').select('svg');
    const circles = svg.selectAll('circle').data(filteredStations, d => d.short_name);

    circles.enter()
        .append('circle')
        .attr('r', d => radiusScale(d.totalTraffic))
        .attr('fill', 'hsl(360, 72%, 68%)')
        .attr('stroke', 'white')
        .attr('stroke-width', 1)
        .attr('opacity', 0.9)
        .each(function(d) {
            d3.select(this)
              .append('title')
              .text(`${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`);
        }).merge(circles) 
        .attr('cx', d => getCoords(d).cx)
        .attr('cy', d => getCoords(d).cy)
        .style("--departure-ratio", d => stationFlow(d.departures / d.totalTraffic));
    
    circles
        .attr('r', d => radiusScale(d.totalTraffic))  
        .attr('cx', d => getCoords(d).cx)  
        .attr('cy', d => getCoords(d).cy); 

    circles.exit().remove();
}

// Define coordinates for each campus
const campusLocations = {
    harvard: { center: [-71.1167, 42.3770], zoom: 15 },       // Harvard Square
    mit: { center: [-71.0921, 42.3601], zoom: 15 },          // MIT
    bu: { center: [-71.1062, 42.3505], zoom: 15 },           // BU (Commonwealth Ave)
    northeastern: { center: [-71.0892, 42.3398], zoom: 15 }  // Northeastern
};

// Add event listener to the dropdown menu
document.getElementById('campus-select').addEventListener('change', function () {
    const selectedCampus = this.value;  // Get selected campus

    if (campusLocations[selectedCampus]) {
        map.flyTo({
            center: campusLocations[selectedCampus].center,
            zoom: campusLocations[selectedCampus].zoom,
            essential: true  // Ensures smooth animation
        });
    }
});
