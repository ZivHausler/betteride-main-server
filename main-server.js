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
const distance = require('./distanceMatrix/index.js');
let demoState = 0;
const MIN_REASSIGN_THRESHOLD = 5 // minutes

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
  console.log('inside orderveihlce');
  const { userOrigin, userDestination, userID } = req.query;

  // find the nearest vehicle and assign it to the user
  const assignment = await assignVehicleToUser(userOrigin, userDestination, userID);
  console.log("orderVehicle new assignmnet = ", assignment);
  if (assignment === -1) {
    return;
  }
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

const replaceMaxKey = (dict, value, newKey) => {
  let max = Math.max(...Object.keys(dict));
  // if we have found a lower dist from, replace
  if (newKey < max) {
    delete dict[max];
    dict[newKey] = value;
  }
  return dict;
};


const optimizedAssignedVehicles = async (durationMatrix, vehicles, users) => {
  const { totalNaiveDrivingTime, vehiclePlateNumber } = await calculateTotalTimeOfNaiveAssign(durationMatrix, vehicles);
  // call a function that calculates the naive assignment total driving time
  sendLog('TDT(naive): ' + parseInt(totalNaiveDrivingTime) + " minutes", 'ALGO');

  // get the optimized routes by the Hungarian Algorithm
  const optimizedRoutes = munkres(durationMatrix);
  console.log("optimizedRoutes:", optimizedRoutes);

  // check if any matching is correct
  for (let i = 0; i < optimizedRoutes.length; i++) {
    if (durationMatrix[optimizedRoutes[i][0]][optimizedRoutes[i][1]] >= '9007199254740990') {
      console.log(`Couldn't find a mach to the last order`);
      return [null, null];
    }
  }
  // create an array that each entry contains: vehicle plate number, user id, how long it will take for the vehicle to get to the user
  // const optimizedRoutesByIDs = optimizedRoutes.map(route => [vehicles[route[0]].id, users[route[1]].id, durationMatrix[route[0]][route[1]]]);

  // calculate all the best routes for each user
  let optimizedTotalDrivingTimeToUser = 0;
  optimizedRoutes.forEach(route => optimizedTotalDrivingTimeToUser += parseInt(durationMatrix[route[0]][route[1]]));
  sendLog('TDT(optimized): ' + optimizedTotalDrivingTimeToUser + ' minutes', 'ALGO');
  return [(optimizedTotalDrivingTimeToUser + MIN_REASSIGN_THRESHOLD) < parseInt(totalNaiveDrivingTime) ? optimizedRoutes : vehiclePlateNumber, (optimizedTotalDrivingTimeToUser + MIN_REASSIGN_THRESHOLD) < parseInt(totalNaiveDrivingTime)]
};

const findUserInArray = (array, userID) => {
  for (let i = 0; i < array.length; i++) {
    if (array[i][1] == userID)
      return array[i];
  }
}
const calculateTotalTimeOfNaiveAssign = async (durationMatrix, vehicles) => {
  try {
    // get the total time of all the current vehicles driving towards users
    const currentTotalTime = await getTotalDrivingTimeToUser();

    // get all the possible vehicles distances for the last user added
    const lastUserDistances = [];
    durationMatrix.forEach(element => lastUserDistances.push(element[element.length - 1]))

    // get all the vehicles distances that have a state of null
    const vehiclesWithNullStateArray = [];
    vehicles?.forEach((vehicle, index) => {
      if (!vehicle.state) vehiclesWithNullStateArray.push({ duration: parseInt(lastUserDistances[index]), id: vehicle.id });
    })
    const naiveAssignVehicle = vehiclesWithNullStateArray?.reduce((prev, curr) => {
      return prev.duration < curr.duration ? prev : curr;
    })
    return { totalNaiveDrivingTime: currentTotalTime / 60 + naiveAssignVehicle.duration, vehiclePlateNumber: naiveAssignVehicle.id }
  } catch (e) {
    console.log(e);
  }
}
const reassignVehicles = async (matches, vehicles, users) => {
  // for each match, create google directions api call to get the route (need origin and destination for each user)
  console.log("reassignVehicles: users", users, matches);
  const promises = matches.map(match => {
    findRouteAndPushToVehicle(vehicles[match[0]].currentLocation, users[match[1]].currentLocation, vehicles[match[0]].id, users[match[1]].id, users[match[1]].assignments > 0);
  });
}

const findRouteAndPushToVehicle = async (origin, destination, vehicleID, userID, isReassigned) => {
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
    body: JSON.stringify({ vehicleID, userID, isReassigned })
  });

}
// This method is responsible for assigning user to the nearest (by time) vehicle
// @param userOrigin
// @param userDestination
// the method recives user origin and destination, calc its route and returns the assigned vehicle
const assignVehicleToUser = async (userOrigin, userDestination, userID) => {
  let vehiclePlateNumber;

  // get vehicles(available) and users (waiting for their vehicle to arrive) data
  let response = await fetch(`${IP_ADDRESS}/getAllUsersWaitingForARide`);
  let users = await response.json();
  users = users.filter(user => user?.assignments < 2);
  users.push({ "id": userID, "currentLocation": userOrigin, userDestination })
  response = await fetch(`${IP_ADDRESS}/getVehiclesTowardsUsers`);
  const vehicles = await response.json();
  console.log('vehicles', vehicles.length);
  console.log('users', users.length);
  if (users.length > vehicles.length) return -1;

  // get distance matrix by users(destinations) and vehicles(origins)
  let { durationMatrix, distanceMatrix } = await createMatrixes(users, vehicles);
  if (!checkDurationMatrix(durationMatrix)) return 0;

  console.log('\n', '\u001b[' + 35 + 'm' + '<<< Computed Duration Matrix >>>' + '\u001b[0m')
  console.log(durationMatrix);
  console.log('\n', '\u001b[' + 35 + 'm' + '<<< Computed Distance Matrix >>>' + '\u001b[0m')
  console.log(distanceMatrix);

  durationMatrix = await checkRestrictions(distanceMatrix, durationMatrix, vehicles, users);
  // send destance matrix to hungarian algorithm
  const [optimized, isOptimize] = await optimizedAssignedVehicles(durationMatrix, vehicles, users);
  if (!optimized) return -1;
  // update user state, adding origin, destantion
  if (!isOptimize) { // if there isn't route optimization, optimized = naaiveAssginmnetVehicle ID
    sendLog(`Hungarian algorithm didn't improve (TRESHOLD:${MIN_REASSIGN_THRESHOLD}min)`, 'ALGO');
    let vehicleOrigin;
    for (let i = 0; i < vehicles.length; i++) {
      if (vehicles[i].id == optimized)
        vehicleOrigin = vehicles[i].currentLocation
    }
    vehiclePlateNumber = optimized;
    await fetch(`${IP_ADDRESS}/pushTripLocationsToUser`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ userID, userOrigin, userDestination, vehiclePlateNumber })
    });
    await findRouteAndPushToVehicle(vehicleOrigin, userOrigin, optimized, userID);
  }
  else {
    for (let i = 0; i < optimized.length; i++) {
      if (optimized[i][1] == users.length - 1) {
        vehiclePlateNumber = vehicles[optimized[i][0]].id
        break;
      }
    }
    await fetch(`${IP_ADDRESS}/pushTripLocationsToUser`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ userID, userOrigin, userDestination, vehiclePlateNumber })
    });
    // reassign all vehicles available according to the optimized array of matches
    reassignVehicles(optimized, vehicles, users);
  }
  // return the vehicle plate number
  return vehiclePlateNumber;
};

const checkDurationMatrix = (matrix) => {
  for (let i = 0; i < matrix.length; i++) {
    if (matrix[i][0] == "NaN") {
      console.log("ERROR, notice some vehicles are not reachable")
      sendLog(`checkDurationMatrix: notice some vehicles are not reachable`, 'ERROR');
      return false;
    }
  }
  return true;
}
const createMatrixes = async (users, vehicles) => {
  const origins = vehicles.map(vehicle => vehicle.currentLocation)
  const destinations = users.map(user => user.currentLocation);
  const durationMatrix = initiateMatrix(destinations.length, origins.length);
  const distanceMatrix = initiateMatrix(destinations.length, origins.length);
  // console.log('origin : ' + origins, "destination: " + destinations)
  distance.key('AIzaSyAEDK9co1lmhgQ2yyb6C0iko4HE7sXaK38');
  const google_matrix = await distance.matrix(origins, destinations, (err, distances) => { console.log('') });
  // console.log('distance_matrix:', google_matrix.rows);
  if (!google_matrix) {
    sendLog(`createDurationMatrix: Couldn't create a distance matrix`, 'ERROR');
    return console.log("no distances");
  }
  if (google_matrix.status == "OK") {
    // mishtatfimMatrix = initiateMatrix(origins.length, destinations.length);
    for (let i = 0; i < origins.length; i++) {
      for (let j = 0; j < destinations.length; j++) {
        if (google_matrix.rows[0].elements[j].status == "OK") {
          durationMatrix[i][j] = (google_matrix?.rows[i]?.elements[j]?.duration?.value / 60).toFixed(2);
          distanceMatrix[i][j] = (google_matrix?.rows[i]?.elements[j]?.distance?.value);
          // mishtatfimMatrix[i][j] = 'vehicle plate number: ' + vehiclesIDs[i] + " to location: " + destinations[j] + " will last: " + (distances.rows[i].elements[j].duration.value / 60).toFixed(2) + ' minutes';
        }
        else console.log("destination is not reachable from ");
      }
    }
  }
  else {
    sendLog(`createDurationMatrix: Couldn't create a distance matrix, maybe STATUS is wrong!`, 'ERROR')
  }
  return { durationMatrix, distanceMatrix };
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
      const result = await assignVehicleToUser(origin, destination, automatedActiveUsersIDs[userIDindex]);
      if (result === -1) {
        await delay(2000);
        continue;
      }
      // remove userID from list
      automatedActiveUsersIDs.splice(userIDindex, 1); // 2nd parameter means remove one item only

    }
    else {
      console.log("no available vehicles, waiting another 2 seconds")
      await delay(2000);
    }
  }
}
const delay = ms => new Promise(res => setTimeout(res, ms))

const checkRestrictions = async (distanceMatrix, durationMatrix, vehicles, users) => {
  console.log("-----------------checkRestrictions-----------------------");
  // console.log('distanceMatrix before', distanceMatrix);
  // foreach user, api call (route) to get the distance of the trip
  for (let i = 0; i < users.length; i++) {
    // go throught the users and check if any of them has already been reassigned
    const result = await getDirectionsByAddress(users[i].currentLocation, users[i].userDestination) // result.distance.value
    distanceMatrix.map((distance, index) => {
      if (distance[i] + result.distance.value > vehicles[index]?.currentBattery) {
        durationMatrix[index][i] = '9007199254740990';
        return distance[i] = '9007199254740990';
      }
      return distance[i];
    });
  }
  return durationMatrix;
}
