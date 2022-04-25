// import { GOOGLE_MAPS_APIKEY } from '@env';
const express = require("express");
const fetch = require("node-fetch");
const app = express();
const cors = require("cors");
const axios = require("axios");
const googleMapsKey = "AIzaSyB9mAs9XA7wtN9RdKMKRig7wlHBfUtjt1g";
// const distance = require("google-distance-matrix");
const munkres = require("munkres-js");
const IP_ADDRESS = "http://localhost:3001"; // Daniel -> 10.100.102.233 // ZIV-> 10.0.0.40 // Ruppin ->  10.80.31.88 // https://betteride-main-server-3mmcqmln7a-ew.a.run.app/
var distance = require('./distanceMatrix/index.js');
let demoState = 0;

// automation vars
let isAutomated = false;
const automatedActiveUsersIDs = ["106239502123201988788", "106431065342803359216", "106431065342803359221", "106431065342803359233", "112665819530754433510"]

app.use(cors({ origin: true }));
app.listen(3002, async () => {
  sendLog("General-Server is up and running", "WARNING")
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
  const assignment = await assignVehicleToUser(userOrigin, userDestination, userID);
  console.log("orderVehicle new assignmnet = ", assignment);

  res.send(JSON.stringify(assignment)).status(200);
});


app.put('/api/updateFinishedUsersAutomation', async (req, res) => {
  const { userID } = req.query;
  console.log("userID " + userID + " has finished trip")
  automatedActiveUsersIDs.push(userID);
  res.send("OK").status(200)
});

app.put('/api/resetDatabase', async (req, res) => {
  await fetch(`${IP_ADDRESS}/resetDatabase`, {
    method: "PUT",
  });
  res.send("OK").status(200)
});

app.put('/api/generateRouteToVehicle', async (req, res) => {
  const { userID } = req.query;
  let origin_destination;
  try {
    // get the desired user origin and destination (from the firebase server)
    const userDirections = await fetch(`${IP_ADDRESS}/getUserDirections?userID=${userID}`)
    origin_destination = await userDirections.json();
    // getting the route from the main server
    console.log("pushing route to vehicle", origin_destination.userOrigin, origin_destination.userDestination)
    const route = await getDirectionsByAddress(origin_destination.userOrigin, origin_destination.userDestination)
    route['user_id'] = userID;
    // push to the vehicle via firebase server
    await fetch(`${IP_ADDRESS}/pushRouteToVehicle`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ plateNumber: origin_destination.state.assigned, route, type: 'WITH_USER' })
    });
    await fetch(`${IP_ADDRESS}/updateUserVehicleState`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ plateNumber: origin_destination.state.assigned, userID, state: "TOGETHER" })
    });
    sendLog("UserID: " + userID + " is in vehicle: " + origin_destination.state.assigned + ", and currently driving to destination", "OK")
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
    sendLog("Somthing went wrong trying pushing route to vehicle, to user-id: " + userID, "ERROR")
    console.log(e)
    res.status(400).send("ERROR")
  }
});

app.put('/api/setAutomation', async (req, res) => {
  isAutomated = !isAutomated;
  automationAlgorithm();
  res.status(200).send("isAutomated set to " + isAutomated)
});

app.put('/api/setAlgorithmExample', async (req, res) => {
  try {
    const { state } = req.query;
    if (state) demoState = state;
    else { demoState++; }

    const firstOrigin = 'Zichron Ya\'akov';
    const secondOrigin = 'Derech HaMelacha 4';
    const thirdOrigin = 'Tirat HaCarmel';
    const destination = 'Ruppin Academic Center';

    switch (demoState) {
      case 1:
        sendLog('Setting up algorithm demo', 'OK');
        await assignVehicleToUser(firstOrigin, destination, '106239502123201988788')
        sendLog("First vehicle has been assigned to user at " + firstOrigin, "OK")
        break;
      case 2:
        await assignVehicleToUser(secondOrigin, destination, '106431065342803359216')
        sendLog("second vehicle has been assigned to user at " + secondOrigin, "OK")
        break;
      case 3:
        await assignVehicleToUser(thirdOrigin, destination, '106431065342803359221')
        sendLog("third vehicle has been assigned to user at " + thirdOrigin, "OK")
        break;
      default:
        sendLog("reseting demo state to 0", "OK")
        demoState = 0;
        break;
    }
    res.status(200).send("Algorithm demo success state: " + demoState)
  }
  catch (e) {
    console.log(e)
    res.status(400).send("Error!")
  }
});

// methods
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
  const uri = encodeURI(`https://maps.googleapis.com/maps/api/directions/json?origin=${from}&destination=${to}&key=${googleMapsKey}`)
  return await axios
    .get(uri)
    .then((response) => {
      return response.data?.routes[0]?.legs[0];
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
      `${IP_ADDRESS}/api/getRoute?fromLat=${value.currentLocation.location.lat}&fromLng=${value.currentLocation.location.lng}&toLat=${callLocation.lat}&toLng=${callLocation.lng}`
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
        `${IP_ADDRESS}/api/getRoute?fromLat=${value.currentTrip.end_location.lat}&fromLng=${value.currentTrip.end_location.lng}&toLat=${callLocation.lat}&toLng=${callLocation.lng}`
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


const optimizedAssignedVehicles = async (distanceMatrix, vehicles, users) => {

  // call a function that calculates the naive assignment total driving time
  const naiveAssignTotalTime = await calculateTotalTimeOfNaiveAssign(distanceMatrix, vehicles);
  // sendLog('Naive assignment has calculated total driving time of: ' + naiveAssignTotalTime, 'ALGO');

  // get the optimized routes by the Hungarian Algorithm
  const optimizedRoutes = munkres(distanceMatrix);

  // create an array that each entry contains: vehicle plate number, user id, how long it will take for the vehicle to get to the user
  const optimizedRoutesByIDs = optimizedRoutes.map(route => [vehicles[route[0]].id, users[route[1]].id, distanceMatrix[route[0]][route[1]]]);

  // calculate all the best routes for each user
  let optimizedTotalDrivingTimeToUser = 0;
  optimizedRoutes.forEach(route => optimizedTotalDrivingTimeToUser += parseInt(distanceMatrix[route[0]][route[1]]));
  console.log('TDT(optimized): ' + optimizedTotalDrivingTimeToUser + ' minutes');
  sendLog('TDT(optimized): ' + optimizedTotalDrivingTimeToUser + ' minutes', 'ALGO');

  return optimizedRoutes;
};

const findUserInArray = (array, userID) => {
  for (let i = 0; i < array.length; i++) {
    if (array[i][1] == userID)
      return array[i];
  }
}

const calculateTotalTimeOfNaiveAssign = async (distanceMatrix, vehicles) => {
  try {
    // get the total time of all the current vehicles driving towards users
    const currentTotalTime = await getTotalDrivingTimeToUser();

    // get all the possible vehicles distances for the last user added
    const lastUserDistances = [];
    distanceMatrix.forEach(element => lastUserDistances.push(element[element.length - 1]))

    // get all the vehicles distances that have a state of null
    const vehiclesWithNullStateArray = [];
    vehicles.forEach((vehicle, index) => {
      if (!vehicle.state) vehiclesWithNullStateArray.push(lastUserDistances[index]);
    })

    console.log(vehiclesWithNullStateArray);
    console.log('currentTotalTime:', currentTotalTime / 60, "min:", Math.min(...vehiclesWithNullStateArray))
    console.log('naive total driving time:', currentTotalTime / 60 + Math.min(...vehiclesWithNullStateArray));

    return currentTotalTime / 60 + Math.min(...vehiclesWithNullStateArray)

  } catch (e) {
    console.log(e);
  }
}

const reassignVehicles = async (matches, vehicles, users) => {
  // for each match, create google directions api call to get the route (need origin and destination for each user)
  const promises = matches.map(match => {
    console.log('vehicle number', vehicles[match[0]].id, 'from:', vehicles[match[0]].currentLocation, 'to:', users[match[1]].currentLocation);
    findRouteAndPushToVehicle(vehicles[match[0]].currentLocation, users[match[1]].currentLocation, vehicles[match[0]].id, users[match[1]].id);
  });
}

const findRouteAndPushToVehicle = async (origin, destination, vehicleID, userID) => {
  const route = await getDirectionsByAddress(origin, destination);
  route['user_id'] = userID;
  // push to the vehicle via firebase server
  // send firebase each response to reassign vehicle's trip
  await fetch(`${IP_ADDRESS}/pushRouteToVehicle`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ plateNumber: vehicleID, route, type: 'TOWARDS_USER' })
  });
  await fetch(`${IP_ADDRESS}/rematchVehiclesAndUsers`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ vehicleID, userID })
  });

}

// This method is responsible for assigning user to the nearest (by time) vehicle
// @param userOrigin
// @param userDestination
// the method recives user origin and destination, calc its route and returns the assigned vehicle
const assignVehicleToUser = async (userOrigin, userDestination, userID) => {

  // get vehicles(available) and users (waiting for their vehicle to arrive) data
  let response = await fetch(`${IP_ADDRESS}/getAllUsersWaitingForARide`);
  const users = await response.json();
  users.push({ "id": userID, "currentLocation": userOrigin })
  response = await fetch(`${IP_ADDRESS}/getVehiclesTowardsUsers`);
  const vehicles = await response.json();

  console.log("trying to assign vehicle to user")
  console.log("users", users)
  console.log("vehicles", vehicles)

  // get distance matrix by users(destinations) and vehicles(origins)
  const distanceMatrix = await createDistanceMatrix(users, vehicles);
  if (!checkDistanceMatrix(distanceMatrix)) return 0;

  console.log('\n', '\u001b[' + 35 + 'm' + '<<< Computed Distance Matrix >>>' + '\u001b[0m')
  console.log(distanceMatrix, '\n')

  // print the total driving time
  if (demoState > 1) {
    console.log('TDT(naive): ' + (parseInt(distanceMatrix[0][0]) + parseInt(distanceMatrix[2][1])) + " minutes")
    sendLog('TDT(naive): ' + (parseInt(distanceMatrix[0][0]) + parseInt(distanceMatrix[2][1])) + " minutes", 'ALGO');
  }


  // send destance matrix to hungarian algorithm
  const optimized = await optimizedAssignedVehicles(distanceMatrix, vehicles, users);

  // find user assigned vehicle id
  let vehiclePlateNumber;
  for (let i = 0; i < optimized.length; i++) {
    if (optimized[i][1] == users.length - 1) {
      vehiclePlateNumber = vehicles[optimized[i][0]].id
      break;
    }
  }

  // reassign all vehicles available according to the optimized array of matches
  reassignVehicles(optimized, vehicles, users);

  // update user state, adding origin, destantion
  await fetch(`${IP_ADDRESS}/pushTripLocationsToUser`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ userID, userOrigin, userDestination, vehiclePlateNumber })
  });





  // return to the user the vehicle 
  return 1;




  // if (unoptimizedTotalDrivingTimeToUser > optimizedTotalDrivingTimeToUser) {
  //   await fetch(`${IP_ADDRESS}/reassignVehiclesToUsers`, {
  //     method: "PUT",
  //     headers: {
  //       "Content-Type": "application/json",
  //     },
  //     body: JSON.stringify(optimizedRoutes),
  //   })
  // }


  // calc which is the nearest (by time!) by sending both arrays to google matrix



  // assign selected  vehicle to user


  // const userRoute = await getDirectionsByAddress(userOrigin, userDestination);
  // const userOriginCoordinates = userRoute.start_location;
  // const vehiclesResponse = await fetch(`${IP_ADDRESS}/getVehicles`);
  // const vehicles = await vehiclesResponse.json();
  // let nearestVehicles = {};

  // // loop through all vehicles and output n nearest vehicles
  // for (const [key, value] of Object.entries(vehicles)) {
  //   let dist = Math.sqrt(Math.pow(userOriginCoordinates.lat - value.currentLocation.location.lat, 2) + Math.pow(userOriginCoordinates.lng - value.currentLocation.location.lng, 2));
  //   if (Object.keys(nearestVehicles).length < 3) {
  //     // the vehicle is available
  //     if (!value?.routeToUser && !value?.routeWithUser) {
  //       nearestVehicles[dist] = value;
  //     }
  //   } else nearestVehicles = replaceMaxKey(nearestVehicles, value, dist);
  // }
  // if (Object.keys(nearestVehicles).length <= 0) {
  //   console.log("there are no available cars for the ride");
  //   return -1;
  // }
  // // replace distance with estimated arrival time
  // nearestVehicles = await replaceDistWithETA(nearestVehicles,userOriginCoordinates);
  // // the row commented below, checks if there is a better vehicle, which its ride ends near the user origin.
  // // nearestVehicles = await calculateUnavailableCars(vehicles, nearestVehicles, userOriginCoordinates);

  // // sort the vehicles and return array from min to max
  // const sortedNearestVehicles = sortedVehicleArray(nearestVehicles);
  // // push route into the avialable vehicle

  // // if (!sortedNearestVehicles[0][1]){
  // //   console.log()
  // // }

  // // add to the desired vehicle the route to user destination from user origin
  // // sortedNearestVehicles[0][1].routeToUser.routes[0].legs[0]['trip_type'] = 'to_user';
  // sortedNearestVehicles[0][1].routeToUser['user_id'] = userID;


  // await fetch(`${IP_ADDRESS}/pushRouteToVehicle`, {
  //   method: "POST",
  //   headers: {
  //     "Content-Type": "application/json",
  //   },
  //   body: JSON.stringify({ plateNumber: sortedNearestVehicles[0][1].vehicle.plateNumber, route: sortedNearestVehicles[0][1].routeToUser, type: "TOWARDS_USER" })
  // });
  // await fetch(`${IP_ADDRESS}/pushTripLocationsToUser`, {
  //   method: "POST",
  //   headers: {
  //     "Content-Type": "application/json",
  //   },
  //   body: JSON.stringify({ userID, userOrigin, userDestination, vehiclePlateNumber: sortedNearestVehicles[0][1].vehicle.plateNumber })
  // });
  // return sortedNearestVehicles[0][1].vehicle.plateNumber;
};

const checkDistanceMatrix = (matrix) => {
  for (let i = 0; i < matrix.length; i++) {
    if (matrix[i][0] == "NaN") {
      console.log("ERROR, notice some vehicles are not reachable")
      sendLog(`createDistanceMatrix: notice some vehicles are not reachable`, 'ERROR');
      return false;
    }
  }
  return true;
}

const createDistanceMatrix = async (users, vehicles) => {
  const origins = vehicles.map(vehicle => vehicle.currentLocation)
  const destinations = users.map(user => user.currentLocation);
  const distanceMatrix = initiateMatrix(destinations.length, origins.length);
  console.log('origin : ' + origins, "destination: " + destinations)
  distance.key('AIzaSyAEDK9co1lmhgQ2yyb6C0iko4HE7sXaK38');
  const google_matrix = await distance.matrix(origins, destinations, (err, distances) => { console.log('') });
  // console.log('distance_matrix:', google_matrix.rows);
  if (!google_matrix) {
    sendLog(`createDistanceMatrix: Couldn't create a distance matrix`, 'ERROR');
    return console.log("no distances");
  }
  if (google_matrix.status == "OK") {
    // mishtatfimMatrix = initiateMatrix(origins.length, destinations.length);
    for (let i = 0; i < origins.length; i++) {
      for (let j = 0; j < destinations.length; j++) {
        if (google_matrix.rows[0].elements[j].status == "OK") {
          distanceMatrix[i][j] = (google_matrix?.rows[i]?.elements[j]?.duration?.value / 60).toFixed(2);
          // mishtatfimMatrix[i][j] = 'vehicle plate number: ' + vehiclesIDs[i] + " to location: " + destinations[j] + " will last: " + (distances.rows[i].elements[j].duration.value / 60).toFixed(2) + ' minutes';
        }
        else console.log("destination is not reachable from ");
      }
    }
  }
  else {
    sendLog(`createDistanceMatrix: Couldn't create a distance matrix, maybe STATUS is wrong!`, 'ERROR')
  }
  return distanceMatrix;
}



const getTotalDrivingTimeToUser = async () => {
  const response = await fetch(`${IP_ADDRESS}/getTotalDrivingTimeToUser`)
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
  try {
    await fetch(`${IP_ADDRESS}/postLog`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text, type, server: "general-server" })
    });
  } catch (e) {
    console.log('\u001b[' + 31 + 'm' + 'Cannot send logs, firebase server offline?' + '\u001b[0m')
  }
}




// const createCostMatrix = async () => {
//   const response = await fetch(`${IP_ADDRESS}/getVehiclesTowardsUsers`);
//   const responseData = await response.json();
//   console.log(responseData);
//   if (responseData.length <= 0) return;
//   const origins = [];
//   const destinations = [];
//   const vehiclesIDs = [];
//   const usersIDs = [];

//   distance.key('AIzaSyAYOZJcrH22i5ePgb4ctAUPsQw9oU69MwU');

//   let count = 0;
//   let mishtatfimMatrix = [];
//   responseData.forEach((vehicle) => {
//     origins.push(vehicle.currentLocation?.location?.lat + "," + vehicle.currentLocation.location.lng);
//     destinations.push(vehicle.route.end_location.lat + "," + vehicle.route.end_location.lng);
//     vehiclesIDs.push(vehicle.plateNumber);
//     usersIDs.push(count++);
//   });
//   if (usersIDs.length <= 1) {
//     //console.log("not enough vehicles to optimize")
//     return;
//   }

//   distance.matrix(origins, destinations, (err, distances) => {
//     const distanceMatrix = initiateMatrix(vehiclesIDs.length, usersIDs.length);
//     if (err) {
//       return console.log(err);
//     }
//     if (!distances) {
//       return console.log("no distances");
//     }
//     if (distances.status == "OK") {
//       mishtatfimMatrix = initiateMatrix(
//         vehiclesIDs.length,
//         usersIDs.length
//       );
//       for (let i = 0; i < origins.length; i++) {
//         for (let j = 0; j < destinations.length; j++) {
//           if (distances.rows[0].elements[j].status == "OK") {
//             distanceMatrix[i][j] = (distances.rows[i].elements[j].duration.value / 60).toFixed(2);
//             mishtatfimMatrix[i][j] = 'vehicle plate number: ' + vehiclesIDs[i] + " to location: " + destinations[j] + " will last: " + (distances.rows[i].elements[j].duration.value / 60).toFixed(2) + ' minutes';
//           }
//           else console.log("destination is not reachable from origin");
//         }
//       }
//     }
//     optimizedAssignedVehicles(distanceMatrix, vehiclesIDs, usersIDs, destinations, mishtatfimMatrix);
//     // return distanceMatrix;
//   });
// };


const automationAlgorithm = async () => {
  // const addresses = ['Holon, Israel', '13 Masrik Blvd., Tel Aviv, Israel', '3 Am Veolamo, Jerusalem, Israel', '10 Pinsker, Hadera, Israel', '28 Bialik St., Ramat Gan, Israel', '11 Hayetzira, Or Yehuda ,Israel', '7 Shlomo Rd., Tel Aviv, Israel', '8 Hadassim, Hod Hasharon, Israel', '8 Haalia Harishona, Hadera, Israel', '10 Hazon Zion, Jerusalem, Israel', '23 Moshe Even Ezra, Ashdod, Israel', '50A Herzl St., Bnei Brak, Israel', '11 Gazit, Petah Tikva, Israel', '30 Frenkel Yedidia, Tel Aviv, Israel', '10 Hapisga, Jerusalem, Israel', '53 Hashomrim, Rehovot, Israel', '14 Hamaagal St., Hod Hasharon, Israel', '7 Plotitsky St., Rishon Lezion, Israel', '49 Golomb Eliahu, Tel Aviv, Israel', '29 Hanapach, Haifa, Israel', '21 1057 St., Nazareth, Israel', '34 M. Goshen Blvd., Kiryat Motzkin, Israel', '3 Mordei Hagetaot St., Hadera, Israel']
  const addresses = ['Holon, Israel', 'Haifa, Israel', 'Tel Aviv, Israel', 'Jerusalem, Israel', 'Eilat, Israel', 'Sderot, Israel', 'Neve Yam, Israel', 'Atlit, Israel', 'Nahariya Israel', 'Herzliya, Israel', 'Ein Hod, Israel', 'Kfar Yona, Israel', 'Zikhron Yaakov', 'Hadera, Israel', 'Tirat Karmel, Israel', 'Akko, Israel', 'Rosh Hanikra, Israel', 'Kfar Blum, Israel', 'Kfar Saba, Israel', 'Mizpe Ramon, Israel', 'Rishon Lezion, Israel']
  // const usersIDs = ["106239502123201988788","106431065342803359216","106431065342803359221","106431065342803359233","112665819530754433510"]
  while (isAutomated) {
    let origin, destination, userIDindex = null;
    if (automatedActiveUsersIDs.length > 1) {
      // generate origin and destination
      while (origin == null || destination == null || origin == destination) {
        origin = addresses[Math.floor(Math.random() * (addresses.length - 1))]
        destination = addresses[Math.floor(Math.random() * (addresses.length - 1))]
      }

      // choose userID
      userIDindex = (Math.floor(Math.random() * (automatedActiveUsersIDs.length - 1)))
      console.log("creating automation")
      console.log("origin", origin)
      console.log("destination ", destination)
      console.log("userIndex", userIDindex)
      console.log("userID", automatedActiveUsersIDs[userIDindex])
      // order vehicle
      await assignVehicleToUser(origin, destination, automatedActiveUsersIDs[userIDindex]);

      // remove userID from list
      automatedActiveUsersIDs.splice(userIDindex, 1); // 2nd parameter means remove one item only

    }
    else {
      console.log("no available vehicles, waiting for 2 seconds")
      await delay(2000);
    }
  }
}


const delay = ms => new Promise(res => setTimeout(res, ms))

