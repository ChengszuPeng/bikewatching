import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';

import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

mapboxgl.accessToken =
  'pk.eyJ1IjoiYnJ1Y2UyMDA0IiwiYSI6ImNtcDhoMGs1aDA4eTIydHB6YTQxNGV2MzAifQ.Fndz7pUVTlIynCrRRBVXbg';

let departuresByMinute =
  Array.from(
    { length: 1440 },
    () => []
  );

let arrivalsByMinute =
  Array.from(
    { length: 1440 },
    () => []
  );

const map =
  new mapboxgl.Map({

    container: 'map',

    style:
      'mapbox://styles/mapbox/streets-v12',

    center: [
      -71.09415,
      42.36027
    ],

    zoom: 12,

    minZoom: 5,

    maxZoom: 18
  });

function getCoords(station) {

  const point =
    new mapboxgl.LngLat(
      +station.lon,
      +station.lat
    );

  const {
    x,
    y
  } = map.project(point);

  return {
    cx: x,
    cy: y
  };
}

function formatTime(minutes) {

  const date = new Date(
    0,
    0,
    0,
    0,
    minutes
  );

  return date.toLocaleString(
    'en-US',
    {
      timeStyle: 'short'
    }
  );
}

function minutesSinceMidnight(
  date
) {

  return (
    date.getHours() * 60 +
    date.getMinutes()
  );
}

function filterByMinute(
  tripsByMinute,
  minute
) {

  if (minute === -1) {
    return tripsByMinute.flat();
  }

  let minMinute =
    (minute - 60 + 1440) %
    1440;

  let maxMinute =
    (minute + 60) % 1440;

  if (minMinute > maxMinute) {

    let beforeMidnight =
      tripsByMinute.slice(
        minMinute
      );

    let afterMidnight =
      tripsByMinute.slice(
        0,
        maxMinute
      );

    return beforeMidnight
      .concat(afterMidnight)
      .flat();

  } else {

    return tripsByMinute
      .slice(
        minMinute,
        maxMinute
      )
      .flat();
  }
}

function computeStationTraffic(
  stations,
  timeFilter = -1
) {

  const departures =
    d3.rollup(
      filterByMinute(
        departuresByMinute,
        timeFilter
      ),
      (v) => v.length,
      (d) =>
        d.start_station_id
    );

  const arrivals =
    d3.rollup(
      filterByMinute(
        arrivalsByMinute,
        timeFilter
      ),
      (v) => v.length,
      (d) =>
        d.end_station_id
    );

  return stations.map(
    (station) => {

      let id =
        station.short_name;

      let arrivalsCount =
        arrivals.get(id) ?? 0;

      let departuresCount =
        departures.get(id) ?? 0;

      return {

        ...station,

        arrivals:
          arrivalsCount,

        departures:
          departuresCount,

        totalTraffic:
          arrivalsCount +
          departuresCount
      };
    }
  );
}

map.on(
  'load',
  async () => {

    map.addSource(
      'boston_route',
      {
        type: 'geojson',

        data:
          './Existing_Bike_Network_2022.geojson'
      }
    );

    map.addLayer({

      id: 'bike-lanes',

      type: 'line',

      source:
        'boston_route',

      paint: {

        'line-color':
          '#32D400',

        'line-width': 5,

        'line-opacity':
          0.6
      }
    });

    map.addSource(
      'cambridge_route',
      {
        type: 'geojson',

        data:
          './cambridge_bike_lanes.geojson'
      }
    );

    map.addLayer({

      id:
        'cambridge-bike-lanes',

      type: 'line',

      source:
        'cambridge_route',

      paint: {

        'line-color':
          '#32D400',

        'line-width': 5,

        'line-opacity':
          0.6
      }
    });

    const jsonData =
      await d3.json(
        'https://dsc106.com/labs/lab07/data/bluebikes-stations.json'
      );

    const baseStations =
      jsonData.data.stations;

    await d3.csv(
      'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv',

      (trip) => {

        trip.started_at =
          new Date(
            trip.started_at
          );

        trip.ended_at =
          new Date(
            trip.ended_at
          );

        let startedMinutes =
          minutesSinceMidnight(
            trip.started_at
          );

        let endedMinutes =
          minutesSinceMidnight(
            trip.ended_at
          );

        departuresByMinute[
          startedMinutes
        ].push(trip);

        arrivalsByMinute[
          endedMinutes
        ].push(trip);

        return trip;
      }
    );

    const trafficStations =
      computeStationTraffic(
        baseStations
      );

    const svg = d3
      .select('#map')
      .select('svg');

    const radiusScale =
      d3
        .scaleSqrt()
        .domain([
          0,
          d3.max(
            trafficStations,
            (d) =>
              d.totalTraffic
          )
        ])
        .range([0, 25]);

    const stationFlow =
      d3
        .scaleQuantize()
        .domain([0, 1])
        .range([
          0,
          0.5,
          1
        ]);

    const circles = svg
      .selectAll('circle')
      .data(
        trafficStations,
        (d) =>
          d.short_name
      )
      .enter()
      .append('circle')
      .attr(
        'cx',
        (d) =>
          getCoords(d).cx
      )
      .attr(
        'cy',
        (d) =>
          getCoords(d).cy
      )
      .attr(
        'r',
        (d) =>
          radiusScale(
            d.totalTraffic
          )
      )
      .style(
        '--departure-ratio',
        (d) => {

          if (
            d.totalTraffic === 0
          ) {
            return 0.5;
          }

          return stationFlow(
            d.departures /
              d.totalTraffic
          );
        }
      )
      .attr(
        'stroke',
        'white'
      )
      .attr(
        'stroke-width',
        1
      )
      .attr(
        'fill-opacity',
        0.7
      );

    function updatePositions() {

      circles
        .attr(
          'cx',
          (d) =>
            getCoords(d).cx
        )
        .attr(
          'cy',
          (d) =>
            getCoords(d).cy
        );
    }

    map.on(
      'move',
      updatePositions
    );

    map.on(
      'zoom',
      updatePositions
    );

    map.on(
      'resize',
      updatePositions
    );

    map.on(
      'moveend',
      updatePositions
    );

    const timeSlider =
      document.getElementById(
        'time-slider'
      );

    const selectedTime =
      document.getElementById(
        'selected-time'
      );

    const anyTimeLabel =
      document.getElementById(
        'any-time'
      );

    function updateScatterPlot(
      timeFilter
    ) {

      const filteredStations =
        computeStationTraffic(
          baseStations,
          timeFilter
        );

      timeFilter === -1
        ? radiusScale.range([
            0,
            25
          ])
        : radiusScale.range([
            3,
            50
          ]);

      circles
        .data(
          filteredStations,
          (d) =>
            d.short_name
        )
        .attr(
          'cx',
          (d) =>
            getCoords(d).cx
        )
        .attr(
          'cy',
          (d) =>
            getCoords(d).cy
        )
        .attr(
          'r',
          (d) =>
            radiusScale(
              d.totalTraffic
            )
        )
        .style(
          '--departure-ratio',
          (d) => {

            if (
              d.totalTraffic === 0
            ) {
              return 0.5;
            }

            return stationFlow(
              d.departures /
                d.totalTraffic
            );
          }
        );
    }

    function updateTimeDisplay() {

      let timeFilter =
        Number(
          timeSlider.value
        );

      if (
        timeFilter === -1
      ) {

        selectedTime.textContent =
          '';

        anyTimeLabel.style.display =
          'block';

      } else {

        selectedTime.textContent =
          formatTime(
            timeFilter
          );

        anyTimeLabel.style.display =
          'none';
      }

      updateScatterPlot(
        timeFilter
      );
    }

    timeSlider.addEventListener(
      'input',
      updateTimeDisplay
    );

    updateTimeDisplay();

    updatePositions();
  }
);