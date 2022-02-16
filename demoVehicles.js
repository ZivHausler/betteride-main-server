const x = 100 // how fast the car will rerender to the map
carsColors = {
    red: "https://i.ibb.co/kSx3LW6/Red.png",
    black: "https://i.ibb.co/Tkt0YK7/Black.png",
    blue: "https://i.ibb.co/yp8QBRW/Blue.png",
    box: "https://i.ibb.co/5WXtzSG/Box.png",
    cyan: "https://i.ibb.co/VWTmv8P/Cyan.png",
    yellow: "https://i.ibb.co/Yf33Bq3/Yellow.png"
}
ref = firebase.database().ref("cars");
const listenToNewVeicle = () => {
    // child_added will be evoked for every child that was added
    // on the first entry, it will bring all the childs
    ref.on("child_added", snapshot => {
        // carsArray.push(snapshot.val())
        demoVehicle(snapshot.val())
    })
}
const listenToRemove = () => {
    ref.on("child_removed", snapshot => {
        console.log("listenToRemove", snapshot.val())
    })
}
const uploadCar = () => {
    if (tempCar != null || tempCar != undefined) {
        ref.child(tempCar.plateNumber).set(tempCar);
    }
}
// listen to incoming messages
listenToNewVeicle();
// listen to removing messages
listenToRemove();
//demo
const demoVehicle = async (vehicle) => {
    let vehicleMarker, i = 0;

    // checks if the vehicle has no trips -> marks it staticly on map
    if (!vehicle.routeToUser && !vehicle.routeWithUser) {
        vehicleMarker = new google.maps.Marker({
            position: vehicle.currentLocation.location,
            title: vehicle.plateNumber,
            icon: {
                url: carsColors[vehicle.color]
            },
            map: map,
        });
    }
    // vehicle has trip route

    else {

        // check which kind of trip is the current one
        currentRoute = vehicle?.routeToUser ? 'routeToUser' : 'routeWithUser'
        console.log(currentRoute)
        // continue from last point (index)
        if (vehicle[currentRoute].index) i = vehicle[currentRoute].index.step;

        // if trip exists, demo vehicle trip
        while (i < vehicle[currentRoute].steps.length) {
            if (vehicleMarker != null) vehicleMarker.setMap(null);
            vehicleMarker = new google.maps.Marker({
                position: i == vehicle[currentRoute].steps.length ? vehicle[currentRoute].steps[i].end_location : vehicle[currentRoute].steps[i].start_location,
                title: vehicle.plateNumber,
                icon: {
                    url: carsColors[vehicle.color]
                },
                map: map,
            });
            await delay(vehicle[currentRoute].steps[i].duration.value * 1000 / x); // then the created Promise can be awaited
            ref.child(vehicle.plateNumber).child('currentLocation').child('location').set({ lat: vehicle[currentRoute].steps[i].start_location.lat, lng: vehicle[currentRoute].steps[i].start_location.lng });
            // ref.child(vehicle.plateNumber).child('currentLocation').child('address').set({lat: vehicle.currentTrip.steps[i].start_location.lat, lng: vehicle.currentTrip.steps[i].start_location.lng});
            ref.child(vehicle.plateNumber).child(currentRoute).child('index').set({ step: ++i });
        }

        // at this point vehicle has arrived to his destination!
        // now we need to update his address and location to the trip end point
        let address = vehicle[currentRoute].end_address;
        let location = { lat: vehicle[currentRoute].end_location.lat, lng: vehicle[currentRoute].end_location.lng };
        ref.child(vehicle.plateNumber).child('currentLocation').set({ address, location });

        // adding the finished trip to history
        // ref.child(vehicle.plateNumber).once("value", snapshot => {
        //     if(snapshot.val().ridesCompleted){
        //         console.log(snapshot.val().ridesCompleted);
        //         let ridesCompletedArray = snapshot.val().ridesCompleted;
        //         ridesCompletedArray.push(vehicle.currentTrip);
        //         ref.child(vehicle.plateNumber).child('ridesCompleted').set(ridesCompletedArray);
        //     }
        //     else ref.child(vehicle.plateNumber).child('ridesCompleted').set([vehicle[currentRoute]]);
        // });

        await ref.child(vehicle.plateNumber).child(currentRoute).set(null);

        // check if there is more routes to complete
        if (currentRoute === 'routeToUser') {
            vehicleMarker.setMap(null)
            ref.child(vehicle.plateNumber).once("value", snapshot => {
                demoVehicle(snapshot.val())
            })
        }
    }
}
const delay = ms => new Promise(res => setTimeout(res, ms))