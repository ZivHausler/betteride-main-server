// import { GOOGLE_MAPS_APIKEY } from '@env';
const express = require("express");
const fetch = require("node-fetch");
const app = express();
const cors = require("cors");
const axios = require("axios");
const googleMapsKey = "AIzaSyB9mAs9XA7wtN9RdKMKRig7wlHBfUtjt1g";
const distance = require("google-distance-matrix");
const munkres = require("munkres-js");
const IP_ADDRESS = "https://betteride-firebase-server-3mmcqmln7a-ew.a.run.app/"; // Daniel -> 10.100.102.233 // ZIV-> 10.0.0.8

app.use(cors({ origin: true }));

app.listen(3001, async () => {
  sendLog("General-Server is up and running","OK")
  console.log("Waiting for a request...");
});
app.get('/', (req, res) => {
  res.send('Game on!')
})
app.get('/api/getUserDirections', async (req, res) => {
  const { origin, destination } = req.query;
  res.status(200).send(await getDirectionsByAddress(origin, destination));
});
app.get('/api/translateCordsToAddress', async (req, res) => {
  const { lat, lng } = req.query;
  res.status(200).send(JSON.stringify(await translateCordsToAddress(lat, lng)));
})
app.get("/api/OrderVehicle", async (req, res) => {
  const { userOrigin, userDestination, userID } = req.query;
  // find the nearest vehicle and assign it to the user
  const vehiclePlateNumber = await naiveAssignmentVehicleToUser(userOrigin, userDestination, userID)
  if (vehiclePlateNumber === -1) {
    console.log("exited with status 404")
    sendLog("OrderVehicle, there are no available vehicles","ERROR")
    res.status(404).send('nothing works here');
  }
  else {
    // collect all vehicles which currently on the way to users
    // and create a costMatrix out of it
    await createCostMatrix();
    res.status(200).send(JSON.stringify(vehiclePlateNumber));
  }
});
app.put('/api/generateRouteToVehicle', async (req, res) => {
  const { userID } = req.query;
  try {
    // get the desired user origin and destination (from the firebase server)
    const userDirections = await fetch(`${IP_ADDRESS}getUserDirections?userID=${userID}`)
    const origin_destination = await userDirections.json();
    // getting the route from the main server
    const route = await getDirectionsByAddress(origin_destination.userOrigin, origin_destination.userDestination)
    route['user_id'] = userID;
    // push to the vehicle via firebase server
    await fetch(`${IP_ADDRESS}pushRouteToVehicle`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ plateNumber: origin_destination.state.assigned, route, type: 'WITH_USER' })
    });
    await fetch(`${IP_ADDRESS}updateUserVehicleState`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ plateNumber: origin_destination.state.assigned, userID, state: "TOGETHER" })
    });
    sendLog("UserID: " + userID + " is in vehicle: " + origin_destination.state.assigned + ", and currently driving to destination","OK")
    res.status(200).send(JSON.stringify({
      origin: {
        description: route.start_address,
        location: route.start_location
      },
      destination: {
        description: route.end_address,
        location: route.end_location
      },
    }));
  }

  catch (e) {
    sendLog("Somthing went wrong trying pushing route to vehicle: " + origin_destination.state.assigned + " to user-id: " + userID,"ERROR")
    console.log(e)
    res.status(400).send("ERROR")
  }
});

// methods
const createCostMatrix = async () => {
  const response = await fetch(`${IP_ADDRESS}getVehiclesTowardsUsers`);
  const responseData = await response.json();
  if (responseData.length <= 0) return;
  const origins = [];
  const destinations = [];
  const vehiclesIDs = [];
  const usersIDs = [];
  distance.key('AIzaSyAYOZJcrH22i5ePgb4ctAUPsQw9oU69MwU');

  let count = 0;
  let mishtatfimMatrix = [];
  responseData.forEach((vehicle) => {
    origins.push(vehicle.currentLocation.location.lat + "," + vehicle.currentLocation.location.lng);
    destinations.push(vehicle.route.end_location.lat + "," + vehicle.route.end_location.lng);
    vehiclesIDs.push(vehicle.plateNumber);
    usersIDs.push(count++);
  });
  if (usersIDs.length <= 1) {
    //console.log("not enough vehicles to optimize")
    return;
  }

  distance.matrix(origins, destinations, (err, distances) => {
    const distanceMatrix = initiateMatrix(vehiclesIDs.length, usersIDs.length);
    if (err) {
      return console.log(err);
    }
    if (!distances) {
      return console.log("no distances");
    }
    if (distances.status == "OK") {
      mishtatfimMatrix = initiateMatrix(
        vehiclesIDs.length,
        usersIDs.length
      );
      for (let i = 0; i < origins.length; i++) {
        for (let j = 0; j < destinations.length; j++) {
          if (distances.rows[0].elements[j].status == "OK") {
            distanceMatrix[i][j] = (distances.rows[i].elements[j].duration.value / 60).toFixed(2);
            mishtatfimMatrix[i][j] = 'vehicle plate number: ' + vehiclesIDs[i] + " to location: " + destinations[j] + " will last: " + (distances.rows[i].elements[j].duration.value / 60).toFixed(2) + ' minutes';
          }
          else console.log(destination + " is not reachable from " + origin);
        }
      }
    }
    optimizedAssignedVehicles(distanceMatrix, vehiclesIDs, usersIDs, destinations, mishtatfimMatrix);
    // return distanceMatrix;
  });
};
const optimizedAssignedVehicles = async (distanceMatrix, vehicleIDs, usersIDs, destinations, mishtatfimMatrix) => {
  let unoptimizedTotalDrivingTimeToUser = (await getTotalDrivingTimeToUser() / 60);
  unoptimizedTotalDrivingTimeToUser = unoptimizedTotalDrivingTimeToUser.toFixed(2);
  console.log("\nTotal driving time before optimization is: " + unoptimizedTotalDrivingTimeToUser + ' minutes,');
  console.log('when the current distribution looks like:');

  mishtatfimMatrix.forEach((mishtatef, index) => console.log(mishtatef[index]));
  console.log('');
  console.log('Full distance matrix (by minutes): ', distanceMatrix);
  // get the optimized routes by the Hungarian Algorithm
  const optimizedRoutes = munkres(distanceMatrix);
  console.log("In order to optimize the routes, consider the following distribution: ", optimizedRoutes);
  console.log('');
  // calculate total optimize time:
  let optimizedTotalDrivingTimeToUser = 0;
  optimizedRoutes.forEach(route => optimizedTotalDrivingTimeToUser += parseInt(distanceMatrix[route[0]][route[1]]));
  console.log("Total driving time after optimization is: " + optimizedTotalDrivingTimeToUser + ' minutes,')
  console.log('when the new distribution will be:');
  mishtatfimMatrix.forEach((mishtatef, index) => console.log(mishtatef[optimizedRoutes[index][1]]));

  optimizedRoutes.forEach(route => {
    route[0] = vehicleIDs[route[0]];
    route[1] = destinations[route[1]];
  })

  if (await getTotalDrivingTimeToUser() > optimizedTotalDrivingTimeToUser) {
    await fetch(`${IP_ADDRESS}reassignVehiclesToUsers`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(optimizedRoutes),
    })
  }
};
const initiateMatrix = (vehiclesLength, usersLength) => {
  return Array.from(
    {
      // generate array of length m
      length: usersLength,
      // inside map function generate array of size n
      // and fill it with `0`
    },
    () => new Array(vehiclesLength).fill(null)
  );
};
const getDirectionsByAddress = async (from, to) => {
  return await axios
    .get(
      `https://maps.googleapis.com/maps/api/directions/json?origin=${from}&destination=${to}&key=${googleMapsKey}`
    )
    .then((response) => {
      return response.data.routes[0].legs[0];
    })
    .catch((error) => console.log(error));
};
const sortedVehicleArray = (nearestVehicles) => {
  // Create items array
  let sortedArray = Object.keys(nearestVehicles).map(function (key) {
    return [key, nearestVehicles[key]];
  });

  // Sort the array based on the second element
  sortedArray.sort(function (first, second) {
    return first[0] - second[0];
  });
  return sortedArray;
};
const replaceDistWithETA = async (dict, callLocation) => {
  let newDict = {};
  for (const [key, value] of Object.entries(dict)) {
    const response = await fetch(
      `${IP_ADDRESS}api/getRoute?fromLat=${value.currentLocation.location.lat}&fromLng=${value.currentLocation.location.lng}&toLat=${callLocation.lat}&toLng=${callLocation.lng}`
    );
    const responseData = await response.json();
    newDict[responseData.routes[0].legs[0].duration.value / 60] = {
      vehicle: value,
      routeToUser: responseData.routes[0].legs[0],
    };
  }
  return newDict;
};
const isFitToCompleteTheTrip = (vehicle, endpoint) => {
  // calculate the km the car has left, then check if the endpoint meets the requirements
  return true;
};
const calculateUnavailableCars = async (
  vehicles,
  nearestVehicles,
  callLocation
) => {
  for (const [key, value] of Object.entries(vehicles)) {
    if (value.currentTrip != null) {
      let response = await fetch(
        `${IP_ADDRESS}api/getRoute?fromLat=${value.currentTrip.end_location.lat}&fromLng=${value.currentTrip.end_location.lng}&toLat=${callLocation.lat}&toLng=${callLocation.lng}`
      )
        .then((response) => response.json())
        .then((response) => response);
      let ETAToDestination =
        response.routes[0].legs[0].duration.value / 60 +
        value.currentTrip.etaMin;
      nearestVehicles = replaceMaxKey(nearestVehicles, value, ETAToDestination);
    }
  }
  return nearestVehicles;
};
const replaceMaxKey = (dict, value, newKey) => {
  let max = Math.max(...Object.keys(dict));
  // if we have found a lower dist from, replace
  if (newKey < max) {
    delete dict[max];
    dict[newKey] = value;
  }
  return dict;
};
// This method is responsible for assigning user to the nearest (by time) vehicle
// @param userOrigin
// @param userDestination
// the method recives user origin and destination, calc its route and returns the assigned vehicle
const naiveAssignmentVehicleToUser = async (userOrigin, userDestination, userID) => {
  const userRoute = await getDirectionsByAddress(userOrigin, userDestination);
  const userOriginCoordinates = userRoute.start_location;
  const vehiclesResponse = await fetch(`${IP_ADDRESS}getVehicles`);
  const vehicles = await vehiclesResponse.json();
  let nearestVehicles = {};

  // loop through all vehicles and output n nearest vehicles
  for (const [key, value] of Object.entries(vehicles)) {
    let dist = Math.sqrt(Math.pow(userOriginCoordinates.lat - value.currentLocation.location.lat, 2) + Math.pow(userOriginCoordinates.lng - value.currentLocation.location.lng, 2));
    if (Object.keys(nearestVehicles).length < 3) {
      // the vehicle is available
      if (!value?.routeToUser && !value?.routeWithUser) {
        nearestVehicles[dist] = value;
      }
    } else nearestVehicles = replaceMaxKey(nearestVehicles, value, dist);
  }
  if (Object.keys(nearestVehicles).length <= 0) {
    console.log("there are no available cars for the ride");
    return -1;
  }
  // replace distance with estimated arrival time
  nearestVehicles = await replaceDistWithETA(
    nearestVehicles,
    userOriginCoordinates
  );
  // the row commented below, checks if there is a better vehicle, which its ride ends near the user origin.
  // nearestVehicles = await calculateUnavailableCars(vehicles, nearestVehicles, userOriginCoordinates);

  // sort the vehicles and return array from min to max
  const sortedNearestVehicles = sortedVehicleArray(nearestVehicles);
  // push route into the avialable vehicle

  // if (!sortedNearestVehicles[0][1]){
  //   console.log()
  // }

  // add to the desired vehicle the route to user destination from user origin
  // sortedNearestVehicles[0][1].routeToUser.routes[0].legs[0]['trip_type'] = 'to_user';
  sortedNearestVehicles[0][1].routeToUser['user_id'] = userID;
  await fetch(`${IP_ADDRESS}pushRouteToVehicle`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ plateNumber: sortedNearestVehicles[0][1].vehicle.plateNumber, route: sortedNearestVehicles[0][1].routeToUser, type: "TOWARDS_USER" })
  });
  await fetch(`${IP_ADDRESS}pushTripLocationsToUser`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ userID, userOrigin, userDestination, vehiclePlateNumber: sortedNearestVehicles[0][1].vehicle.plateNumber })
  });
  return sortedNearestVehicles[0][1].vehicle.plateNumber;
};
const getTotalDrivingTimeToUser = async () => {
  let response = await fetch(`${IP_ADDRESS}getTotalDrivingTimeToUser`)
  return await response.json();
}
const translateCordsToAddress = async (lat, lng) => {
  return await axios
    .get(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${googleMapsKey}`
    )
    .then((response) => {
      return response.data.results[0].formatted_address;
    })
    .catch((error) => console.log('error'));

}
const sendLog = async (text, type) => {
  await fetch(`${IP_ADDRESS}postLog`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text, type, server: "general-server" })
  });
}