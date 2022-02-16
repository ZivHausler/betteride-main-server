// Note: This example requires that you consent to location sharing when
// prompted by your browser. If you see the error "The Geolocation service
// failed.", it means you probably did not give permission for the browser to
// locate you.
let map, infoWindow, directionsService, geocoder, tempCar, listener, marker;
let directionsRenderer = {};
let routes = [];

const styles = {
    default: [],
    hide: [{
            featureType: "poi.business",
            stylers: [{ visibility: "off" }],
        },
        {
            featureType: "transit",
            elementType: "labels.icon",
            stylers: [{ visibility: "off" }],
        },
    ],
};

function initMap() {
    directionsService = new google.maps.DirectionsService();
    geocoder = new google.maps.Geocoder();
    map = new google.maps.Map(document.getElementById("map"), {
        center: { lat: 32.342333, lng: 34.911375 },
        zoom: 15,
        disableDefaultUI: true,
    });
    infoWindow = new google.maps.InfoWindow();
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                // for debugging
                // const pos = {
                //     lat: position.coords.latitude,
                //     lng: position.coords.longitude,
                // };
                const userLocation = { lat: 32.342333, lng: 34.911375 };

                // show person location pin
                var marker = new google.maps.Marker({
                    position: userLocation,
                    title: 'Your Location',
                    map: map,
                });

                infoWindow.setPosition(userLocation);
                // infoWindow.open(map);
                map.setCenter(userLocation);
            },() => handleLocationError(true, infoWindow, map.getCenter())
        );
    } 
    else handleLocationError(false, infoWindow, map.getCenter());  // Browser doesn't support Geolocation
    // icon hiding
    // Add controls to the map, allowing users to hide/show features.
    const styleControl = document.getElementById("style-selector-control");
    map.setOptions({ styles: styles["hide"] });
}

const findRide = (condition) => {
    if(condition){
        document.querySelector('#findRide').style.display = "none";
        document.querySelector('#orderInputsButtonsDiv').style.display = "flex";
    }
    else{
        document.querySelector('#findRide').style.display = "block";
        document.querySelector('#orderInputsButtonsDiv').style.display = "none";
    }
}

function handleLocationError(browserHasGeolocation, infoWindow, pos) {
    infoWindow.setPosition(pos);
    infoWindow.setContent(
        browserHasGeolocation ?
        "Error: The Geolocation service failed." :
        "Error: Your browser doesn't support geolocation."
    );
    infoWindow.open(map);
}

const getNearestVehicles = async () => {
    
    console.log('searching');
    let originLocation = document.querySelector('#originAddressInput').value;
    let destinationLocation = document.querySelector('#destinationAddressInput').value;
    await fetch(`http://localhost:3001/api/getDirections?origin=${originLocation}&destination=${destinationLocation}&amount=1`)
                    .then(response => response.json())
                    .then(response => {
                        console.log(response);
                        renderVehiclePins(response.vehicle);
                        routes = [];

                        // console.log('current drive:')
                        routes.push({   origin: { lat: 32.788832, lng: 34.986745 },
                                        destination: { lat: 32.342036, lng: 34.9126165 },
                                        travelMode: 'DRIVING'
                                    });
                        // console.log('new drive drive:')
                        routes.push({   origin: response.fromTo.origin,
                                        destination: response.fromTo.destination,
                                        travelMode: 'DRIVING'
                                    });
                        renderRoute();
                    })
}

const renderVehiclePins = (nearestVehicleArray) => {
    for (i = 0; i < nearestVehicleArray.length; i++) {
        let pos = {
            "lat": nearestVehicleArray[i][1].currentLocation.lat,
            "lng": nearestVehicleArray[i][1].currentLocation.lng
        }
        var marker = new google.maps.Marker({
            position: pos,
            title: nearestVehicleArray[i][1].plateNumber,
            icon: {
                url: `${i == 0 ? "http://maps.google.com/mapfiles/ms/icons/blue-dot.png" : "http://maps.google.com/mapfiles/ms/icons/green-dot.png"}`
            },
            map: map,
        });
    }
}

const renderRoute = () => {
    if (directionsRenderer[i]){
        // clear all routes that are already rendered to the map
        for (let i = 0; i < Object.keys(directionsRenderer).length; i++) {
            directionsRenderer[i].setMap(null);
        }
    }
    routes.forEach((route, index) => {
        directionsRenderer[index] = new google.maps.DirectionsRenderer();
        directionsRenderer[index].setMap(map);
        if(index % 2 == 0) directionsRenderer[index].setOptions({polylineOptions:{  strokeColor: 'green',
                                                                                    strokeOpacity: 0.5,
                                                                                    strokeWeight: 6}});
        directionsService.route(route)
        .then(response => {
            directionsRenderer[index].setDirections(response);
            // console.log(`A car has been found. It's plate number is: ${ride.vehicle[0][1].plateNumber}`);
            // console.log(`The car will arrive in ${Math.floor(ride.vehicle[0][1])} minutes to your location at: ${response.routes[0].legs[0].start_address}`);
            // console.log(`The trip to your disired destination (${response.routes[0].legs[0].end_address}) will last ${Math.floor(response.routes[0].legs[0].duration.value/60)} minutes for ${response.routes[0].legs[0].distance.value/1000} km long`)
            // let finalDate = new Date((new Date()).getTime() + response.routes[0].legs[0].duration.value * 60000);
            // let finalDateString = '';
            // finalDateString = finalDate.getHours() < 10 ? `0${finalDate.getHours()}:` : `${finalDate.getHours()}:`;
            // finalDateString += finalDate.getMinutes() < 10 ? `0${finalDate.getMinutes()}` : finalDate.getMinutes()
            // console.log("ETA to destination: " + finalDateString);
        })
        .catch((error) => console.log("Directions request failed due to " + error));
    });
}

const addSeconds = (date, seconds) => new Date(date.getTime() + seconds * 60000);

const addCar = () => {
    // listen for click events on the map
    if(document.querySelector('#addCars').innerText == "Add Car"){
        listener = google.maps.event.addListener(map, 'click', (event) => {
            geocoder.geocode({'latLng': event.latLng}, (results, status) => {
              if (status == google.maps.GeocoderStatus.OK) {
                    if (results[0]) {
                        // create a new marker on the map
                        addMarker({
                            address: results[0].formatted_address,
                            location: {"lat": results[0].geometry.location.lat(), "lng": results[0].geometry.location.lng()},
                        });
                        // pause the event listener
                        google.maps.event.removeListener(listener);
                        changeAddCarButton("add");
                    }
                }
            });
        });
    }
    // cancel request to add an empty car
    else {
        google.maps.event.removeListener(listener);
        changeAddCarButton("add"); // change the button text to "Add Car"
        return;
    } 
    if(tempCar != undefined){
        saveCar();
    }
    changeAddCarButton("save"); // change the button text to "Save Car"
}

// Add marker to the map using to "on click" event listener by clicking on the map
const addMarker = (position) => {
    infowindow = new google.maps.InfoWindow({
        content: `
        <p>${position.address}</p>
        <button onclick="addDestinationPosition(this)">Add Destination</button>
        <button id="saveCar" onclick="minimizeWindow(true)">Save</button>
        <button id="removeThisCar" onclick="minimizeWindow(false)">Cancel</button>`,
    });
    marker = new google.maps.Marker({
        position: position.location,
        title: `Tesla`,
        map: map,
        // icon: icon
    });
    // marker.addListener("click", () => {
        //     infowindow.open(map,marker);
        // });
        infowindow.open({
            anchor: marker,
            map,
            shouldFocus: false,
        });
    createTempCar(position);
}

const switchDirections = () => {
    let from = document.querySelector('#originAddressInput').value;
    let to = document.querySelector('#destinationAddressInput').value;
    document.querySelector('#originAddressInput').value = to;
    document.querySelector('#destinationAddressInput').value = from;
}

